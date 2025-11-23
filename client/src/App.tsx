import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { Play, Pause, SkipForward, SkipBack, Volume2, Users, Upload, Link, Lock, Unlock } from 'lucide-react';
import './App.css';

interface Track {
  id: string;
  name: string;
  url?: string;
  duration: number;
  isLiveStream?: boolean;
}

interface SyncState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number;
  volume: number;
  serverTime: number;
  controlsLocked: boolean;
}

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  const [, setHostId] = useState<string>('');
  const [isHost, setIsHost] = useState<boolean>(false);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [clientCount, setClientCount] = useState<number>(0);
  const [users, setUsers] = useState<Array<{name: string, isHost: boolean}>>([]);
  const [userName, setUserName] = useState<string>('');
  const [showNameInput, setShowNameInput] = useState<boolean>(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [position, setPosition] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [controlsLocked, setControlsLocked] = useState<boolean>(false);
  const [latency, setLatency] = useState<number>(0);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [peerConnections, setPeerConnections] = useState<Map<string, RTCPeerConnection>>(new Map());
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncTime = useRef<number>(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(serverUrl);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('sync-state', (state: SyncState) => {
      const networkDelay = Date.now() - state.serverTime;
      const adjustedPosition = state.position + (networkDelay / 1000);
      
      console.log('Sync state received:', state);
      setCurrentTrack(state.currentTrack);
      setIsPlaying(state.isPlaying);
      setPosition(adjustedPosition);
      setVolume(state.volume);
      setControlsLocked(state.controlsLocked);
      
      // Update users from sync state
      if (state.users) {
        setUsers(state.users);
        setClientCount(state.users.length);
      }
      
      if (audioRef.current && state.currentTrack) {
        audioRef.current.volume = state.volume;
        if (state.currentTrack.isLiveStream) {
          console.log('Setting up live stream for guest');
          audioRef.current.muted = !state.isPlaying;
          if (state.isPlaying) {
            audioRef.current.play().catch(e => console.log('Play failed:', e));
          }
        } else {
          audioRef.current.currentTime = adjustedPosition;
          if (state.isPlaying) {
            audioRef.current.play().catch(e => console.log('Play failed:', e));
          } else {
            audioRef.current.pause();
          }
        }
      }
    });

    newSocket.on('play', (data) => {
      const networkDelay = Date.now() - data.serverTime;
      const adjustedPosition = data.position + (networkDelay / 1000);
      
      console.log('Play event received:', data);
      setIsPlaying(true);
      setPosition(adjustedPosition);
      if (data.currentTrack) setCurrentTrack(data.currentTrack);
      
      if (audioRef.current) {
        if (data.currentTrack?.isLiveStream) {
          console.log('Playing live stream');
          audioRef.current.muted = false;
        } else {
          audioRef.current.currentTime = adjustedPosition;
        }
        audioRef.current.play().catch(e => console.log('Play failed:', e));
      }
    });

    newSocket.on('pause', (data) => {
      console.log('Pause event received:', data);
      setIsPlaying(false);
      setPosition(data.position);
      if (audioRef.current) {
        if (currentTrack?.isLiveStream) {
          console.log('Muting live stream');
          audioRef.current.muted = true;
        } else {
          audioRef.current.pause();
          audioRef.current.currentTime = data.position;
        }
      }
    });

    newSocket.on('seek', (data) => {
      const networkDelay = Date.now() - data.serverTime;
      const adjustedPosition = data.position + (networkDelay / 1000);
      
      setPosition(adjustedPosition);
      if (audioRef.current && !currentTrack?.isLiveStream) {
        audioRef.current.currentTime = adjustedPosition;
      }
    });

    newSocket.on('volume-change', (data) => {
      setVolume(data.volume);
      if (audioRef.current) {
        audioRef.current.volume = data.volume;
      }
      if (audioContextRef.current && sourceNodeRef.current) {
        // Volume control for live stream would need gain node
      }
    });

    newSocket.on('track-change', (data) => {
      console.log('Track changed:', data.track);
      setCurrentTrack(data.track);
      setPosition(0);
      setIsPlaying(false);
      if (audioRef.current && !data.track?.isLiveStream) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    });

    newSocket.on('users-updated', (data) => {
      console.log('Users updated:', data);
      setUsers(data.users || []);
      setClientCount(data.clientCount || 0);
    });

    // WebRTC signaling events
    newSocket.on('webrtc-offer', async (data) => {
      await handleWebRTCOffer(data.offer, data.from, newSocket);
    });

    newSocket.on('webrtc-answer', async (data) => {
      await handleWebRTCAnswer(data.answer, data.from);
    });

    newSocket.on('webrtc-ice-candidate', async (data) => {
      await handleICECandidate(data.candidate, data.from);
    });

    newSocket.on('user-joined', (data) => {
      console.log('User joined for WebRTC:', data);
      if (isHost && localStreamRef.current) {
        setTimeout(() => {
          createPeerConnection(data.userId, newSocket);
        }, 1000);
      }
    });

    newSocket.on('host-started-stream', (data) => {
      console.log('Host started streaming');
    });

    newSocket.on('host-stopped-stream', () => {
      console.log('Host stopped streaming');
      setIsStreaming(false);
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    });

    newSocket.on('controls-toggled', (data) => {
      setControlsLocked(data.locked);
    });

    newSocket.on('pong', (serverTime) => {
      const roundTripTime = Date.now() - serverTime;
      setLatency(roundTripTime / 2);
    });

    // Ping server every 5 seconds for latency measurement
    const pingInterval = setInterval(() => {
      newSocket.emit('ping');
    }, 5000);

    return () => {
      clearInterval(pingInterval);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync position updates
  useEffect(() => {
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    
    if (isPlaying && audioRef.current && !currentTrack?.isLiveStream) {
      syncIntervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const currentTime = audioRef.current.currentTime;
          setPosition(currentTime);
          
          // Drift correction
          const timeSinceLastSync = Date.now() - lastSyncTime.current;
          if (timeSinceLastSync > 10000) { // Sync every 10 seconds
            const drift = Math.abs(currentTime - position);
            if (drift > 0.5) { // If drift > 500ms, correct it
              audioRef.current.currentTime = position;
            }
            lastSyncTime.current = Date.now();
          }
        }
      }, 100);
    } else if (isPlaying && currentTrack?.isLiveStream) {
      // For live streams, just update position based on time
      syncIntervalRef.current = setInterval(() => {
        setPosition(prev => prev + 0.1);
      }, 100);
    }

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, position]);

  const createSession = async () => {
    try {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:3001';
      console.log('Creating session with server:', serverUrl);
      const response = await fetch(`${serverUrl}/api/session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Session created:', data);
      setSessionId(data.sessionId);
      setHostId(data.hostId);
      setIsHost(true);
      joinSession(data.sessionId, true, data.hostId, 'Puneet');
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session. Please check console for details.');
    }
  };

  const handleJoinSession = () => {
    if (!sessionId.trim()) {
      alert('Please enter session ID');
      return;
    }
    setShowNameInput(true);
  };

  const joinSession = (id: string, host: boolean = false, hId: string = '', name: string = '') => {
    if (!socket) return;
    
    console.log('Joining session:', { id, host, name });
    socket.emit('join-session', {
      sessionId: id,
      isHost: host,
      hostId: hId,
      userName: name
    });
    
    setIsConnected(true);
    setIsHost(host);
  };

  const handleJoinWithName = () => {
    if (!userName.trim()) {
      alert('Please enter your name');
      return;
    }
    joinSession(sessionId, false, '', userName);
    setShowNameInput(false);
  };

  // WebRTC functions
  const createPeerConnection = async (userId: string, socket: any) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', {
          candidate: event.candidate,
          to: userId
        });
      }
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    setPeerConnections(prev => new Map(prev.set(userId, pc)));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    socket.emit('webrtc-offer', {
      offer: offer,
      to: userId
    });
  };

  const handleWebRTCOffer = async (offer: RTCSessionDescriptionInit, from: string, socket: any) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc-ice-candidate', {
          candidate: event.candidate,
          to: from
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('Received remote stream from host');
      if (audioRef.current) {
        audioRef.current.srcObject = event.streams[0];
        audioRef.current.play().catch(e => console.log('Auto-play blocked:', e));
        setIsStreaming(true);
        setCurrentTrack({
          id: 'webrtc-stream',
          name: 'Live Audio from Host',
          duration: 0,
          isLiveStream: true
        });
      }
    };

    setPeerConnections(prev => new Map(prev.set(from, pc)));

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    socket.emit('webrtc-answer', {
      answer: answer,
      to: from
    });
  };

  const handleWebRTCAnswer = async (answer: RTCSessionDescriptionInit, from: string) => {
    const pc = peerConnections.get(from);
    if (pc) {
      await pc.setRemoteDescription(answer);
    }
  };

  const handleICECandidate = async (candidate: RTCIceCandidateInit, from: string) => {
    const pc = peerConnections.get(from);
    if (pc) {
      await pc.addIceCandidate(candidate);
    }
  };

  const startAudioCapture = async () => {
    try {
      // Mac requires video track for system audio - we'll hide it
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        },
        video: {
          width: 1280,
          height: 720
        }
      });
      
      // Keep only audio track
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      
      if (audioTracks.length === 0) {
        throw new Error('No system audio available - make sure to check "Share system audio"');
      }
      
      // Stop video tracks to save bandwidth
      videoTracks.forEach(track => {
        track.stop();
        stream.removeTrack(track);
      });
      
      setMediaStream(stream);
      setIsCapturing(true);
      
      // Create audio context for processing
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const destination = audioContext.createMediaStreamDestination();
      
      source.connect(destination);
      
      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      destinationRef.current = destination;
      
      // Create live stream track
      const track: Track = {
        id: Date.now().toString(),
        name: 'Mac System Audio (Spotify/Music)',
        duration: 0,
        isLiveStream: true
      };
      
      setCurrentTrack(track);
      if (socket) {
        socket.emit('track-change', { track });
      }
      
      // Set up audio element to play the captured stream
      if (audioRef.current) {
        audioRef.current.srcObject = destination.stream;
        console.log('Audio stream set up for host');
      }
      
      // Store stream for WebRTC sharing
      localStreamRef.current = stream;
      setIsStreaming(true);
      
      // Create peer connections for existing users
      users.forEach(user => {
        if (!user.isHost) {
          // Will be handled by server signaling
        }
      });
      
      // Broadcast stream to all clients via WebRTC
      if (socket) {
        console.log('Broadcasting audio stream to clients via WebRTC');
        socket.emit('start-audio-stream');
      }
      
    } catch (error) {
      console.error('Failed to capture system audio:', error);
      alert('Mac System Audio Setup:\n\n✅ Chrome flag enabled: chrome://flags/#enable-experimental-web-platform-features\n\n📱 When popup appears:\n1. Select "Entire Screen" or your display\n2. ✅ Check "Share system audio" (bottom of dialog)\n3. Click "Share"\n\n🎵 Then play Spotify - everyone will hear it!\n\nIf no "Share system audio" option: Try Chrome Canary or Edge');
    }
  };
  
  const stopAudioCapture = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Close all peer connections
    peerConnections.forEach(pc => pc.close());
    setPeerConnections(new Map());
    
    localStreamRef.current = null;
    setIsCapturing(false);
    setIsStreaming(false);
    setCurrentTrack(null);
    
    if (socket) {
      socket.emit('stop-audio-stream');
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('audio/')) return;

    const url = URL.createObjectURL(file);
    const track: Track = {
      id: Date.now().toString(),
      name: file.name,
      url,
      duration: 0
    };

    setCurrentTrack(track);
    if (socket) {
      socket.emit('track-change', { track });
    }
  };

  const togglePlay = () => {
    if (!socket || (!isHost && controlsLocked)) return;
    
    const newPlaying = !isPlaying;
    const currentPos = currentTrack?.isLiveStream ? 0 : (audioRef.current?.currentTime || 0);
    
    if (newPlaying) {
      socket.emit('play', { position: currentPos, currentTrack });
      if (audioRef.current) {
        if (currentTrack?.isLiveStream) {
          audioRef.current.muted = false;
        }
        audioRef.current.play();
      }
    } else {
      socket.emit('pause', { position: currentPos });
      if (audioRef.current) {
        if (currentTrack?.isLiveStream) {
          audioRef.current.muted = true;
        } else {
          audioRef.current.pause();
        }
      }
    }
  };

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!socket || (!isHost && controlsLocked) || !currentTrack || currentTrack.isLiveStream) return;
    
    const newPosition = parseFloat(event.target.value);
    setPosition(newPosition);
    socket.emit('seek', { position: newPosition });
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!socket || (!isHost && controlsLocked)) return;
    
    const newVolume = parseFloat(event.target.value);
    setVolume(newVolume);
    socket.emit('volume-change', { volume: newVolume });
  };

  const toggleControls = () => {
    if (!socket || !isHost) return;
    socket.emit('toggle-controls');
  };

  const copySessionLink = () => {
    const link = `${window.location.origin}?session=${sessionId}`;
    navigator.clipboard.writeText(link);
    alert('Session link copied to clipboard!');
  };

  // Auto-join from URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionParam = urlParams.get('session');
    if (sessionParam && !isConnected) {
      setSessionId(sessionParam);
      setShowNameInput(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  if (!isConnected) {
    return (
      <div className="app">
        <div className="welcome">
          <h1>🎵 JAM - Listen Together</h1>
          <div className="session-controls">
            <button onClick={createSession} className="btn-primary">
              Create Session
            </button>
            <div className="join-section">
              <input
                type="text"
                placeholder="Enter session ID"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="session-input"
              />
              <button 
                onClick={handleJoinSession}
                disabled={!sessionId}
                className="btn-secondary"
              >
                Join Session
              </button>
            </div>
            
            {showNameInput && (
              <div className="name-input-modal">
                <div className="name-input-content">
                  <h3>Enter Your Name</h3>
                  <input
                    type="text"
                    placeholder="Your name"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="name-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinWithName()}
                  />
                  <div className="name-input-buttons">
                    <button onClick={handleJoinWithName} className="btn-primary">
                      Join
                    </button>
                    <button onClick={() => setShowNameInput(false)} className="btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>🎵 JAM</h1>
        <div className="session-info">
          <span className="session-id">Session: {sessionId}</span>
          <div className="users-section">
            <div className="users-count">
              <Users size={16} />
              <span>{clientCount} online</span>
            </div>
            <div className="users-list-visible">
              {users.map((user, index) => (
                <div key={index} className="user-badge-small">
                  {user.isHost ? '👑' : '🎧'} {user.name}
                </div>
              ))}
            </div>
          </div>
          <div className="latency">
            Latency: {latency}ms
          </div>
          {isHost && (
            <>
              <button onClick={copySessionLink} className="btn-icon">
                <Link size={16} />
              </button>
              <button onClick={toggleControls} className="btn-icon">
                {controlsLocked ? <Lock size={16} /> : <Unlock size={16} />}
              </button>
            </>
          )}
          <button onClick={() => window.location.reload()} className="btn-quit">
            ✕ Quit
          </button>
        </div>
      </header>

      <main className="player">
        <div className="track-info">
          {currentTrack ? (
            <>
              <h2>{currentTrack.name}</h2>
              <div className="user-badge">
                {isHost ? '👑 Host' : '🎧 Listener'}
              </div>
            </>
          ) : (
            <div className="no-track">
              {isHost ? (
                <>
                  <p>Select audio source to share</p>
                  <div className="audio-options">
                    {!isCapturing ? (
                      <>
                        <button 
                          onClick={startAudioCapture}
                          className="btn-capture"
                        >
                          🎵 Share System Audio (Spotify/Music)
                        </button>
                        <div className="audio-note">
                          🎉 Your audio will stream live to all listeners!
                        </div>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={stopAudioCapture}
                          className="btn-stop"
                        >
                          ⏹️ Stop Sharing
                        </button>
                        {isStreaming && (
                          <div className="streaming-indicator">
                            🔴 Live streaming to {clientCount - 1} listeners
                          </div>
                        )}
                      </>
                    )}
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="btn-upload"
                    >
                      <Upload size={16} />
                      Upload File
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {currentTrack ? (
                    <>
                      <p>Listening to host's audio</p>
                      <div className="guest-listening">
                        🎵 {currentTrack.name}
                      </div>
                    </>
                  ) : (
                    <>
                      <p>Waiting for host to share audio...</p>
                      <div className="guest-waiting">
                        🎧 You'll hear audio when the host starts sharing
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {currentTrack && (
          <>
            <audio
              ref={audioRef}
              src={currentTrack.isLiveStream ? undefined : currentTrack.url}
              onLoadedMetadata={() => {
                if (audioRef.current && !currentTrack.isLiveStream) {
                  setCurrentTrack(prev => prev ? {...prev, duration: audioRef.current!.duration} : null);
                }
              }}
            />

            <div className="progress-container">
              <span className="time">{formatTime(position)}</span>
              <input
                type="range"
                min="0"
                max={currentTrack.duration || 100}
                value={position}
                onChange={handleSeek}
                disabled={(!isHost && controlsLocked) || currentTrack.isLiveStream}
                className="progress-bar"
              />
              <span className="time">{formatTime(currentTrack.duration)}</span>
            </div>

            <div className="controls">
              <button 
                className="btn-control"
                disabled={!isHost && controlsLocked}
              >
                <SkipBack size={20} />
              </button>
              
              <button 
                onClick={togglePlay}
                className="btn-play"
                disabled={!isHost && controlsLocked}
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>
              
              <button 
                className="btn-control"
                disabled={!isHost && controlsLocked}
              >
                <SkipForward size={20} />
              </button>
            </div>

            <div className="volume-container">
              <Volume2 size={16} />
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                disabled={!isHost && controlsLocked}
                className="volume-slider"
              />
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
      </main>
    </div>
  );
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export default App;