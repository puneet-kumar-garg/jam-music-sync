const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors({
  origin: true,
  methods: ["GET", "POST"],
  credentials: true
}));
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'JAM Music Sync Server is running!', status: 'online' });
});

// Store active sessions
const sessions = new Map();

class MusicSession {
  constructor(id, hostId) {
    this.id = id;
    this.hostId = hostId;
    this.clients = new Map();
    this.currentTrack = null;
    this.isPlaying = false;
    this.position = 0;
    this.volume = 1;
    this.lastUpdate = Date.now();
    this.controlsLocked = false;
  }

  addClient(socketId, isHost = false, userName = 'Anonymous') {
    this.clients.set(socketId, { isHost, userName, joinedAt: Date.now() });
  }

  removeClient(socketId) {
    this.clients.delete(socketId);
    return this.clients.size === 0;
  }

  getCurrentPosition() {
    if (!this.isPlaying) return this.position;
    return this.position + (Date.now() - this.lastUpdate) / 1000;
  }

  updateState(state) {
    this.isPlaying = state.isPlaying;
    this.position = state.position;
    this.volume = state.volume || this.volume;
    this.currentTrack = state.currentTrack || this.currentTrack;
    this.lastUpdate = Date.now();
  }
}

// Create session
app.post('/api/session', (req, res) => {
  const sessionId = uuidv4().substring(0, 8);
  const hostId = uuidv4();
  const session = new MusicSession(sessionId, hostId);
  sessions.set(sessionId, session);
  
  res.json({ sessionId, hostId });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get session info
app.get('/api/session/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    id: session.id,
    clientCount: session.clients.size,
    currentTrack: session.currentTrack,
    isPlaying: session.isPlaying,
    position: session.getCurrentPosition(),
    volume: session.volume
  });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join-session', ({ sessionId, isHost, hostId, userName }) => {
    const session = sessions.get(sessionId);
    if (!session) {
      socket.emit('error', 'Session not found');
      return;
    }

    if (isHost && session.hostId !== hostId) {
      socket.emit('error', 'Invalid host credentials');
      return;
    }

    const name = isHost ? 'Puneet' : (userName || 'Anonymous');
    socket.join(sessionId);
    session.addClient(socket.id, isHost, name);
    socket.sessionId = sessionId;
    socket.isHost = isHost;
    socket.userName = name;

    // Send current state to new client
    socket.emit('sync-state', {
      currentTrack: session.currentTrack,
      isPlaying: session.isPlaying,
      position: session.getCurrentPosition(),
      volume: session.volume,
      serverTime: Date.now(),
      controlsLocked: session.controlsLocked
    });

    // Get all users list
    const usersList = Array.from(session.clients.values()).map(client => ({
      name: client.userName,
      isHost: client.isHost
    }));

    // Send users list to all clients
    io.to(sessionId).emit('users-updated', {
      users: usersList,
      clientCount: session.clients.size
    });

    // Notify host about new user for WebRTC connection
    if (!isHost) {
      socket.to(sessionId).emit('user-joined', {
        userId: socket.id,
        userName: name
      });
    }

    console.log(`Client ${socket.id} joined session ${sessionId} as ${isHost ? 'host' : 'guest'}`);
  });

  socket.on('play', (data) => {
    if (!socket.sessionId || (!socket.isHost && sessions.get(socket.sessionId)?.controlsLocked)) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.updateState({
      isPlaying: true,
      position: data.position,
      currentTrack: data.currentTrack
    });

    socket.to(socket.sessionId).emit('play', {
      position: session.position,
      serverTime: Date.now(),
      currentTrack: session.currentTrack
    });
  });

  socket.on('pause', (data) => {
    if (!socket.sessionId || (!socket.isHost && sessions.get(socket.sessionId)?.controlsLocked)) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.updateState({
      isPlaying: false,
      position: data.position
    });

    socket.to(socket.sessionId).emit('pause', {
      position: session.position,
      serverTime: Date.now()
    });
  });

  socket.on('seek', (data) => {
    if (!socket.sessionId || (!socket.isHost && sessions.get(socket.sessionId)?.controlsLocked)) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.updateState({
      position: data.position,
      isPlaying: session.isPlaying
    });

    socket.to(socket.sessionId).emit('seek', {
      position: session.position,
      serverTime: Date.now()
    });
  });

  socket.on('volume-change', (data) => {
    if (!socket.sessionId || (!socket.isHost && sessions.get(socket.sessionId)?.controlsLocked)) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.volume = data.volume;
    socket.to(socket.sessionId).emit('volume-change', { volume: data.volume });
  });

  socket.on('track-change', (data) => {
    if (!socket.sessionId || (!socket.isHost && sessions.get(socket.sessionId)?.controlsLocked)) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.updateState({
      currentTrack: data.track,
      position: 0,
      isPlaying: false
    });

    socket.to(socket.sessionId).emit('track-change', {
      track: data.track,
      serverTime: Date.now()
    });
  });

  socket.on('toggle-controls', () => {
    if (!socket.sessionId || !socket.isHost) return;
    
    const session = sessions.get(socket.sessionId);
    if (!session) return;

    session.controlsLocked = !session.controlsLocked;
    io.to(socket.sessionId).emit('controls-toggled', { locked: session.controlsLocked });
  });

  socket.on('ping', () => {
    socket.emit('pong', Date.now());
  });

  // WebRTC signaling
  socket.on('webrtc-offer', (data) => {
    socket.to(data.to).emit('webrtc-offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on('webrtc-answer', (data) => {
    socket.to(data.to).emit('webrtc-answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on('webrtc-ice-candidate', (data) => {
    socket.to(data.to).emit('webrtc-ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  socket.on('start-audio-stream', () => {
    socket.to(socket.sessionId).emit('host-started-stream', {
      hostId: socket.id
    });
  });

  socket.on('stop-audio-stream', () => {
    socket.to(socket.sessionId).emit('host-stopped-stream');
  });

  socket.on('disconnect', () => {
    if (socket.sessionId) {
      const session = sessions.get(socket.sessionId);
      if (session) {
        const isEmpty = session.removeClient(socket.id);
        if (isEmpty) {
          sessions.delete(socket.sessionId);
          console.log(`Session ${socket.sessionId} deleted`);
        } else {
          const usersList = Array.from(session.clients.values()).map(client => ({
            name: client.userName,
            isHost: client.isHost
          }));
          
          socket.to(socket.sessionId).emit('users-updated', {
            users: usersList,
            clientCount: session.clients.size
          });
        }
      }
    }
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});