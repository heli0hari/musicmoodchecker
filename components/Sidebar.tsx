import React, { useState, useRef, useEffect } from 'react';
import { MoodState, PlaylistResponse, SpotifyState, YoutubeTrack, SpotifyTrack } from '../types';
import { generatePlaylist } from '../services/geminiService';
import { audioManager } from '../services/audioService';
import { searchTrack, getUserProfile, createPlaylist, addTracksToPlaylist, addItemToQueue, searchSpotifyTracks } from '../services/spotifyService';
import { resolveYoutubeUrl, searchYoutube } from '../services/youtubeService';

interface SidebarProps {
  currentMood: MoodState;
  spotifyState: SpotifyState;
  onConnectSpotify: () => void;
  onToggleDemo: () => void;
  isDemoMode: boolean;
  token: string | null;
  onAudioToggle: (isActive: boolean) => void;
  isAudioActive: boolean;
  onPlatformChange: (platform: 'SPOTIFY' | 'YOUTUBE') => void;
  onAddToQueue: (type: 'SPOTIFY' | 'YOUTUBE', item: any) => void;
  onMoodChange?: (mood: MoodState) => void;
  onPlayNow: (type: 'SPOTIFY' | 'YOUTUBE', item: any) => void;
}

const MOOD_PRESETS = [
  "HAPPY", "MELANCHOLIC", "CALM", "ANXIOUS",
  "BITTERSWEET", "DREAMY", "NOSTALGIC", "TENDER",
  "SLEEPY", "LAID-BACK", "PUMPED", "HYPER",
  "FOCUS", "BACKGROUND", "PARTY", "NIGHT DRIVE"
];

const getPresetValues = (name: string): MoodState => {
  switch(name) {
    case "HAPPY": return { energy: 0.8, valence: 0.9, euphoria: 0.8, cognition: 0.3 };
    case "MELANCHOLIC": return { energy: 0.3, valence: 0.2, euphoria: 0.1, cognition: 0.7 };
    case "CALM": return { energy: 0.2, valence: 0.6, euphoria: 0.3, cognition: 0.5 };
    case "ANXIOUS": return { energy: 0.9, valence: 0.2, euphoria: 0.1, cognition: 0.9 };
    case "BITTERSWEET": return { energy: 0.5, valence: 0.4, euphoria: 0.3, cognition: 0.8 };
    case "DREAMY": return { energy: 0.3, valence: 0.5, euphoria: 0.7, cognition: 0.1 };
    case "NOSTALGIC": return { energy: 0.4, valence: 0.4, euphoria: 0.2, cognition: 0.9 };
    case "TENDER": return { energy: 0.2, valence: 0.7, euphoria: 0.4, cognition: 0.6 };
    case "SLEEPY": return { energy: 0.1, valence: 0.5, euphoria: 0.2, cognition: 0.1 };
    case "LAID-BACK": return { energy: 0.4, valence: 0.6, euphoria: 0.5, cognition: 0.4 };
    case "PUMPED": return { energy: 0.9, valence: 0.8, euphoria: 0.9, cognition: 0.6 };
    case "HYPER": return { energy: 1.0, valence: 0.7, euphoria: 1.0, cognition: 0.2 };
    case "FOCUS": return { energy: 0.5, valence: 0.5, euphoria: 0.2, cognition: 1.0 };
    case "BACKGROUND": return { energy: 0.3, valence: 0.5, euphoria: 0.1, cognition: 0.5 };
    case "PARTY": return { energy: 0.9, valence: 0.9, euphoria: 0.9, cognition: 0.2 };
    case "NIGHT DRIVE": return { energy: 0.6, valence: 0.5, euphoria: 0.6, cognition: 0.4 };
    default: return { energy: 0.5, valence: 0.5, euphoria: 0.5, cognition: 0.5 };
  }
};

const Sidebar: React.FC<SidebarProps> = ({ 
  currentMood, 
  spotifyState, 
  onConnectSpotify, 
  token,
  onAudioToggle,
  isAudioActive,
  onPlatformChange,
  onAddToQueue,
  onMoodChange,
  onPlayNow
}) => {
  const activePlatform = spotifyState.activeSource;
  
  const [commandInput, setCommandInput] = useState("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>(["SYS.ONLINE...", "AWAITING INPUT..."]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [ytSearchResults, setYtSearchResults] = useState<YoutubeTrack[]>([]);
  const [spotifySearchResults, setSpotifySearchResults] = useState<SpotifyTrack[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [playlistResult, setPlaylistResult] = useState<PlaylistResponse | null>(null);

  const addLog = (msg: string) => {
    setConsoleLogs(prev => [...prev.slice(-4), `> ${msg}`]);
  };
  
  const handleAudioToggleClick = async (forceStart = false) => {
    if (isAudioActive && !forceStart) {
      audioManager.stop();
      onAudioToggle(false);
    } else {
      const success = await audioManager.startMic();
      if (success) onAudioToggle(true);
    }
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandInput.trim() || isProcessing) return;

    const query = commandInput.trim();
    
    if (activePlatform === 'YOUTUBE') setYtSearchResults([]);
    else setSpotifySearchResults([]);

    setIsProcessing(true);
    addLog(`PROCESSING: ${query.substring(0, 15)}...`);

    try {
      if (activePlatform === 'SPOTIFY') {
         if (!spotifyState.isConnected || !token) {
             addLog("ERR: SPOTIFY NOT CONNECTED");
             setIsProcessing(false);
             return;
         }
         
         addLog(`SEARCHING: ${query.toUpperCase()}`);
         const results = await searchSpotifyTracks(token, query);
         
         if (results.length > 0) {
            setSpotifySearchResults(results);
            addLog(`FOUND ${results.length} RESULTS`);
         } else {
            addLog("ERR: NO RESULTS FOUND");
         }
      } 
      else {
         const result = await resolveYoutubeUrl(query);
         
         if (result) {
             if (Array.isArray(result)) {
                 addLog(`LOADED PLAYLIST: ${result.length} TRACKS`);
                 if (result.length > 0) {
                     onPlayNow('YOUTUBE', result[0]);
                     if (result.length > 1) {
                         onAddToQueue('YOUTUBE', result.slice(1));
                         addLog(`QUEUED ${result.length - 1} TRACKS`);
                     }
                 }
                 setCommandInput("");
             } else {
                 setCommandInput("");
                 onPlayNow('YOUTUBE', result);
                 addLog(`PLAYING: ${result.title.substring(0, 15).toUpperCase()}`);
             }
         } else {
             addLog(`SEARCHING: ${query.toUpperCase()}`);
             const results = await searchYoutube(query);
             if (results.length > 0) {
                 setYtSearchResults(results);
                 addLog(`FOUND ${results.length} RESULTS`);
             } else {
                 addLog("ERR: NO RESULTS FOUND");
             }
         }
      }
    } catch (err: any) {
        const msg = err.message || "EXECUTION FAILED";
        if (msg.includes("API Key") || msg.includes("403")) {
            addLog("ERR: SEARCH API DISABLED. USE LINK.");
        } else {
            addLog(`ERR: ${msg.toUpperCase().substring(0,20)}`);
        }
    } finally {
        setIsProcessing(false);
    }
  };

  const handleSliderChange = (key: keyof MoodState, val: number) => {
      if (onMoodChange) {
          onMoodChange({ ...currentMood, [key]: val });
      }
  };

  const handlePresetClick = (presetName: string) => {
      const newMood = getPresetValues(presetName);
      if (onMoodChange) onMoodChange(newMood);
  };

  const handleGeneratePlaylist = async () => {
      setIsGenerating(true);
      setPlaylistResult(null);
      const moodToUse = currentMood; // Always use manual mood for generation
      const result = await generatePlaylist(moodToUse);
      setPlaylistResult(result);
      setIsGenerating(false);
  };

  const handleExportPlaylist = async () => {
      if (!playlistResult || !token || !spotifyState.isConnected) return;
      setIsGenerating(true);
      try {
          const user = await getUserProfile(token);
          const playlist = await createPlaylist(token, user.id, `Mood: ${playlistResult.moodDescription.substring(0, 20)}...`, "Generated by Mood Check AI");
          const uris: string[] = [];
          for (const song of playlistResult.songs) {
              const foundUri = await searchTrack(token, `${song.title} ${song.artist}`);
              if (foundUri) uris.push(foundUri);
          }
          if (uris.length > 0) {
              await addTracksToPlaylist(token, playlist.id, uris);
              addLog("PLAYLIST EXPORTED TO SPOTIFY");
          } else {
              addLog("ERR: NO TRACKS FOUND");
          }
      } catch (e) {
          addLog("ERR: EXPORT FAILED");
      } finally {
          setIsGenerating(false);
      }
  };

  const handleYoutubeResultClick = (item: YoutubeTrack) => {
      onAddToQueue('YOUTUBE', item);
      setYtSearchResults([]);
      setCommandInput("");
      addLog(`QUEUED: ${item.title.substring(0,15).toUpperCase()}...`);
  };

  const handleSpotifyResultClick = (item: SpotifyTrack) => {
      onAddToQueue('SPOTIFY', item);
      setSpotifySearchResults([]);
      setCommandInput("");
      addLog(`QUEUED: ${item.name.substring(0,15).toUpperCase()}...`);
  };

  // Telemetry Logic - FOR DISPLAY ONLY, doesn't affect controls
  const hasTrack = activePlatform === 'SPOTIFY' ? !!spotifyState.currentTrack : !!spotifyState.youtubeTrack;
  const hasFeatures = !!spotifyState.features;
  
  let telemetryState = "MANUAL";
  let telemetryColor = "text-white/40";
  let displayMood = currentMood;

  if (activePlatform === 'YOUTUBE') {
      telemetryState = isAudioActive ? "LISTENING (EXT)" : "WAITING_AUDIO";
      telemetryColor = isAudioActive ? "text-red-500 animate-pulse" : "text-white/40";
  }
  else if (hasTrack) {
      if (hasFeatures) {
          if (spotifyState.features?.isEstimated) {
             telemetryState = "ESTIMATED";
             telemetryColor = "text-amber-500 animate-pulse";
          } else {
             telemetryState = "NOMINAL";
             telemetryColor = "text-green-400";
          }
          displayMood = {
            energy: spotifyState.features!.energy,
            valence: spotifyState.features!.valence,
            euphoria: spotifyState.features!.danceability,
            cognition: 1.0 - spotifyState.features!.acousticness
          };
      } else {
          telemetryState = "NO_DATA";
          telemetryColor = "text-red-500";
      }
  }

  const backgroundStripeStyle = { backgroundImage: 'repeating-linear-gradient(90deg, #222 0px, #222 1px, transparent 1px, transparent 4px)' };
  const fillHatchStyle = { backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 2px, transparent 2px, transparent 4px)' };
  const formatPercent = (val: number) => telemetryState === "NO_DATA" ? "N/A" : `${(val * 100).toFixed(0)}%`;

  const renderSlider = (label: string, value: number, field: keyof MoodState, colorClass: string) => (
      <div className="group">
        <div className="flex justify-between text-[9px] mb-1 uppercase tracking-widest font-bold">
            <span className={colorClass}>{label}</span>
            <span className="text-white font-mono">{(value * 100).toFixed(0)}%</span>
        </div>
        <input 
            type="range" min="0" max="1" step="0.01" value={value}
            onChange={(e) => handleSliderChange(field, parseFloat(e.target.value))}
            // REMOVED: No disabling - always enabled for manual control
            className="w-full h-1 appearance-none bg-white/10 rounded-none outline-none cursor-pointer hover:bg-white/20"
        />
      </div>
  );

  return (
    <aside className="w-full md:w-96 h-full bg-black/95 backdrop-blur-sm border-l border-white/20 overflow-y-auto custom-scrollbar font-mono flex flex-col">
      <div className="p-6 space-y-6 pb-20">
        <div className="relative mb-6 border-b border-white/20 pb-4">
           <div className="absolute top-0 right-0 text-[9px] text-white/30 flex flex-col items-end font-mono">
            <span>VER 2.5.0</span>
            <span>SYS.ONLINE</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1 mt-1 uppercase font-pixel">
            Mood<span className="text-blue-400">_</span>Check<span className="animate-pulse text-blue-400">_</span>
          </h1>
          <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-mono">// VISUAL_INTERFACE_UNIT</p>
        </div>

{/* PLATFORM SELECTOR */}
<div className="grid grid-cols-2 gap-2 p-1 bg-white/5 border border-white/10 mb-4">
    <button onClick={() => onPlatformChange('SPOTIFY')} className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activePlatform === 'SPOTIFY' ? 'bg-[#1DB954] text-black' : 'text-white/40 hover:text-white'}`}>Spotify</button>
    <button onClick={() => onPlatformChange('YOUTUBE')} className={`py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activePlatform === 'YOUTUBE' ? 'bg-[#FF0000] text-black' : 'text-white/40 hover:text-white'}`}>YouTube(experimental)</button>
</div>

        {/* COMMON REAL-TIME MIC SYNC */}
         <div className="space-y-4">
             <div className={`p-3 border bg-white/5 flex flex-col gap-2 ${isAudioActive ? 'border-red-500/50' : 'border-white/10'}`}>
                <div className="flex items-center justify-between">
                    <h3 className={`font-bold text-[10px] uppercase tracking-wider ${isAudioActive ? 'text-red-400' : 'text-white/50'}`}>REAL-TIME MIC SYNC</h3>
                    <div className={`w-2 h-2 rounded-full ${isAudioActive ? 'bg-red-500 animate-pulse' : 'bg-white/10'}`}></div>
                </div>
                <div className="flex items-center gap-2">
                    <p className="text-[9px] text-white/40 flex-1">Use microphone for visual reactivity on any platform.</p>
                    <button onClick={() => handleAudioToggleClick()} className={`px-3 py-1 text-[9px] font-bold uppercase tracking-widest border transition-all ${isAudioActive ? 'bg-red-500 text-white border-red-500' : 'bg-transparent text-white/60 border-white/20 hover:text-white hover:border-white/40'}`}>
                        {isAudioActive ? "ON" : "OFF"}
                    </button>
                </div>
             </div>
         </div>

        {/* SPOTIFY CONNECT UI */}
        {activePlatform === 'SPOTIFY' && (
            <div className="animate-in fade-in slide-in-from-top-2 duration-300 space-y-6">
                {!spotifyState.isConnected ? (
                <div className="p-4 border border-dashed border-white/20 bg-white/5 text-center">
                    <p className="text-xs text-white/50 mb-3 uppercase tracking-widest">System Offline</p>
                    <button onClick={onConnectSpotify} className="w-full py-3 bg-[#1DB954]/90 hover:bg-[#1DB954] text-black font-bold text-xs uppercase tracking-[0.15em] transition-all hover:scale-[1.02]">
                        &gt;&gt; Connect Spotify
                    </button>
                </div>
                ) : (
                <div className="p-3 border border-green-500/30 bg-green-500/5 flex items-center justify-between">
                    <span className="text-[10px] text-green-400 uppercase tracking-widest font-bold">&gt;&gt; LINK_ESTABLISHED</span>
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
                </div>
                )}
            </div>
        )}

        {/* TELEMETRY DASHBOARD */}
        <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-dashed border-white/20 pb-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide font-pixel">/// LIVE_TELEMETRY</h3>
              <span className={`text-[9px] font-mono ${telemetryColor}`}>STATE: {telemetryState}</span>
            </div>
            <div className="space-y-5 pt-1">
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-orange-500">ENERGY</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.energy)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-orange-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.energy * 100}%` }}><div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div></div>
                  </div>
               </div>
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-pink-500">LIFT</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.euphoria)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-pink-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.euphoria * 100}%` }}><div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div></div>
                  </div>
               </div>
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-cyan-500">MOOD TONE</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.valence)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-cyan-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.valence * 100}%` }}><div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div></div>
                  </div>
               </div>
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-gray-400">FOCUS LEVEL</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.cognition)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-gray-400 transition-all duration-500 ease-out" style={{ width: `${displayMood.cognition * 100}%` }}><div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div></div>
                  </div>
               </div>
            </div>
        </div>

        {/* COMMAND CONSOLE */}
        <div className="space-y-4 pt-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="flex justify-between items-center border-b border-dashed border-white/20 pb-1">
              <h3 className="text-sm font-bold text-white uppercase font-pixel">/// CMD_CONSOLE</h3>
              <span className="text-[9px] text-white/30 font-mono uppercase">{activePlatform}</span>
            </div>

            <div className="bg-black border border-white/10 p-3 h-24 overflow-hidden flex flex-col justify-end font-mono text-[9px] text-green-400/80 shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                 {consoleLogs.map((log, i) => (
                    <div key={i} className="truncate">{log}</div>
                 ))}
            </div>

            <form onSubmit={handleCommandSubmit} className="relative">
                <span className="absolute left-3 top-3.5 text-green-400 text-[10px]">&gt;&gt;</span>
                <input 
                  type="text"
                  placeholder={activePlatform === 'SPOTIFY' ? "REQUEST SONG..." : "SEARCH OR PASTE LINK..."}
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  disabled={isProcessing}
                  className="w-full bg-white/5 border border-white/20 pl-8 pr-3 py-3 text-[10px] text-white placeholder-white/30 focus:outline-none focus:border-green-400 font-mono uppercase tracking-wide disabled:opacity-50"
                />
            </form>

            {/* Youtube Search Results */}
            {ytSearchResults.length > 0 && activePlatform === 'YOUTUBE' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">SEARCH RESULTS</div>
                    {ytSearchResults.map(result => (
                        <div key={result.id} className="flex gap-3 p-2 bg-white/5 hover:bg-white/10 border border-white/10 group transition-all relative">
                             <div className="w-10 h-10 flex-shrink-0 bg-black">
                                 <img src={result.thumbnailUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100"/>
                             </div>
                             <div className="flex flex-col justify-center flex-1 min-w-0">
                                 <span className="text-[10px] text-white font-bold truncate">{result.title}</span>
                                 <span className="text-[9px] text-white/50 truncate">{result.channelTitle}</span>
                             </div>
                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 absolute right-2 bg-black/80 p-1">
                                <button onClick={() => { onPlayNow('YOUTUBE', result); setYtSearchResults([]); setCommandInput(""); addLog(`PLAYING: ${result.title.substring(0,10)}...`); }} className="px-2 py-1 bg-green-500 text-black text-[9px] font-bold hover:bg-green-400">PLAY</button>
                                <button onClick={() => handleYoutubeResultClick(result)} className="px-2 py-1 border border-white/30 text-white text-[9px] font-bold hover:bg-white/10">+ QUEUE</button>
                             </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Spotify Search Results */}
            {spotifySearchResults.length > 0 && activePlatform === 'SPOTIFY' && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <div className="text-[9px] text-white/40 uppercase tracking-widest font-bold">SEARCH RESULTS</div>
                    {spotifySearchResults.map(result => (
                        <div key={result.id} className="flex gap-3 p-2 bg-white/5 hover:bg-white/10 border border-white/10 group transition-all relative">
                             <div className="w-10 h-10 flex-shrink-0 bg-black">
                                 {result.album.images[0] ? (
                                     <img src={result.album.images[0].url} className="w-full h-full object-cover opacity-80 group-hover:opacity-100"/>
                                 ) : (
                                     <div className="w-full h-full bg-white/10"></div>
                                 )}
                             </div>
                             <div className="flex flex-col justify-center flex-1 min-w-0">
                                 <span className="text-[10px] text-white font-bold truncate">{result.name}</span>
                                 <span className="text-[9px] text-white/50 truncate">{result.artists[0]?.name}</span>
                             </div>
                             <div className="flex gap-1 opacity-0 group-hover:opacity-100 absolute right-2 bg-black/80 p-1">
                                <button onClick={() => { onPlayNow('SPOTIFY', result); setSpotifySearchResults([]); setCommandInput(""); addLog(`PLAYING: ${result.name.substring(0,10)}...`); }} className="px-2 py-1 bg-green-500 text-black text-[9px] font-bold hover:bg-green-400">PLAY</button>
                                <button onClick={() => handleSpotifyResultClick(result)} className="px-2 py-1 border border-white/30 text-white text-[9px] font-bold hover:bg-white/10">+ QUEUE</button>
                             </div>
                        </div>
                    ))}
                </div>
            )}

             {/* UP NEXT QUEUE */}
            <div className="mt-4">
                <div className="text-[9px] text-white/40 mb-2 uppercase tracking-widest font-bold">UP NEXT</div>
                <div className="space-y-1">
                    {spotifyState.queue.filter(q => q.platform === activePlatform).length === 0 && (
                        <div className="text-[9px] text-white/20 italic px-2">QUEUE EMPTY</div>
                    )}
                    {spotifyState.queue.filter(q => q.platform === activePlatform).slice(0, 3).map((item, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 border border-white/5 bg-white/5">
                            <div className="w-1 h-1 bg-green-400"></div>
                            <span className="text-[9px] text-white/70 truncate flex-1 font-mono">
                                {item.platform === 'SPOTIFY' ? item.spotifyTrack?.name : item.youtubeTrack?.title}
                            </span>
                        </div>
                    ))}
                    {spotifyState.queue.filter(q => q.platform === activePlatform).length > 3 && (
                        <div className="text-[9px] text-white/30 italic px-2 pt-1">
                           + {spotifyState.queue.filter(q => q.platform === activePlatform).length - 3} MORE
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* AI GENERATOR & MANUAL SETUP - ALWAYS ENABLED */}
        <div className="space-y-4 pt-6 animate-in fade-in slide-in-from-bottom-4 duration-700 border-t border-white/10 mt-4">
             <div className="flex justify-between items-center border-b border-dashed border-white/20 pb-1">
                <h3 className="text-sm font-bold text-white uppercase font-pixel">/// CUSTOM_SETUP</h3>
                <span className="text-[9px] text-white/30 font-mono uppercase">GENERATOR</span>
             </div>

             {/* REMOVED: No disabling conditions - always enabled */}
             <div className="grid grid-cols-2 gap-2">
                 {MOOD_PRESETS.map(preset => (
                     <button 
                       key={preset} 
                       onClick={() => handlePresetClick(preset)}
                       className="py-2 border border-white/10 bg-white/5 text-white/60 text-[9px] hover:bg-white/10 hover:text-white hover:border-white/30 transition-all flex items-center gap-2 px-2"
                     >
                        <div className="w-1.5 h-1.5 bg-white/20"></div>
                        {preset}
                     </button>
                 ))}
             </div>
             
             {/* REMOVED: No disabling conditions - always enabled */}
             <div className="space-y-4 bg-white/5 p-3 border border-white/10 mt-4">
                {renderSlider("ENERGY", currentMood.energy, "energy", "text-orange-400")}
                {renderSlider("LIFT", currentMood.euphoria, "euphoria", "text-pink-400")}
                {renderSlider("TONE", currentMood.valence, "valence", "text-cyan-400")}
                {renderSlider("FOCUS", currentMood.cognition, "cognition", "text-gray-400")}
             </div>

             {/* Generate button - always enabled */}
             <button 
               onClick={handleGeneratePlaylist} 
               disabled={isGenerating}
               className="w-full py-3 border border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold text-[10px] uppercase tracking-[0.15em] transition-all hover:border-white/40 disabled:opacity-50 flex justify-center items-center gap-2 mt-2"
             >
                {isGenerating ? ( <><div className="w-2 h-2 bg-white rounded-full animate-bounce"></div><span>PROCESSING...</span></> ) : ( <span>[ GENERATE_SEQUENCE ]</span> )}
             </button>

             {playlistResult && (
                <div className="space-y-3 mt-4 border-t border-white/10 pt-4">
                    <p className="text-[10px] text-white/60 italic border-l-2 border-white/20 pl-2">"{playlistResult.moodDescription}"</p>
                    <div className="space-y-1">
                        {playlistResult.songs.map((song, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] p-2 bg-white/5 hover:bg-white/10 cursor-pointer border border-transparent hover:border-white/10 group">
                                <div className="flex flex-col truncate">
                                    <span className="text-white font-bold truncate">{song.title}</span>
                                    <span className="text-white/50">{song.artist}</span>
                                </div>
                                <button onClick={() => {
                                    if (activePlatform === 'SPOTIFY') setCommandInput(`${song.title} ${song.artist}`);
                                    else addLog("COPY LINK TO PLAY ON YT");
                                }} className="opacity-0 group-hover:opacity-100 text-green-400 hover:underline">CMD</button>
                            </div>
                        ))}
                    </div>
                    {activePlatform === 'SPOTIFY' && spotifyState.isConnected && (
                        <button onClick={handleExportPlaylist} disabled={isGenerating} className="w-full py-2 bg-[#1DB954]/20 hover:bg-[#1DB954]/30 text-[#1DB954] border border-[#1DB954]/50 font-bold text-[9px] uppercase tracking-widest mt-2 transition-all">
                            {isGenerating ? "EXPORTING..." : "EXPORT TO SPOTIFY"}
                        </button>
                    )}
                </div>
             )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;