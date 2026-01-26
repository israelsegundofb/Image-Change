
import React, { useState, useEffect, useCallback } from 'react';
import { editImageWithPrompt, QualityLevel } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { UploadIcon, SparklesIcon, AlertTriangleIcon, DownloadIcon, KeyIcon } from './components/Icons';

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
  const [aspectRatio, setAspectRatio] = useState<string>('1:1');
  const [quality, setQuality] = useState<QualityLevel>('low');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);

  const initialImageUrl = 'https://i.imgur.com/gK6nJ4P.jpeg';
  
  const aspectOptions = [
    { key: '1:1', label: '1:1' },
    { key: '3:4', label: '3:4' },
    { key: '4:3', label: '4:3' },
    { key: '9:16', label: '9:16' },
    { key: '16:9', label: '16:9' },
  ];

  const qualityOptions = [
    { key: 'low', label: 'Low', desc: 'Standard (Fastest)' },
    { key: 'medium', label: 'Medium', desc: 'High Definition (1K)' },
    { key: 'high', label: 'High', desc: 'Ultra HD (2K)' },
  ] as const;

  const checkApiKeyStatus = useCallback(async () => {
    if (typeof window.aistudio?.hasSelectedApiKey === 'function') {
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    }
  }, []);

  const handleOpenKeySelector = async () => {
    if (typeof window.aistudio?.openSelectKey === 'function') {
      await window.aistudio.openSelectKey();
      setHasKey(true); // Assume success per instructions
    }
  };

  const loadInitialImage = useCallback(async () => {
    try {
        setError(null);
        setIsLoading(true);
        const imageData = await urlToDataUrl(initialImageUrl);
        setOriginalImage(imageData);
        await checkApiKeyStatus();
    } catch (e) {
        console.error("Failed to load initial image:", e);
        setError("Could not load the initial example image. Please try uploading your own.");
    } finally {
        setIsLoading(false);
    }
  }, [checkApiKeyStatus]);

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

    // Pro models require key selection
    if ((quality === 'medium' || quality === 'high') && !hasKey) {
      setError('Medium and High quality modes require a paid API key. Please click the key icon to select one.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setEditedImage(null);

    try {
      const base64Data = originalImage.dataUrl.split(',')[1];
      const newImageBase64 = await editImageWithPrompt(
        base64Data, 
        originalImage.mimeType, 
        prompt, 
        quality, 
        aspectRatio as any
      );
      setEditedImage(`data:image/png;base64,${newImageBase64}`);
    } catch (e: any) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      if (errorMessage.includes("Requested entity was not found")) {
        setHasKey(false);
        setError("API Key session expired or project not found. Please re-select your key.");
      } else {
        setError(`Generation failed: ${errorMessage}`);
      }
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
            <div className="flex justify-between items-center">
               <label className="block text-sm font-medium text-gray-300">Configuration</label>
               <button 
                  onClick={handleOpenKeySelector}
                  className={`p-1.5 rounded-full transition-colors ${hasKey ? 'text-green-400 hover:bg-green-400/10' : 'text-gray-400 hover:bg-gray-400/10'}`}
                  title={hasKey ? "API Key Selected" : "Select Paid API Key (Required for Medium/High Quality)"}
               >
                 <KeyIcon className="w-5 h-5" />
               </button>
            </div>

            <div>
              <label htmlFor="image-upload" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">1. Upload Image</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md hover:border-purple-500 transition-colors bg-gray-900/40">
                <div className="space-y-1 text-center">
                  <UploadIcon className="mx-auto h-10 w-10 text-gray-500"/>
                  <div className="flex text-sm text-gray-400">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-800 rounded-md font-medium text-purple-400 hover:text-purple-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-900 focus-within:ring-purple-500 px-1">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleImageUpload} accept="image/png, image/jpeg, image/webp" />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="prompt" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">2. Prompt</label>
              <textarea
                id="prompt"
                rows={5}
                className="block w-full bg-gray-900/70 border-gray-700 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 sm:text-sm placeholder-gray-600"
                placeholder="e.g., A clean marble countertop..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">3. Quality Level</label>
                <div className="grid grid-cols-1 gap-2">
                    {qualityOptions.map(({ key, label, desc }) => (
                    <button
                        key={key}
                        onClick={() => setQuality(key)}
                        className={`px-4 py-2 text-left rounded-md transition-all border ${
                        quality === key
                            ? 'bg-purple-600/20 border-purple-500 text-white shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                            : 'bg-gray-700/50 border-transparent hover:bg-gray-700 text-gray-400'
                        }`}
                    >
                        <div className="font-bold text-sm">{label}</div>
                        <div className="text-[10px] opacity-70">{desc}</div>
                    </button>
                    ))}
                </div>
                {(quality === 'medium' || quality === 'high') && !hasKey && (
                  <p className="mt-2 text-[10px] text-yellow-500/80">
                    * Pro models require a <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener" className="underline">paid project key</a>.
                  </p>
                )}
            </div>

            <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">4. Aspect Ratio</label>
                <div className="grid grid-cols-5 gap-1">
                    {aspectOptions.map(({ key, label }) => (
                    <button
                        key={key}
                        onClick={() => setAspectRatio(key)}
                        className={`py-1.5 text-[10px] font-bold rounded transition-colors focus:outline-none ${
                        aspectRatio === key
                            ? 'bg-purple-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-400'
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
              className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-purple-500 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              {isLoading ? (
                <>
                  <Spinner className="w-5 h-5 !mr-0" /> <span className="ml-2">Processing...</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="w-5 h-5" /> Generate Image
                </>
              )}
            </button>
             {error && (
              <div className="bg-red-900/30 border border-red-800 text-red-400 px-4 py-3 rounded-lg flex items-start gap-3 mt-2">
                <AlertTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <span className="text-[12px] leading-tight">{error}</span>
              </div>
            )}
          </div>

          {/* Image Display Column */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-4">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-600"></div> Original
              </h2>
              <div className="aspect-square w-full bg-gray-950/50 rounded-3xl border border-gray-800 overflow-hidden flex items-center justify-center p-4 relative shadow-inner">
                {originalImage ? (
                  <img src={originalImage.dataUrl} alt="Original" className="object-contain max-h-full max-w-full rounded-xl" />
                ) : (
                  <div className="text-gray-700 italic text-sm">
                    {isLoading ? <Spinner className="w-8 h-8 !mr-0" /> : 'No image uploaded'}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
               <div className="flex items-center justify-between">
                 <h2 className="text-sm font-bold uppercase tracking-widest text-purple-400 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></div> Result
                 </h2>
                 {editedImage && (
                    <a
                        href={editedImage}
                        download="ai-product-shot.png"
                        className="p-2 rounded-full bg-gray-800 hover:bg-purple-600 text-gray-400 hover:text-white transition-all shadow-lg"
                        aria-label="Download edited image"
                        title="Download image"
                    >
                        <DownloadIcon className="w-4 h-4" />
                    </a>
                 )}
               </div>
              <div className="aspect-square w-full bg-gray-950/50 rounded-3xl border border-purple-900/30 overflow-hidden flex items-center justify-center p-4 relative shadow-2xl">
                {isLoading && !editedImage ? (
                  <div className="flex flex-col items-center gap-4 text-gray-600">
                    <div className="relative">
                       <Spinner className="w-12 h-12 !mr-0 text-purple-500" />
                       <div className="absolute inset-0 flex items-center justify-center">
                          <SparklesIcon className="w-5 h-5 text-purple-400" />
                       </div>
                    </div>
                    <span className="text-[12px] font-medium tracking-wide">Refining pixels...</span>
                  </div>
                ) : editedImage ? (
                  <img src={editedImage} alt="Edited" className="object-contain max-h-full max-w-full rounded-xl animate-in fade-in zoom-in duration-700" />
                ) : (
                  <div className="text-gray-700 italic text-sm text-center p-8">
                    Describe your background and click generate to see the magic.
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
