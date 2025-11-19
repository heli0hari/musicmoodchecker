import React, { useState, useEffect } from 'react';
import { SpotifyState } from '../types';
import { playTrack, pauseTrack, nextTrack, previousTrack } from '../services/spotifyService';

interface MediaPlayerProps {
  spotifyState: SpotifyState;
  token: string | null;
  isDemoMode: boolean;
}

const MediaPlayer: React.FC<MediaPlayerProps> = ({ spotifyState, token, isDemoMode }) => {
  const { currentTrack, isPlaying, progress_ms } = spotifyState;
  const [localProgress, setLocalProgress] = useState(progress_ms);

  // Sync local progress with prop updates
  useEffect(() => {
    setLocalProgress(progress_ms);
  }, [progress_ms]);

  // Simulated progress timer for smoother UI
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;
    
    const interval = setInterval(() => {
      setLocalProgress((prev) => {
        const next = prev + 1000;
        return next > currentTrack.duration_ms ? currentTrack.duration_ms : next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, currentTrack]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    if (isPlaying) {
      pauseTrack(token);
    } else {
      playTrack(token);
    }
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    nextTrack(token);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!token || isDemoMode) return;
    previousTrack(token);
  };

  if (!currentTrack) return null;

  const progressPercent = (localProgress / currentTrack.duration_ms) * 100;
  const albumArt = currentTrack.album.images[0]?.url;

  return (
    <div className="absolute top-0 md:top-auto md:bottom-8 left-0 md:left-8 w-full md:w-80 z-40 p-4 pointer-events-none">
      <div className="pointer-events-auto bg-black/80 backdrop-blur-md border border-white/20 p-3 shadow-[0px_0px_20px_rgba(0,0,0,0.5)] flex items-center gap-3 relative overflow-hidden group">
        
        {/* Scanline overlay */}
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>

        {/* Album Art */}
        <div className="relative w-14 h-14 flex-shrink-0 border border-white/10">
          {albumArt ? (
            <img src={albumArt} alt="Album Art" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px]">NO IMG</div>
          )}
          {/* Spinning decorative vinyl-like ring */}
          <div className={`absolute inset-0 rounded-full border border-white/30 opacity-0 group-hover:opacity-100 transition-opacity ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}></div>
        </div>

        {/* Track Info & Controls */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          {/* Title */}
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm truncate uppercase tracking-wide">{currentTrack.name}</span>
            <span className="text-white/50 text-[10px] truncate uppercase tracking-wider">{currentTrack.artists[0]?.name}</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1 bg-white/10 rounded-full mt-2 relative overflow-hidden">
            <div 
              className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-1000 linear"
              style={{ width: `${progressPercent}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[8px] text-white/40 font-mono mt-1">
            <span>{formatTime(localProgress)}</span>
            <span>{formatTime(currentTrack.duration_ms)}</span>
          </div>
        </div>

        {/* Controls */}
        <div className={`flex flex-col gap-1 ml-2 ${isDemoMode ? 'opacity-50 pointer-events-none' : ''}`}>
           <div className="flex items-center gap-1">
             <button onClick={handlePrev} className="p-1 text-white/70 hover:text-white hover:bg-white/10">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
             </button>
             <button onClick={handlePlayPause} className="p-1 text-white hover:text-green-400 hover:bg-white/10 border border-white/10">
                {isPlaying ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
             </button>
             <button onClick={handleNext} className="p-1 text-white/70 hover:text-white hover:bg-white/10">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
             </button>
           </div>
        </div>

      </div>
    </div>
  );
};

export default MediaPlayer;