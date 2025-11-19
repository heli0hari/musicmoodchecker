import React, { useState, useEffect, useRef } from 'react';
import { SpotifyState } from '../types';
import { playTrack, pauseTrack, nextTrack, previousTrack, setSpotifyVolume } from '../services/spotifyService';
import { audioManager } from '../services/audioService';

interface MediaPlayerProps {
  spotifyState: SpotifyState;
  token: string | null;
  isDemoMode: boolean;
  showProgressBar?: boolean;
  primaryColor?: string;
  onYoutubeEnd?: () => void;
  isAudioActive?: boolean; // Add this prop to know if mic is enabled
}

const MediaPlayer: React.FC<MediaPlayerProps> = ({ 
  spotifyState, 
  token, 
  isDemoMode, 
  showProgressBar = false, 
  primaryColor = '#1DB954',
  onYoutubeEnd,
  isAudioActive = false // Default to false
}) => {
  const { currentTrack, isPlaying, progress_ms, activeSource, youtubeTrack } = spotifyState;

  const [localProgress, setLocalProgress] = useState(progress_ms);
  const [optimisticIsPlaying, setOptimisticIsPlaying] = useState(isPlaying);
  const [volume, setVolume] = useState(60);
  const [isYoutubePlaying, setIsYoutubePlaying] = useState(false);
  
  const lastInteractionTime = useRef<number>(0);
  const youtubeIframeRef = useRef<HTMLIFrameElement>(null);
  const volumeDebounceTimer = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with parent playing state
  useEffect(() => {
    setOptimisticIsPlaying(isPlaying);
  }, [isPlaying]);

  // Handle YouTube playback state
  useEffect(() => {
    if (activeSource === 'YOUTUBE' && youtubeTrack) {
      if (isPlaying && !isYoutubePlaying) {
        // START PLAYBACK
        setIsYoutubePlaying(true);
        setOptimisticIsPlaying(true);
        
        // Start progress simulation
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
        }
        
        progressIntervalRef.current = setInterval(() => {
          setLocalProgress(prev => {
            const duration = youtubeTrack.duration_ms || 180000;
            const newProgress = prev + 1000;
            
            if (duration > 0 && newProgress >= duration) {
              // Track ended
              if (onYoutubeEnd) {
                onYoutubeEnd();
              }
              setIsYoutubePlaying(false);
              setOptimisticIsPlaying(false);
              return 0;
            }
            return newProgress;
          });
        }, 1000);

        // REMOVED: Automatic microphone start
        // Microphone will only start if user explicitly enables it in sidebar

      } else if (!isPlaying && isYoutubePlaying) {
        // STOP PLAYBACK
        setIsYoutubePlaying(false);
        setOptimisticIsPlaying(false);
        
        // Stop progress simulation
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }

        // REMOVED: Automatic microphone stop
        // Microphone control is handled by the sidebar toggle
      }
    }
  }, [isPlaying, youtubeTrack, activeSource, onYoutubeEnd, isYoutubePlaying]);

  // Cleanup intervals
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      // Don't stop microphone here - let sidebar handle it
    };
  }, []);

  // Spotify progress handling
  useEffect(() => {
    if (activeSource === 'SPOTIFY') {
      if (Math.abs(localProgress - progress_ms) > 2000) setLocalProgress(progress_ms);
      
      if (optimisticIsPlaying) {
        const interval = setInterval(() => setLocalProgress(p => p + 1000), 1000);
        return () => clearInterval(interval);
      }
    }
  }, [progress_ms, optimisticIsPlaying, activeSource, localProgress]);

  const formatTime = (ms: number) => {
    if (!ms && ms !== 0) return "0:00";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !optimisticIsPlaying;
    setOptimisticIsPlaying(newState);
    lastInteractionTime.current = Date.now();

    if (activeSource === 'SPOTIFY' && token) {
      newState ? playTrack(token) : pauseTrack(token);
    }
    // For YouTube, we let the parent component handle the state change
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSource === 'SPOTIFY' && token) nextTrack(token);
    else if (activeSource === 'YOUTUBE' && onYoutubeEnd) onYoutubeEnd();
    setLocalProgress(0); 
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeSource === 'SPOTIFY' && token) previousTrack(token);
    // For YouTube, restart current track
    else if (activeSource === 'YOUTUBE') {
      setLocalProgress(0);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseInt(e.target.value, 10);
    setVolume(newVol);

    if (activeSource === 'SPOTIFY' && token) {
      if (volumeDebounceTimer.current) clearTimeout(volumeDebounceTimer.current);
      volumeDebounceTimer.current = setTimeout(() => setSpotifyVolume(token, newVol), 300); 
    }
  };

  const trackName = activeSource === 'SPOTIFY' ? currentTrack?.name : youtubeTrack?.title;
  const artistName = activeSource === 'SPOTIFY' ? currentTrack?.artists[0]?.name : youtubeTrack?.channelTitle;
  const albumArt = activeSource === 'SPOTIFY' ? currentTrack?.album.images[0]?.url : youtubeTrack?.thumbnailUrl;
  const duration = activeSource === 'SPOTIFY' ? currentTrack?.duration_ms : (youtubeTrack?.duration_ms || 180000);

  if (!trackName && activeSource === 'YOUTUBE' && !youtubeTrack) return null;
  const progressPercent = duration ? (localProgress / duration) * 100 : 0;

  return (
    <>
      {/* Hidden YouTube iframe - ALWAYS present but controlled by src */}
      {activeSource === 'YOUTUBE' && youtubeTrack && (
        <iframe
          key={`yt-${youtubeTrack.id}-${isYoutubePlaying ? 'playing' : 'paused'}-${Math.floor(localProgress / 1000)}`}
          ref={youtubeIframeRef}
          src={isYoutubePlaying ? 
            `https://www.youtube.com/embed/${youtubeTrack.id}?autoplay=1&controls=0&disablekb=1&modestbranding=1&playsinline=1&start=${Math.floor(localProgress / 1000)}` :
            `about:blank` // Empty when paused to stop playback
          }
          style={{ 
            position: 'fixed', 
            width: '1px', 
            height: '1px', 
            border: 'none',
            opacity: 0,
            pointerEvents: 'none',
            top: '-10px',
            left: '-10px'
          }}
          allow="autoplay; encrypted-media"
          title="YouTube Audio Player"
          onLoad={() => {
            console.log("YouTube iframe loaded, playing:", isYoutubePlaying, "at:", formatTime(localProgress));
          }}
        />
      )}

      <div className="absolute top-0 md:top-auto md:bottom-8 left-0 md:left-8 w-full md:w-[26rem] z-40 p-4 md:p-0 pointer-events-none">
        <div className="pointer-events-auto bg-black/95 md:bg-black/90 backdrop-blur-xl border-b md:border border-white/20 p-4 md:p-4 shadow-[0px_4px_30px_rgba(0,0,0,0.8)] flex items-center gap-5 md:gap-4 relative overflow-hidden group rounded-b-2xl md:rounded-none">
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay pointer-events-none"></div>
          
          <div className="relative w-24 h-24 md:w-24 md:h-24 flex-shrink-0 border border-white/10 bg-black shadow-lg rounded-md md:rounded-none overflow-hidden">
            {albumArt ? (
              <img src={albumArt} alt="Art" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px]">
                {activeSource === 'YOUTUBE' ? 'YT' : 'NO IMG'}
              </div>
            )}
            <div className={`absolute inset-0 rounded-full border-2 border-white/30 opacity-0 group-hover:opacity-100 transition-opacity ${optimisticIsPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }}></div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-center gap-3 md:gap-2">
            <div className="flex flex-col pr-2">
              <span className="text-white font-bold text-lg md:text-lg truncate uppercase tracking-wide drop-shadow-md leading-tight">
                {trackName || "Select Track"}
              </span>
              <span className="text-white/60 text-sm md:text-sm truncate uppercase tracking-wider">
                {artistName || "Search in Console"}
              </span>
              {activeSource === 'YOUTUBE' && (
                <div className="flex gap-2 mt-1">
                  <span className="text-red-500 text-[10px] uppercase tracking-widest">
                    YouTube(experimental)
                  </span>
                  {optimisticIsPlaying && (
                    <span className="text-green-500 text-[10px] uppercase tracking-widest animate-pulse">
                      • PLAYING
                    </span>
                  )}
                  {!optimisticIsPlaying && localProgress > 0 && (
                    <span className="text-yellow-500 text-[10px] uppercase tracking-widest">
                      • PAUSED
                    </span>
                  )}
                  {isAudioActive && (
                    <span className="text-red-500 text-[10px] uppercase tracking-widest animate-pulse">
                      • MIC ON
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-between text-[11px] md:text-[10px] text-white/50 font-mono mt-1">
              <span>{formatTime(localProgress)}</span>
              <span>{formatTime(duration || 0)}</span>
            </div>

            <div className={`flex items-center justify-between mt-2 md:mt-1 ${isDemoMode ? 'opacity-50 pointer-events-none' : ''}`}>
              <button onClick={handlePrev} className="p-3 md:p-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all rounded-full">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="md:w-6 md:h-6"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" /></svg>
              </button>

              <button 
                onClick={handlePlayPause} 
                className={`p-4 md:p-2 border rounded-full active:scale-95 transition-all shadow-lg ${
                  optimisticIsPlaying 
                    ? 'text-white hover:text-green-400 bg-white/5 hover:bg-white/10 border-white/20' 
                    : 'text-white hover:text-green-400 bg-white/5 hover:bg-white/10 border-white/20'
                }`}
              >
                {optimisticIsPlaying ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="md:w-8 md:h-8"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" className="md:w-8 md:h-8"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <button onClick={handleNext} className="p-3 md:p-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition-all rounded-full">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" className="md:w-6 md:h-6"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" /></svg>
              </button>
            </div>

            <div className={`mt-3 md:mt-2 flex items-center gap-2 ${isDemoMode ? 'opacity-50 pointer-events-none' : ''}`}>
              <span className="text-[10px] text-white/60 font-mono">VOL</span>
              <input 
                type="range" 
                min={0} 
                max={100} 
                value={volume} 
                onChange={handleVolumeChange} 
                className="flex-1 h-1 accent-white/90 cursor-pointer" 
              />
            </div>
          </div>

          {showProgressBar && (
            <div className="absolute bottom-0 left-0 w-full h-1 bg-white/10 md:hidden">
              <div className="h-full transition-all duration-1000 linear relative" style={{ width: `${progressPercent}%`, backgroundColor: primaryColor, boxShadow: `0 0 15px ${primaryColor}` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full z-50" style={{ boxShadow: `0 0 10px rgba(255,255,255,1), 0 0 20px ${primaryColor}` }}></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default MediaPlayer;