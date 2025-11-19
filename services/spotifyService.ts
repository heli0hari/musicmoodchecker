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

// --- PKCE Helper Functions ---

const generateRandomString = (length: number) => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
};

const sha256 = async (plain: string) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
};

const base64encode = (input: ArrayBuffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

// --- Auth Flow Functions ---

export const redirectToSpotifyAuth = async (clientId: string, redirectUri: string) => {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  // Store verifier locally for the callback step
  window.localStorage.setItem('spotify_code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code', // Using Authorization Code Flow
    client_id: clientId,
    scope: SCOPES_LIST.join(" "),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: redirectUri,
  });

  document.location = `https://accounts.spotify.com/authorize?${params.toString()}`;
};

export const getAccessToken = async (clientId: string, code: string, redirectUri: string): Promise<string | null> => {
  const codeVerifier = window.localStorage.getItem('spotify_code_verifier');

  if (!codeVerifier) {
    console.error("No code verifier found");
    return null;
  }

  const params = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params
    });

    const data = await response.json();
    
    if (data.access_token) {
      // Clear verifier after success
      window.localStorage.removeItem('spotify_code_verifier');
      return data.access_token;
    } else {
      console.error("Token exchange failed:", data);
      return null;
    }
  } catch (e) {
    console.error("Error fetching access token:", e);
    return null;
  }
};

// --- Data Fetching Functions ---

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