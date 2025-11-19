import React, { useState, useEffect, useRef } from 'react';
import Scene from './components/Scene';
import Sidebar from './components/Sidebar';
import MediaPlayer from './components/MediaPlayer';
import { MoodState, SpotifyState } from './types';
import { redirectToSpotifyAuth, getAccessToken, fetchCurrentTrack, fetchAudioFeatures } from './services/spotifyService';

const INITIAL_MOOD: MoodState = {
  energy: 0.5,
  valence: 0.3,
  euphoria: 0.4,
  cognition: 0.6
};

const App: React.FC = () => {
  const [clientId, setClientId] = useState<string>(() => {
    const saved = localStorage.getItem('spotify_client_id');
    if (saved) return saved;
    // @ts-ignore
    if (import.meta.env && import.meta.env.VITE_SPOTIFY_CLIENT_ID) {
      // @ts-ignore
      return import.meta.env.VITE_SPOTIFY_CLIENT_ID;
    }
    return process.env.SPOTIFY_CLIENT_ID || "";
  });

  const [showSettings, setShowSettings] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [mood, setMood] = useState<MoodState>(INITIAL_MOOD);
  const [showClientId, setShowClientId] = useState(false); // Toggle ID visibility
  
  // Mobile Menu State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const [spotifyState, setSpotifyState] = useState<SpotifyState>({
    isConnected: false,
    currentTrack: null,
    features: null,
    progress_ms: 0,
    isPlaying: false
  });

  const [token, setToken] = useState<string | null>(null);

  // Handle Spotify Auth Callback (PKCE Flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');
    
    if (error) {
      console.error("Spotify Auth Error:", error);
      setConnectionError(`Spotify says: "${error}"`);
      setShowSettings(true);
      // Clean URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (code) {
      // Exchange code for token
      const storedClientId = localStorage.getItem('spotify_client_id') || clientId;
      const redirectUri = `${window.location.origin}/`; 

      if (storedClientId) {
        getAccessToken(storedClientId, code, redirectUri).then(accessToken => {
           if (accessToken) {
             setToken(accessToken);
             setSpotifyState(prev => ({ ...prev, isConnected: true }));
             setShowSettings(false);
             setConnectionError(null);
             // Remove code from URL so we don't try to use it again
             window.history.replaceState({}, document.title, window.location.pathname);
           } else {
             setConnectionError("Failed to exchange authorization code for token.");
             setShowSettings(true);
           }
        });
      }
    }
  }, []);

  const handleConnect = async () => {
    const cleanClientId = clientId.replace(/[^a-zA-Z0-9]/g, "");
    setClientId(cleanClientId);

    if (!cleanClientId) {
      setConnectionError("Client ID is missing.");
      setShowSettings(true);
      return;
    }

    if (cleanClientId.length !== 32) {
      setConnectionError(`Invalid Client ID length (${cleanClientId.length}). Should be 32 chars.`);
      setShowSettings(true);
      return;
    }
    
    localStorage.setItem('spotify_client_id', cleanClientId);
    
    // PKCE Flow
    const redirectUri = `${window.location.origin}/`; 
    await redirectToSpotifyAuth(cleanClientId, redirectUri);
  };

  const handleToggleDemo = () => {
    if (isDemoMode) {
      setIsDemoMode(false);
      setSpotifyState({ isConnected: false, currentTrack: null, features: null, progress_ms: 0, isPlaying: false });
      setMood(INITIAL_MOOD);
    } else {
      setIsDemoMode(true);
    }
  };

  // Swipe Handlers
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.targetTouches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.targetTouches[0].clientY;
  };

  const onTouchEnd = () => {
    if (!touchStartY.current || !touchEndY.current) return;
    const distance = touchStartY.current - touchEndY.current;
    const isSwipeUp = distance > 50;
    const isSwipeDown = distance < -50;

    if (isSwipeDown) {
        setIsMobileMenuOpen(false);
    }
    if (isSwipeUp) {
        setIsMobileMenuOpen(true);
    }
    
    // Reset
    touchStartY.current = 0;
    touchEndY.current = 0;
  };

  // Demo Loop
  useEffect(() => {
    if (!isDemoMode) return;
    const updateDemo = () => {
       const newEnergy = 0.3 + Math.random() * 0.7;
       const newValence = Math.random();
       const newEuphoria = Math.random();
       const newCognition = Math.random();
       
       setMood({ energy: newEnergy, valence: newValence, euphoria: newEuphoria, cognition: newCognition });

       setSpotifyState({
          isConnected: true,
          currentTrack: {
             id: 'demo',
             name: 'SIMULATION_MODE',
             artists: [{name: 'VISUAL_TEST_UNIT'}],
             album: { images: [{ url: '' }] },
             duration_ms: 240000
          },
          features: {
             energy: newEnergy,
             valence: newValence,
             danceability: newEuphoria,
             acousticness: newCognition,
             instrumentalness: newCognition,
             tempo: 100 + Math.random() * 40,
             loudness: -5
          },
          progress_ms: Math.random() * 240000,
          isPlaying: true
       });
    };
    updateDemo();
    const interval = setInterval(updateDemo, 4000);
    return () => clearInterval(interval);
  }, [isDemoMode]);

  // Spotify Polling
  useEffect(() => {
    if (!token || isDemoMode) return;
    const fetchData = async () => {
      const { track, progress_ms, is_playing } = await fetchCurrentTrack(token);
      if (track) {
        if (track.id !== spotifyState.currentTrack?.id) {
          const features = await fetchAudioFeatures(token, track.id);
          setSpotifyState(prev => ({ ...prev, currentTrack: track, features: features, progress_ms, isPlaying: is_playing }));
          if (features) {
            setMood({
              energy: features.energy,
              valence: features.valence,
              euphoria: features.danceability, 
              cognition: (features.acousticness + features.instrumentalness) / 2
            });
          }
        } else {
          setSpotifyState(prev => ({ ...prev, progress_ms, isPlaying: is_playing }));
        }
      } else {
         // If no track is playing, we might want to clear state or just set isPlaying false
         setSpotifyState(prev => ({ ...prev, isPlaying: false }));
      }
    };
    
    fetchData();
    // Poll faster (every 1s) to make visualizer and controls feel more responsive
    const interval = setInterval(fetchData, 1000); 
    return () => clearInterval(interval);
  }, [token, spotifyState.currentTrack?.id, isDemoMode]);

  return (
    <div className="w-full h-[100dvh] flex flex-col md:flex-row bg-[#050505] text-[#e0e0e0] overflow-hidden relative font-pixel">
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="bg-black p-8 border-2 border-white/20 w-[90%] md:w-[30rem] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)] relative">
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-white"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-white"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-white"></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-white"></div>

            <h2 className="text-2xl font-bold mb-6 uppercase tracking-widest border-b border-dashed border-white/30 pb-2">
              CONFIG.SYS
            </h2>

            {connectionError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 text-red-200 text-xs font-mono">
                <span className="font-bold">ERROR:</span> {connectionError}
              </div>
            )}

            <div className="text-xs text-white/60 mb-6 font-mono leading-relaxed space-y-4">
              <div className="space-y-1">
                <p className="text-white font-bold">&gt; SETUP CHECKLIST:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>Go to <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-blue-400 underline">Spotify Developer Dashboard</a></li>
                  <li>Add your email to <strong>Users and Access</strong> (Required for Development Mode)</li>
                  <li>Add this exact URL to <strong>Redirect URIs</strong>:</li>
                </ul>
              </div>
              
              <div className="p-2 bg-white/5 border border-white/10 text-center">
                <code className="text-green-400 select-all text-xs block">
                  {`${window.location.origin}/`}
                </code>
              </div>
            </div>

            <div className="mb-4">
                <div className="flex justify-between items-end mb-1">
                  <label className="text-[10px] uppercase text-white/40 block">Spotify Client ID</label>
                  <button 
                    onClick={() => setShowClientId(!showClientId)}
                    className="text-[9px] text-blue-400 uppercase hover:text-white"
                  >
                    {showClientId ? "HIDE" : "SHOW"}
                  </button>
                </div>
                <input 
                  type={showClientId ? "text" : "password"} 
                  placeholder="32-character Client ID..."
                  className="w-full bg-black border border-white/40 p-3 text-white placeholder-white/20 font-mono text-sm focus:outline-none focus:border-white transition-colors"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                />
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <button 
                onClick={() => setShowSettings(false)} 
                className="px-6 py-2 text-sm text-white/60 hover:text-white uppercase border border-transparent hover:border-white/20"
              >
                Close
              </button>
              <button 
                onClick={handleConnect} 
                className="px-6 py-2 bg-white text-black text-sm uppercase font-bold border border-white hover:bg-black hover:text-white transition-colors shadow-[4px_4px_0px_0px_rgba(255,255,255,0.2)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px]"
              >
                Save & Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3D Scene */}
      <div className="absolute inset-0 md:relative md:flex-1 z-0">
        <Scene 
          mood={mood} 
          tempo={spotifyState.features?.tempo || 0} 
          isPlaying={spotifyState.isPlaying}
        />
      </div>

      {/* Floating Media Player */}
      <MediaPlayer 
        spotifyState={spotifyState} 
        token={token} 
        isDemoMode={isDemoMode} 
      />

      {/* Sidebar (Desktop) */}
      <div className="hidden md:block md:h-full md:w-auto md:flex-none z-10 relative">
        <Sidebar 
          currentMood={mood} 
          spotifyState={spotifyState}
          onConnectSpotify={handleConnect}
          onToggleDemo={handleToggleDemo}
          isDemoMode={isDemoMode}
          token={token}
        />
      </div>
      
      {/* Config Trigger (Bottom Right) */}
      <button 
        onClick={() => setShowSettings(true)}
        className="absolute bottom-2 right-2 z-50 text-[9px] text-white/20 hover:text-white uppercase tracking-widest border border-transparent hover:border-white/20 px-2 py-1 bg-black/50 backdrop-blur-sm transition-all"
      >
        [ SYS_CONFIG ]
      </button>

       {/* Sidebar (Mobile) - Collapsible */}
       <div 
         className={`absolute bottom-0 w-full md:hidden z-50 transition-all duration-300 ease-out border-t border-white/20 bg-black/90 backdrop-blur-md flex flex-col shadow-[0px_-10px_40px_rgba(0,0,0,0.8)] ${isMobileMenuOpen ? 'h-[65vh]' : 'h-28'}`}
       >
          {/* Touch Handle / Toggle */}
          <div 
             className="w-full h-14 flex items-center justify-center flex-shrink-0 cursor-pointer bg-white/10 hover:bg-white/20 active:bg-white/30 touch-none border-b border-white/5 transition-colors"
             onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
             onTouchStart={onTouchStart}
             onTouchMove={onTouchMove}
             onTouchEnd={onTouchEnd}
          >
              <div className="flex flex-col items-center gap-1">
                  <div className="w-16 h-1.5 bg-white/40 rounded-full mb-1 shadow-lg"></div>
                  <span className="text-[10px] uppercase text-white font-bold tracking-widest drop-shadow-md">
                      {isMobileMenuOpen ? "Swipe Down" : "Swipe Up / Tap"}
                  </span>
              </div>
          </div>

          <div className="flex-1 overflow-hidden relative">
             <div className="absolute inset-0 overflow-auto pb-10">
                <Sidebar 
                  currentMood={mood} 
                  spotifyState={spotifyState}
                  onConnectSpotify={handleConnect}
                  onToggleDemo={handleToggleDemo}
                  isDemoMode={isDemoMode}
                  token={token}
                />
             </div>
          </div>
       </div>
    </div>
  );
};

export default App;