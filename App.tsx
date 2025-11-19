import React, { useState, useEffect, useCallback, useRef } from 'react';
import Scene from './components/Scene';
import Sidebar from './components/Sidebar';
import MediaPlayer from './components/MediaPlayer';
import { MoodState, SpotifyState, VisualConfig, AudioFeatures, SpotifyTrack, QueueItem, YoutubeTrack } from './types';
import { 
  redirectToSpotifyAuth, 
  getAccessToken, 
  fetchCurrentTrack, 
  fetchAudioFeatures,
  seekToPosition,
  playTrack,
  pauseTrack
} from './services/spotifyService';

const INITIAL_MOOD: MoodState = {
  energy: 0.5,
  valence: 0.3,
  euphoria: 0.4,
  cognition: 0.6
};

const generateEstimatedFeatures = (track: SpotifyTrack): AudioFeatures => {
  const str = track.name + (track.artists[0]?.name || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  
  const seed = Math.abs(hash);
  const rand = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
  };

  return {
    energy: 0.3 + (rand(1) * 0.7),
    valence: rand(2),
    danceability: rand(3),
    acousticness: rand(4) * 0.5,
    instrumentalness: rand(5) * 0.2,
    tempo: 80 + (rand(6) * 100),
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

  const [mood, setMood] = useState<MoodState>(INITIAL_MOOD);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(true);
  const [isAudioActive, setIsAudioActive] = useState(false);
  
  const [token, setToken] = useState<string | null>(null);
  const [spotifyState, setSpotifyState] = useState<SpotifyState>({
    isConnected: false,
    activeSource: 'SPOTIFY',
    currentTrack: null,
    youtubeTrack: null,
    features: null,
    progress_ms: 0,
    isPlaying: false,
    visualConfig: undefined,
    queue: []
  });

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
    if (!token || spotifyState.activeSource === 'YOUTUBE') return;
    
    const { track, progress_ms, is_playing } = await fetchCurrentTrack(token);
    
    const trackKey = track ? (track.id || `${track.name}-${track.artists[0]?.name}`) : null;
    
    if (track && trackKey !== currentTrackKeyRef.current) {
       currentTrackKeyRef.current = trackKey;
       let features: AudioFeatures | null = null;
       if (track.id) {
           features = await fetchAudioFeatures(token, track.id);
       }
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
    else if (track) {
       setSpotifyState(prev => ({
         ...prev,
         progress_ms,
         isPlaying: is_playing
       }));
    }
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
  }, [token, spotifyState.activeSource]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(pollSpotify, 3000);
    pollSpotify();
    return () => clearInterval(interval);
  }, [token, pollSpotify]);


  const handleAudioToggle = (isActive: boolean) => {
    setIsAudioActive(isActive);
  };
  
  const handleToggleDemo = () => {};

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(err));
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
    }
  };

  const getHybridVisualConfig = (): VisualConfig | undefined => {
    if (spotifyState.activeSource === 'SPOTIFY' && spotifyState.features) {
      const energy = spotifyState.features.energy;
      const valence = spotifyState.features.valence;
      let primary = '#8b5cf6'; 
      if (energy > 0.8) primary = '#ef4444'; 
      else if (valence > 0.8) primary = '#eab308'; 
      else if (valence < 0.3) primary = '#3b82f6'; 
      else if (energy > 0.5 && valence > 0.5) primary = '#ec4899'; 
      return {
        primaryColor: primary,
        secondaryColor: '#ffffff',
        style: 'LIQUID',
        speed: 1,
        sharpness: energy 
      };
    } else if (spotifyState.activeSource === 'YOUTUBE') {
        return {
            primaryColor: '#FF0000',
            secondaryColor: '#FFFFFF',
            style: 'LIQUID',
            speed: 1,
            sharpness: 0.6
        };
    }
    return undefined;
  };

  const activeVisualConfig = getHybridVisualConfig();

  // --- NEW LOGIC: QUEUE & PLAYBACK ---

  const handleAddToQueue = (type: 'SPOTIFY' | 'YOUTUBE', item: any | any[]) => {
      const itemsToAdd = Array.isArray(item) ? item : [item];
      
      const newItems: QueueItem[] = itemsToAdd.map(it => ({
          platform: type,
          addedBy: 'User',
          spotifyTrack: type === 'SPOTIFY' ? it : undefined,
          youtubeTrack: type === 'YOUTUBE' ? it : undefined
      }));

      setSpotifyState(prev => {
          const newQueue = [...prev.queue, ...newItems];
          
          // If YT mode active, idle, and single track added, Play it
          if (prev.activeSource === 'YOUTUBE' && !prev.youtubeTrack && type === 'YOUTUBE' && !Array.isArray(item)) {
             return { ...prev, youtubeTrack: item, isPlaying: true, queue: newQueue };
          }
          
          return { ...prev, queue: newQueue };
      });
  };

  const handlePlayNow = (type: 'SPOTIFY' | 'YOUTUBE', item: any) => {
    if (type === 'SPOTIFY') {
       if (token && item.uri) {
           playTrack(token, item.uri).catch(err => console.error("Play failed", err));
       }
    } else {
       // YOUTUBE
       setSpotifyState(prev => ({
           ...prev,
           activeSource: 'YOUTUBE',
           youtubeTrack: item,
           isPlaying: true,
           progress_ms: 0
       }));
    }
  };

  const handleYoutubeEnd = () => {
      setSpotifyState(prev => {
          // FIFO Queue logic
          const nextYt = prev.queue.find(q => q.platform === 'YOUTUBE' && q.youtubeTrack?.id !== prev.youtubeTrack?.id);

          if (nextYt && nextYt.youtubeTrack) {
              // Remove specific item from queue
              const newQueue = prev.queue.filter(q => q !== nextYt);
              return { ...prev, youtubeTrack: nextYt.youtubeTrack, queue: newQueue, isPlaying: true };
          } else {
              return { ...prev, isPlaying: false };
          }
      });
  };

  const handleSeek = (percentage: number) => {
      if (spotifyState.activeSource === 'SPOTIFY') {
          if (token && spotifyState.currentTrack) {
              const ms = spotifyState.currentTrack.duration_ms * percentage;
              seekToPosition(token, ms);
              setSpotifyState(prev => ({...prev, progress_ms: ms}));
          }
      } else if (spotifyState.activeSource === 'YOUTUBE') {
          if (spotifyState.youtubeTrack) {
              const duration = spotifyState.youtubeTrack.duration_ms || 240000;
              const seconds = (duration * percentage) / 1000;
              // @ts-ignore
              const ytPlayer = window.YT?.get && window.YT.get('youtube-player-instance');
              if (ytPlayer && ytPlayer.seekTo) {
                  ytPlayer.seekTo(seconds, true);
              }
          }
      }
  };

  // Platform Switcher - FIX CRASH BY PAUSING
  const handlePlatformChange = (platform: 'SPOTIFY' | 'YOUTUBE') => {
      if (platform === 'YOUTUBE' && spotifyState.activeSource === 'SPOTIFY') {
          if (token) pauseTrack(token);
      }
      // Reset playing state to prevent render conflicts
      setSpotifyState(prev => ({
          ...prev, 
          activeSource: platform, 
          isPlaying: false 
      }));
  };
  
  const handleMoodChange = (newMood: MoodState) => {
      setMood(newMood);
  };

  return (
    <div className="w-full h-[100dvh] flex flex-col md:flex-row bg-[#050505] text-[#e0e0e0] overflow-hidden relative font-pixel">
      
      <button 
        onClick={toggleFullScreen}
        className="hidden md:flex absolute top-6 left-6 z-50 p-2 text-white/50 hover:text-white border border-white/10 bg-black/30 backdrop-blur-sm rounded hover:bg-white/10 transition-all group"
      >
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="group-hover:scale-110 transition-transform">
             <path d="M3 3h7v2H5v5H3V3zm18 0h-7v2h5v5h2V3zM3 21h7v-2H5v-5H3v7zm18 0h-7v-2h5v-5h2v7z" />
         </svg>
      </button>

      <div className="absolute inset-0 md:relative md:flex-1 z-0">
        <Scene 
          mood={mood} 
          visualConfig={activeVisualConfig}
          isAudioActive={isAudioActive}
          spotifyState={spotifyState}
          isMobileMenuOpen={isMobileMenuOpen}
          onSeek={handleSeek}
        />
        
        {!isAudioActive && !spotifyState.currentTrack && !spotifyState.youtubeTrack && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/50 backdrop-blur-sm p-4 border border-white/10 text-center">
                    <h2 className="text-white font-bold uppercase tracking-widest mb-2">System Idle</h2>
                    <p className="text-xs text-white/50">Select Platform or Use Command Console</p>
                </div>
            </div>
        )}
        
        <MediaPlayer 
            spotifyState={spotifyState} 
            token={token} 
            isDemoMode={false} 
            showProgressBar={isMobileMenuOpen}
            primaryColor={activeVisualConfig?.primaryColor}
            onYoutubeEnd={handleYoutubeEnd}
             isAudioActive={isAudioActive}
        />
      </div>

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
          onPlatformChange={handlePlatformChange}
          onAddToQueue={handleAddToQueue}
          onMoodChange={handleMoodChange}
          onPlayNow={handlePlayNow}
        />
      </div>
      
       <div className={`absolute bottom-0 w-full md:hidden z-50 transition-all duration-300 ease-out border-t border-white/20 bg-black/95 backdrop-blur-xl flex flex-col shadow-[0px_-10px_40px_rgba(0,0,0,0.8)] ${isMobileMenuOpen ? 'h-[calc(100dvh-180px)]' : 'h-14'}`}>
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
                  onPlatformChange={handlePlatformChange}
                  onAddToQueue={handleAddToQueue}
                  onMoodChange={handleMoodChange}
                  onPlayNow={handlePlayNow}
                />
             </div>
          </div>
       </div>
    </div>
  );
};

export default App;