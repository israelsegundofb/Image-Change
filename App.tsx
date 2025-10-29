
import React, { useState, useEffect, useCallback } from 'react';
import { editImageWithPrompt } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { UploadIcon, SparklesIcon, AlertTriangleIcon, DownloadIcon, CropIcon } from './components/Icons';

// Helper to convert file to base64
const fileToBase64 = (file: File): Promise<{ dataUrl: string; mimeType: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const mimeType = result.substring(result.indexOf(':') + 1, result.indexOf(';'));
      resolve({ dataUrl: result, mimeType });
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

const urlToDataUrl = async (url: string): Promise<{ dataUrl: string; mimeType: string }> => {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}`);
    }
    const blob = await response.blob();
    const file = new File([blob], "initial-image.jpeg", { type: blob.type });
    return fileToBase64(file);
}

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<string>(
    'Replace the background of the image without altering the product or its packaging. Place the product centered on a wooden countertop or table, as if it is resting naturally on it. The new background should be a softly blurred warehouse or stockroom environment, with warm, realistic lighting and depth of field. Do not modify, crop, or distort the product or its packaging — keep colors, proportions, and textures exactly as in the original image. Ensure the product and packaging are sharp and in focus, while the background remains softly blurred. Maintain a professional, clean, and realistic photographic look suitable for e-commerce product display.'
  );
  const [aspectRatio, setAspectRatio] = useState<string>('original');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const initialImageUrl = 'https://i.imgur.com/gK6nJ4P.jpeg';
  
  const aspectOptions = [
    { key: 'original', label: 'Original' },
    { key: '1:1', label: '1:1 (Square)' },
    { key: '9:16', label: '9:16 (Story)' },
    { key: '4:5', label: '4:5 (Portrait)' },
  ];

  const loadInitialImage = useCallback(async () => {
    try {
        setError(null);
        setIsLoading(true);
        const imageData = await urlToDataUrl(initialImageUrl);
        setOriginalImage(imageData);
    } catch (e) {
        console.error("Failed to load initial image:", e);
        setError("Could not load the initial example image. Please try uploading your own.");
    } finally {
        setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInitialImage();
  }, [loadInitialImage]);


  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        setIsLoading(true);
        setError(null);
        setEditedImage(null);
        const { dataUrl, mimeType } = await fileToBase64(file);
        setOriginalImage({ dataUrl, mimeType });
      } catch (e) {
        setError('Failed to read the image file.');
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGenerate = async () => {
    if (!originalImage || !prompt) {
      setError('Please upload an image and provide a prompt.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setEditedImage(null);

    let finalPrompt = prompt;
    if (aspectRatio !== 'original') {
      finalPrompt = `${prompt.trim()} Please ensure the final image composition is suitable for a ${aspectRatio} aspect ratio.`;
    }

    try {
      const base64Data = originalImage.dataUrl.split(',')[1];
      const newImageBase64 = await editImageWithPrompt(base64Data, originalImage.mimeType, finalPrompt);
      setEditedImage(`data:image/png;base64,${newImageBase64}`);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      setError(`Generation failed: ${errorMessage}`);
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
      <main className="container mx-auto p-4 sm:p-6 lg:p-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
            AI Image Background Replacer
          </h1>
          <p className="mt-2 text-lg text-gray-400 max-w-2xl mx-auto">
            Upload a product image, describe a new background, and let Gemini create a professional, e-commerce-ready photo.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls Column */}
          <div className="lg:col-span-4 bg-gray-800/50 p-6 rounded-2xl border border-gray-700 shadow-lg flex flex-col gap-6 h-fit sticky top-8">
            <div>
              <label htmlFor="image-upload" className="block text-sm font-medium text-gray-300 mb-2">1. Upload Image</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md hover:border-purple-500 transition-colors">
                <div className="space-y-1 text-center">
                  <UploadIcon className="mx-auto h-12 w-12 text-gray-500"/>
                  <div className="flex text-sm text-gray-400">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-purple-400 hover:text-purple-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-purple-500 px-1">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleImageUpload} accept="image/png, image/jpeg, image/webp" />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, WEBP up to 10MB</p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">2. Describe New Background</label>
              <textarea
                id="prompt"
                rows={8}
                className="block w-full bg-gray-900/70 border-gray-600 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm placeholder-gray-500"
                placeholder="e.g., A clean marble countertop with a soft, out-of-focus kitchen in the background..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">3. Select Aspect Ratio</label>
                <div className="grid grid-cols-2 sm:grid-cols-2 gap-2">
                    {aspectOptions.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setAspectRatio(key)}
                        className={`px-3 py-2 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 ${
                        aspectRatio === key
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                    >
                        {label}
                    </button>
                    ))}
                </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isLoading || !originalImage || !prompt}
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? (
                <>
                  <Spinner className="w-5 h-5" /> Generating...
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" /> Generate Image
                </>
              )}
            </button>
             {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-md flex items-center gap-3">
                <AlertTriangleIcon className="w-5 h-5" />
                <span className="text-sm">{error}</span>
              </div>
            )}
          </div>

          {/* Image Display Column */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <h2 className="text-xl font-bold text-center text-gray-400">Original Image</h2>
              <div className="aspect-w-1 aspect-h-1 w-full bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden flex items-center justify-center p-2">
                {originalImage ? (
                  <img src={originalImage.dataUrl} alt="Original" className="object-contain max-h-full max-w-full rounded-lg" />
                ) : (
                  <div className="text-gray-500">
                    {isLoading ? <Spinner className="w-10 h-10" /> : 'Upload an image to start'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
               <div className="flex items-center justify-center relative">
                 <h2 className="text-xl font-bold text-center text-gray-400">Edited Image</h2>
                 {editedImage && (
                    <a
                        href={editedImage}
                        download="edited-image.png"
                        className="absolute right-0 inline-flex items-center justify-center p-2 rounded-full bg-gray-700 hover:bg-purple-600 text-gray-300 hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500"
                        aria-label="Download edited image"
                        title="Download image"
                    >
                        <DownloadIcon className="w-5 h-5" />
                    </a>
                 )}
               </div>
              <div className="aspect-w-1 aspect-h-1 w-full bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden flex items-center justify-center p-2">
                {isLoading && !editedImage ? (
                  <div className="flex flex-col items-center gap-4 text-gray-500">
                    <Spinner className="w-10 h-10" />
                    <span>Generating new background...</span>
                  </div>
                ) : editedImage ? (
                  <img src={editedImage} alt="Edited" className="object-contain max-h-full max-w-full rounded-lg" />
                ) : (
                  <div className="text-gray-500 text-center p-4">
                    Your generated image will appear here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
