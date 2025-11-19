import { SpotifyTrack, AudioFeatures } from "../types";

const SCOPES_LIST = [
  "user-read-private",
  "user-read-email",
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "playlist-modify-public",
  "playlist-modify-private"
];

export const getAuthUrl = (clientId: string, redirectUri: string) => {
  // Using URLSearchParams ensures all parameters are correctly encoded for the URL.
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    // We join with a space here, and then replace + with %20 later because
    // Spotify's strict OAuth parser sometimes rejects '+' for spaces.
    scope: SCOPES_LIST.join(" "), 
    show_dialog: 'true'
  });

  // Explicitly replace '+' with '%20' in the query string for the scope parameter.
  // This is a known fix for 'unsupported_response_type' on Spotify.
  const queryString = params.toString().replace(/\+/g, '%20');

  return `https://accounts.spotify.com/authorize?${queryString}`;
};

export const getTokenFromUrl = (): { token: string | null, error: string | null } => {
  const hash = window.location.hash;
  if (!hash) return { token: null, error: null };
  
  // Remove the '#' character
  const params = new URLSearchParams(hash.substring(1));
  
  const error = params.get("error");
  const token = params.get("access_token");

  return { token, error };
};

// Updated to return more details including progress and playing status
export const fetchCurrentTrack = async (token: string): Promise<{ track: SpotifyTrack | null, progress_ms: number, is_playing: boolean }> => {
  try {
    const res = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.status === 204 || res.status > 299) {
      return { track: null, progress_ms: 0, is_playing: false };
    }

    const data = await res.json();
    
    if (!data.item) {
      return { track: null, progress_ms: 0, is_playing: false };
    }

    const track = data.item as SpotifyTrack;
    
    return { 
      track, 
      progress_ms: data.progress_ms || 0,
      is_playing: data.is_playing 
    };
  } catch (e) {
    console.error("Error fetching track", e);
    return { track: null, progress_ms: 0, is_playing: false };
  }
};

export const fetchAudioFeatures = async (token: string, trackId: string): Promise<AudioFeatures | null> => {
  try {
    const res = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    return await res.json() as AudioFeatures;
  } catch (e) {
    console.error("Error fetching features", e);
    return null;
  }
};

// --- Controls ---

export const playTrack = async (token: string) => {
  await fetch("https://api.spotify.com/v1/me/player/play", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const pauseTrack = async (token: string) => {
  await fetch("https://api.spotify.com/v1/me/player/pause", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const nextTrack = async (token: string) => {
  await fetch("https://api.spotify.com/v1/me/player/next", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const previousTrack = async (token: string) => {
  await fetch("https://api.spotify.com/v1/me/player/previous", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });
};

// --- Playlist Management Functions ---

export const getUserProfile = async (token: string) => {
  const res = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` }
  });
  return await res.json();
};

export const searchTrack = async (token: string, query: string): Promise<string | null> => {
  try {
    const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.tracks?.items[0]?.uri || null;
  } catch (e) {
    console.error("Search failed for:", query, e);
    return null;
  }
};

export const createPlaylist = async (token: string, userId: string, name: string, description: string) => {
  const res = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      name, 
      description, 
      public: false // defaulting to private for safety
    })
  });
  return await res.json();
};

export const addTracksToPlaylist = async (token: string, playlistId: string, uris: string[]) => {
  await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ uris })
  });
};
