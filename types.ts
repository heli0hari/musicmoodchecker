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
}

export interface SpotifyState {
  isConnected: boolean;
  currentTrack: SpotifyTrack | null;
  features: AudioFeatures | null;
  progress_ms: number;
  isPlaying: boolean;
}