const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(helmet());
app.use(express.static(__dirname));

const MAX_USERS = 5;
const MAX_MESSAGES = 500;
const RATE_LIMIT_COUNT = 15;
const RATE_LIMIT_WINDOW_MS = 3000;

const rooms = {};
const userRateMap = {};

function makeAnon() {
  return `Anon${Math.floor(Math.random() * 100000)}`;
}

function getRoom(roomId) {
  if (!rooms[roomId]) {
    rooms[roomId] = { users: [], messages: [] };
  }
  return rooms[roomId];
}

function cleanUpRoomIfEmpty(roomId) {
  const r = rooms[roomId];
  if (!r) return;
  if (r.users.length === 0) delete rooms[roomId];
}

io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('createOrJoin', data => {
    const requested = data && data.roomId ? String(data.roomId) : null;
    let roomId = requested;
    if (!roomId) roomId = `room-${Math.floor(Math.random() * 1000000)}`;
    let room = getRoom(roomId);
    if (room.users.length >= MAX_USERS) {
      socket.emit('room-full', { roomId });
      return;
    }
    username = (data && data.username) ? String(data.username).substring(0,16) : makeAnon();
    if (!username) username = makeAnon();
    currentRoom = roomId;
    socket.join(roomId);
    room.users.push({ id: socket.id, name: username });
    socket.emit('joined', { roomId, users: room.users, messages: room.messages, you: username });
    socket.to(roomId).emit('system', { text: `${username} joined the room` });
    io.to(roomId).emit('roster', { users: room.users.map(u => u.name) });
  });

  socket.on('sendMessage', data => {
    if (!currentRoom) return;
    if (!data || typeof data.text !== 'string') return;
    const now = Date.now();
    const key = socket.id;
    if (!userRateMap[key]) userRateMap[key] = [];
    userRateMap[key] = userRateMap[key].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
    if (userRateMap[key].length >= RATE_LIMIT_COUNT) {
      socket.emit('rate-limited', { when: RATE_LIMIT_WINDOW_MS });
      return;
    }
    userRateMap[key].push(now);
    const clean = sanitizeHtml(data.text, { allowedTags: [], allowedAttributes: {} }).trim().slice(0,2000);
    if (!clean) return;
    const room = getRoom(currentRoom);
    const msg = { id: uuidv4(), user: username, text: clean, ts: now };
    room.messages.push(msg);
    if (room.messages.length > MAX_MESSAGES) room.messages.shift();
    io.to(currentRoom).emit('message', msg);
  });

  socket.on('rename', newName => {
    if (!currentRoom) return;
    const old = username;
    username = newName ? String(newName).substring(0,16) : username;
    const room = getRoom(currentRoom);
    for (let u of room.users) if (u.id === socket.id) u.name = username;
    io.to(currentRoom).emit('system', { text: `${old} is now ${username}` });
    io.to(currentRoom).emit('roster', { users: room.users.map(u => u.name) });
  });

  socket.on('hop', () => {
    if (currentRoom) {
      const room = getRoom(currentRoom);
      room.users = room.users.filter(u => u.id !== socket.id);
      socket.leave(currentRoom);
      socket.to(currentRoom).emit('system', { text: `${username} left the room` });
      io.to(currentRoom).emit('roster', { users: room.users.map(u => u.name) });
      cleanUpRoomIfEmpty(currentRoom);
      currentRoom = null;
    }
    const newRoomId = `room-${Math.floor(Math.random() * 1000000)}`;
    const room = getRoom(newRoomId);
    if (room.users.length >= MAX_USERS) {
      socket.emit('room-full', { roomId: newRoomId });
      return;
    }
    room.users.push({ id: socket.id, name: username });
    currentRoom = newRoomId;
    socket.join(newRoomId);
    socket.emit('joined', { roomId: newRoomId, users: room.users, messages: room.messages, you: username });
    socket.to(newRoomId).emit('system', { text: `${username} joined the room` });
    io.to(newRoomId).emit('roster', { users: room.users.map(u => u.name) });
  });

  socket.on('get-rooms', () => {
    const brief = Object.keys(rooms).map(rid => ({ id: rid, count: rooms[rid].users.length }));
    socket.emit('rooms-list', brief);
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = getRoom(currentRoom);
    room.users = room.users.filter(u => u.id !== socket.id);
    socket.to(currentRoom).emit('system', { text: `${username} disconnected` });
    io.to(currentRoom).emit('roster', { users: room.users.map(u => u.name) });
    cleanUpRoomIfEmpty(currentRoom);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`DarkWebChat server running on port ${PORT}`);
});
