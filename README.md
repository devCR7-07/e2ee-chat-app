# 🔐 ChatBug — End-to-End Encrypted Secure Web Messenger

![Node.js](https://img.shields.io/badge/Node.js-v18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Web Crypto API](https://img.shields.io/badge/Cryptography-Web_Crypto_API-blueviolet?style=for-the-badge&logo=googlechrome&logoColor=white)
![WebSockets](https://img.shields.io/badge/Real--Time-WebSockets-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

A software-based, **Zero-Knowledge End-to-End Encrypted (E2EE) Real-Time Web Chat Application**. Built using native browser cryptography (Web Crypto API) and a lightweight Node.js WebSocket relay server.
---

## 🛡️ Security & Cryptographic Architecture

ChatBug operates on a **Zero-Knowledge Model**. Messages are encrypted on the sender's device before transmission and decrypted strictly on the recipient's device. The central server acts as a dumb relay—it holds **zero private keys** and **zero plaintext messages**.

```
[ Sender (Alice's Device) ]                       [ Relay Server (Node.js) ]                [ Recipient (Bob's Device) ]
             |                                                 |                                            |
 1. Local ECDH Key Generation                                  |                             1. Local ECDH Key Generation
    (Alice_Priv, Alice_Pub)                                    |                                (Bob_Priv, Bob_Pub)
             |                                                 |                                            |
 2. Compute Shared AES-256-GCM Key                             |                             2. Compute Shared AES-256-GCM Key
    = ECDH(Alice_Priv + Bob_Pub)                               |                                = ECDH(Bob_Priv + Alice_Pub)
             |                                                 |                                            |
 3. Encrypt "Hello Bob!" -> "a8f9%#x"                          |                                            |
 4. Transmit Ciphertext over WebSocket ----------------------->| 5. Relays Unreadable Packet ------------->| 6. Receive "a8f9%#x"
                                                                  (Server sees ONLY "a8f9%#x")               7. Decrypt using Shared Key
                                                                                                                -> "Hello Bob!"
```

### Key Security Features:
* **ECDH (Elliptic-Curve Diffie-Hellman P-256)**: Asymmetric key agreement protocol to derive a shared symmetric encryption key without transmitting the secret over the wire.
* **AES-256-GCM (Galois/Counter Mode)**: Authenticated Encryption with Associated Data (AEAD) using unique 96-bit (12-byte) random Initialization Vectors (IVs) per message.
* **Local Identity Key Storage (`IndexedDB`)**: Private keys are generated locally via `window.crypto.subtle` and stored inside browser `IndexedDB`. Private keys **never leave the user's browser**.
* **30-Digit Safety Number / Fingerprint**: Cryptographic fingerprint generated via SHA-256 hash of public keys, enabling users to verify session integrity against Man-in-the-Middle (MitM) attacks.
* **25-Second Keep-Alive Heartbeat**: Prevents idle TCP/WebSocket timeouts on cloud platforms.

---

## ✨ Features

- 👤 **Instant Registration & Unique Handles**: Register with a Display Name and Unique `@username`.
- 🔍 **User Search**: Real-time user discovery by handle or display name.
- 💬 **WhatsApp/Signal-Style Responsive UI**: Dynamic view switching between Conversations List and Active Chat Rooms on mobile phones and tablets.
- 📥 **Offline Message Queuing**: Server queues encrypted ciphertext payloads if a recipient is offline and delivers them immediately upon login.
- 🎨 **Glassmorphism Dark Theme**: Modern UI with smooth micro-animations, online/offline status indicators, and security badges.

---

## 📁 Project Structure

```text
e2ee-chat-app/
├── server/
│   ├── server.js          # Express REST API & WebSocket Relay Server
│   └── userStore.js       # User directory & offline encrypted message queue
├── public/
│   ├── css/
│   │   └── styles.css     # Glassmorphism design system & mobile media queries
│   ├── js/
│   │   ├── app.js         # Single-Page Application controller
│   │   ├── crypto.js      # Web Crypto API engine (ECDH & AES-256-GCM)
│   │   ├── storage.js     # IndexedDB local key & transcript manager
│   │   └── ws.js          # WebSocket client manager with 25s ping heartbeat
│   └── index.html         # Main SPA interface
└── package.json           # Project dependencies & start scripts
```

---

## 🚀 Getting Started (Local Development)

### Prerequisites:
* Node.js v18 or higher installed on your machine.

### Installation:

1. Clone the repository:
   ```bash
   git clone https://github.com/devCR7-07/e2ee-chat-app.git
   cd e2ee-chat-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the local server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```text
   http://localhost:3000
   ```

---

## 🧪 Testing Cryptographic Security

1. Open `http://localhost:3000` in Browser Window 1 (Register as `Alice`).
2. Open an Incognito Window and visit `http://localhost:3000` (Register as `Bob`).
3. Press **`F12`** in Chrome/Edge $\rightarrow$ Click **Network** $\rightarrow$ **WS** $\rightarrow$ **localhost** $\rightarrow$ **Messages**.
4. Send a message on the webpage and inspect the outgoing WebSocket frame. You will see that **zero plaintext** is sent over the wire—only encrypted `ciphertext` and `iv` strings!

---

## 📜 License

This project is open source and available under the [MIT License](LICENSE).
