import React, { useState, useRef, useEffect } from 'react';
import { MoodState, PlaylistResponse, SpotifyState } from '../types';
import { generatePlaylist } from '../services/geminiService';
import { getUserProfile, searchTrack, createPlaylist, addTracksToPlaylist } from '../services/spotifyService';

interface SidebarProps {
  currentMood: MoodState; // Read-only mood from App (Spotify/Demo)
  spotifyState: SpotifyState;
  onConnectSpotify: () => void;
  onToggleDemo: () => void;
  isDemoMode: boolean;
  token: string | null;
}

type PresetMood = {
  name: string;
  values: MoodState;
};

const MOOD_PRESETS: PresetMood[] = [
  { name: 'Happy', values: { energy: 0.8, valence: 0.9, euphoria: 0.7, cognition: 0.3 } },
  { name: 'Melancholy', values: { energy: 0.2, valence: 0.2, euphoria: 0.1, cognition: 0.6 } },
  { name: 'Focus', values: { energy: 0.4, valence: 0.5, euphoria: 0.2, cognition: 0.9 } },
  { name: 'Hyper', values: { energy: 0.95, valence: 0.7, euphoria: 0.9, cognition: 0.1 } },
];

const PARAM_CONFIG = [
  { label: 'Energy', key: 'energy', color: 'text-orange-400', bg: 'bg-orange-400' },
  { label: 'Euphoria', key: 'euphoria', color: 'text-pink-400', bg: 'bg-pink-400' },
  { label: 'Valence', key: 'valence', color: 'text-cyan-400', bg: 'bg-cyan-400' },
  { label: 'Cognition', key: 'cognition', color: 'text-white', bg: 'bg-white' },
] as const;

const Sidebar: React.FC<SidebarProps> = ({ currentMood, spotifyState, onConnectSpotify, onToggleDemo, isDemoMode, token }) => {
  // Local state for Custom Setup (independent of Visualizer)
  const [customMood, setCustomMood] = useState<MoodState>({
    energy: 0.5,
    valence: 0.5,
    euphoria: 0.5,
    cognition: 0.5
  });
  
  const [playlist, setPlaylist] = useState<PlaylistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [userContext, setUserContext] = useState("");
  
  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);

  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playlist && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [playlist]);

  const handleGenerateClick = async () => {
    setLoading(true);
    setExportUrl(null); // Reset export state on new generation
    // Use customMood for generation, not the visualizer mood
    const result = await generatePlaylist(customMood, userContext);
    setPlaylist(result);
    setLoading(false);
  };

  const handleExportToSpotify = async () => {
    if (!token || !playlist) return;
    setExporting(true);

    try {
      // 1. Get User ID
      const user = await getUserProfile(token);
      if (!user || !user.id) throw new Error("Could not fetch user profile");

      // 2. Create Playlist
      // Use a generic name if preset isn't matched exactly, or just "Mood Check"
      const playlistName = `Mood Check: ${playlist.moodDescription.substring(0, 20)}...`;
      const newPlaylist = await createPlaylist(token, user.id, playlistName, `AI Generated for mood: ${playlist.moodDescription}`);
      
      // 3. Find Tracks
      const trackUris: string[] = [];
      for (const song of playlist.songs) {
        const uri = await searchTrack(token, `${song.title} ${song.artist}`);
        if (uri) {
          trackUris.push(uri);
        }
      }

      // 4. Add Tracks
      if (trackUris.length > 0) {
        await addTracksToPlaylist(token, newPlaylist.id, trackUris);
        setExportUrl(newPlaylist.external_urls.spotify);
      } else {
        alert("Could not find these songs on Spotify.");
      }

    } catch (error) {
      console.error("Export failed:", error);
      alert("Failed to create playlist. Check console for details.");
    } finally {
      setExporting(false);
    }
  };

  const handleSliderChange = (key: keyof MoodState, value: string) => {
    setCustomMood(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const applyPreset = (preset: PresetMood) => {
    setCustomMood(preset.values);
  };

  const getVisualizerTitle = () => {
    if (currentMood.euphoria > 0.8) return "STATE: EUPHORIC";
    if (currentMood.valence < 0.3 && currentMood.energy < 0.3) return "STATE: MELANCHOLIC";
    if (currentMood.energy > 0.8) return "STATE: HIGH_ENERGY";
    if (currentMood.cognition > 0.8) return "STATE: DEEP_FOCUS";
    return "STATE: NOMINAL";
  };

  // Component for Read-Only Progress Bar
  const ProgressBar = ({ label, value, color, bg }: { label: string, value: number, color: string, bg: string }) => (
    <div className="mb-3 group">
       <div className="flex justify-between text-[10px] mb-1 uppercase tracking-widest">
          <span className={`${color}`}>{label}</span>
          <span className="text-white/60 font-mono">{(value * 100).toFixed(0)}%</span>
       </div>
       <div className="w-full h-3 bg-white/5 border border-white/20 relative">
          {/* Grid background for empty part */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(255,255,255,0.5) 50%)', backgroundSize: '4px 100%' }}></div>
          
          {/* Filled part */}
          <div 
            className={`h-full ${bg} relative transition-all duration-500 ease-out`}
            style={{ width: `${value * 100}%` }}
          >
             {/* Scanline effect on bar */}
             <div className="absolute inset-0 bg-black/20" style={{ backgroundImage: 'linear-gradient(45deg,transparent 25%,rgba(0,0,0,.5) 25%,rgba(0,0,0,.5) 50%,transparent 50%,transparent 75%,rgba(0,0,0,.5) 75%,rgba(0,0,0,.5))', backgroundSize: '3px 3px' }}></div>
          </div>
       </div>
    </div>
  );

  return (
    <aside className="w-full md:w-96 h-full bg-black/90 backdrop-blur-sm border-l border-white/20 overflow-y-auto custom-scrollbar font-mono flex flex-col">
      <div className="p-6 space-y-8 pb-20">
        
        {/* Header Section */}
        <div className="relative">
           <div className="absolute top-0 right-0 text-[10px] text-white/30 flex flex-col items-end">
            <span>VER 2.4.0</span>
            <span>SYS.ONLINE</span>
          </div>
          <h1 className="text-3xl uppercase tracking-tighter text-white mb-1 mt-2">
            Mood<span className="text-blue-400">_</span>Check<span className="animate-pulse">_</span>
          </h1>
          <p className="text-white/40 text-xs uppercase tracking-widest border-b border-white/10 pb-4 inline-block">
            // Visual_Interface_Unit
          </p>
        </div>

        {/* Connection Panel (Simplified) */}
        <div className="p-4 bg-white/5 border border-white/20 relative group">
           <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-white/50"></div>
           <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-white/50"></div>
           <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-white/50"></div>
           <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-white/50"></div>

          {!spotifyState.isConnected ? (
            <div className="space-y-3">
              <button 
                onClick={onConnectSpotify}
                className="w-full py-2 px-4 bg-[#1DB954] hover:bg-[#1ed760] text-black font-bold uppercase text-sm tracking-wider transition-none border border-[#1DB954] hover:border-white"
              >
                [ Connect_Spotify ]
              </button>
              <button 
                onClick={onToggleDemo}
                className="w-full py-1 text-xs text-white/40 hover:text-white uppercase tracking-widest hover:bg-white/10 transition-colors"
              >
                &gt; Initiate_Simulation
              </button>
            </div>
          ) : (
             <div className="flex items-center justify-between">
               <span className="text-green-400 text-xs uppercase tracking-widest blink">&gt;&gt; LINK_ESTABLISHED</span>
               {isDemoMode && (
                  <button onClick={onToggleDemo} className="text-[10px] bg-red-500/10 text-red-400 px-2 py-1 border border-red-500/50 hover:bg-red-500 hover:text-black uppercase">
                    [ STOP_SIM ]
                  </button>
               )}
             </div>
          )}
        </div>

        {/* SECTION 1: LIVE PARAMETERS (READ ONLY) */}
        <div className="space-y-4">
          <div className="flex justify-between items-center border-b border-white/20 pb-1 border-dashed">
            <span className="text-sm font-bold text-white uppercase">/// Live_Telemetry</span>
            <span className="text-[10px] text-white/40 font-mono">{getVisualizerTitle()}</span>
          </div>
          
          {/* This uses 'currentMood' passed from App/Spotify */}
          <div className="space-y-1">
            {PARAM_CONFIG.map((param) => (
              <ProgressBar 
                key={param.key}
                label={param.label}
                value={currentMood[param.key as keyof MoodState]}
                color={param.color}
                bg={param.bg}
              />
            ))}
          </div>
        </div>

        {/* SECTION 2 & 3: CUSTOM SETUP & PRESETS (EDITABLE) */}
        <div className="space-y-4 pt-4 border-t border-white/20">
          <div className="flex justify-between items-center border-b border-white/20 pb-1 border-dashed">
            <span className="text-sm font-bold text-white uppercase">/// Custom_Setup</span>
            <span className="text-[10px] text-white/40 font-mono">GENERATOR_CONFIG</span>
          </div>

          {/* Presets */}
           <div className="grid grid-cols-2 gap-2 mb-4">
            {MOOD_PRESETS.map((preset) => (
              <button
                key={preset.name}
                onClick={() => applyPreset(preset)}
                className="text-[10px] uppercase py-2 px-2 border border-white/20 hover:border-white/60 hover:bg-white/10 text-white/70 hover:text-white transition-all text-left flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 bg-white/40"></span>
                {preset.name}
              </button>
            ))}
          </div>

          {/* Sliders - These control 'customMood' */}
          <div className="space-y-4">
            {PARAM_CONFIG.map((control) => (
              <div key={control.key} className="group">
                <div className="flex justify-between text-[10px] mb-1 uppercase tracking-widest">
                  <span className={`text-white/60 group-hover:text-white transition-colors`}>{control.label}</span>
                  <span className="text-white/30 font-mono">{(customMood[control.key as keyof MoodState] * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={customMood[control.key as keyof MoodState]}
                  onChange={(e) => handleSliderChange(control.key as keyof MoodState, e.target.value)}
                  className="w-full"
                />
              </div>
            ))}
          </div>
          
          {/* Context Input */}
           <div className="space-y-2 pt-2">
             <input 
                type="text"
                placeholder=">> ADD_CONTEXT (OPTIONAL)..."
                value={userContext}
                onChange={(e) => setUserContext(e.target.value)}
                className="w-full bg-black border border-white/30 px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-blue-400 font-mono uppercase"
             />
          </div>

          {/* Generate Button */}
          <button 
            onClick={handleGenerateClick}
            disabled={loading}
            className={`w-full py-3 font-bold text-sm uppercase tracking-widest transition-all border
              ${loading 
                ? 'bg-white/5 border-white/10 text-white/20 cursor-wait' 
                : 'bg-white/5 border-white/40 hover:bg-white hover:text-black hover:border-white shadow-[4px_4px_0px_0px_rgba(255,255,255,0.1)] hover:shadow-none active:translate-x-[2px] active:translate-y-[2px]'
              }`}
          >
            {loading ? (
              <span className="animate-pulse">processing...</span>
            ) : "[ GENERATE_SEQUENCE ]"}
          </button>
        </div>

        {/* SECTION 4: OUTPUT LOG */}
        <div ref={outputRef} className="space-y-4 pt-4 border-t border-white/20">
           <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-white uppercase">/// Output_Log</span>
          </div>

          {playlist ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 border-l-2 border-blue-500 pl-3 py-1 bg-blue-500/5">
                 <p className="text-xs text-blue-300 leading-relaxed font-mono uppercase">
                  // AI_ANALYSIS: "{playlist.moodDescription}"
                 </p>
              </div>
              
              <div className="space-y-3">
                {playlist.songs.map((song, idx) => (
                  <div key={idx} className="group p-3 border border-white/10 bg-white/5 hover:border-white/50 transition-colors relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-2 h-2 bg-white"></div>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-white text-sm uppercase tracking-tight">{song.title}</span>
                    </div>
                    <div className="text-xs text-gray-400 mb-2 uppercase border-b border-white/5 pb-1 inline-block">{song.artist}</div>
                    <div className="text-[10px] text-white/50 leading-relaxed font-mono">&gt;&gt; {song.reason}</div>
                  </div>
                ))}
              </div>

              {/* Export to Spotify Button */}
              {!exportUrl ? (
                <button
                  onClick={handleExportToSpotify}
                  disabled={exporting || !token}
                  className={`w-full py-2 font-bold text-xs uppercase tracking-wider border transition-all
                    ${!token 
                      ? 'opacity-50 border-white/10 text-white/30 cursor-not-allowed'
                      : exporting 
                        ? 'bg-green-500/20 border-green-500/50 text-green-400'
                        : 'bg-green-600 hover:bg-green-500 border-transparent text-white hover:shadow-[0px_0px_15px_rgba(34,197,94,0.4)]'
                    }`}
                >
                   {!token ? "[ CONNECT_SPOTIFY_FIRST ]" : exporting ? ">> SYNCHRONIZING..." : "[ EXPORT_TO_SPOTIFY ]"}
                </button>
              ) : (
                 <a 
                   href={exportUrl} 
                   target="_blank" 
                   rel="noreferrer"
                   className="block w-full text-center py-2 font-bold text-xs uppercase tracking-wider bg-white text-black hover:bg-gray-200 transition-all border border-white"
                 >
                   &gt;&gt; OPEN_IN_SPOTIFY
                 </a>
              )}

            </div>
          ) : (
            <div className="py-8 border border-dashed border-white/10 flex flex-col items-center justify-center text-white/20">
               <span className="text-[10px] text-center px-4 uppercase tracking-widest font-mono">Awaiting_Generation_Protocol...</span>
            </div>
          )}
        </div>

      </div>
    </aside>
  );
};

export default Sidebar;