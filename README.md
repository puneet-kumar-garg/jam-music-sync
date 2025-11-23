# JAM - Real-Time Music Sync Application

A full-stack application that allows multiple users to listen to music together in perfect real-time synchronization.

## Features

### Core Functionality
- **Real-time audio sync** - All listeners hear the same track at the exact timestamp
- **Automatic drift correction** - Compensates for network latency and audio drift
- **Host controls** - Play, pause, seek, volume control with instant sync
- **Session management** - Create/join sessions via shareable links
- **Multi-device support** - Works on desktop and mobile browsers

### Real-Time Communication
- **WebSocket-based sync** - Instant control synchronization using Socket.IO
- **Latency compensation** - Automatic network delay adjustment
- **Heartbeat monitoring** - Continuous latency measurement and correction
- **Server timestamp sync** - NTP-like synchronization for perfect timing

### User Experience
- **Host/Guest system** - Clear role indicators and permissions
- **Control locking** - Host can lock/unlock guest controls
- **Live user count** - See who's listening in real-time
- **Responsive design** - Optimized for all screen sizes

## Architecture

### Backend (Node.js + Socket.IO)
- **Express server** - REST API for session management
- **Socket.IO** - Real-time WebSocket communication
- **Session management** - In-memory session storage with automatic cleanup
- **Timestamp synchronization** - Server-side time coordination

### Frontend (React + TypeScript)
- **React hooks** - Modern state management
- **Web Audio API** - Precise audio control and sync
- **Socket.IO client** - Real-time communication
- **Responsive UI** - Mobile-first design

### Sync Logic
1. **Server maintains authoritative state** - Position, play status, volume
2. **Network delay compensation** - Adjusts playback based on measured latency
3. **Drift correction** - Periodic sync checks prevent audio drift
4. **Timestamp-based sync** - Uses server time for perfect coordination

## Setup Instructions

### Prerequisites
- Node.js 16+ and npm
- Modern web browser with Web Audio API support

### Installation

1. **Clone and setup**:
```bash
cd JAM
npm install
```

2. **Install dependencies**:
```bash
# Server dependencies
cd server && npm install

# Client dependencies  
cd ../client && npm install
```

3. **Start development servers**:
```bash
# From root directory
npm run dev
```

This starts:
- Backend server on `http://localhost:3001`
- Frontend client on `http://localhost:3000`

### Production Build

```bash
# Build client
cd client && npm run build

# Start production server
cd ../server && npm start
```

## API Documentation

### REST Endpoints

#### Create Session
```
POST /api/session
Response: { sessionId: string, hostId: string }
```

#### Get Session Info
```
GET /api/session/:id
Response: { 
  id: string, 
  clientCount: number, 
  currentTrack: Track | null,
  isPlaying: boolean,
  position: number,
  volume: number 
}
```

### WebSocket Events

#### Client → Server
- `join-session` - Join a music session
- `play` - Start playback
- `pause` - Pause playback  
- `seek` - Change track position
- `volume-change` - Adjust volume
- `track-change` - Switch tracks
- `toggle-controls` - Lock/unlock guest controls
- `ping` - Latency measurement

#### Server → Client
- `sync-state` - Full state synchronization
- `play` - Playback started
- `pause` - Playback paused
- `seek` - Position changed
- `volume-change` - Volume adjusted
- `track-change` - Track switched
- `user-joined` - New user connected
- `user-left` - User disconnected
- `controls-toggled` - Control permissions changed
- `pong` - Latency response

## Usage Guide

### Creating a Session
1. Click "Create Session" 
2. Upload an audio file
3. Share the session link with others
4. Control playback - all connected users sync automatically

### Joining a Session
1. Click the shared session link
2. Or manually enter session ID and click "Join Session"
3. Audio will sync automatically when host plays music

### Host Controls
- **Play/Pause** - Controls playback for all users
- **Seek** - Jump to any position in the track
- **Volume** - Adjust volume for all users
- **Lock Controls** - Prevent guests from controlling playback
- **Share Link** - Copy session URL to clipboard

## Deployment

### Vercel (Frontend)
```bash
cd client
npm run build
# Deploy build folder to Vercel
```

### Render/Heroku (Backend)
```bash
cd server
# Set PORT environment variable
# Deploy to Render or Heroku
```

### Environment Variables
- `PORT` - Server port (default: 3001)
- Update client Socket.IO connection URL for production

## Technical Implementation

### Real-Time Sync Algorithm
1. **Server State Management** - Authoritative game state pattern
2. **Client Prediction** - Immediate UI updates with server reconciliation  
3. **Lag Compensation** - Network delay measurement and adjustment
4. **Drift Correction** - Periodic sync to prevent audio desynchronization

### Audio Synchronization
- Uses `HTMLAudioElement.currentTime` for precise positioning
- Measures network latency via ping/pong
- Adjusts playback position based on network delay
- Implements drift detection and correction every 10 seconds

### Session Management
- UUID-based session IDs (8 characters)
- In-memory session storage with automatic cleanup
- Host authentication via secure host ID
- Real-time user count tracking

## Browser Compatibility
- Chrome 66+
- Firefox 60+  
- Safari 11.1+
- Edge 79+

## Limitations
- Audio files must be uploaded (no streaming service integration)
- Sessions are temporary (no persistence)
- Limited to browser-supported audio formats
- Requires stable internet connection for best sync

## Future Enhancements
- Spotify/YouTube integration
- Persistent sessions with database
- Voice chat integration
- Playlist management
- Mobile app versions