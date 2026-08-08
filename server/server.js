const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { WebSocketServer, WebSocket } = require('ws');
const userStore = require('./userStore');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Map of username -> active WebSocket socket
const activeSockets = new Map();

// --- REST API ENDPOINTS ---

// Register User
app.post('/api/auth/register', (req, res) => {
  const { username, displayName, publicKey } = req.body;
  if (!username || !publicKey) {
    return res.status(400).json({ error: 'Username and Public Key are required.' });
  }

  const result = userStore.registerUser(username, displayName, publicKey);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  res.json({ success: true, user: result.user });
});

// Search Users
app.get('/api/users/search', (req, res) => {
  const query = req.query.q || '';
  const exclude = req.query.exclude || '';
  const users = userStore.searchUsers(query, exclude).map(u => ({
    ...u,
    isOnline: activeSockets.has(u.username)
  }));
  res.json({ users });
});

// Get Single User Public Key & Status
app.get('/api/users/:username', (req, res) => {
  const user = userStore.getUser(req.params.username);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }
  res.json({
    username: user.username,
    displayName: user.displayName,
    publicKey: user.publicKey,
    isOnline: activeSockets.has(user.username)
  });
});

// --- WEBSOCKET RELAY & PRESENCE ---

function broadcastPresence(username, isOnline) {
  const presenceMsg = JSON.stringify({
    type: 'PRESENCE_CHANGE',
    username,
    isOnline
  });
  for (const [uname, ws] of activeSockets.entries()) {
    if (uname !== username && ws.readyState === WebSocket.OPEN) {
      ws.send(presenceMsg);
    }
  }
}

wss.on('connection', (ws) => {
  let currentUser = null;

  ws.on('message', (rawMessage) => {
    try {
      const data = JSON.parse(rawMessage);

      switch (data.type) {
        case 'AUTHENTICATE': {
          const { username } = data;
          const user = userStore.getUser(username);

          if (!user) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'User not registered.' }));
            return;
          }

          currentUser = user.username;
          activeSockets.set(currentUser, ws);

          ws.send(JSON.stringify({
            type: 'AUTHENTICATED',
            user: { username: user.username, displayName: user.displayName }
          }));

          // Deliver pending offline messages
          const offlineMsgs = userStore.getAndClearOfflineMessages(currentUser);
          if (offlineMsgs.length > 0) {
            ws.send(JSON.stringify({
              type: 'OFFLINE_MESSAGES',
              messages: offlineMsgs
            }));
          }

          // Broadcast to others that user is online
          broadcastPresence(currentUser, true);
          break;
        }

        case 'ENCRYPTED_MESSAGE': {
          const { to, ciphertext, iv, timestamp, messageId } = data;
          if (!currentUser) {
            ws.send(JSON.stringify({ type: 'ERROR', message: 'Not authenticated.' }));
            return;
          }

          const recipientUsername = to.trim().toLowerCase();
          const targetSocket = activeSockets.get(recipientUsername);

          const messagePayload = {
            type: 'NEW_ENCRYPTED_MESSAGE',
            from: currentUser,
            to: recipientUsername,
            ciphertext,
            iv,
            timestamp: timestamp || Date.now(),
            messageId
          };

          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(JSON.stringify(messagePayload));
            
            // Send delivery acknowledgment to sender
            ws.send(JSON.stringify({
              type: 'MESSAGE_DELIVERED',
              messageId,
              to: recipientUsername
            }));
          } else {
            // Queue for offline delivery
            userStore.queueOfflineMessage(recipientUsername, messagePayload);
            ws.send(JSON.stringify({
              type: 'MESSAGE_QUEUED_OFFLINE',
              messageId,
              to: recipientUsername
            }));
          }
          break;
        }

        case 'TYPING': {
          const { to, isTyping } = data;
          const targetSocket = activeSockets.get(to.trim().toLowerCase());
          if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
            targetSocket.send(JSON.stringify({
              type: 'USER_TYPING',
              from: currentUser,
              isTyping
            }));
          }
          break;
        }

        default:
          break;
      }
    } catch (err) {
      console.error('Error handling WS message:', err);
    }
  });

  ws.on('close', () => {
    if (currentUser) {
      activeSockets.delete(currentUser);
      broadcastPresence(currentUser, false);
    }
  });
});

server.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🔐 E2EE Secure Chat Server running on http://localhost:${PORT}`);
  console.log(`===================================================`);
});
