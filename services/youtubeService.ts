import { YoutubeTrack } from "../types";

// Use ONLY the instances that were working for you
const WORKING_INVIDIOUS_INSTANCES = [
  "https://inv.nadeko.net",
  "https://yewtu.be", 
  "https://invidious.f5.si",
  "https://invidious.nerdvpn.de", 
  "https://inv.perditum.com"
];

// Simple fetch with timeout - no complex retry logic
async function simpleFetch(url: string, timeout = 5000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    const response = await fetch(url, {
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    return null;
  }
}

export const searchYoutube = async (query: string): Promise<YoutubeTrack[]> => {
  if (!query.trim()) return [];
  
  // Try each instance until one works
  for (const instance of WORKING_INVIDIOUS_INSTANCES) {
    try {
      console.log(`Searching with ${instance} for: ${query}`);
      const response = await simpleFetch(`${instance}/api/v1/search?q=${encodeURIComponent(query)}&type=video`);
      
      if (response && response.ok) {
        const data = await response.json();
        
        if (Array.isArray(data)) {
          const results = data.slice(0, 5).map((item: any) => ({
            id: item.videoId,
            title: item.title || "Unknown Title",
            channelTitle: item.author || "Unknown Channel",
            thumbnailUrl: item.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`,
            duration_ms: (item.lengthSeconds || 240) * 1000
          }));
          
          console.log(`Search successful with ${instance}, found ${results.length} results`);
          return results;
        }
      }
    } catch (error) {
      console.warn(`Search failed with ${instance}:`, error);
      continue;
    }
  }
  
  console.log("All search instances failed");
  return [];
};

export const resolveYoutubeUrl = async (url: string): Promise<YoutubeTrack | null> => {
  let videoId: string | null = null;
  
  try {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?#]+)/,
      /youtube\.com\/embed\/([^&?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        videoId = match[1];
        break;
      }
    }

    if (!videoId) return null;

    // Try to get detailed info
    for (const instance of WORKING_INVIDIOUS_INSTANCES) {
      try {
        const response = await simpleFetch(`${instance}/api/v1/videos/${videoId}`);
        if (response && response.ok) {
          const data = await response.json();
          return {
            id: data.videoId,
            title: data.title || "Unknown Title",
            channelTitle: data.author || "Unknown Channel",
            thumbnailUrl: data.videoThumbnails?.find((t: any) => t.quality === "medium")?.url || 
                         data.videoThumbnails?.[0]?.url || 
                         `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            duration_ms: (data.lengthSeconds || 240) * 1000
          };
        }
      } catch (error) {
        continue;
      }
    }

    // Fallback basic info
    return {
      id: videoId,
      title: "YouTube Audio",
      channelTitle: "External Source",
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
      duration_ms: 240000
    };
    
  } catch (e) {
    return null;
  }
};

// SIMPLE PLAYBACK SOLUTION: Use YouTube embed with autoplay
export const getAudioStream = async (videoId: string): Promise<string | null> => {
  // Return a YouTube embed URL that will actually play audio
  // This is the most reliable approach for casual projects
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&modestbranding=1`;
};