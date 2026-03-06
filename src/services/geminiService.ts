import { GoogleGenAI, Modality, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface SafetyAdvice {
  advice: string;
  places?: {
    name: string;
    address: string;
    uri: string;
  }[];
}

export const getSafetyAdvice = async (prompt: string, location?: { lat: number; lng: number }): Promise<SafetyAdvice> => {
  // For location-based queries, use gemini-2.5-flash with googleMaps
  if (location && (prompt.toLowerCase().includes('near') || prompt.toLowerCase().includes('where') || prompt.toLowerCase().includes('place'))) {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: location.lat,
              longitude: location.lng
            }
          }
        }
      },
    });

    const places: any[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.maps) {
          places.push({
            name: chunk.maps.title,
            uri: chunk.maps.uri,
            address: '' // Address might not be directly in the chunk title
          });
        }
      });
    }

    return {
      advice: response.text || "I found some places nearby that might help.",
      places
    };
  }

  // For complex safety planning, use gemini-3.1-pro-preview with high thinking
  if (prompt.length > 100 || prompt.toLowerCase().includes('plan') || prompt.toLowerCase().includes('strategy')) {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    return { advice: response.text || "Here is a detailed safety plan." };
  }

  // For fast general advice, use gemini-3.1-flash-lite-preview
  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are a personal safety assistant. Provide concise, actionable safety advice for someone walking alone."
    }
  });

  return { advice: response.text || "Stay alert and keep to well-lit areas." };
};

export const getSafetySummary = async (location: { lat: number; lng: number } | null, isTracking: boolean, isSOSActive: boolean): Promise<string> => {
  const prompt = `Generate a very concise (max 15 words) safety status summary for a user. 
  Current Status: ${isSOSActive ? 'SOS ACTIVE - EMERGENCY' : isTracking ? 'Walking - Tracking Active' : 'Idle - Monitoring'}.
  Location: ${location ? `${location.lat}, ${location.lng}` : 'Unknown'}.
  Tone: Professional, reassuring, but urgent if SOS is active.`;

  const response = await ai.models.generateContent({
    model: "gemini-3.1-flash-lite-preview",
    contents: prompt,
    config: {
      systemInstruction: "You are a safety monitor. Summarize the user's current safety state in one short, powerful sentence."
    }
  });

  return response.text || "System active. Stay alert.";
};
