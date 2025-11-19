
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Scene from './components/Scene';
import Sidebar from './components/Sidebar';
import MediaPlayer from './components/MediaPlayer';
import { MoodState, SpotifyState, VisualConfig, AudioFeatures, SpotifyTrack } from './types';
import { 
  redirectToSpotifyAuth, 
  getAccessToken, 
  fetchCurrentTrack, 
  fetchAudioFeatures 
} from './services/spotifyService';

const INITIAL_MOOD: MoodState = {
  energy: 0.5,
  valence: 0.3,
  euphoria: 0.4,
  cognition: 0.6
};

// Helper to generate deterministic features for local/unsupported tracks
const generateEstimatedFeatures = (track: SpotifyTrack): AudioFeatures => {
  // Simple string hash from title and artist
  const str = track.name + (track.artists[0]?.name || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  
  // Helper to get pseudo-random float 0-1 from seed
  const seed = Math.abs(hash);
  const rand = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
  };

  // Generate plausible features based on hash
  return {
    energy: 0.3 + (rand(1) * 0.7), // Bias towards 0.3 - 1.0
    valence: rand(2),
    danceability: rand(3),
    acousticness: rand(4) * 0.5,
    instrumentalness: rand(5) * 0.2,
    tempo: 80 + (rand(6) * 100), // 80 - 180 BPM
    loudness: -5 - (rand(7) * 10),
    isEstimated: true
  };
};

const App: React.FC = () => {
  useEffect(() => {
    if (window.location.hostname === 'localhost') {
      window.location.hostname = '127.0.0.1';
    }
  }, []);

  // UI State
  const [mood, setMood] = useState<MoodState>(INITIAL_MOOD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
  const [isAudioActive, setIsAudioActive] = useState(false);
  
  // Spotify State
  const [token, setToken] = useState<string | null>(null);
  const [spotifyState, setSpotifyState] = useState<SpotifyState>({
    isConnected: false,
    currentTrack: null,
    features: null,
    progress_ms: 0,
    isPlaying: false,
    visualConfig: undefined
  });

  // --- AUTH FLOW ---
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = `${window.location.origin}/`;

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code && clientId) {
      getAccessToken(clientId, code, redirectUri).then((accessToken) => {
        if (accessToken) {
          setToken(accessToken);
          setSpotifyState(prev => ({ ...prev, isConnected: true }));
          window.history.replaceState({}, document.title, "/");
        }
      });
    }
  }, [clientId, redirectUri]);

  const handleConnect = () => {
    if (!clientId) {
      alert("Missing Client ID in .env file");
      return;
    }
    redirectToSpotifyAuth(clientId, redirectUri);
  };

  // --- POLL SPOTIFY DATA ---
  const currentTrackKeyRef = useRef<string | null>(null);

  const pollSpotify = useCallback(async () => {
    if (!token) return;
    
    const { track, progress_ms, is_playing } = await fetchCurrentTrack(token);
    
    // Generate a unique key for the track. 
    // Local files often have null IDs, so we fall back to Name+Artist.
    const trackKey = track ? (track.id || `${track.name}-${track.artists[0]?.name}`) : null;
    
    // Case 1: New Track Detected
    if (track && trackKey !== currentTrackKeyRef.current) {
       currentTrackKeyRef.current = trackKey;
       
       let features: AudioFeatures | null = null;
       
       // Try to fetch real features if we have a real ID
       if (track.id) {
           features = await fetchAudioFeatures(token, track.id);
       }
       
       // If fetch failed or it's a local file (no ID), generate estimates
       if (!features) {
           features = generateEstimatedFeatures(track);
       }
       
       setSpotifyState(prev => ({
         ...prev,
         currentTrack: track,
         features: features,
         progress_ms,
         isPlaying: is_playing
       }));
    } 
    // Case 2: Same Track, Update Progress
    else if (track) {
       setSpotifyState(prev => ({
         ...prev,
         progress_ms,
         isPlaying: is_playing
       }));
    }
    // Case 3: No Track (Stopped/Private)
    else {
       if (currentTrackKeyRef.current !== null) {
           currentTrackKeyRef.current = null;
           setSpotifyState(prev => ({
               ...prev,
               currentTrack: null,
               features: null,
               isPlaying: false
           }));
       }
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(pollSpotify, 3000);
    pollSpotify(); // Initial fetch
    return () => clearInterval(interval);
  }, [token, pollSpotify]);


  const handleAudioToggle = (isActive: boolean) => {
    setIsAudioActive(isActive);
  };
  
  const handleToggleDemo = () => {
    // No-Op
  };

  // Fullscreen Toggle
  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  };

  // Determine Visual Configuration
  // If Audio is Active -> Use Audio Colors logic inside Scene
  // If Spotify is Active -> Use Spotify features for Colors
  const getHybridVisualConfig = (): VisualConfig | undefined => {
    if (spotifyState.features) {
      // Map Spotify Features to Colors
      const energy = spotifyState.features.energy;
      const valence = spotifyState.features.valence;
      
      let primary = '#8b5cf6'; // Default Purple
      
      if (energy > 0.8) primary = '#ef4444'; // Red (High Energy)
      else if (valence > 0.8) primary = '#eab308'; // Yellow (Happy)
      else if (valence < 0.3) primary = '#3b82f6'; // Blue (Sad)
      else if (energy > 0.5 && valence > 0.5) primary = '#ec4899'; // Pink (Pop)
      
      return {
        primaryColor: primary,
        secondaryColor: '#ffffff',
        style: 'LIQUID',
        speed: 1,
        sharpness: energy // More energy = sharper
      };
    }
    return undefined;
  };

  const activeVisualConfig = getHybridVisualConfig();

  return (
    <div className="w-full h-[100dvh] flex flex-col md:flex-row bg-[#050505] text-[#e0e0e0] overflow-hidden relative font-pixel">
      
      {/* Fullscreen Button */}
      <button 
        onClick={toggleFullScreen}
        className="hidden md:flex absolute top-6 left-6 z-50 p-2 text-white/50 hover:text-white border border-white/10 bg-black/30 backdrop-blur-sm rounded hover:bg-white/10 transition-all group"
        title="Toggle Fullscreen"
      >
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="group-hover:scale-110 transition-transform">
             <path d="M3 3h7v2H5v5H3V3zm18 0h-7v2h5v5h2V3zM3 21h7v-2H5v-5H3v7zm18 0h-7v-2h5v-5h2v7z" />
         </svg>
      </button>

      {/* MAIN SCENE */}
      <div className="absolute inset-0 md:relative md:flex-1 z-0">
        <Scene 
          mood={mood} 
          visualConfig={activeVisualConfig}
          isAudioActive={isAudioActive}
          spotifyState={spotifyState}
          isMobileMenuOpen={isMobileMenuOpen}
        />
        
        {/* Overlay Text for Idle Mode */}
        {!isAudioActive && !spotifyState.currentTrack && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 backdrop-blur-sm p-4 border border-white/10 text-center">
                    <h2 className="text-white font-bold uppercase tracking-widest mb-2">System Idle</h2>
                    <p className="text-xs text-white/50">Select "Live Audio" or "Spotify Mode" in Sidebar</p>
                </div>
            </div>
        )}
        
        {/* Media Player (Only if Spotify is active) */}
        {spotifyState.isConnected && (
          <MediaPlayer 
            spotifyState={spotifyState} 
            token={token} 
            isDemoMode={false} 
            showProgressBar={isMobileMenuOpen}
            primaryColor={activeVisualConfig?.primaryColor}
          />
        )}
      </div>

      {/* SIDEBAR */}
      <div className="hidden md:block md:h-full md:w-auto md:flex-none z-10 relative bg-black/80 backdrop-blur-md border-l border-white/20">
        <Sidebar 
          currentMood={mood} 
          spotifyState={spotifyState}
          onConnectSpotify={handleConnect}
          onToggleDemo={handleToggleDemo}
          isDemoMode={false}
          token={token}
          onAudioToggle={handleAudioToggle}
          isAudioActive={isAudioActive}
        />
      </div>
      
      {/* MOBILE MENU 
          Adjusted height to 100dvh - 180px to prevent overlapping with Media Player which is at the top.
          180px is roughly the height needed for the top media player (approx 130-140px) plus some gap.
      */}
       <div className={`absolute bottom-0 w-full md:hidden z-50 transition-all duration-300 ease-out border-t border-white/20 bg-black/95 backdrop-blur-xl flex flex-col shadow-[0px_-10px_40px_rgba(0,0,0,0.8)] ${isMobileMenuOpen ? 'h-[calc(100dvh-240px)]' : 'h-14'}`}>
          <div className="w-full h-14 flex items-center justify-center flex-shrink-0 cursor-pointer border-b border-white/10 bg-black/40" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}>
              <div className="flex flex-col items-center gap-1">
                  <div className="w-16 h-1 bg-white/40 rounded-full mb-1"></div>
                  <span className="text-[10px] uppercase text-white font-bold tracking-widest">TAP</span>
              </div>
          </div>
          <div className="flex-1 overflow-hidden relative">
             <div className="absolute inset-0 overflow-auto pb-10">
                <Sidebar 
                  currentMood={mood} 
                  spotifyState={spotifyState}
                  onConnectSpotify={handleConnect}
                  onToggleDemo={handleToggleDemo}
                  isDemoMode={false}
                  token={token}
                  onAudioToggle={handleAudioToggle}
                  isAudioActive={isAudioActive}
                />
             </div>
          </div>
       </div>
    </div>
  );
};

export default App;
