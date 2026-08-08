import { CryptoEngine } from './crypto.js';
import { StorageManager } from './storage.js';
import { WSManager } from './ws.js';

class App {
  constructor() {
    this.ws = new WSManager();
    this.currentUser = null; // { username, displayName, keyPair: { privateKey, publicKey }, pubKeyJWK }
    this.activeChatContact = null; // { username, displayName, publicKeyJWK, sharedAESKey, isOnline }
    this.contactsMap = new Map(); // username -> contact object

    this.initDOMElements();
    this.bindEvents();
    this.bootstrapAccount();
  }

  initDOMElements() {
    this.dom = {
      authScreen: document.getElementById('auth-screen'),
      authForm: document.getElementById('auth-form'),
      authError: document.getElementById('auth-error'),
      displayNameInput: document.getElementById('display-name'),
      usernameInput: document.getElementById('username'),

      chatDashboard: document.getElementById('chat-dashboard'),
      myAvatar: document.getElementById('my-avatar'),
      myDisplayName: document.getElementById('my-display-name'),
      myUsername: document.getElementById('my-username'),
      logoutBtn: document.getElementById('logout-btn'),

      searchInput: document.getElementById('search-input'),
      contactsList: document.getElementById('contacts-list'),
      contactsSectionTitle: document.querySelector('.contacts-section-title'),

      welcomeScreen: document.getElementById('welcome-screen'),
      activeChatView: document.getElementById('active-chat-view'),
      chatAvatar: document.getElementById('chat-avatar'),
      chatTitle: document.getElementById('chat-title'),
      chatStatus: document.getElementById('chat-status'),
      securityVerifyBtn: document.getElementById('security-verify-btn'),

      messagesContainer: document.getElementById('messages-container'),
      chatForm: document.getElementById('chat-form'),
      messageInput: document.getElementById('message-input'),

      safetyModal: document.getElementById('safety-modal'),
      safetyFriendName: document.getElementById('safety-friend-name'),
      safetyFingerprint: document.getElementById('safety-fingerprint'),
      closeSafetyModalBtn: document.getElementById('close-safety-modal'),
      mobileBackBtn: document.getElementById('mobile-back-btn')
    };
  }

  bindEvents() {
    // Auth Form
    this.dom.authForm.addEventListener('submit', (e) => this.handleRegister(e));

    // Search Input
    this.dom.searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));

    // Chat Form Submit
    this.dom.chatForm.addEventListener('submit', (e) => this.handleSendMessage(e));

    // Logout / Exit
    this.dom.logoutBtn.addEventListener('click', () => this.handleLogout());

    // Security Verification Modal
    this.dom.securityVerifyBtn.addEventListener('click', () => this.openSafetyModal());
    this.dom.closeSafetyModalBtn.addEventListener('click', () => this.dom.safetyModal.classList.add('hidden'));

    // Mobile Back Button
    if (this.dom.mobileBackBtn) {
      this.dom.mobileBackBtn.addEventListener('click', () => {
        this.dom.chatDashboard.classList.remove('mobile-chat-open');
      });
    }

    // WebSocket Event Listeners
    this.ws.on('NEW_ENCRYPTED_MESSAGE', (data) => this.handleIncomingMessage(data));
    this.ws.on('OFFLINE_MESSAGES', (data) => this.handleOfflineMessages(data.messages));
    this.ws.on('PRESENCE_CHANGE', (data) => this.handlePresenceChange(data));
  }

  async bootstrapAccount() {
    try {
      const savedAcc = await StorageManager.getAccount();
      if (savedAcc && savedAcc.username && savedAcc.privateKeyJWK && savedAcc.publicKeyJWK) {
        // Reconstruct CryptoKeys from saved JWKs
        const privateKey = await CryptoEngine.importPrivateKeyFromJWK(savedAcc.privateKeyJWK);
        const publicKey = await CryptoEngine.importPublicKeyFromJWK(savedAcc.publicKeyJWK);

        this.currentUser = {
          username: savedAcc.username,
          displayName: savedAcc.displayName,
          keyPair: { privateKey, publicKey },
          pubKeyJWK: savedAcc.publicKeyJWK
        };

        this.onUserAuthenticated();
      }
    } catch (err) {
      console.error('Error bootstrapping account:', err);
    }
  }

  async handleRegister(e) {
    e.preventDefault();
    this.showAuthError('');

    const displayName = this.dom.displayNameInput.value.trim();
    const username = this.dom.usernameInput.value.trim().toLowerCase();

    if (!username || !displayName) {
      this.showAuthError('Please fill in both fields.');
      return;
    }

    try {
      // 1. Generate Local ECDH Keypair
      const keyPair = await CryptoEngine.generateKeyPair();
      const pubKeyJWK = await CryptoEngine.exportKeyToJWK(keyPair.publicKey);
      const privKeyJWK = await CryptoEngine.exportKeyToJWK(keyPair.privateKey);

      // 2. Register with server
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          displayName,
          publicKey: pubKeyJWK
        })
      });

      const data = await response.json();
      if (!response.ok) {
        this.showAuthError(data.error || 'Registration failed.');
        return;
      }

      // 3. Save to IndexedDB
      await StorageManager.saveAccount({
        username,
        displayName,
        privateKeyJWK: privKeyJWK,
        publicKeyJWK: pubKeyJWK
      });

      this.currentUser = {
        username,
        displayName,
        keyPair,
        pubKeyJWK
      };

      this.onUserAuthenticated();
    } catch (err) {
      console.error('Registration error:', err);
      this.showAuthError('Cryptographic key generation error.');
    }
  }

  showAuthError(msg) {
    if (!msg) {
      this.dom.authError.classList.add('hidden');
    } else {
      this.dom.authError.textContent = msg;
      this.dom.authError.classList.remove('hidden');
    }
  }

  onUserAuthenticated() {
    this.dom.authScreen.classList.add('hidden');
    this.dom.chatDashboard.classList.remove('hidden');

    this.dom.myDisplayName.textContent = this.currentUser.displayName;
    this.dom.myUsername.textContent = `@${this.currentUser.username}`;
    this.dom.myAvatar.textContent = this.currentUser.displayName.charAt(0).toUpperCase();

    // Connect to WebSocket Relay
    this.ws.connect(this.currentUser.username);

    // Load initial contacts
    this.loadContactsList();
  }

  async handleLogout() {
    if (confirm('Are you sure? This will delete your local encryption keys from this browser.')) {
      await StorageManager.clearAccount();
      window.location.reload();
    }
  }

  // --- CONTACTS & SEARCH ---

  async loadContactsList() {
    if (this.dom.contactsSectionTitle) {
      this.dom.contactsSectionTitle.textContent = 'Conversations';
    }
    const contacts = await StorageManager.getAllContacts();
    contacts.forEach(c => this.contactsMap.set(c.username, c));
    this.renderContactsList(contacts);
  }

  async handleSearch(query) {
    const cleanQ = query.trim().toLowerCase().replace(/^@/, '');
    if (!cleanQ) {
      this.loadContactsList();
      return;
    }

    if (this.dom.contactsSectionTitle) {
      this.dom.contactsSectionTitle.textContent = 'Search Results';
    }

    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(cleanQ)}&exclude=${this.currentUser.username}`);
      const data = await res.json();
      this.renderContactsList(data.users || []);
    } catch (err) {
      console.error('Search error:', err);
    }
  }

  renderContactsList(users) {
    this.dom.contactsList.innerHTML = '';

    if (users.length === 0) {
      this.dom.contactsList.innerHTML = '<div class="empty-state">No users found.</div>';
      return;
    }

    users.forEach(user => {
      const item = document.createElement('div');
      item.className = `contact-item ${this.activeChatContact?.username === user.username ? 'active' : ''}`;
      
      const initial = (user.displayName || user.username).charAt(0).toUpperCase();
      const isOnline = user.isOnline || (this.contactsMap.get(user.username)?.isOnline);

      item.innerHTML = `
        <div class="avatar-circle">${initial}</div>
        <div class="status-dot ${isOnline ? 'online' : ''}"></div>
        <div class="contact-details">
          <div class="contact-name-row">
            <span class="contact-name">${user.displayName}</span>
          </div>
          <span class="contact-handle">@${user.username}</span>
        </div>
      `;

      item.addEventListener('click', () => this.selectChatContact(user));
      this.dom.contactsList.appendChild(item);
    });
  }

  // --- ACTIVE CHAT SESSION ---

  async selectChatContact(user) {
    try {
      // 1. Fetch full public key if needed
      let contactObj = this.contactsMap.get(user.username);
      if (!contactObj || !contactObj.publicKeyJWK) {
        const res = await fetch(`/api/users/${user.username}`);
        const data = await res.json();
        contactObj = {
          username: data.username,
          displayName: data.displayName,
          publicKeyJWK: data.publicKey,
          isOnline: data.isOnline
        };
      }

      // Always save contact so it stays in Conversations list
      await StorageManager.saveContact(contactObj);
      this.contactsMap.set(contactObj.username, contactObj);

      // Clear search input & restore Conversations title
      if (this.dom.searchInput.value) {
        this.dom.searchInput.value = '';
      }

      // 2. Import Public Key & Derive Shared AES Key
      const importedPubKey = await CryptoEngine.importPublicKeyFromJWK(contactObj.publicKeyJWK);
      const sharedAESKey = await CryptoEngine.deriveSharedAESKey(
        this.currentUser.keyPair.privateKey,
        importedPubKey
      );

      this.activeChatContact = {
        ...contactObj,
        sharedAESKey
      };

      // 3. Update UI
      this.dom.welcomeScreen.classList.add('hidden');
      this.dom.activeChatView.classList.remove('hidden');
      this.dom.chatDashboard.classList.add('mobile-chat-open');
      this.dom.chatTitle.textContent = this.activeChatContact.displayName;
      this.dom.chatStatus.textContent = this.activeChatContact.isOnline ? 'Online' : 'Offline';
      this.dom.chatAvatar.textContent = this.activeChatContact.displayName.charAt(0).toUpperCase();

      this.loadActiveChatMessages();
      this.loadContactsList(); // Refresh Conversations list
    } catch (err) {
      console.error('Failed to select chat:', err);
      alert('Error establishing E2EE session with user.');
    }
  }

  async loadActiveChatMessages() {
    this.dom.messagesContainer.innerHTML = '';
    const messages = await StorageManager.getMessagesForChat(this.activeChatContact.username);
    messages.forEach(msg => this.renderMessageBubble(msg));
    this.scrollToBottom();
  }

  renderMessageBubble(msg) {
    const isSent = msg.from === this.currentUser.username;
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;

    const timeStr = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div>${this.escapeHTML(msg.text)}</div>
      <div class="message-meta">
        <svg class="lock-icon" viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
        <span>${timeStr}</span>
      </div>
    `;

    this.dom.messagesContainer.appendChild(bubble);
  }

  scrollToBottom() {
    this.dom.messagesContainer.scrollTop = this.dom.messagesContainer.scrollHeight;
  }

  // --- SEND & RECEIVE ENCRYPTED MESSAGES ---

  async handleSendMessage(e) {
    e.preventDefault();
    const text = this.dom.messageInput.value.trim();
    if (!text || !this.activeChatContact) return;

    this.dom.messageInput.value = '';

    try {
      // 1. Encrypt plaintext with Shared AES Key
      const encrypted = await CryptoEngine.encryptMessage(
        this.activeChatContact.sharedAESKey,
        text
      );

      const timestamp = Date.now();
      const messageId = `msg_${timestamp}_${Math.random().toString(36).substr(2, 9)}`;

      // 2. Send Ciphertext over WebSocket
      this.ws.send({
        type: 'ENCRYPTED_MESSAGE',
        to: this.activeChatContact.username,
        ciphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        timestamp,
        messageId
      });

      // 3. Save plaintext locally in IndexedDB
      const msgObj = {
        messageId,
        chatWith: this.activeChatContact.username,
        from: this.currentUser.username,
        to: this.activeChatContact.username,
        text,
        timestamp
      };
      await StorageManager.saveMessage(msgObj);

      // 4. Render bubble
      this.renderMessageBubble(msgObj);
      this.scrollToBottom();
    } catch (err) {
      console.error('Encryption error:', err);
      alert('Failed to encrypt message.');
    }
  }

  async handleIncomingMessage(data) {
    const { from, ciphertext, iv, timestamp, messageId } = data;

    try {
      // Ensure we have contact's public key & shared AES key
      let contactObj = this.contactsMap.get(from);
      if (!contactObj || !contactObj.publicKeyJWK) {
        const res = await fetch(`/api/users/${from}`);
        const userApiData = await res.json();
        contactObj = {
          username: userApiData.username,
          displayName: userApiData.displayName,
          publicKeyJWK: userApiData.publicKey
        };
        await StorageManager.saveContact(contactObj);
        this.contactsMap.set(from, contactObj);
      }

      const importedPubKey = await CryptoEngine.importPublicKeyFromJWK(contactObj.publicKeyJWK);
      const sharedAESKey = await CryptoEngine.deriveSharedAESKey(
        this.currentUser.keyPair.privateKey,
        importedPubKey
      );

      // Decrypt Ciphertext
      const decryptedText = await CryptoEngine.decryptMessage(sharedAESKey, ciphertext, iv);

      const msgObj = {
        messageId,
        chatWith: from,
        from,
        to: this.currentUser.username,
        text: decryptedText,
        timestamp
      };

      await StorageManager.saveMessage(msgObj);

      // Render if currently chatting with this user
      if (this.activeChatContact && this.activeChatContact.username === from) {
        this.renderMessageBubble(msgObj);
        this.scrollToBottom();
      }
    } catch (err) {
      console.error('Failed to decrypt incoming message:', err);
    }
  }

  handleOfflineMessages(messages) {
    if (Array.isArray(messages)) {
      messages.forEach(m => this.handleIncomingMessage(m));
    }
  }

  handlePresenceChange(data) {
    const { username, isOnline } = data;
    if (this.contactsMap.has(username)) {
      const c = this.contactsMap.get(username);
      c.isOnline = isOnline;
      this.renderContactsList(Array.from(this.contactsMap.values()));
    }

    if (this.activeChatContact && this.activeChatContact.username === username) {
      this.activeChatContact.isOnline = isOnline;
      this.dom.chatStatus.textContent = isOnline ? 'Online' : 'Offline';
    }
  }

  async openSafetyModal() {
    if (!this.activeChatContact) return;

    this.dom.safetyFriendName.textContent = this.activeChatContact.displayName;
    const fingerprint = await CryptoEngine.computeSafetyNumber(
      this.currentUser.pubKeyJWK,
      this.activeChatContact.publicKeyJWK
    );
    this.dom.safetyFingerprint.textContent = fingerprint;
    this.dom.safetyModal.classList.remove('hidden');
  }

  escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }
}

// Initialize App
window.addEventListener('DOMContentLoaded', () => {
  new App();
});
