
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
    PencilIcon, 
    CheckIcon, 
    PaintBrushIcon, 
    ArrowsPointingOutIcon, 
    ArrowsPointingInIcon, 
    SparklesIcon, 
    CheckCircleIcon,
    DocumentArrowDownIcon,
    DocumentIcon
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
    <div className="relative w-full h-full flex items-center justify-center p-4 bg-zinc-900/50">
        <canvas ref={canvasRef} className={`max-w-full max-h-full shadow-2xl rounded-sm border border-zinc-700 transition-opacity duration-700 ${loading ? 'opacity-0' : 'opacity-100'}`}/>
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
                max-width: 800px; 
                margin: 0 auto; 
                padding: 80px 60px; 
                background-color: #ffffff;
                -webkit-font-smoothing: antialiased;
            }
            h1 { font-family: 'Inter', sans-serif; font-size: 3rem; font-weight: 800; color: #111827; letter-spacing: -0.03em; margin-bottom: 0.75rem; line-height: 1.1; }
            .metadata { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 3.5rem; border-bottom: 2px solid #f3f4f6; padding-bottom: 1.25rem; }
            h2 { font-size: 1.875rem; font-weight: 700; color: #111827; margin-top: 4rem; margin-bottom: 1.5rem; letter-spacing: -0.02em; border-left: 4px solid #3b82f6; padding-left: 1rem; margin-left: -1.25rem; }
            h3 { font-size: 1.4rem; font-weight: 600; color: #1f2937; margin-top: 3rem; margin-bottom: 1.25rem; }
            p { margin-bottom: 1.5rem; font-size: 1.1rem; }
            ul, ol { margin-bottom: 2.5rem; padding-left: 1.75rem; }
            li { margin-bottom: 1rem; }
            li strong { color: #111827; font-weight: 700; }
            img { max-width: 100%; height: auto; display: block; margin: 3.5rem auto; border-radius: 16px; border: 1px solid #e5e7eb; box-shadow: 0 20px 40px -10px rgba(0,0,0,0.1); }
            .ai-diagram { margin: 4rem 0; background: #f9fafb; border-radius: 20px; border: 1px solid #e5e7eb; padding: 2.5rem; }
            .note, .warning { padding: 1.75rem; border-radius: 14px; margin: 2.5rem 0; font-size: 1rem; }
            .note { background: #eff6ff; border-left: 6px solid #3b82f6; color: #1e40af; }
            .warning { background: #fffaf5; border-left: 6px solid #f97316; color: #9a3412; }
            table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 3rem 0; font-size: 1rem; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb; }
            th { text-align: left; background: #f8fafc; padding: 16px 20px; border-bottom: 2px solid #e2e8f0; color: #0f172a; font-weight: 700; }
            td { padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
            tr:last-child td { border-bottom: none; }
            [contenteditable="true"]:focus { outline: none; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.25); border-radius: 6px; }
            
            /* Streaming Diff Animation - UX-001 */
            @keyframes kb-diff-pulse {
                0% { background-color: rgba(52, 211, 153, 0.1); }
                50% { background-color: rgba(52, 211, 153, 0.3); }
                100% { background-color: rgba(52, 211, 153, 0.0); }
            }
            .kb-updated-node {
                animation: kb-diff-pulse 2s ease-out;
            }

            /* Animations */
            @keyframes slideUpFade { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            body > * { animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        </style>`;
        return html.includes('</body>') ? html.replace('</body>', `${styleTag}</body>`) : html + styleTag;
    }, [creation?.html, imageMap]);

    // Handle tool-call driven updates with a visual "diff" effect
    useEffect(() => {
        if (!iframeRef.current?.contentDocument) return;
        // Inject a script into the iframe to handle adding the flash effect when elements change
        const iframeDoc = iframeRef.current.contentDocument;
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    const target = mutation.target.nodeType === 1 ? (mutation.target as HTMLElement) : mutation.target.parentElement;
                    if (target) {
                        target.classList.add('kb-updated-node');
                        setTimeout(() => target.classList.remove('kb-updated-node'), 2000);
                    }
                }
            });
        });

        observer.observe(iframeDoc.body, { childList: true, subtree: true, characterData: true });
        return () => observer.disconnect();
    }, [creation?.id]); // Re-run when switching documents

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
        { id: 'context', label: 'Semantic Analysis', trigger: 'context' },
        { id: 'theme', label: 'Aesthetic Generation', trigger: 'theme' },
        { id: 'hierarchy', label: 'Document Hierarchy', trigger: 'hierarchy' },
        { id: 'assets', label: 'Visual Integration', trigger: 'visual' },
        { id: 'logic', label: 'Process Formulation', trigger: 'logic' },
    ];

    const currentPhaseIndex = phases.findIndex(p => loadingMessage?.toLowerCase().includes(p.trigger));

  return (
    <div className={`flex flex-col h-full bg-[#050507] border-l border-zinc-800 transition-all duration-300 ${className} ${isFullScreen ? '!fixed !inset-0 !z-[100] !w-screen !h-screen !border-0' : ''}`}>
      {/* Refined Header */}
      <div className="h-16 flex items-center justify-between px-6 border-b border-zinc-800 bg-[#09090b]/90 backdrop-blur-2xl sticky top-0 z-10 shrink-0">
        <div className="flex items-center space-x-4 shrink-0">
            <div className="relative">
                <div className={`w-3 h-3 rounded-full ${isLoading ? 'bg-blue-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]'}`}></div>
                {isLoading && <div className="absolute inset-0 w-3 h-3 rounded-full bg-blue-500 animate-ping opacity-40"></div>}
            </div>
            <div className="flex flex-col">
                <span className="text-[9px] font-black text-zinc-600 uppercase tracking-[0.3em] leading-none mb-1">
                    {isLoading ? 'Synthesizing' : 'Artifact Preview'}
                </span>
                {creation && (
                    <span className="text-[11px] font-bold text-zinc-100 truncate max-w-[220px]">{creation.name}</span>
                )}
            </div>
        </div>
        
        {creation && (
            <div className="flex items-center gap-2">
                {!isEditing && !showStyleEditor ? (
                    <div className="flex items-center p-1 bg-zinc-900/80 rounded-xl border border-zinc-800 shadow-sm mr-2">
                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"><PencilIcon className="w-3.5 h-3.5" /> Edit</button>
                        <button onClick={() => setShowStyleEditor(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"><PaintBrushIcon className="w-3.5 h-3.5" /> Style</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 mr-2">
                        <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase text-emerald-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-all shadow-[0_0_20px_rgba(52,211,153,0.3)]"><CheckIcon className="w-3.5 h-3.5" /> Save Changes</button>
                        <button onClick={() => { setIsEditing(false); setShowStyleEditor(false); }} className="px-3 py-1.5 text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors">Discard</button>
                    </div>
                )}
                
                <div className="w-px h-6 bg-zinc-800 mx-2"></div>
                
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleExportPdf} 
                        disabled={!!isExporting} 
                        className={`
                            group relative p-2 text-zinc-400 hover:text-orange-400 bg-zinc-900/50 hover:bg-orange-500/10 border border-zinc-800 hover:border-orange-500/30 rounded-xl transition-all shadow-sm
                            ${isExporting === 'pdf' ? 'cursor-not-allowed opacity-50' : ''}
                        `}
                        title="Export as PDF"
                    >
                        <DocumentIcon className={`w-4.5 h-4.5 ${isExporting === 'pdf' ? 'animate-pulse' : ''}`} />
                    </button>

                    <button 
                        onClick={handleExportDocx} 
                        disabled={!!isExporting} 
                        className={`
                            group relative p-2 text-zinc-400 hover:text-blue-400 bg-zinc-900/50 hover:bg-blue-500/10 border border-zinc-800 hover:border-blue-500/30 rounded-xl transition-all shadow-sm
                            ${isExporting === 'docx' ? 'cursor-not-allowed opacity-50' : ''}
                        `}
                        title="Export as Word"
                    >
                        <DocumentArrowDownIcon className={`w-4.5 h-4.5 ${isExporting === 'docx' ? 'animate-pulse' : ''}`} />
                    </button>
                    
                    <button 
                        onClick={() => setIsFullScreen(!isFullScreen)} 
                        className="p-2 text-zinc-500 hover:text-white bg-zinc-900/50 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-all shadow-sm"
                        title="Toggle Focus Mode"
                    >
                        {isFullScreen ? <ArrowsPointingInIcon className="w-4.5 h-4.5" /> : <ArrowsPointingOutIcon className="w-4.5 h-4.5" />}
                    </button>
                </div>
            </div>
        )}
      </div>

      {/* Preview Stage */}
      <div className="flex-1 relative bg-[#050507] w-full overflow-hidden flex flex-col items-center">
        {isLoading && (
            <div className="absolute inset-0 z-50 bg-[#050507]/80 backdrop-blur-3xl flex items-center justify-center animate-in fade-in duration-500">
                <div className="max-w-md w-full p-1 border border-zinc-800/50 rounded-[3rem] bg-zinc-900/20 shadow-2xl">
                    <div className="px-10 py-12 rounded-[2.8rem] bg-black/60 border border-zinc-800 flex flex-col items-center text-center shadow-inner">
                        
                        <div className="relative mb-14">
                            <div className="w-28 h-28 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shadow-[0_0_80px_rgba(59,130,246,0.2)]">
                                <SparklesIcon className="w-12 h-12 text-blue-400 animate-pulse" />
                            </div>
                            <div className="absolute -inset-8 animate-[spin_12s_linear_infinite] opacity-60">
                                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_20px_rgba(59,130,246,1)]"></div>
                            </div>
                            <div className="absolute -inset-6 animate-[spin_8s_linear_infinite_reverse] opacity-30">
                                <div className="absolute bottom-0 right-1/4 w-2 h-2 bg-indigo-500 rounded-full"></div>
                            </div>
                        </div>

                        <div className="w-full space-y-10">
                            <div className="space-y-3">
                                <h3 className="text-2xl font-black text-white tracking-tighter">Manifesting Article</h3>
                                <p className="text-blue-500/80 text-[10px] font-black uppercase tracking-[0.4em]">{loadingMessage || 'Interpreting Signal...'}</p>
                            </div>

                            <div className="space-y-4 text-left max-w-[260px] mx-auto">
                                {phases.map((phase, idx) => {
                                    const isComplete = idx < currentPhaseIndex;
                                    const isActive = idx === currentPhaseIndex;
                                    return (
                                        <div key={phase.id} className={`flex items-center gap-4 transition-all duration-700 ${isComplete ? 'opacity-100 translate-x-0' : (isActive ? 'opacity-100 translate-x-1' : 'opacity-10')}`}>
                                            <div className="flex items-center justify-center w-6 h-6 shrink-0">
                                                {isComplete ? (
                                                    <CheckCircleIcon className="w-6 h-6 text-emerald-500" />
                                                ) : isActive ? (
                                                    <div className="relative flex items-center justify-center">
                                                      <div className="absolute inset-0 bg-blue-500/30 rounded-full animate-ping"></div>
                                                      <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                                                    </div>
                                                ) : (
                                                    <div className="w-2 h-2 bg-zinc-800 rounded-full"></div>
                                                )}
                                            </div>
                                            <span className={`text-[12px] font-bold tracking-tight ${isComplete ? 'text-zinc-600 line-through' : (isActive ? 'text-zinc-100' : 'text-zinc-800')}`}>
                                                {phase.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 px-4">
                                <div className="flex items-center justify-between mb-3 px-1">
                                    <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Entropy Compression</span>
                                    <span className="text-[10px] text-zinc-400 font-mono tracking-tighter">{(streamSize/1024).toFixed(1)}KB</span>
                                </div>
                                <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800/50">
                                    <div 
                                        className="h-full bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-400 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(37,99,235,0.5)]" 
                                        style={{ width: `${Math.min(100, (streamSize / 8192) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {/* Document Content */}
        <div className={`flex-1 w-full overflow-y-auto overflow-x-hidden p-6 md:p-12 transition-all duration-700 ${processedHtml ? 'bg-[#121214]' : 'bg-[#050507]'}`}>
          <div className={`mx-auto max-w-[840px] w-full min-h-full transition-all duration-1000 ${processedHtml ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            {processedHtml ? (
                <div className="relative bg-white shadow-[0_30px_100px_rgba(0,0,0,0.5)] rounded-sm overflow-hidden min-h-[1100px]">
                    <iframe 
                      ref={iframeRef} 
                      title="Preview" 
                      srcDoc={processedHtml} 
                      className={`w-full h-full border-none transition-opacity duration-1000 min-h-[1100px] ${isLoading ? 'opacity-20 pointer-events-none' : 'opacity-100'}`} 
                      sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin" 
                    />
                </div>
            ) : creation?.originalImage ? (
                creation.originalImage.startsWith('data:application/pdf') ? (
                    <div className="rounded-xl overflow-hidden shadow-2xl border border-zinc-800">
                        <PdfRenderer dataUrl={creation.originalImage} />
                    </div>
                ) : (
                    <div className="w-full h-full flex items-center justify-center p-8 bg-zinc-900/30 rounded-2xl border border-zinc-800/50">
                        <div className="relative group max-w-2xl animate-in zoom-in-95 duration-700">
                            <img src={creation.originalImage} alt="Reference Context" className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-white/5 opacity-50 group-hover:opacity-80 transition-opacity" />
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <div className="bg-black/80 backdrop-blur-xl px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] text-white border border-white/10 shadow-2xl">
                                    Base Visual Context
                                </div>
                            </div>
                        </div>
                    </div>
                )
            ) : (
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-zinc-700 space-y-8 animate-in fade-in duration-1000">
                    <div className="relative">
                        <div className="p-6 bg-zinc-900/40 rounded-[2rem] border border-zinc-800/50 shadow-inner">
                            <SparklesIcon className="w-16 h-16 opacity-10 animate-pulse text-blue-500" />
                        </div>
                        <div className="absolute -inset-10 bg-blue-500/5 blur-3xl rounded-full"></div>
                    </div>
                    <div className="text-center space-y-2">
                        <p className="text-[10px] font-black tracking-[0.4em] uppercase opacity-30">Awaiting Signal</p>
                        <p className="text-[12px] font-medium text-zinc-600 max-w-[240px] leading-relaxed">
                            Upload high-fidelity technical specs or captured UI to manifest professional documentation
                        </p>
                    </div>
                </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
