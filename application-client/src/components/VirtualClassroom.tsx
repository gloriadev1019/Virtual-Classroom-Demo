import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Room, RoomEvent, RemoteParticipant, RemoteTrack, RemoteTrackPublication, Track } from 'livekit-client';
import { Tldraw, toRichText } from 'tldraw';
import { useSyncDemo } from '@tldraw/sync';
import 'tldraw/tldraw.css';
import './VirtualClassroom.css';

interface FileUploadResponse {
  success: boolean;
  filename?: string;
  path?: string;
  error?: string;
  details?: Record<string, string[]>;
}

interface FileConversionResponse {
  success: boolean;
  converted_file: string;
  url: string;
}

interface RemoteParticipantInfo {
  participant: RemoteParticipant;
  videoTrack: Track | null;
  audioTrack: Track | null;
}

const VirtualClassroom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role') as 'tutor' | 'student' | 'moderator' || 'student';
  
  const [participantName, setParticipantName] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [localTracks, setLocalTracks] = useState<{ video: boolean; audio: boolean }>({ video: false, audio: false });
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [convertedImages, setConvertedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [showNameInput, setShowNameInput] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  const LIVEKIT_URL = 'wss://virtual-classroom-wo4okd0f.livekit.cloud';
  const API_BASE_URL = 'http://192.168.105.3:6080';

  // Set up tldraw sync for real-time collaboration
  const syncStore = useSyncDemo({ 
    roomId: `classroom-${sessionId}`
  });



  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

  // Debug remote participants
  useEffect(() => {
    console.log('Remote participants updated:', remoteParticipants.map(p => ({
      identity: p.participant.identity,
      hasVideo: !!p.videoTrack,
      hasAudio: !!p.audioTrack,
      videoSid: p.videoTrack?.sid,
      audioSid: p.audioTrack?.sid
    })));
  }, [remoteParticipants]);

  const handleNameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (participantName.trim()) {
      setIsJoining(true);
      setShowNameInput(false);
      // Join the room after name is submitted
      await joinRoom();
      setIsJoining(false);
    }
  };

  const joinRoom = async () => {
    try {
      console.log('Starting to join room...');
      console.log('Session ID:', sessionId);
      console.log('Participant Name:', participantName);
      console.log('LiveKit URL:', LIVEKIT_URL);

      // Clear any previous error
      setError(null);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      setRoom(room);

      // Set up event listeners
      room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.on(RoomEvent.TrackMuted, (publication, participant) => {
        if (participant instanceof RemoteParticipant && publication instanceof RemoteTrackPublication) {
          handleTrackMuted(publication, participant);
        }
      });
      room.on(RoomEvent.TrackUnmuted, (publication, participant) => {
        if (participant instanceof RemoteParticipant && publication instanceof RemoteTrackPublication) {
          handleTrackUnmuted(publication, participant);
        }
      });

      // Add connection state change listener
      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        console.log('Connection state changed:', state);
        if (state === 'disconnected') {
          console.log('Room disconnected');
          setIsConnected(false);
        } else if (state === 'connected') {
          console.log('Room connected');
          setIsConnected(true);
        }
      });

      console.log('Getting token from backend...');
      // Get token from backend
      const token = await getToken(sessionId!, participantName);
      console.log('Token received, length:', token.length);
      
      if (!token || token.length === 0) {
        throw new Error('Invalid token received from server');
      }
      
      console.log('Connecting to LiveKit room...');
      // Connect to room with timeout
      const connectionPromise = room.connect(LIVEKIT_URL, token, {
        autoSubscribe: true,
      });
      
      // Add timeout to connection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 30000); // 30 seconds
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      
      console.log('Connected to room, enabling camera and microphone...');
      
      // Try to enable camera and microphone, but don't fail if it doesn't work
      try {
        await room.localParticipant.enableCameraAndMicrophone();
        setLocalTracks({ video: true, audio: true });
      } catch (mediaError) {
        console.warn('Could not enable camera/microphone:', mediaError);
        setLocalTracks({ video: false, audio: false });
      }

      // Set local video track
      if (videoRef.current && room.localParticipant.videoTrackPublications.size > 0) {
        const videoPublication = Array.from(room.localParticipant.videoTrackPublications.values())[0];
        if (videoPublication.videoTrack) {
          videoPublication.videoTrack.attach(videoRef.current);
        }
      }

      console.log('Successfully connected to room:', room.name);
      console.log('Local participant:', room.localParticipant.identity);
      console.log('Remote participants:', room.remoteParticipants.size);

    } catch (err) {
      console.error('Error joining room:', err);
      console.error('Error details:', {
        name: err instanceof Error ? err.name : 'Unknown',
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : 'No stack trace'
      });
      
      // Clean up room if it exists
      if (room) {
        try {
          room.disconnect();
        } catch (disconnectError) {
          console.warn('Error disconnecting room:', disconnectError);
        }
        setRoom(null);
      }
      
      setError(`Failed to join room: ${err instanceof Error ? err.message : 'Unknown error'}`);
      setIsConnected(false);
    }
  };

  const getToken = async (roomName: string, participantName: string): Promise<string> => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Requesting token from: ${API_BASE_URL}/api/token (attempt ${attempt}/${maxRetries})`);
        console.log('Request payload:', { roomName, participantName });
        
        const response = await fetch(`${API_BASE_URL}/api/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          mode: 'cors',
          credentials: 'omit',
          body: JSON.stringify({
            roomName,
            participantName,
          }),
        });

        console.log('Token response status:', response.status);
        console.log('Token response headers:', Object.fromEntries(response.headers.entries()));

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Token request failed:', errorText);
          throw new Error(`Failed to get token: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Token response data:', data);
        
        if (!data.token) {
          throw new Error('No token received from server');
        }
        
        return data.token;
      } catch (error) {
        lastError = error as Error;
        console.error(`Error in getToken (attempt ${attempt}/${maxRetries}):`, error);
        
        if (attempt < maxRetries) {
          console.log(`Retrying in ${attempt * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
        }
      }
    }
    
    throw lastError || new Error('Failed to get token after all retries');
  };

  const handleParticipantConnected = (participant: RemoteParticipant) => {
    console.log('Participant connected:', participant.identity);
    setRemoteParticipants(prev => [
      ...prev,
      {
        participant,
        videoTrack: null,
        audioTrack: null
      }
    ]);
  };

  const handleParticipantDisconnected = (participant: RemoteParticipant) => {
    console.log('Participant disconnected:', participant.identity);
    setRemoteParticipants(prev => prev.filter(p => p.participant.identity !== participant.identity));
  };

  const handleTrackSubscribed = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    console.log('Track subscribed:', track.kind, participant.identity);
    console.log('Track details:', {
      kind: track.kind,
      sid: track.sid,
      participant: participant.identity
    });
    
    setRemoteParticipants(prev => {
      const existing = prev.find(p => p.participant.identity === participant.identity);
      if (existing) {
        // Update existing participant
        return prev.map(p => {
          if (p.participant.identity === participant.identity) {
            if (track.kind === Track.Kind.Video) {
              console.log('Setting video track for:', participant.identity);
              return { ...p, videoTrack: track };
            } else if (track.kind === Track.Kind.Audio) {
              console.log('Setting audio track for:', participant.identity);
              return { ...p, audioTrack: track };
            }
          }
          return p;
        });
      } else {
        // Add new participant with track
        console.log('Adding new participant with track:', participant.identity, track.kind);
        return [
          ...prev,
          {
            participant,
            videoTrack: track.kind === Track.Kind.Video ? track : null,
            audioTrack: track.kind === Track.Kind.Audio ? track : null
          }
        ];
      }
    });
  };

  const handleTrackUnsubscribed = (track: RemoteTrack, _publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    console.log('Track unsubscribed:', track.kind, participant.identity);
    
    setRemoteParticipants(prev => prev.map(p => {
      if (p.participant.identity === participant.identity) {
        if (track.kind === Track.Kind.Video) {
          return { ...p, videoTrack: null };
        } else if (track.kind === Track.Kind.Audio) {
          return { ...p, audioTrack: null };
        }
      }
      return p;
    }));
  };

  const handleTrackMuted = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    console.log('Track muted:', publication.kind, participant.identity);
  };

  const handleTrackUnmuted = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    console.log('Track unmuted:', publication.kind, participant.identity);
  };

  const toggleVideo = async () => {
    if (!room) return;
    
    if (localTracks.video) {
      await room.localParticipant.setCameraEnabled(false);
      setLocalTracks(prev => ({ ...prev, video: false }));
    } else {
      await room.localParticipant.setCameraEnabled(true);
      setLocalTracks(prev => ({ ...prev, video: true }));
    }
  };

  const toggleAudio = async () => {
    if (!room) return;
    
    if (localTracks.audio) {
      await room.localParticipant.setMicrophoneEnabled(false);
      setLocalTracks(prev => ({ ...prev, audio: false }));
    } else {
      await room.localParticipant.setMicrophoneEnabled(true);
      setLocalTracks(prev => ({ ...prev, audio: true }));
    }
  };

  const leaveRoom = async () => {
    try {
      console.log('Leaving room...');
      
      if (room) {
        // Disconnect from LiveKit room
        await room.disconnect();
        console.log('Disconnected from LiveKit room');
      }
      
      // Reset all states
      setIsConnected(false);
      setRoom(null);
      setRemoteParticipants([]);
      setLocalTracks({ video: false, audio: false });
      setError(null);
      
      // Navigate back to session creation page
      window.location.href = '/admin/create-session';
      
    } catch (error) {
      console.error('Error leaving room:', error);
      // Even if there's an error, try to navigate back
      window.location.href = '/admin/create-session';
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Frontend validation
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Please upload PDF, DOCX, or PPTX files only.');
      return;
    }

    if (file.size > maxSize) {
      setError('File size too large. Maximum size is 10MB.');
      return;
    }

    setIsUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE_URL}/api/upload-file`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        body: formData,
      });

      const data: FileUploadResponse = await response.json();

      if (data.success && data.filename) {
        // Automatically convert the file
        await convertFile(data.filename);
      } else {
        // Handle validation errors and other failures
        if (response.status === 422 && data.details) {
          // Validation error - show specific details
          const errorMessages = Object.values(data.details).flat();
          setError(`File validation failed: ${errorMessages.join(', ')}`);
        } else if (data.error) {
          setError(`File upload failed: ${data.error}`);
        } else {
          setError('File upload failed');
        }
      }
    } catch (err) {
      console.error('File upload error:', err);
      if (err instanceof Error) {
        setError(`File upload failed: ${err.message}`);
      } else {
        setError('File upload failed');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const convertFile = async (filename: string) => {
    setIsConverting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/convert-file`, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filename }),
      });

      const data: FileConversionResponse = await response.json();

      if (data.success) {
        setConvertedImages(prev => [...prev, data.url]);
        
        // Automatically add the converted image to the whiteboard after a short delay
        setTimeout(() => {
          addImageToWhiteboard(data.url, convertedImages.length);
        }, 1000);
      } else {
        setError('File conversion failed');
      }
    } catch (err) {
      setError('File conversion failed');
    } finally {
      setIsConverting(false);
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const addImageToWhiteboard = (imageUrl: string, index: number) => {
    if (editorRef.current) {
      try {
        // Create a frame to contain the image reference
        editorRef.current.createShape({
          type: 'frame',
          x: 100 + (index * 50),
          y: 100 + (index * 50),
          props: {
            name: `Image ${index + 1}`,
            w: 400,
            h: 300,
          },
        });
        
        // Add a text note with the image URL inside the frame
        editorRef.current.createShape({
          type: 'note',
          x: 120 + (index * 50),
          y: 130 + (index * 50),
          props: {
            richText: toRichText(`📷 Image ${index + 1}\nClick to view: ${imageUrl}`),
            color: 'blue',
            align: 'start',
          },
        });
        
        console.log('Image frame and note added to whiteboard:', imageUrl);
      } catch (error) {
        console.error('Error adding image to whiteboard:', error);
        setError('Failed to add image to whiteboard');
      }
    } else {
      console.warn('Editor not ready yet');
      setError('Whiteboard not ready. Please try again.');
    }
  };

  if (showNameInput) {
    return (
      <div className="name-input-container">
        <div className="name-input-card">
          <h2>Enter Your Name</h2>
          <p>Session ID: {sessionId}</p>
          <p>Role: {role}</p>
          <form onSubmit={handleNameSubmit}>
            <input
              type="text"
              value={participantName}
              onChange={(e) => setParticipantName(e.target.value)}
              placeholder="Enter your name"
              required
              className="name-input"
              disabled={isJoining}
            />
            <button type="submit" className="name-submit-btn" disabled={isJoining}>
              {isJoining ? '🔄 Joining...' : 'Join Classroom'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <div className="error-actions">
          <button onClick={() => window.location.reload()} className="retry-btn">
            🔄 Retry Connection
          </button>
          <button onClick={() => setError(null)} className="dismiss-btn">
            ✕ Dismiss
          </button>
        </div>
        <div className="error-tips">
          <h4>Troubleshooting Tips:</h4>
          <ul>
            <li>Make sure the backend server is running on port 6080</li>
            <li>Check your internet connection</li>
            <li>Try refreshing the page</li>
            <li>Contact support if the issue persists</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="virtual-classroom">
      <div className="classroom-header">
        <div className="session-info">
          <h1>Virtual Classroom - Session {sessionId}</h1>
          <p>Role: {role.charAt(0).toUpperCase() + role.slice(1)} | Participant: {participantName}</p>
          <p>Connected: {isConnected ? 'Yes' : 'No'} | Remote Participants: {remoteParticipants.length}</p>
        </div>
        
        <div className="controls">
          <button 
            onClick={toggleVideo} 
            className={`control-btn ${localTracks.video ? 'active' : 'inactive'}`}
          >
            {localTracks.video ? '📹' : '🚫📹'}
          </button>
          
          <button 
            onClick={toggleAudio} 
            className={`control-btn ${localTracks.audio ? 'active' : 'inactive'}`}
          >
            {localTracks.audio ? '🎤' : '🚫🎤'}
          </button>
          
          {role === 'tutor' && (
            <button onClick={triggerFileUpload} className="control-btn upload-btn">
              📁 Upload
            </button>
          )}
          
          <button 
            onClick={() => {
              if (window.confirm('Are you sure you want to leave the classroom? This will end your session.')) {
                leaveRoom();
              }
            }} 
            className="control-btn leave-btn"
          >
            🚪 Leave
          </button>
        </div>
      </div>

      <div className="classroom-content">
        <div className="video-section">
          <div className="local-video">
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline
              className="video-element"
            />
            <div className="video-label">You ({participantName})</div>
          </div>
          
          {remoteParticipants.map((remoteParticipant) => (
            <div key={remoteParticipant.participant.identity} className="remote-video">
              {remoteParticipant.videoTrack ? (
                <video
                  key={`${remoteParticipant.participant.identity}-${remoteParticipant.videoTrack.sid}`}
                  autoPlay
                  playsInline
                  className="video-element"
                  ref={(el) => {
                    if (el && remoteParticipant.videoTrack) {
                      console.log('Attaching video track to element for:', remoteParticipant.participant.identity);
                      try {
                        remoteParticipant.videoTrack.attach(el);
                        console.log('Video track attached successfully for:', remoteParticipant.participant.identity);
                      } catch (error) {
                        console.error('Error attaching video track:', error);
                      }
                    }
                  }}
                />
              ) : (
                <div className="video-placeholder">
                  <div className="participant-info">
                    <span>{remoteParticipant.participant.identity}</span>
                    <br />
                    <small>Camera Off</small>
                  </div>
                </div>
              )}
              <div className="video-label">
                {remoteParticipant.participant.identity}
                {remoteParticipant.videoTrack && <span className="video-status">📹</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="whiteboard-section">
          <div className="whiteboard-header">
            <h3>Interactive Whiteboard</h3>
            <div className="whiteboard-info">
              <span className="role-badge">{role}</span>
              <span className="participant-badge">{participantName}</span>
            </div>
            {convertedImages.length > 0 && (
              <div className="converted-files">
                <h4>📁 Uploaded Files</h4>
                <p className="file-instructions">Click any file to add it to the whiteboard</p>
                <div className="file-grid">
                  {convertedImages.map((url, index) => (
                    <div key={index} className="file-item" onClick={() => addImageToWhiteboard(url, index)}>
                      <img 
                        src={url} 
                        alt={`Converted file ${index + 1}`}
                        className="converted-image"
                      />
                      <div className="file-overlay">
                        <span className="file-number">#{index + 1}</span>
                        <span className="add-to-whiteboard">➕ Add to Whiteboard</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="whiteboard-container">
            <Tldraw 
              store={syncStore}
              autoFocus
              inferDarkMode
              onMount={(editor) => {
                // Store editor reference for later use
                editorRef.current = editor;
                
                // Set up the editor with session-specific configuration
                editor.setCurrentTool('select');
              }}
            />
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />

      {(isUploading || isConverting || isJoining) && (
        <div className="loading-overlay">
          <div className="loading-spinner">
            {isJoining ? 'Joining classroom...' : isUploading ? 'Uploading file...' : 'Converting file...'}
          </div>
        </div>
      )}
    </div>
  );
};

export default VirtualClassroom;
