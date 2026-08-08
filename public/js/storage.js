/**
 * IndexedDB Local Storage Manager
 * Stores user private/public keys, cached contacts, and local encrypted chat transcripts.
 */

const DB_NAME = 'E2EEChatAppDB';
const DB_VERSION = 1;

export class StorageManager {
  static db = null;

  static async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // Key-value store for account credentials (identity keypair, username)
        if (!db.objectStoreNames.contains('account')) {
          db.createObjectStore('account', { keyPath: 'id' });
        }

        // Store for contacts & public keys
        if (!db.objectStoreNames.contains('contacts')) {
          db.createObjectStore('contacts', { keyPath: 'username' });
        }

        // Store for local chat transcripts
        if (!db.objectStoreNames.contains('messages')) {
          const msgStore = db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
          msgStore.createIndex('chatWith', 'chatWith', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Account Key Management ---
  static async saveAccount(accountData) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('account', 'readwrite');
      const store = tx.objectStore('account');
      store.put({ id: 'current_user', ...accountData });
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  static async getAccount() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('account', 'readonly');
      const store = tx.objectStore('account');
      const req = store.get('current_user');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  static async clearAccount() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['account', 'contacts', 'messages'], 'readwrite');
      tx.objectStore('account').clear();
      tx.objectStore('contacts').clear();
      tx.objectStore('messages').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Contact Management ---
  static async saveContact(contact) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readwrite');
      tx.objectStore('contacts').put(contact);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  static async getContact(username) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readonly');
      const req = tx.objectStore('contacts').get(username.toLowerCase());
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  static async getAllContacts() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('contacts', 'readonly');
      const req = tx.objectStore('contacts').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // --- Message Transcript Management ---
  static async saveMessage(msg) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readwrite');
      tx.objectStore('messages').add(msg);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  static async getMessagesForChat(chatWithUsername) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('messages', 'readonly');
      const store = tx.objectStore('messages');
      const index = store.index('chatWith');
      const req = index.getAll(chatWithUsername.toLowerCase());
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }
}
