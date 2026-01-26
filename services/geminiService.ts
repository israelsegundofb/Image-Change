
import { GoogleGenAI } from "@google/genai";

export type QualityLevel = 'low' | 'medium' | 'high';
export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export async function editImageWithPrompt(
  base64ImageData: string, 
  mimeType: string, 
  textPrompt: string, 
  quality: QualityLevel = 'low',
  aspectRatio: AspectRatio = '1:1'
): Promise<string> {
  try {
    // Re-initialize to ensure it picks up the latest key from process.env.API_KEY
    // which is updated if the user selects a key via the AI Studio dialog
    const API_KEY = process.env.API_KEY;
    if (!API_KEY) {
      throw new Error("No API key available.");
    }
    const ai = new GoogleGenAI({ apiKey: API_KEY });

    let modelName = 'gemini-2.5-flash-image';
    let imageSize: '1K' | '2K' | '4K' | undefined = undefined;

    if (quality === 'medium') {
      modelName = 'gemini-3-pro-image-preview';
      imageSize = '1K';
    } else if (quality === 'high') {
      modelName = 'gemini-3-pro-image-preview';
      imageSize = '2K';
    }

    const config: any = {};
    if (modelName === 'gemini-3-pro-image-preview') {
      config.imageConfig = {
        aspectRatio: aspectRatio,
        imageSize: imageSize
      };
    }

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          {
            inlineData: {
              data: base64ImageData,
              mimeType: mimeType,
            },
          },
          {
            text: textPrompt,
          },
        ],
      },
      config: config,
    });

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
       throw new Error('Malformed response from Gemini API.');
    }

    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }

    throw new Error('No image was returned in the response parts.');
  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("An unexpected error occurred while communicating with the Gemini API.");
  }
}
