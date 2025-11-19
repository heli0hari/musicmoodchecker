import React, { useState, useEffect, useCallback } from 'react';
import Scene from './components/Scene';
import Sidebar from './components/Sidebar';
import MediaPlayer from './components/MediaPlayer';
import { MoodState, SpotifyState } from './types';
import { getAuthUrl, getTokenFromUrl, fetchCurrentTrack, fetchAudioFeatures } from './services/spotifyService';

const INITIAL_MOOD: MoodState = {
  energy: 0.5,
  valence: 0.3,
  euphoria: 0.4,
  cognition: 0.6
};

const App: React.FC = () => {
  // Initialize Client ID with priority:
  // 1. LocalStorage (Saved by user previously)
  // 2. Vite Environment Variable (VITE_SPOTIFY_CLIENT_ID)
  // 3. Process Env (Fallback)
  const [clientId, setClientId] = useState<string>(() => {
    const saved = localStorage.getItem('spotify_client_id');
    if (saved) return saved;
    
    // @ts-ignore - Vite specific
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
  
  const [spotifyState, setSpotifyState] = useState<SpotifyState>({
    isConnected: false,
    currentTrack: null,
    features: null,
    progress_ms: 0,
    isPlaying: false
  });

  const [token, setToken] = useState<string | null>(null);

  // Handle Spotify Auth Callback & Errors
  useEffect(() => {
    const { token: accessToken, error } = getTokenFromUrl();
    
    if (error) {
      setConnectionError(`Spotify Error: ${error}`);
      setShowSettings(true);
      window.location.hash = ""; // Clear error from URL
    } else if (accessToken) {
      setToken(accessToken);
      window.location.hash = ""; // Clear token from URL
      setSpotifyState(prev => ({ ...prev, isConnected: true }));
      setShowSettings(false);
      setConnectionError(null);
    }
  }, []);

  const handleConnect = () => {
    // Sanitize ID to remove spaces
    const cleanClientId = clientId.trim();
    setClientId(cleanClientId);

    if (!cleanClientId) {
      setConnectionError("Client ID is missing.");
      setShowSettings(true);
      return;
    }
    
    // Save ID to storage so user doesn't have to enter it again
    localStorage.setItem('spotify_client_id', cleanClientId);

    // IMPORTANT: Spotify is strict about Redirect URIs.
    // We enforce a trailing slash to match standard browser copy-paste behavior.
    // If the dashboard has '...netlify.app' (no slash) but we send '...netlify.app/' (with slash), it fails.
    const redirectUri = `${window.location.origin}/`; 

    console.log("Redirecting to Spotify with URI:", redirectUri);
    window.location.href = getAuthUrl(cleanClientId, redirectUri);
  };

  const handleToggleDemo = () => {
    if (isDemoMode) {
      // Turn off
      setIsDemoMode(false);
      setSpotifyState({ isConnected: false, currentTrack: null, features: null, progress_ms: 0, isPlaying: false });
    } else {
      // Turn on
      setIsDemoMode(true);
    }
  };

  // Demo Mode Loop
  useEffect(() => {
    if (!isDemoMode) return;

    const updateDemo = () => {
       const newEnergy = 0.3 + Math.random() * 0.7;
       const newValence = Math.random();
       const newEuphoria = Math.random();
       const newCognition = Math.random();
       
       setMood({
          energy: newEnergy,
          valence: newValence,
          euphoria: newEuphoria,
          cognition: newCognition
       });

       setSpotifyState({
          isConnected: true,
          currentTrack: {
             id: 'demo',
             name: 'SIMULATION_MODE',
             artists: [{name: 'VISUAL_TEST_UNIT'}],
             album: { images: [{ url: '' }] }, // Empty url for demo
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

  // Poll Spotify for updates (Only if not in demo mode)
  useEffect(() => {
    if (!token || isDemoMode) return;

    const fetchData = async () => {
      const { track, progress_ms, is_playing } = await fetchCurrentTrack(token);
      
      if (track) {
        // Only fetch features if track changed
        if (track.id !== spotifyState.currentTrack?.id) {
          const features = await fetchAudioFeatures(token, track.id);
          
          setSpotifyState(prev => ({
            ...prev,
            currentTrack: track,
            features: features,
            progress_ms,
            isPlaying: is_playing
          }));

          if (features) {
            // Map Spotify features to our Mood parameters
            setMood({
              energy: features.energy,
              valence: features.valence,
              // Danceability is a good proxy for "Euphoria" in this context
              euphoria: features.danceability, 
              // Acousticness/Instrumentalness often correlates with focus/cognition
              cognition: (features.acousticness + features.instrumentalness) / 2
            });
          }
        } else {
          // Track same, just update progress and status
          setSpotifyState(prev => ({
             ...prev,
             progress_ms,
             isPlaying: is_playing
          }));
        }
      } else {
         // No track playing
         setSpotifyState(prev => ({ ...prev, isPlaying: false }));
      }
    };

    // Initial fetch
    fetchData();
    // Poll every 3 seconds (Faster for player UI)
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);

  }, [token, spotifyState.currentTrack?.id, isDemoMode]);

  return (
    <div className="w-full h-screen flex flex-col md:flex-row bg-[#050505] text-[#e0e0e0] overflow-hidden relative font-pixel">
      {/* Settings Modal for Client ID */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="bg-black p-8 border-2 border-white/20 w-[30rem] shadow-[8px_8px_0px_0px_rgba(255,255,255,0.1)] relative">
             {/* Decorative corners */}
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
                <p className="mt-1 opacity-70">Ensure Client ID is correct and Redirect URI matches Spotify Dashboard.</p>
              </div>
            )}

            <div className="text-xs text-white/60 mb-6 font-mono leading-relaxed space-y-4">
              <div className="space-y-1">
                <p>&gt; SETUP INSTRUCTIONS:</p>
                <p>1. Go to <a href="https://developer.spotify.com/dashboard" target="_blank" className="text-blue-400 underline hover:text-blue-300">Spotify Developer Dashboard</a></p>
                <p>2. Create an App and copy the <strong>Client ID</strong> (Not Client Secret).</p>
                <p>3. Click "Edit Settings" in Spotify Dashboard.</p>
              </div>
              
              <div className="p-3 bg-white/5 border border-white/10">
                <p className="text-[10px] uppercase text-red-300 font-bold mb-1">REQUIRED: ADD THIS TO SPOTIFY DASHBOARD:</p>
                <code className="text-green-400 block select-all text-xs bg-black/50 p-2 border border-white/10">
                  {`${window.location.origin}/`}
                </code>
                <p className="text-[9px] text-white/30 mt-1">*Copy exactly. This detects your current local or web address.</p>
              </div>
            </div>

            <div className="mb-2">
                <label className="text-[10px] uppercase text-white/40 block mb-1">Spotify Client ID</label>
                <input 
                  type="text" 
                  placeholder="ENTER_CLIENT_ID..."
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

      {/* New Floating Media Player */}
      <MediaPlayer 
        spotifyState={spotifyState} 
        token={token} 
        isDemoMode={isDemoMode} 
      />

      {/* Sidebar */}
      <div className="absolute bottom-0 w-full h-[45vh] md:static md:h-full md:w-auto md:flex-none z-10 hidden md:block">
        <Sidebar 
          currentMood={mood} 
          spotifyState={spotifyState}
          onConnectSpotify={handleConnect}
          onToggleDemo={handleToggleDemo}
          isDemoMode={isDemoMode}
          token={token}
        />
      </div>
      
      {/* Manual Config Trigger Button (Bottom Right) */}
      <button 
        onClick={() => setShowSettings(true)}
        className="absolute bottom-2 right-2 z-50 text-[9px] text-white/20 hover:text-white uppercase tracking-widest border border-transparent hover:border-white/20 px-2 py-1 bg-black/50 backdrop-blur-sm transition-all"
      >
        [ SYS_CONFIG ]
      </button>

       {/* Sidebar for Mobile (conditionally rendered or styled) */}
       <div className="absolute bottom-0 w-full h-[45vh] md:hidden z-20 bg-black/90 border-t border-white/20 overflow-auto">
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
  );
};

export default App;