
import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { MoodState, PlaylistResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
    const response = await ai.models.generateContent({
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
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");

    // Cleanup potentially lingering markdown ticks which some models might still output
    text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    
    return JSON.parse(text) as PlaylistResponse;

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      moodDescription: "Unable to analyze mood at the moment. Please try again.",
      songs: []
    };
  }
};
