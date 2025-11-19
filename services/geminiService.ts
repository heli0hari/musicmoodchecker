import { GoogleGenAI, Type } from "@google/genai";
import { MoodState, PlaylistResponse } from "../types";

// Lazy initialization to prevent crash on load if API Key is missing locally
let ai: GoogleGenAI | null = null;

const getAIClient = () => {
  if (!ai) {
    // Fallback to empty string to allow app to load; API calls will fail gracefully later if key is invalid
    const apiKey = process.env.API_KEY || "";
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

export const generatePlaylist = async (mood: MoodState, userContext?: string): Promise<PlaylistResponse> => {
  const modelId = "gemini-2.5-flash";
  
  const prompt = `
    Generate a music playlist suggestion (10 songs) based on the following mood parameters (0.0 to 1.0 scale):
    Energy: ${mood.energy}
    Mood Tone (Valence/Positivity): ${mood.valence}
    Lift (Euphoria): ${mood.euphoria}
    Focus Level (Cognition): ${mood.cognition}

    ${userContext ? `Additional User Context/Genre Preference: "${userContext}"` : ''}

    Provide a 1-sentence description of this specific mood blend.
  `;

  try {
    const client = getAIClient();
    const response = await client.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            moodDescription: { type: Type.STRING },
            songs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  artist: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as PlaylistResponse;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      moodDescription: "Unable to connect to AI. Please check your API KEY in the configuration.",
      songs: []
    };
  }
};