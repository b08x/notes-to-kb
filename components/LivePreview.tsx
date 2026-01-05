
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
    ArrowDownTrayIcon, 
    PencilIcon, 
    CheckIcon, 
    PaintBrushIcon, 
    ArrowsPointingOutIcon, 
    ArrowsPointingInIcon, 
    SparklesIcon, 
    BoltIcon, 
    CheckCircleIcon,
    DocumentArrowDownIcon,
    DocumentIcon,
    EyeIcon
} from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';
import { DocxGenerator } from '../lib/services/DocxGenerator';
import { PdfGenerator } from '../lib/services/PdfGenerator';

interface LivePreviewProps {
  creation: Creation | null;
  isLoading: boolean;
  loadingMessage?: string;
  streamSize?: number;
  className?: string;
  imageMap?: Record<string, string>;
  onUpdateArtifact?: (id: string, html: string, isManualEdit: boolean) => void;
  isLive?: boolean;
}

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

const createAudioContext = () => {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
};

const playGeneratingSound = () => {
    try {
        const ctx = createAudioContext();
        const osc1 = ctx.createOscillator();
        osc1.frequency.value = 120;
        const gain1 = ctx.createGain();
        gain1.gain.value = 0.02;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.01;
        lfo.connect(lfoGain);
        lfoGain.connect(gain1.gain);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        lfo.start();
        return () => {
            const now = ctx.currentTime;
            gain1.gain.setTargetAtTime(0, now, 0.1);
            setTimeout(() => {
                osc1.stop();
                lfo.stop();
                ctx.close();
            }, 200);
        };
    } catch (e) {
        return () => {};
    }
};

const playCompletionSound = () => {
    try {
        const ctx = createAudioContext();
        const now = ctx.currentTime;
        const freqs = [523.25, 659.25, 783.99, 1046.50]; 
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.value = f;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.05 + (i * 0.05));
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0 + (i * 0.1));
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + (i * 0.05));
            osc.stop(now + 2);
        });
        setTimeout(() => ctx.close(), 2500);
    } catch (e) {}
};

const PdfRenderer = ({ dataUrl }: { dataUrl: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const renderPdf = async () => {
      if (!window.pdfjsLib) { setLoading(false); return; }
      try {
        setLoading(true);
        const loadingTask = window.pdfjsLib.getDocument(dataUrl);
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        const viewport = page.getViewport({ scale: 2.0 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        setLoading(false);
      } catch (err) { setLoading(false); }
    };
    renderPdf();
  }, [dataUrl]);
  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
        <canvas ref={canvasRef} className={`max-w-full max-h-full shadow-lg transition-opacity duration-700 ${loading ? 'opacity-0' : 'opacity-100'}`}/>
    </div>
  );
};

export const LivePreview: React.FC<LivePreviewProps> = ({ creation, isLoading, loadingMessage, streamSize = 0, className = "", imageMap = {}, onUpdateArtifact, isLive }) => {
    const [isExporting, setIsExporting] = useState<'docx' | 'pdf' | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [showStyleEditor, setShowStyleEditor] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const stopGenerationSoundRef = useRef<(() => void) | null>(null);
    const prevIsLoadingRef = useRef(isLoading);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        if (isLoading && !prevIsLoadingRef.current) stopGenerationSoundRef.current = playGeneratingSound();
        else if (!isLoading && prevIsLoadingRef.current) {
            if (stopGenerationSoundRef.current) { stopGenerationSoundRef.current(); stopGenerationSoundRef.current = null; }
            playCompletionSound();
        }
        prevIsLoadingRef.current = isLoading;
    }, [isLoading]);

    useEffect(() => () => { if (stopGenerationSoundRef.current) stopGenerationSoundRef.current(); }, []);

    const processedHtml = useMemo(() => {
        if (!creation?.html) return "";
        let html = creation.html;
        Object.entries(imageMap).forEach(([id, dataUrl]) => {
            const regex = new RegExp(`src=["']${id}["']`, 'g');
            html = html.replace(regex, `src="${dataUrl}" data-kb-id="${id}"`);
        });
        const styleTag = `<style id="kb-edit-style">
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,600;1,400&display=swap');
            body { 
                font-family: 'Inter', -apple-system, sans-serif; 
                line-height: 1.65; 
                color: #374151; 
                max-width: 840px; 
                margin: 0 auto; 
                padding: 60px 40px; 
                background-color: #ffffff;
                -webkit-font-smoothing: antialiased;
            }
            h1 { font-family: 'Inter', sans-serif; font-size: 2.75rem; font-weight: 800; color: #111827; letter-spacing: -0.025em; margin-bottom: 0.5rem; line-height: 1.2; }
            .metadata { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3rem; border-bottom: 1px solid #f3f4f6; padding-bottom: 1rem; }
            h2 { font-size: 1.75rem; font-weight: 700; color: #111827; margin-top: 3.5rem; margin-bottom: 1.25rem; letter-spacing: -0.015em; }
            h3 { font-size: 1.25rem; font-weight: 600; color: #1f2937; margin-top: 2.5rem; margin-bottom: 1rem; }
            p { margin-bottom: 1.25rem; font-size: 1.05rem; }
            ul, ol { margin-bottom: 2rem; padding-left: 1.5rem; }
            li { margin-bottom: 0.75rem; }
            img { max-width: 100%; height: auto; display: block; margin: 3rem auto; border-radius: 12px; border: 1px solid #f3f4f6; box-shadow: 0 10px 30px -5px rgba(0,0,0,0.05); }
            .ai-diagram { margin: 3rem 0; background: #fafafa; border-radius: 16px; border: 1px solid #f1f1f1; padding: 2rem; }
            .note, .warning { padding: 1.5rem; border-radius: 12px; margin: 2rem 0; font-size: 0.95rem; }
            .note { background: #f0f9ff; border-left: 4px solid #0ea5e9; color: #075985; }
            .warning { background: #fff7ed; border-left: 4px solid #f97316; color: #9a3412; }
            table { width: 100%; border-collapse: collapse; margin: 2.5rem 0; font-size: 0.95rem; }
            th { text-align: left; background: #f9fafb; padding: 12px 16px; border-bottom: 2px solid #e5e7eb; color: #111827; font-weight: 600; }
            td { padding: 12px 16px; border-bottom: 1px solid #f3f4f6; }
            [contenteditable="true"]:focus { outline: none; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); border-radius: 4px; }
            /* Animations */
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            body > * { animation: fadeIn 0.6s ease-out forwards; }
        </style>`;
        return html.includes('</body>') ? html.replace('</body>', `${styleTag}</body>`) : html + styleTag;
    }, [creation?.html, imageMap]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;
        const toggleEdit = () => {
             try {
                 const doc = iframe.contentDocument;
                 if (!doc) return;
                 doc.body.contentEditable = (isEditing && !showStyleEditor && !isLive) ? "true" : "false";
             } catch (e) {}
        };
        toggleEdit(); iframe.onload = toggleEdit;
    }, [isEditing, processedHtml, showStyleEditor, isLive]);

    const handleSaveEdit = () => {
        if (!iframeRef.current?.contentDocument) return;
        const doc = iframeRef.current.contentDocument;
        doc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        let newHtml = doc.documentElement.outerHTML;
        if (creation && onUpdateArtifact) onUpdateArtifact(creation.id, newHtml, true);
        setIsEditing(false); setShowStyleEditor(false);
    };

    const handleExportDocx = async () => {
        if (!creation || !processedHtml) return;
        setIsExporting('docx');
        try {
            const generator = new DocxGenerator();
            const blob = await generator.generate(processedHtml);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${creation.name}_KB.docx`;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) { alert("Failed to generate DOCX."); }
        finally { setIsExporting(null); }
    };

    const handleExportPdf = async () => {
        if (!creation || !processedHtml) return;
        setIsExporting('pdf');
        try {
            const generator = new PdfGenerator();
            await generator.generate(processedHtml, `${creation.name}_KB.pdf`);
        } catch (error) { alert("Failed to generate PDF."); }
        finally { setIsExporting(null); }
    };

    const phases = [
        { id: 'context', label: 'Analyzing Context', trigger: 'context' },
        { id: 'theme', label: 'Drafting UI Theme', trigger: 'theme' },
        { id: 'hierarchy', label: 'Structuring Content', trigger: 'hierarchy' },
        { id: 'assets', label: 'Injecting Visuals', trigger: 'visual' },
        { id: 'logic', label: 'Formulating Logic', trigger: 'logic' },
    ];

    const currentPhaseIndex = phases.findIndex(p => loadingMessage?.toLowerCase().includes(p.trigger));

  return (
    <div className={`flex flex-col h-full bg-[#09090b] border-l border-zinc-800 transition-all duration-300 ${className} ${isFullScreen ? '!fixed !inset-0 !z-[100] !w-screen !h-screen !border-0' : ''}`}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 bg-[#09090b]/80 backdrop-blur-xl sticky top-0 z-10 shrink-0">
        <div className="flex items-center space-x-3 shrink-0">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] whitespace-nowrap">
                {isLoading ? 'Synthesizing' : (!creation ? 'System Ready' : (isEditing ? 'Drafting' : 'Manifest')) }
            </span>
            {creation && (
              <div className="flex items-center gap-2 pl-2 border-l border-zinc-800">
                <span className="text-[11px] font-bold text-zinc-300 truncate max-w-[180px]">{creation.name}</span>
              </div>
            )}
        </div>
        
        {creation && (
            <div className="flex items-center gap-1.5">
                {!isEditing && !showStyleEditor ? (
                    <div className="flex items-center p-1 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"><PencilIcon className="w-3 h-3" /> Edit</button>
                        <button onClick={() => setShowStyleEditor(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"><PaintBrushIcon className="w-3 h-3" /> Style</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase text-emerald-900 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all shadow-[0_0_20px_rgba(52,211,153,0.2)]"><CheckIcon className="w-3 h-3" /> Commit</button>
                        <button onClick={() => { setIsEditing(false); setShowStyleEditor(false); }} className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-200 transition-colors">Discard</button>
                    </div>
                )}
                
                <div className="w-px h-4 bg-zinc-800 mx-2"></div>
                
                <div className="flex items-center gap-1.5">
                    <button 
                        onClick={handleExportPdf} 
                        disabled={!!isExporting} 
                        className={`
                            group relative p-2 text-zinc-400 hover:text-red-400 bg-zinc-900/50 hover:bg-red-500/10 border border-zinc-800 hover:border-red-500/20 rounded-xl transition-all
                            ${isExporting === 'pdf' ? 'cursor-not-allowed opacity-50' : ''}
                        `}
                        title="Export to PDF"
                    >
                        <DocumentIcon className={`w-4 h-4 ${isExporting === 'pdf' ? 'animate-pulse' : ''}`} />
                        {isExporting === 'pdf' && <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-zinc-500">PDF...</span>}
                    </button>

                    <button 
                        onClick={handleExportDocx} 
                        disabled={!!isExporting} 
                        className={`
                            group relative p-2 text-zinc-400 hover:text-blue-400 bg-zinc-900/50 hover:bg-blue-500/10 border border-zinc-800 hover:border-blue-500/20 rounded-xl transition-all
                            ${isExporting === 'docx' ? 'cursor-not-allowed opacity-50' : ''}
                        `}
                        title="Export to DOCX"
                    >
                        <DocumentArrowDownIcon className={`w-4 h-4 ${isExporting === 'docx' ? 'animate-pulse' : ''}`} />
                        {isExporting === 'docx' && <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[8px] font-bold text-zinc-500">DOCX...</span>}
                    </button>
                    
                    <button 
                        onClick={() => setIsFullScreen(!isFullScreen)} 
                        className="p-2 text-zinc-500 hover:text-white bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all"
                        title="Toggle Focus Mode"
                    >
                        {isFullScreen ? <ArrowsPointingInIcon className="w-4 h-4" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        )}
      </div>

      <div className="flex-1 relative bg-[#09090b] w-full overflow-hidden">
        {isLoading && (
            <div className="absolute inset-0 z-50 bg-[#09090b]/60 backdrop-blur-2xl flex items-center justify-center animate-in fade-in duration-700">
                <div className="max-w-sm w-full p-1 border border-zinc-800 rounded-[2.5rem] bg-zinc-900/50 shadow-2xl">
                    <div className="px-8 py-10 rounded-[2.3rem] bg-black/40 border border-zinc-800 flex flex-col items-center text-center">
                        
                        {/* Core Animation */}
                        <div className="relative mb-12">
                            <div className="w-24 h-24 rounded-full bg-blue-500/5 flex items-center justify-center border border-blue-500/10 shadow-[0_0_60px_rgba(59,130,246,0.15)]">
                                <SparklesIcon className="w-10 h-10 text-blue-400 animate-pulse" />
                            </div>
                            <div className="absolute -inset-6 animate-[spin_10s_linear_infinite] opacity-40">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-blue-500 rounded-full shadow-[0_0_20px_rgba(59,130,246,1)]"></div>
                            </div>
                            <div className="absolute -inset-4 animate-[spin_6s_linear_infinite_reverse] opacity-20">
                                <div className="absolute bottom-0 right-1/4 w-2 h-2 bg-purple-500 rounded-full"></div>
                            </div>
                        </div>

                        <div className="w-full space-y-8">
                            <div className="space-y-2">
                                <h3 className="text-xl font-black text-white tracking-tighter">Manifesting Article</h3>
                                <p className="text-blue-400 text-[10px] font-black uppercase tracking-[0.3em]">{loadingMessage || 'Calibrating...'}</p>
                            </div>

                            {/* Checklist */}
                            <div className="space-y-3 text-left">
                                {phases.map((phase, idx) => {
                                    const isComplete = idx < currentPhaseIndex;
                                    const isActive = idx === currentPhaseIndex;
                                    return (
                                        <div key={phase.id} className={`flex items-center gap-3 transition-all duration-500 ${isComplete ? 'opacity-100 translate-x-0' : (isActive ? 'opacity-100 translate-x-1' : 'opacity-20')}`}>
                                            <div className="flex items-center justify-center w-5 h-5 shrink-0">
                                                {isComplete ? (
                                                    <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                                                ) : isActive ? (
                                                    <div className="relative flex items-center justify-center">
                                                      <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                                                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                    </div>
                                                ) : (
                                                    <div className="w-1.5 h-1.5 bg-zinc-700 rounded-full"></div>
                                                )}
                                            </div>
                                            <span className={`text-[11px] font-bold tracking-tight ${isComplete ? 'text-zinc-500 line-through' : (isActive ? 'text-white' : 'text-zinc-700')}`}>
                                                {phase.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Progress bar */}
                            <div className="pt-2">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Entropy Level</span>
                                    <span className="text-[10px] text-zinc-400 font-mono">{(streamSize/1000).toFixed(1)}k</span>
                                </div>
                                <div className="w-full h-1 bg-zinc-900 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-500 ease-out shadow-[0_0_10px_rgba(37,99,235,0.4)]" 
                                        style={{ width: `${Math.min(100, (streamSize / 6000) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        <div className="w-full h-full bg-white relative">
          {processedHtml ? (
              <iframe 
                ref={iframeRef} 
                title="Preview" 
                srcDoc={processedHtml} 
                className={`w-full h-full border-none transition-opacity duration-500 ${isLoading ? 'opacity-30 pointer-events-none' : 'opacity-100'}`} 
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin" 
              />
          ) : creation?.originalImage ? (
              creation.originalImage.startsWith('data:application/pdf') ? (
                  <PdfRenderer dataUrl={creation.originalImage} />
              ) : (
                  <div className="w-full h-full bg-zinc-900 flex items-center justify-center p-12 transition-all duration-700">
                    <div className="relative group max-w-2xl">
                      <img src={creation.originalImage} alt="Reference" className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl opacity-40 group-hover:opacity-60 transition-opacity" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-xs font-bold text-white border border-white/10">Reference Context</div>
                      </div>
                    </div>
                  </div>
              )
          ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-[#09090b] text-zinc-500 transition-all duration-1000 animate-in fade-in">
                  <div className="relative mb-6">
                    <SparklesIcon className="w-14 h-14 opacity-10 animate-pulse" />
                    <div className="absolute inset-0 bg-blue-500/10 blur-[60px] rounded-full"></div>
                  </div>
                  <p className="text-[10px] font-black tracking-[0.3em] uppercase opacity-20">Awaiting Signal</p>
                  <p className="text-[11px] font-medium text-zinc-700 mt-2 max-w-[200px] text-center">Upload a file or provide a prompt to generate documentation</p>
              </div>
          )}
        </div>
      </div>
    </div>
  );
};
