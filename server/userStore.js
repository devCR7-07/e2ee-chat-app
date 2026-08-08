const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

class UserStore {
  constructor() {
    this.users = new Map(); // username -> { username, displayName, publicKey, createdAt }
    this.offlineMessages = new Map(); // username -> array of pending encrypted message objects
    this.loadDB();
  }

  loadDB() {
    try {
      if (fs.existsSync(DB_PATH)) {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const data = JSON.parse(raw);
        if (data.users) {
          data.users.forEach(u => this.users.set(u.username.toLowerCase(), u));
        }
        if (data.offlineMessages) {
          Object.keys(data.offlineMessages).forEach(uname => {
            this.offlineMessages.set(uname.toLowerCase(), data.offlineMessages[uname]);
          });
        }
      }
    } catch (err) {
      console.error('Error loading DB file:', err);
    }
  }

  saveDB() {
    try {
      const data = {
        users: Array.from(this.users.values()),
        offlineMessages: Object.fromEntries(this.offlineMessages.entries())
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Error saving DB file:', err);
    }
  }

  registerUser(username, displayName, publicKey) {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
      return { success: false, error: 'Username must be at least 3 characters long.' };
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      return { success: false, error: 'Username can only contain letters, numbers, and underscores.' };
    }
    if (this.users.has(cleanUsername)) {
      return { success: false, error: 'Username is already taken. Please choose another.' };
    }

    const newUser = {
      username: cleanUsername,
      displayName: displayName.trim() || cleanUsername,
      publicKey,
      createdAt: new Date().toISOString()
    };

    this.users.set(cleanUsername, newUser);
    this.saveDB();
    return { success: true, user: newUser };
  }

  getUser(username) {
    if (!username) return null;
    return this.users.get(username.trim().toLowerCase()) || null;
  }

  searchUsers(query, excludeUsername = '') {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    const results = [];

    for (const user of this.users.values()) {
      if (!q || user.username.toLowerCase().includes(q) || user.displayName.toLowerCase().includes(q)) {
        results.push({
          username: user.username,
          displayName: user.displayName,
          publicKey: user.publicKey
        });
      }
    }
    return results.slice(0, 20);
  }

  queueOfflineMessage(toUsername, messagePayload) {
    const cleanUsername = toUsername.trim().toLowerCase();
    if (!this.offlineMessages.has(cleanUsername)) {
      this.offlineMessages.set(cleanUsername, []);
    }
    this.offlineMessages.get(cleanUsername).push(messagePayload);
    this.saveDB();
  }

  getAndClearOfflineMessages(username) {
    const cleanUsername = username.trim().toLowerCase();
    const pending = this.offlineMessages.get(cleanUsername) || [];
    this.offlineMessages.delete(cleanUsername);
    this.saveDB();
    return pending;
  }
}

module.exports = new UserStore();
