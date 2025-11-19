
import React, { useState, useRef, useEffect } from 'react';
import { MoodState, PlaylistResponse, SpotifyState } from '../types';
import { generatePlaylist } from '../services/geminiService';
import { audioManager } from '../services/audioService';

interface SidebarProps {
  currentMood: MoodState;
  spotifyState: SpotifyState;
  onConnectSpotify: () => void;
  onToggleDemo: () => void;
  isDemoMode: boolean;
  token: string | null;
  onAudioToggle: (isActive: boolean) => void;
  isAudioActive: boolean;
}

type PresetMood = {
  name: string;
  values: MoodState;
};

const MOOD_PRESETS: PresetMood[] = [
  { name: 'HAPPY', values: { energy: 0.8, valence: 0.9, euphoria: 0.7, cognition: 0.3 } },
  { name: 'MELANCHOLIC', values: { energy: 0.2, valence: 0.2, euphoria: 0.1, cognition: 0.6 } },
  { name: 'CALM', values: { energy: 0.3, valence: 0.8, euphoria: 0.2, cognition: 0.5 } },
  { name: 'ANXIOUS', values: { energy: 0.8, valence: 0.2, euphoria: 0.3, cognition: 0.8 } },
  { name: 'BITTERSWEET', values: { energy: 0.5, valence: 0.5, euphoria: 0.4, cognition: 0.6 } },
  { name: 'DREAMY', values: { energy: 0.3, valence: 0.6, euphoria: 0.6, cognition: 0.4 } },
  { name: 'NOSTALGIC', values: { energy: 0.4, valence: 0.4, euphoria: 0.3, cognition: 0.7 } },
  { name: 'TENDER', values: { energy: 0.2, valence: 0.7, euphoria: 0.2, cognition: 0.5 } },
  { name: 'SLEEPY', values: { energy: 0.1, valence: 0.5, euphoria: 0.1, cognition: 0.2 } },
  { name: 'LAID-BACK', values: { energy: 0.4, valence: 0.8, euphoria: 0.3, cognition: 0.3 } },
  { name: 'PUMPED', values: { energy: 0.9, valence: 0.7, euphoria: 0.9, cognition: 0.4 } },
  { name: 'HYPER', values: { energy: 1.0, valence: 0.6, euphoria: 1.0, cognition: 0.1 } },
  { name: 'FOCUS', values: { energy: 0.3, valence: 0.5, euphoria: 0.1, cognition: 0.95 } },
  { name: 'BACKGROUND', values: { energy: 0.3, valence: 0.5, euphoria: 0.1, cognition: 0.7 } },
  { name: 'PARTY', values: { energy: 0.9, valence: 0.9, euphoria: 0.9, cognition: 0.2 } },
  { name: 'NIGHT DRIVE', values: { energy: 0.7, valence: 0.3, euphoria: 0.6, cognition: 0.7 } },
];

const PARAM_CONFIG = [
  { label: 'ENERGY', key: 'energy', color: 'text-orange-400', bg: 'bg-orange-400' },
  { label: 'LIFT', key: 'euphoria', color: 'text-pink-400', bg: 'bg-pink-400' },
  { label: 'MOOD TONE', key: 'valence', color: 'text-cyan-400', bg: 'bg-cyan-400' },
  { label: 'FOCUS LEVEL', key: 'cognition', color: 'text-gray-300', bg: 'bg-gray-300' },
] as const;

const Sidebar: React.FC<SidebarProps> = ({ 
  currentMood, 
  spotifyState, 
  onConnectSpotify, 
  onToggleDemo, 
  isDemoMode, 
  token,
  onAudioToggle,
  isAudioActive
}) => {
  const [customMood, setCustomMood] = useState<MoodState>({
    energy: 0.5, valence: 0.5, euphoria: 0.5, cognition: 0.5
  });
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [userContext, setUserContext] = useState("");
  
  const [selectedTracks, setSelectedTracks] = useState<Set<number>>(new Set());

  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playlist && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [playlist]);

  const handleGenerateClick = async () => {
    setLoading(true);
    const result = await generatePlaylist(customMood, userContext);
    setPlaylist(result);
    setSelectedTracks(new Set(result.songs.map((_, i) => i)));
    setLoading(false);
  };

  const handleSliderChange = (key: keyof MoodState, value: string) => {
    setCustomMood(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const applyPreset = (preset: PresetMood) => {
    setCustomMood(preset.values);
  };

  const handleAudioToggleClick = async () => {
    if (isAudioActive) {
      audioManager.stop();
      onAudioToggle(false);
    } else {
      const success = await audioManager.start();
      if (success) onAudioToggle(true);
    }
  };

  const toggleTrackSelection = (idx: number) => {
    const next = new Set(selectedTracks);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedTracks(next);
  };

  const toggleSelectAll = () => {
    if (!playlist) return;
    if (selectedTracks.size === playlist.songs.length) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(playlist.songs.map((_, i) => i)));
    }
  };

  // LOGIC: Telemetry Display
  // If a track is loaded, we show its data (even if paused).
  // If features are missing (local files), we show NO_DATA.
  // If no track is loaded, we show MANUAL (custom sliders).
  
  const hasTrack = !!spotifyState.currentTrack;
  const hasFeatures = !!spotifyState.features;
  
  let telemetryState = "MANUAL";
  let telemetryColor = "text-white/40";
  let displayMood = customMood;

  if (hasTrack) {
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
          // Show empty bars for NO_DATA to distinguish from actual 0%
          displayMood = { energy: 0, valence: 0, euphoria: 0, cognition: 0 };
      }
  }

  // Styles for the retro bar patterns
  const backgroundStripeStyle = {
    backgroundImage: 'repeating-linear-gradient(90deg, #222 0px, #222 1px, transparent 1px, transparent 4px)'
  };
  
  const fillHatchStyle = {
    backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.5) 0px, rgba(0,0,0,0.5) 2px, transparent 2px, transparent 4px)'
  };

  const formatPercent = (val: number) => {
    if (telemetryState === "NO_DATA") return "N/A";
    return `${(val * 100).toFixed(0)}%`;
  };

  return (
    <aside className="w-full md:w-96 h-full bg-black/95 backdrop-blur-sm border-l border-white/20 overflow-y-auto custom-scrollbar font-mono flex flex-col">
      <div className="p-6 space-y-6 pb-20">
        
        <div className="relative mb-6 border-b border-white/20 pb-4">
           <div className="absolute top-0 right-0 text-[9px] text-white/30 flex flex-col items-end font-mono">
            <span>VER 2.4.0</span>
            <span>SYS.ONLINE</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1 mt-1 uppercase font-pixel">
            Mood<span className="text-blue-400">_</span>Check<span className="animate-pulse text-blue-400">_</span>
          </h1>
          <p className="text-white/40 text-[10px] uppercase tracking-[0.2em] font-mono">
            // VISUAL_INTERFACE_UNIT
          </p>
        </div>

        {/* REAL-TIME MIC SYNC CARD */}
        <div className="p-4 border border-white/10 bg-white/5 flex items-center justify-between">
          <div>
            <h3 className="text-white font-bold text-xs uppercase tracking-wider">Real-time Mic Sync</h3>
            <p className="text-[9px] text-white/40 uppercase tracking-wide mt-1">Use microphone for beat pulse</p>
          </div>
          <button 
            onClick={handleAudioToggleClick}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-all
              ${isAudioActive 
                ? 'bg-red-500/20 text-red-400 border-red-500 hover:bg-red-500 hover:text-white' 
                : 'bg-transparent text-white/40 border-white/20 hover:text-white hover:border-white'}`}
          >
            {isAudioActive ? "ON" : "OFF"}
          </button>
        </div>

        {/* CONNECT BUTTON */}
        {!spotifyState.isConnected ? (
          <div className="p-4 border border-dashed border-white/20 bg-white/5 text-center">
             <p className="text-xs text-white/50 mb-3 uppercase tracking-widest">System Offline</p>
             <button 
                onClick={onConnectSpotify}
                className="w-full py-3 bg-[#1DB954]/90 hover:bg-[#1DB954] text-black font-bold text-xs uppercase tracking-[0.15em] transition-all hover:scale-[1.02]"
             >
                &gt;&gt; Connect Spotify
             </button>
          </div>
        ) : (
          <div className="p-3 border border-green-500/30 bg-green-500/5 flex items-center justify-between">
             <span className="text-[10px] text-green-400 uppercase tracking-widest font-bold">&gt;&gt; LINK_ESTABLISHED</span>
             <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
          </div>
        )}

        {/* TELEMETRY DASHBOARD */}
        <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-dashed border-white/20 pb-1">
              <h3 className="text-sm font-bold text-white uppercase tracking-wide font-pixel">/// LIVE_TELEMETRY</h3>
              <span className={`text-[9px] font-mono ${telemetryColor}`}>STATE: {telemetryState}</span>
            </div>

            <div className="space-y-5 pt-1">
               {/* ENERGY */}
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-orange-500">ENERGY</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.energy)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      {/* Background Texture */}
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      {/* Filled Bar */}
                      <div className="absolute top-0 left-0 bottom-0 bg-orange-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.energy * 100}%` }}>
                          <div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div>
                      </div>
                  </div>
               </div>

               {/* LIFT */}
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-pink-500">LIFT</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.euphoria)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-pink-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.euphoria * 100}%` }}>
                          <div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div>
                      </div>
                  </div>
               </div>

               {/* MOOD TONE */}
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-cyan-500">MOOD TONE</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.valence)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-cyan-500 transition-all duration-500 ease-out" style={{ width: `${displayMood.valence * 100}%` }}>
                          <div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div>
                      </div>
                  </div>
               </div>

               {/* FOCUS LEVEL */}
               <div className="group">
                  <div className="flex justify-between text-[10px] mb-1.5 uppercase tracking-widest font-bold">
                    <span className="text-white">FOCUS LEVEL</span>
                    <span className="text-white font-mono">{formatPercent(displayMood.cognition)}</span>
                  </div>
                  <div className="h-3 w-full bg-black border border-white/10 relative overflow-hidden">
                      <div className="absolute inset-0 opacity-30" style={backgroundStripeStyle}></div>
                      <div className="absolute top-0 left-0 bottom-0 bg-gray-300 transition-all duration-500 ease-out" style={{ width: `${displayMood.cognition * 100}%` }}>
                          <div className="absolute inset-0 w-full h-full" style={fillHatchStyle}></div>
                      </div>
                  </div>
               </div>
            </div>
        </div>

        {/* GENERATOR CONTROLS */}
        <div className="space-y-4 pt-6">
            <div className="flex justify-between items-center border-b border-dashed border-white/20 pb-1">
              <h3 className="text-sm font-bold text-white uppercase font-pixel">/// CUSTOM_SETUP</h3>
              <span className="text-[9px] text-white/30 font-mono uppercase">GENERATOR_CONFIG</span>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              {MOOD_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => applyPreset(preset)}
                  className="text-[9px] font-mono flex items-center gap-2 uppercase py-2 px-2 border border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/30 text-white/70 hover:text-white transition-all text-left group"
                >
                  <span className="w-1.5 h-1.5 bg-white/20 group-hover:bg-white transition-colors"></span>
                  {preset.name}
                </button>
              ))}
            </div>
            
            {/* Manual Sliders */}
            <div className="space-y-5">
               {PARAM_CONFIG.map((control) => (
                 <div key={control.key} className="group">
                    <div className="flex justify-between text-[10px] mb-2 uppercase tracking-widest font-bold text-white/80">
                       <span className="text-white/60 group-hover:text-white transition-colors">{control.label}</span>
                       <span className="font-mono">{(customMood[control.key as keyof MoodState] * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={customMood[control.key as keyof MoodState]}
                      onChange={(e) => handleSliderChange(control.key as keyof MoodState, e.target.value)}
                      className="w-full opacity-70 hover:opacity-100 transition-opacity"
                    />
                 </div>
               ))}
            </div>

            <div className="space-y-2 pt-2">
              <input 
                  type="text"
                  placeholder=">> ADD_CONTEXT (OPTIONAL)..."
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  className="w-full bg-black border border-white/20 px-3 py-3 text-[10px] text-white placeholder-white/30 focus:outline-none focus:border-blue-400 font-mono uppercase tracking-wide"
              />
            </div>

            <button 
              onClick={handleGenerateClick}
              disabled={loading}
              className={`w-full py-3 font-bold text-xs uppercase tracking-[0.15em] transition-all border font-mono mt-2
                ${loading 
                  ? 'bg-white/5 border-white/10 text-white/20 cursor-wait' 
                  : 'bg-white/5 border-white/30 hover:bg-white hover:text-black hover:border-white shadow-[0_0_10px_rgba(255,255,255,0.05)]'
                }`}
            >
              {loading ? <span className="animate-pulse">PROCESSING...</span> : "[ GENERATE_SEQUENCE ]"}
            </button>
        </div>

        {/* PLAYLIST OUTPUT HEADER & CONTENT */}
        <div className="space-y-4 pt-2">
          {/* Output Header */}
          <div className="flex justify-between items-center border-b border-dashed border-white/20 pb-1">
              <h3 className="text-sm font-bold text-white uppercase font-pixel">/// OUTPUT_LOG</h3>
          </div>

          {/* Playlist Content */}
          <div ref={outputRef}>
          {playlist && (
            <div className="space-y-3 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start gap-2 border-l border-blue-500 pl-3 py-1 bg-blue-500/5">
                 <p className="text-[10px] text-blue-300 leading-relaxed font-mono uppercase">
                  // AI_OUT: "{playlist.moodDescription}"
                 </p>
              </div>
              
              <div className="flex justify-between items-center pb-2 border-b border-white/10 mt-3">
                 <div className="flex gap-2">
                    <button onClick={toggleSelectAll} className="text-[9px] text-white/50 hover:text-white uppercase border border-white/20 px-2 py-0.5 hover:bg-white/10 transition-colors">
                       {selectedTracks.size === playlist.songs.length ? "NONE" : "ALL"}
                    </button>
                 </div>
                 <span className="text-[9px] text-white/30 font-mono">{selectedTracks.size}/{playlist.songs.length} SELECTED</span>
              </div>

              {playlist.songs.map((song, idx) => {
                const isSelected = selectedTracks.has(idx);
                return (
                  <div 
                    key={idx} 
                    className={`p-2 border transition-all cursor-pointer group ${isSelected ? 'border-white/20 bg-white/5' : 'border-transparent opacity-50 hover:opacity-80'}`}
                    onClick={() => toggleTrackSelection(idx)}
                  >
                    <div className="flex items-center gap-3">
                       <div className={`w-2.5 h-2.5 border border-white/40 flex items-center justify-center ${isSelected ? 'bg-blue-500 border-blue-500' : ''}`}>
                          {isSelected && <div className="w-1 h-1 bg-white"></div>}
                       </div>
                       <div className="flex-1 min-w-0 font-mono">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`font-bold text-[10px] uppercase truncate ${isSelected ? 'text-white' : 'text-gray-400'}`}>{song.title}</span>
                          </div>
                          <div className="text-[9px] text-gray-500 uppercase truncate">{song.artist}</div>
                       </div>
                    </div>
                  </div>
                );
              })}
              
              <button 
                 className="w-full py-2 mt-2 bg-[#1DB954] text-black font-bold text-xs uppercase tracking-[0.15em] hover:bg-[#1ed760] disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                 disabled={!spotifyState.isConnected || selectedTracks.size === 0}
                 title={!spotifyState.isConnected ? "Connect Spotify to Export" : ""}
              >
                 {spotifyState.isConnected ? `[ EXPORT (${selectedTracks.size}) ]` : "[ LOGIN_REQ ]"}
              </button>
            </div>
          )}
          </div>
        </div>

      </div>
    </aside>
  );
};

export default Sidebar;
