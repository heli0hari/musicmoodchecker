import React, { useState, useEffect, useRef } from 'react';
import { SpotifyState } from '../types';
import { playTrack, pauseTrack, nextTrack, previousTrack } from '../services/spotifyService';

interface MediaPlayerProps {
  spotifyState: SpotifyState;
  token: string | null;
  isDemoMode: boolean;
  showProgressBar?: boolean;
}

const MediaPlayer: React.FC<MediaPlayerProps> = ({ spotifyState, token, isDemoMode, showProgressBar = false }) => {
  const { currentTrack, isPlaying, progress_ms } = spotifyState;
  const [localProgress, setLocalProgress] = useState(progress_ms);
  
  // Optimistic UI state
  const [optimisticIsPlaying, setOptimisticIsPlaying] = useState(isPlaying);
  // Lock to prevent external updates from overwriting optimistic state immediately after interaction
  const lastInteractionTime = useRef<number>(0);

  // Sync optimistic state with actual state, but respect user interaction lock (2 seconds)
  useEffect(() => {
    if (Date.now() - lastInteractionTime.current > 2000) {
      setOptimisticIsPlaying(isPlaying);
    }
  }, [isPlaying]);

  // Sync local progress with prop updates
  useEffect(() => {
    setLocalProgress(progress_ms);
  }, [progress_ms]);

  // Simulated progress timer for smoother UI
  useEffect(() => {
    if (!optimisticIsPlaying || !currentTrack) return;
    
    const interval = setInterval(() => {
      setLocalProgress((prev) => {
        const next = prev + 1000;
        return next > currentTrack.duration_ms ? currentTrack.duration_ms : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [optimisticIsPlaying, currentTrack]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    
    // Optimistic Update
    const newState = !optimisticIsPlaying;
    setOptimisticIsPlaying(newState);
    lastInteractionTime.current = Date.now(); // Lock external sync for 2s

    if (newState) {
      playTrack(token);
    } else {
      pauseTrack(token);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    nextTrack(token);
    // Reset progress visually for better feel
    setLocalProgress(0); 
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    previousTrack(token);
    setLocalProgress(0);
  };

  if (!currentTrack) return null;

  const albumArt = currentTrack.album.images[0]?.url;
  const progressPercent = (localProgress / currentTrack.duration_ms) * 100;

  return (
    <div className="absolute top-0 md:top-auto md:bottom-8 left-0 md:left-8 w-full md:w-[26rem] z-40 p-4 md:p-0 pointer-events-none">
      {/* 
        MEDIA PLAYER CONTAINER 
        Mobile: Scaled up padding, borders, and sizes.
        Desktop: Standard sizing.
      */}
      <div className="pointer-events-auto bg-black/95 md:bg-black/90 backdrop-blur-xl border-b md:border border-white/20 p-4 md:p-4 shadow-[0px_4px_30px_rgba(0,0,0,0.8)] flex items-center gap-5 md:gap-4 relative overflow-hidden group rounded-b-2xl md:rounded-none">
        
        {/* Scanline overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>

        {/* Album Art - Significantly Larger on Mobile */}
        <div className="relative w-24 h-24 md:w-24 md:h-24 flex-shrink-0 border border-white/10 bg-black shadow-lg rounded-md md:rounded-none overflow-hidden">
          {albumArt ? (
            <img src={albumArt} alt="Album Art" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px]">NO IMG</div>
          )}
          {/* Spinning decorative vinyl-like ring */}
          <div className={`absolute inset-0 rounded-full border-2 border-white/30 opacity-0 group-hover:opacity-100 transition-opacity ${optimisticIsPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}></div>
        </div>

        {/* Track Info & Controls */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-3 md:gap-2">
          {/* Title */}
          <div className="flex flex-col pr-2">
            <span className="text-white font-bold text-lg md:text-lg truncate uppercase tracking-wide drop-shadow-md leading-tight">{currentTrack.name}</span>
            <span className="text-white/60 text-sm md:text-sm truncate uppercase tracking-wider">{currentTrack.artists[0]?.name}</span>
          </div>

          <div className="flex justify-between text-[11px] md:text-[10px] text-white/50 font-mono mt-1">
            <span>{formatTime(localProgress)}</span>
            <span>{formatTime(currentTrack.duration_ms)}</span>
          </div>

           {/* Controls - Larger Touch Targets for Mobile */}
          <div className={`flex items-center justify-between mt-2 md:mt-1 ${isDemoMode ? 'opacity-50 pointer-events-none' : ''}`}>
             {/* Prev Button */}
             <button onClick={handlePrev} className="p-3 md:p-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all rounded-full active:bg-white/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="md:w-6 md:h-6"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
             </button>
             
             {/* Play/Pause Button - Prominent */}
             <button onClick={handlePlayPause} className="p-4 md:p-2 text-white hover:text-green-400 bg-white/5 hover:bg-white/10 border border-white/20 rounded-full active:scale-95 transition-all shadow-lg active:bg-white/20">
                {optimisticIsPlaying ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="md:w-8 md:h-8"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="md:w-8 md:h-8"><path d="M8 5v14l11-7z"/></svg>
                )}
             </button>
             
             {/* Next Button */}
             <button onClick={handleNext} className="p-3 md:p-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all rounded-full active:bg-white/20">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="md:w-6 md:h-6"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
             </button>
           </div>
        </div>
        
        {/* Conditional Progress Bar (Only shows when requested, typically Mobile Menu View) */}
        {showProgressBar && (
           <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10">
             <div 
               className="h-full bg-green-500 transition-all duration-1000 linear relative"
               style={{ width: `${progressPercent}%` }}
             >
               <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
             </div>
           </div>
        )}

      </div>
    </div>
  );
};

export default MediaPlayer;