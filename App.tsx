
import React, { useState, useEffect, useRef } from 'react';
import { editImageWithPrompt, removeBackground, QualityLevel, AspectRatio } from './services/geminiService';
import { Spinner } from './components/Spinner';
import { 
  UploadIcon, SparklesIcon, AlertTriangleIcon, DownloadIcon, 
  KeyIcon, HistoryIcon, TrashIcon, ClockIcon, RefreshIcon,
  TypeIcon, PhotoIcon, AlignLeftIcon, AlignCenterIcon, AlignRightIcon,
  ChevronUpIcon, ChevronDownIcon, DoubleChevronUpIcon, DoubleChevronDownIcon
} from './components/Icons';

type TextAlignment = 'left' | 'center' | 'right';
type ObjectFit = 'cover' | 'contain' | 'fill';

interface Overlay {
  id: string;
  type: 'text' | 'image';
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  scale: number;
  rotation: number;
  opacity: number;
  flipX: boolean;
  flipY: boolean;
  isProcessing?: boolean;
  // Text specific
  text?: string;
  fontSize?: number;
  color?: string;
  isBold?: boolean;
  isItalic?: boolean;
  fontFamily?: string;
  alignment?: TextAlignment;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  // Image specific
  imageSrc?: string;
  width?: number; // % of canvas width
  height?: number; // % of canvas height
  lockRatio?: boolean;
  objectFit?: ObjectFit;
  originalAspectRatio?: number;
}

interface HistoryItem {
  id: string;
  resultUrl: string;
  originalUrl: string;
  originalMimeType: string;
  prompt: string;
  quality: QualityLevel;
  aspectRatio: AspectRatio;
  timestamp: number;
}

const FONTS = [
    { name: 'Modern Sans', value: 'Inter, sans-serif' },
    { name: 'Elegant Serif', value: "'Playfair Display', serif" },
    { name: 'Bold Impact', value: 'Oswald, sans-serif' },
    { name: 'Classy Sans', value: 'Montserrat, sans-serif' },
    { name: 'Typewriter', value: "'Courier Prime', monospace" },
    { name: 'Industrial', value: "'Bebas Neue', sans-serif" },
    { name: 'Playful Script', value: 'Pacifico, cursive' },
];

const QUICK_COLORS = ['#ffffff', '#000000', '#ffeb3b', '#f44336', '#4caf50', '#2196f3', '#9c27b0'];

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

const hexToRgba = (hex: string, opacity: number) => {
  let r = 0, g = 0, b = 0;
  if (!hex || hex === 'transparent') return 'rgba(0,0,0,0)';
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0] + cleanHex[0], 16);
    g = parseInt(cleanHex[1] + cleanHex[1], 16);
    b = parseInt(cleanHex[2] + cleanHex[2], 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16);
    g = parseInt(cleanHex.substring(2, 4), 16);
    b = parseInt(cleanHex.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

// Removed custom global declaration for 'aistudio' to fix type conflict with environment's AIStudio definition.
// We'll rely on the existing global type or cast to 'any' for safe access.

const App: React.FC = () => {
  const [originalImage, setOriginalImage] = useState<{ dataUrl: string; mimeType: string } | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [prompt, setPrompt] = useState<string>(
    'Replace the background of the image without altering the product or its packaging. Place the product centered on a wooden countertop or table, as if it is resting naturally on it. The new background should be a softly blurred warehouse or stockroom environment, with warm, realistic lighting and depth of field. Do not modify, crop, or distort the product or its packaging — keep colors, proportions, and textures exactly as in the original image. Ensure the product and packaging are sharp and in focus, while the background remains softly blurred. Maintain a professional, clean, and realistic photographic look suitable for e-commerce product display.'
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [quality, setQuality] = useState<QualityLevel>('low');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  
  const masterContainerRef = useRef<HTMLDivElement>(null);
  const dragInfoRef = useRef<{ id: string, startX: number, startY: number, startOverlayX: number, startOverlayY: number } | null>(null);

  useEffect(() => {
    const checkKeyStatus = async () => {
      // Using 'any' cast to avoid TypeScript errors with environment-provided 'aistudio' property.
      const aiStudio = (window as any).aistudio;
      if (aiStudio?.hasSelectedApiKey) {
        const result = await aiStudio.hasSelectedApiKey();
        setHasKey(result);
      }
    };
    checkKeyStatus();
  }, []);

  const handleLinkKey = async () => {
    // Using 'any' cast to safely access the pre-configured 'aistudio' object.
    const aiStudio = (window as any).aistudio;
    if (aiStudio?.openSelectKey) {
      await aiStudio.openSelectKey();
      // Per instructions: assume key selection success to avoid race condition.
      setHasKey(true);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const data = await fileToBase64(file);
        setOriginalImage(data);
        setEditedImage(null);
        setError(null);
        setOverlays([]);
        setSelectedOverlayId(null);
      } catch (err) {
        setError("Error loading file.");
      }
    }
  };

  const updateOverlay = (id: string, updates: Partial<Overlay>) => {
    setOverlays(prev => prev.map(o => {
      if (o.id !== id) return o;
      const newOverlay = { ...o, ...updates };
      if (o.type === 'image' && newOverlay.lockRatio && o.originalAspectRatio) {
        if (updates.width !== undefined && updates.height === undefined) {
           newOverlay.height = updates.width / o.originalAspectRatio;
        } else if (updates.height !== undefined && updates.width === undefined) {
           newOverlay.width = updates.height * o.originalAspectRatio;
        }
      }
      return newOverlay;
    }));
  };

  const handleRemoveStickerBackground = async (overlayId: string) => {
    const overlay = overlays.find(o => o.id === overlayId);
    if (!overlay || overlay.type !== 'image' || !overlay.imageSrc) return;

    updateOverlay(overlayId, { isProcessing: true });
    
    try {
      const base64Data = overlay.imageSrc.split(',')[1];
      const mimeType = overlay.imageSrc.substring(overlay.imageSrc.indexOf(':') + 1, overlay.imageSrc.indexOf(';'));
      
      const resultBase64 = await removeBackground(base64Data, mimeType);
      updateOverlay(overlayId, { 
        imageSrc: `data:image/png;base64,${resultBase64}`,
        isProcessing: false 
      });
    } catch (err) {
      console.error(err);
      setError("Failed to remove sticker background.");
      updateOverlay(overlayId, { isProcessing: false });
    }
  };

  const addTextOverlay = () => {
    const newOverlay: Overlay = {
      id: Date.now().toString(),
      type: 'text',
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      text: 'New Text',
      fontSize: 32,
      color: '#ffffff',
      isBold: true,
      fontFamily: FONTS[0].value,
      alignment: 'center',
      shadowColor: '#000000',
      shadowBlur: 8,
      shadowOpacity: 0.6
    };
    setOverlays([...overlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const { dataUrl } = await fileToBase64(file);
      const img = new Image();
      img.onload = () => {
        const ar = img.naturalWidth / img.naturalHeight;
        const newOverlay: Overlay = {
          id: Date.now().toString(),
          type: 'image',
          x: 50,
          y: 50,
          scale: 1,
          rotation: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
          imageSrc: dataUrl,
          width: 30,
          height: 30 / ar,
          lockRatio: true,
          objectFit: 'contain',
          originalAspectRatio: ar
        };
        setOverlays([...overlays, newOverlay]);
        setSelectedOverlayId(newOverlay.id);
      };
      img.src = dataUrl;
    }
  };

  const generateImage = async () => {
    if (!originalImage) return;
    if (quality !== 'low' && !hasKey) {
      setError("High quality models require a linked API key.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const base64Data = originalImage.dataUrl.split(',')[1];
      const resultBase64 = await editImageWithPrompt(base64Data, originalImage.mimeType, prompt, quality, aspectRatio);
      const resultUrl = `data:image/png;base64,${resultBase64}`;
      setEditedImage(resultUrl);
      const item: HistoryItem = { id: Date.now().toString(), resultUrl, originalUrl: originalImage.dataUrl, originalMimeType: originalImage.mimeType, prompt, quality, aspectRatio, timestamp: Date.now() };
      setHistory(prev => [item, ...prev]);
    } catch (err: any) {
      setError(err.message || "Failed to generate image.");
      if (err.message?.includes("Requested entity was not found")) setHasKey(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOverlayMouseDown = (e: React.MouseEvent, overlay: Overlay) => {
    e.stopPropagation();
    setSelectedOverlayId(overlay.id);
    setIsDragging(true);
    dragInfoRef.current = { id: overlay.id, startX: e.clientX, startY: e.clientY, startOverlayX: overlay.x, startOverlayY: overlay.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragInfoRef.current || !masterContainerRef.current) return;
      const rect = masterContainerRef.current.getBoundingClientRect();
      const dx = ((e.clientX - dragInfoRef.current.startX) / rect.width) * 100;
      const dy = ((e.clientY - dragInfoRef.current.startY) / rect.height) * 100;
      updateOverlay(dragInfoRef.current.id, { 
        x: Math.max(0, Math.min(100, dragInfoRef.current.startOverlayX + dx)), 
        y: Math.max(0, Math.min(100, dragInfoRef.current.startOverlayY + dy)) 
      });
    };
    const handleMouseUp = () => { setIsDragging(false); dragInfoRef.current = null; };
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const selectedOverlay = overlays.find(o => o.id === selectedOverlayId);
  const selectedOverlayIndex = overlays.findIndex(o => o.id === selectedOverlayId);

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-blue-400">Gemini Product Studio</h1>
            <p className="text-neutral-400 text-sm">Professional backgrounds & overlays, powered by Gemini.</p>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={handleLinkKey} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${hasKey ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/50' : 'bg-neutral-800 hover:bg-neutral-700 border border-neutral-700'}`}>
              <KeyIcon className="w-4 h-4" /> {hasKey ? 'API Key Linked' : 'Link API Key'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Controls Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700 shadow-xl space-y-6">
              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase text-neutral-500 tracking-widest">Source Image</label>
                <div className="border-2 border-dashed border-neutral-600 rounded-xl p-6 text-center hover:border-blue-500 transition-all cursor-pointer group bg-neutral-900/50" onClick={() => document.getElementById('imageInput')?.click()}>
                  <input id="imageInput" type="file" className="hidden" accept="image/*" onChange={onFileChange} />
                  <UploadIcon className="w-10 h-10 mx-auto mb-3 text-neutral-500 group-hover:text-blue-400" />
                  <p className="text-sm text-neutral-400">{originalImage ? 'Change Image' : 'Upload Product'}</p>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-bold uppercase text-neutral-500 tracking-widest">Scene Prompt</label>
                <textarea className="w-full bg-neutral-900 border border-neutral-700 rounded-xl p-4 text-sm focus:ring-2 focus:ring-blue-500 outline-none min-h-[100px] resize-none" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <select value={quality} onChange={(e) => setQuality(e.target.value as QualityLevel)} className="bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-xs">
                  <option value="low">Standard</option>
                  <option value="medium">Pro 1K</option>
                  <option value="high">Pro 2K</option>
                </select>
                <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)} className="bg-neutral-900 border border-neutral-700 rounded-lg p-2 text-xs">
                  <option value="1:1">1:1 Square</option>
                  <option value="16:9">16:9 Landscape</option>
                  <option value="9:16">9:16 Portrait</option>
                </select>
              </div>

              <button onClick={generateImage} disabled={isLoading || !originalImage} className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-3">
                {isLoading ? <Spinner className="w-5 h-5 !mr-0" /> : <><SparklesIcon className="w-5 h-5" /> Generate</>}
              </button>

              {editedImage && (
                <div className="border-t border-neutral-700 pt-6 space-y-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Design Overlays</h4>
                  <div className="flex gap-2">
                    <button onClick={addTextOverlay} className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-[10px] font-bold">
                      <TypeIcon className="w-4 h-4" /> Text
                    </button>
                    <button onClick={() => document.getElementById('stickerInput')?.click()} className="flex-1 flex items-center justify-center gap-2 py-2 px-3 bg-neutral-700 hover:bg-neutral-600 rounded-xl text-[10px] font-bold">
                      <input id="stickerInput" type="file" className="hidden" accept="image/*" onChange={handleStickerUpload} />
                      <PhotoIcon className="w-4 h-4" /> Sticker
                    </button>
                  </div>

                  {selectedOverlay && (
                    <div className="bg-neutral-900/50 p-4 rounded-xl border border-neutral-700 space-y-4 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-neutral-500 uppercase">Edit {selectedOverlay.type}</span>
                        <button onClick={() => setOverlays(prev => prev.filter(o => o.id !== selectedOverlay.id))} className="text-red-500 hover:text-red-400"><TrashIcon className="w-4 h-4" /></button>
                      </div>

                      {selectedOverlay.type === 'image' && (
                        <button 
                          onClick={() => handleRemoveStickerBackground(selectedOverlay.id)}
                          disabled={selectedOverlay.isProcessing}
                          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600/20 text-blue-400 border border-blue-600/50 hover:bg-blue-600/30 rounded-lg text-[10px] font-bold disabled:opacity-50"
                        >
                          {selectedOverlay.isProcessing ? <Spinner className="w-3 h-3 !mr-0" /> : <SparklesIcon className="w-3 h-3" />}
                          Remove Sticker Background
                        </button>
                      )}

                      <div className="space-y-3">
                        {selectedOverlay.type === 'text' && (
                          <textarea className="w-full bg-neutral-800 border border-neutral-700 rounded-lg p-2 text-xs resize-none" value={selectedOverlay.text} onChange={e => updateOverlay(selectedOverlay.id, { text: e.target.value })} />
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-500 w-10">Scale</span>
                          <input type="range" min="0.1" max="5" step="0.1" value={selectedOverlay.scale} onChange={e => updateOverlay(selectedOverlay.id, { scale: parseFloat(e.target.value) })} className="flex-1 accent-blue-500" />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-neutral-500 w-10">Rotate</span>
                          <input type="range" min="0" max="360" value={selectedOverlay.rotation} onChange={e => updateOverlay(selectedOverlay.id, { rotation: parseInt(e.target.value) })} className="flex-1 accent-blue-500" />
                        </div>
                        <div className="grid grid-cols-4 gap-2 border-t border-neutral-700 pt-3">
                           <button onClick={() => {
                             const idx = selectedOverlayIndex;
                             if (idx < overlays.length - 1) {
                               const arr = [...overlays];
                               [arr[idx], arr[idx+1]] = [arr[idx+1], arr[idx]];
                               setOverlays(arr);
                             }
                           }} className="p-2 bg-neutral-800 rounded-lg flex justify-center hover:bg-neutral-700"><ChevronUpIcon className="w-4 h-4" /></button>
                           <button onClick={() => {
                             const idx = selectedOverlayIndex;
                             if (idx > 0) {
                               const arr = [...overlays];
                               [arr[idx], arr[idx-1]] = [arr[idx-1], arr[idx]];
                               setOverlays(arr);
                             }
                           }} className="p-2 bg-neutral-800 rounded-lg flex justify-center hover:bg-neutral-700"><ChevronDownIcon className="w-4 h-4" /></button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="flex gap-2 p-3 bg-red-900/20 border border-red-500/30 rounded-lg text-red-400 text-[11px]">
                  <AlertTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}
            </div>
          </div>

          {/* Workspace */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-neutral-800 rounded-2xl border border-neutral-700 shadow-2xl relative overflow-hidden flex flex-col items-center justify-center min-h-[600px] p-6 group">
              {!originalImage ? (
                <div className="text-center space-y-4 max-w-sm">
                  <div className="w-20 h-20 bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
                    <PhotoIcon className="w-10 h-10 text-neutral-500" />
                  </div>
                  <h3 className="text-lg font-medium">Ready for your shoot?</h3>
                </div>
              ) : (
                <div ref={masterContainerRef} className={`relative w-full h-full flex items-center justify-center ${isDragging ? 'cursor-grabbing' : 'cursor-default'}`} onMouseDown={() => setSelectedOverlayId(null)}>
                   <div className="relative shadow-2xl rounded-xl overflow-hidden border border-neutral-700 max-w-full">
                      <img src={editedImage || originalImage.dataUrl} alt="Preview" className="object-contain max-h-[700px] pointer-events-none" />
                      
                      {overlays.map(overlay => (
                        <div 
                          key={overlay.id} 
                          onMouseDown={e => handleOverlayMouseDown(e, overlay)}
                          className={`absolute select-none ${selectedOverlayId === overlay.id ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-900 z-50' : 'hover:ring-1 hover:ring-blue-500/50 z-10'}`}
                          style={{ 
                            left: `${overlay.x}%`, 
                            top: `${overlay.y}%`, 
                            transform: `translate(-50%, -50%) rotate(${overlay.rotation}deg) scale(${overlay.scale}) scaleX(${overlay.flipX ? -1 : 1}) scaleY(${overlay.flipY ? -1 : 1})`,
                            opacity: overlay.opacity
                          }}
                        >
                          {overlay.type === 'text' ? (
                            <div style={{ fontSize: `${overlay.fontSize}px`, color: overlay.color, fontWeight: overlay.isBold ? 'bold' : 'normal', fontFamily: overlay.fontFamily, textAlign: overlay.alignment, whiteSpace: 'nowrap' }}>{overlay.text}</div>
                          ) : (
                            <div className="relative group/sticker">
                              {overlay.isProcessing && <div className="absolute inset-0 bg-neutral-900/60 backdrop-blur-sm flex items-center justify-center rounded-lg"><Spinner className="w-6 h-6 !mr-0" /></div>}
                              <img src={overlay.imageSrc} alt="sticker" style={{ width: `${overlay.width}vw`, maxWidth: 'none' }} className="block pointer-events-none drop-shadow-xl" />
                            </div>
                          )}
                        </div>
                      ))}

                      {isLoading && <div className="absolute inset-0 bg-neutral-900/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-8"><Spinner className="w-14 h-14 text-blue-400 !mr-0" /><h4 className="text-xl font-bold">Rendering Scene...</h4></div>}
                   </div>
                </div>
              )}
            </div>
            
            {history.length > 0 && (
              <div className="flex gap-4 overflow-x-auto pb-4 px-2">
                {history.map(item => (
                  <div key={item.id} className="flex-shrink-0 w-24 h-24 bg-neutral-800 rounded-lg border border-neutral-700 overflow-hidden cursor-pointer hover:border-blue-500" onClick={() => {setEditedImage(item.resultUrl); setOverlays([]);}}>
                    <img src={item.resultUrl} className="w-full h-full object-cover" alt="history" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
