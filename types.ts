
export enum VisualizerMaterial {
  Liquid = 'LIQUID',
  Rock = 'ROCK',
  Metal = 'METAL',
  Romance = 'ROMANCE',
  Glass = 'GLASS'
}

export interface MoodState {
  energy: number;   // 0.0 - 1.0
  valence: number;  // 0.0 - 1.0
  euphoria: number; // 0.0 - 1.0
  cognition: number; // 0.0 - 1.0
}

export interface SongSuggestion {
  title: string;
  artist: string;
  reason: string;
}

export interface PlaylistResponse {
  moodDescription: string;
  songs: SongSuggestion[];
}

// --- Visual Types ---

export interface VisualConfig {
  primaryColor: string;
  secondaryColor: string;
  style: 'LIQUID' | 'GLITCH' | 'GEOMETRIC' | 'PARTICLE' | 'NEON';
  speed: number; // 0.5 to 2.0
  sharpness: number; // 0.0 (round) to 1.0 (spiky)
}

// --- Spotify Specific Types ---

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: { images: { url: string }[] };
  duration_ms: number;
}

export interface AudioFeatures {
  energy: number;
  valence: number;
  danceability: number; // Map to Euphoria
  acousticness: number; 
  instrumentalness: number; // Map combined with acousticness to Cognition
  tempo: number;
  loudness: number;
  isEstimated?: boolean; // Flag to indicate if data is simulated
}

export interface SpotifyState {
  isConnected: boolean;
  currentTrack: SpotifyTrack | null;
  features: AudioFeatures | null;
  progress_ms: number;
  isPlaying: boolean;
  visualConfig?: VisualConfig; // Added strictly for the scene
}
