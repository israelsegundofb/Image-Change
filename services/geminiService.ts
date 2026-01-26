
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
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) {
    throw new Error("Missing API Key. Check your environment configuration.");
  }

  try {
    // Model selection based on user quality preference
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
    if (modelName.includes('gemini-3') || modelName.includes('gemini-2.5')) {
      config.imageConfig = {
        aspectRatio: aspectRatio,
        ...(imageSize ? { imageSize } : {})
      };
    }

    // Always create a new instance right before making an API call
    const ai = new GoogleGenAI({ apiKey: API_KEY });

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
    if (!candidate?.content?.parts) {
       throw new Error('API returned an empty result. Try a different prompt.');
    }

    // Iterate through all response parts to find the image part (standard for nano banana series)
    for (const part of candidate.content.parts) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }

    throw new Error('No image was found in the model response.');
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    
    const message = error?.message || "";
    if (message.includes('safety')) {
      throw new Error("Generation blocked by safety filters. Please try a more descriptive or professional prompt.");
    }
    if (message.includes('Requested entity was not found')) {
       throw new Error("Model or project access denied. Please ensure your project has billing enabled and you have selected a valid project API key.");
    }
    
    if (error instanceof Error) throw error;
    throw new Error("Generation failed due to a network or server communication error.");
  }
}

export async function removeBackground(
  base64ImageData: string, 
  mimeType: string
): Promise<string> {
  const API_KEY = process.env.API_KEY;
  if (!API_KEY) throw new Error("Missing API Key.");

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  // Use gemini-2.5-flash-image for efficient background removal tasks
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          inlineData: {
            data: base64ImageData,
            mimeType: mimeType,
          },
        },
        {
          text: "Remove the background of this image. Return ONLY the subject in a high-quality PNG format with complete transparency in place of the background.",
        },
      ],
    },
  });

  const candidate = response.candidates?.[0];
  if (!candidate?.content?.parts) throw new Error('Failed to process background removal.');

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      return part.inlineData.data;
    }
  }

  throw new Error('No transparency-enabled image data was returned.');
}
