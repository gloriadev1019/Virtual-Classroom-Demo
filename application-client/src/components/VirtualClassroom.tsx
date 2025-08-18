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

interface SessionResponse {
  success: boolean;
  session: {
    id: string;
    subject: string;
    tutor_name: string;
    student_name: string;
  };
}

const VirtualClassroom: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const nameFromUrl = searchParams.get('name');
  const role = (searchParams.get('role') as 'tutor' | 'student' | 'moderator') || 'student';
  
  const [participantName, setParticipantName] = useState<string>(nameFromUrl || '');
  const [room, setRoom] = useState<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [localTracks, setLocalTracks] = useState<{ video: boolean; audio: boolean }>({ video: false, audio: false });
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipantInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [convertedImages, setConvertedImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [currentView, setCurrentView] = useState<'whiteboard' | 'share' | 'file'>('whiteboard');
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareTrack, setScreenShareTrack] = useState<any>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  const LIVEKIT_URL = 'wss://virtual-classroom-wo4okd0f.livekit.cloud';
  const API_BASE_URL = 'http://192.168.105.3:6080';

  // Set up tldraw sync for real-time collaboration
  const syncStore = useSyncDemo({ 
    roomId: `classroom-${sessionId}`
  });

  // Timer effect
  useEffect(() => {
    if (isConnected) {
      const interval = setInterval(() => {
        setSessionTimer(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
      audioMuted: p.audioTrack?.isMuted,
      videoSid: p.videoTrack?.sid,
      audioSid: p.audioTrack?.sid
    })));
  }, [remoteParticipants]);

  // Monitor local participant audio state
  useEffect(() => {
    if (room && room.localParticipant) {
      const audioPublications = Array.from(room.localParticipant.audioTrackPublications.values());
      if (audioPublications.length > 0) {
        const audioTrack = audioPublications[0].track;
        if (audioTrack) {
          const updateLocalAudioState = () => {
            setLocalTracks(prev => ({
              ...prev,
              audio: !audioTrack.isMuted
            }));
          };
          
          audioTrack.on('muted', updateLocalAudioState);
          audioTrack.on('unmuted', updateLocalAudioState);
          
          // Initial state
          updateLocalAudioState();
          
          return () => {
            audioTrack.off('muted', updateLocalAudioState);
            audioTrack.off('unmuted', updateLocalAudioState);
          };
        }
      }
    }
  }, [room]);

  // Resolve participant display name from DB based on role, or URL override
  useEffect(() => {
    const resolveName = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch session');
        }
        const data: SessionResponse = await response.json();
        const dbNameForRole = role === 'tutor'
          ? data.session.tutor_name
          : role === 'student'
            ? data.session.student_name
            : 'Moderator';

        const baseName = nameFromUrl || dbNameForRole || `Participant_${Math.floor(Math.random() * 1000)}`;
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        setParticipantName(`${baseName} (${roleLabel})`);
      } catch (_e) {
        const baseName = nameFromUrl || `Participant_${Math.floor(Math.random() * 1000)}`;
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        setParticipantName(`${baseName} (${roleLabel})`);
      }
    };

    if (sessionId && !participantName) {
      resolveName();
    }
  }, [sessionId, role, nameFromUrl, participantName]);

  // Auto-join room when component mounts
  useEffect(() => {
    if (sessionId && participantName && !isJoining && !isConnected) {
      const autoJoin = async () => {
        setIsJoining(true);
        await joinRoom();
        setIsJoining(false);
      };
      autoJoin();
    }
  }, [sessionId, participantName]);



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
    
    // Update participant state when track is muted
    setRemoteParticipants(prev => prev.map(p => {
      if (p.participant.identity === participant.identity) {
        if (publication.kind === Track.Kind.Audio) {
          return { ...p, audioTrack: null };
        } else if (publication.kind === Track.Kind.Video) {
          return { ...p, videoTrack: null };
        }
      }
      return p;
    }));
  };

  const handleTrackUnmuted = (publication: RemoteTrackPublication, participant: RemoteParticipant) => {
    console.log('Track unmuted:', publication.kind, participant.identity);
    
    // Update participant state when track is unmuted
    setRemoteParticipants(prev => prev.map(p => {
      if (p.participant.identity === participant.identity) {
        if (publication.kind === Track.Kind.Audio) {
          // Find the audio track from the publication
          const audioTrack = publication.track;
          return { ...p, audioTrack: audioTrack || null };
        } else if (publication.kind === Track.Kind.Video) {
          // Find the video track from the publication
          const videoTrack = publication.track;
          return { ...p, videoTrack: videoTrack || null };
        }
      }
      return p;
    }));
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
    
    try {
      if (localTracks.audio) {
        await room.localParticipant.setMicrophoneEnabled(false);
        setLocalTracks(prev => ({ ...prev, audio: false }));
        console.log('Microphone disabled');
      } else {
        await room.localParticipant.setMicrophoneEnabled(true);
        setLocalTracks(prev => ({ ...prev, audio: true }));
        console.log('Microphone enabled');
      }
    } catch (error) {
      console.error('Error toggling microphone:', error);
      setError('Failed to toggle microphone');
    }
  };

  // Helper function to check if a participant has active audio
  const hasActiveAudio = (participant: RemoteParticipantInfo) => {
    return participant.audioTrack !== null && !participant.audioTrack.isMuted;
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

  const toggleScreenShare = async () => {
    if (!room) return;
    
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenShareTrack) {
          await room.localParticipant.unpublishTrack(screenShareTrack);
          setScreenShareTrack(null);
        }
        setIsScreenSharing(false);
        console.log('Screen sharing stopped');
      } else {
        // Start screen sharing
        const screenTracks = await room.localParticipant.createScreenTracks({
          audio: false,
        });
        
        if (screenTracks.length > 0) {
          const screenTrack = screenTracks[0];
          await room.localParticipant.publishTrack(screenTrack);
          setScreenShareTrack(screenTrack);
        }
        setIsScreenSharing(true);
        console.log('Screen sharing started');
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
      setError('Failed to toggle screen sharing');
    }
  };

  const handleFileButtonClick = () => {
    triggerFileUpload();
  };



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
    <div className="virtual-classroom-new">
      {/* Top Bar */}
      <div className="top-bar">
        <div className="logo-section">
        </div>
        
        <div className="session-status">
          <div className="report-problem">
            <span className="warning-icon">⚠️</span>
            <span>Report a Problem</span>
          </div>
          <div className="session-timer">
            <span className="timer-icon">⏰</span>
            <span>Started: {formatTime(sessionTimer)}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Whiteboard Area */}
        <div className="whiteboard-area">
          <div className="whiteboard-container">
            <Tldraw 
              store={syncStore}
              autoFocus
              inferDarkMode
              onMount={(editor) => {
                editorRef.current = editor;
                editor.setCurrentTool('select');
              }}
            />
          </div>
          
          {/* Uploaded Files Display */}
          {convertedImages.length > 0 && (
            <div className="uploaded-files-panel">
              <h4>📁 Uploaded Files</h4>
              <div className="files-grid">
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
          
          {/* Page Navigation */}
          <div className="page-navigation">
            <button className="page-btn">+</button>
            <div className="page-info">
              <span>&lt; 1 / 1 &gt;</span>
            </div>
            <button className="page-btn">←</button>
            <button className="page-btn">→</button>
            <button className="page-btn">↻</button>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="right-sidebar">

          {/* Participant Panels */}
          <div className="participant-panels">
            {/* Local Participant */}
            <div className="participant-panel">
              <div className="participant-video">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline
                  className="video-element"
                />
                {!localTracks.video && (
                  <div className="camera-off-overlay">
                    <span className="camera-icon">📹</span>
                  </div>
                )}
              </div>
              <div className="participant-info">
                <div className="mic-indicator">
                  <span className={`mic-icon ${localTracks.audio ? 'active' : 'muted'}`}>
                    {localTracks.audio ? '🎤' : '🔇'}
                  </span>
                </div>
                <span className="participant-name">{participantName}</span>
              </div>
            </div>

            {/* Remote Participants */}
            {remoteParticipants.map((remoteParticipant) => (
              <div key={remoteParticipant.participant.identity} className="participant-panel">
                <div className="participant-video">
                  {remoteParticipant.videoTrack ? (
                    <video
                      key={`${remoteParticipant.participant.identity}-${remoteParticipant.videoTrack.sid}`}
                      autoPlay
                      playsInline
                      className="video-element"
                      ref={(el) => {
                        if (el && remoteParticipant.videoTrack) {
                          try {
                            remoteParticipant.videoTrack.attach(el);
                          } catch (error) {
                            console.error('Error attaching video track:', error);
                          }
                        }
                      }}
                    />
                  ) : (
                    <div className="video-placeholder">
                      <span className="person-icon">👤</span>
                    </div>
                  )}
                  {!remoteParticipant.videoTrack && (
                    <div className="camera-off-overlay">
                      <span className="camera-icon">📹</span>
                    </div>
                  )}
                </div>
                <div className="participant-info">
                  <div className="mic-indicator">
                    <span className={`mic-icon ${hasActiveAudio(remoteParticipant) ? 'active' : 'muted'}`}>
                      {hasActiveAudio(remoteParticipant) ? '🎤' : '🔇'}
                    </span>
                  </div>
                  <span className="participant-name">{remoteParticipant.participant.identity}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="bottom-controls">
        <button 
          onClick={toggleAudio} 
          className={`control-btn ${localTracks.audio ? 'active' : 'muted'}`}
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
            {!localTracks.audio && <div className="mute-line"></div>}
          </div>
          <span className="control-label">Mic</span>
        </button>
        
        <button 
          onClick={toggleVideo} 
          className={`control-btn ${localTracks.video ? 'active' : 'muted'}`}
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
            </svg>
            {!localTracks.video && <div className="mute-line"></div>}
          </div>
          <span className="control-label">Camera</span>
        </button>
        
        <button 
          onClick={() => setCurrentView('whiteboard')}
          className={`control-btn ${currentView === 'whiteboard' ? 'active' : ''}`}
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </div>
          <span className="control-label">Whiteboard</span>
        </button>
        
        <button 
          onClick={toggleScreenShare}
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm6 12H6v-1.4c0-2 4-3.1 6-3.1s6 1.1 6 3.1V18z"/>
              <path d="M12 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
            </svg>
          </div>
          <span className="control-label">Share</span>
        </button>
        
        <button 
          onClick={handleFileButtonClick}
          className={`control-btn`}
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
          </div>
          <span className="control-label">File</span>
        </button>
        
        <button 
          onClick={() => {
            if (window.confirm('Are you sure you want to leave the classroom?')) {
              leaveRoom();
            }
          }} 
          className="control-btn exit-btn"
        >
          <div className="control-icon-wrapper">
            <svg className="control-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </div>
          <span className="control-label">Exit</span>
        </button>
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
