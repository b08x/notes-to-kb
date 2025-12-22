
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ArrowDownTrayIcon, CodeBracketIcon, DocumentTextIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, PaintBrushIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, SparklesIcon, BoltIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';
import { DocxGenerator } from '../lib/services/DocxGenerator';

interface LivePreviewProps {
  creation: Creation | null;
  isLoading: boolean;
  loadingMessage?: string;
  streamSize?: number;
  className?: string;
  imageMap?: Record<string, string>;
  onUpdateArtifact?: (id: string, html: string) => void;
  isLive?: boolean;
  onToggleLive?: () => void;
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
        <canvas ref={canvasRef} className={`max-w-full max-h-full shadow-lg ${loading ? 'opacity-0' : 'opacity-100'}`}/>
    </div>
  );
};

const rgbToHex = (rgb: string) => {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    if (rgb.startsWith('#')) return rgb;
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    const rgbVal = rgb.substr(4).split(")")[0].split(sep);
    let r = (+rgbVal[0]).toString(16), g = (+rgbVal[1]).toString(16), b = (+rgbVal[2]).toString(16);
    if (r.length === 1) r = "0" + r;
    if (g.length === 1) g = "0" + g;
    if (b.length === 1) b = "0" + b;
    return "#" + r + g + b;
};

interface StyleAction {
    element: HTMLElement;
    property: string;
    oldValue: string;
    newValue: string;
}

export const LivePreview: React.FC<LivePreviewProps> = ({ creation, isLoading, loadingMessage, streamSize = 0, className = "", imageMap = {}, onUpdateArtifact, isLive, onToggleLive }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showStyleEditor, setShowStyleEditor] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
    const [styleValues, setStyleValues] = useState({
        color: '#000000', backgroundColor: '#ffffff', fontSize: '', padding: '', margin: '', borderRadius: '', maxWidth: '', boxShadow: ''
    });

    const [styleHistory, setStyleHistory] = useState<StyleAction[]>([]);
    const [styleRedoStack, setStyleRedoStack] = useState<StyleAction[]>([]);
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
            body { font-family: 'Segoe UI', sans-serif; line-height: 1.6; color: #1f2937; max-width: 900px; margin: 0 auto; padding: 40px; background-color: #ffffff; }
            h1 { font-size: 2.25rem; font-weight: 700; color: #111827; }
            h2 { font-size: 1.5rem; font-weight: 600; color: #1f2937; margin-top: 2.5rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
            img { max-width: 85%; height: auto; display: block; margin: 2rem auto; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            [contenteditable="true"]:focus { outline: 2px solid #3b82f6; border-radius: 4px; }
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

    const handleStyleChange = (prop: string, value: string) => {
        if (!selectedEl) return;
        const oldValue = (selectedEl.style as any)[prop];
        (selectedEl.style as any)[prop] = value;
        setStyleValues(prev => ({ ...prev, [prop]: value }));
        setStyleHistory(prev => [...prev, { element: selectedEl, property: prop, oldValue: oldValue || '', newValue: value }]);
    };

    const handleSaveEdit = () => {
        if (!iframeRef.current?.contentDocument) return;
        const doc = iframeRef.current.contentDocument;
        doc.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
        let newHtml = doc.documentElement.outerHTML;
        if (creation && onUpdateArtifact) onUpdateArtifact(creation.id, newHtml);
        setIsEditing(false); setShowStyleEditor(false);
    };

    const handleExportDocx = async () => {
        if (!creation || !processedHtml) return;
        setIsExporting(true);
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
        finally { setIsExporting(false); }
    };

    // Assistant Progress States
    const phases = [
        { id: 'context', label: 'Analyzing Context', trigger: 'context' },
        { id: 'theme', label: 'Drafting UI Theme', trigger: 'theme' },
        { id: 'hierarchy', label: 'Structuring Content', trigger: 'hierarchy' },
        { id: 'assets', label: 'Injecting Visuals', trigger: 'visual' },
        { id: 'logic', label: 'Formulating Logic', trigger: 'logic' },
    ];

    const currentPhaseIndex = phases.findIndex(p => loadingMessage?.toLowerCase().includes(p.trigger));

  return (
    <div className={`flex flex-col h-full bg-[#121214] border-l border-zinc-800 ${className} ${isFullScreen ? '!fixed !inset-0 !z-[100] !w-screen !h-screen !border-0' : ''}`}>
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 bg-[#121214] shrink-0">
        <div className="flex items-center space-x-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                {isLoading ? 'Processing Stream' : (isEditing ? 'Draft Edit' : (showStyleEditor ? 'Styling' : 'Artifact View'))}
            </span>
            {creation && <span className="text-[10px] text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 truncate max-w-[150px]">{creation.name}</span>}
        </div>
        
        {creation && (
            <div className="flex items-center space-x-2">
                {!isEditing && !showStyleEditor ? (
                    <>
                        <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-md transition-all"><PencilIcon className="w-3 h-3" /> Edit</button>
                        <button onClick={() => setShowStyleEditor(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-zinc-300 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-md transition-all"><PaintBrushIcon className="w-3 h-3" /> Style</button>
                    </>
                ) : (
                    <>
                        <button onClick={handleSaveEdit} className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-md transition-all"><CheckIcon className="w-3 h-3" /> Save</button>
                        <button onClick={() => { setIsEditing(false); setShowStyleEditor(false); }} className="text-[10px] font-bold text-zinc-500 hover:text-white px-2">Cancel</button>
                    </>
                )}
                <div className="w-px h-3 bg-zinc-800"></div>
                <button onClick={handleExportDocx} disabled={isExporting} className="p-1.5 text-zinc-400 hover:text-white transition-colors"><DocumentTextIcon className="w-4 h-4" /></button>
                <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-1.5 text-zinc-400 hover:text-white transition-colors">{isFullScreen ? <ArrowsPointingInIcon className="w-4 h-4" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}</button>
            </div>
        )}
      </div>

      <div className="flex-1 relative bg-white w-full overflow-hidden">
        {isLoading && (
            <div className="absolute inset-0 z-50 bg-[#09090b]/95 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-500">
                <div className="max-w-md w-full px-8 py-10 rounded-3xl bg-zinc-900/50 border border-zinc-800 shadow-2xl flex flex-col items-center text-center">
                    
                    {/* Neural Hub Avatar */}
                    <div className="relative mb-10">
                        <div className="w-20 h-20 rounded-full bg-blue-500/5 flex items-center justify-center border border-blue-500/10 shadow-[0_0_40px_rgba(59,130,246,0.1)]">
                            <SparklesIcon className="w-10 h-10 text-blue-400 animate-pulse" />
                        </div>
                        <div className="absolute -inset-4 animate-[spin_8s_linear_infinite] opacity-40">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_15px_rgba(59,130,246,1)]"></div>
                        </div>
                        <div className="absolute -inset-2 animate-[spin_5s_linear_infinite_reverse] opacity-20">
                            <div className="absolute bottom-0 right-1/4 w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                        </div>
                    </div>

                    <div className="w-full space-y-6">
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold text-white tracking-tight">Assistant Working</h3>
                            <p className="text-blue-400 text-[10px] font-mono uppercase tracking-[0.2em]">{loadingMessage || 'Initializing...'}</p>
                        </div>

                        {/* Task Manifest Checklist */}
                        <div className="grid grid-cols-1 gap-2.5 text-left bg-black/20 p-5 rounded-2xl border border-zinc-800/50">
                            {phases.map((phase, idx) => {
                                const isComplete = idx < currentPhaseIndex;
                                const isActive = idx === currentPhaseIndex;
                                return (
                                    <div key={phase.id} className={`flex items-center gap-3 transition-opacity duration-300 ${isComplete ? 'opacity-100' : (isActive ? 'opacity-100' : 'opacity-30')}`}>
                                        <div className="relative flex items-center justify-center w-5 h-5">
                                            {isComplete ? (
                                                <CheckCircleIcon className="w-5 h-5 text-emerald-500" />
                                            ) : isActive ? (
                                                <>
                                                    <div className="absolute inset-0 bg-blue-500/20 rounded-full animate-ping"></div>
                                                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                                                </>
                                            ) : (
                                                <div className="w-2 h-2 bg-zinc-700 rounded-full"></div>
                                            )}
                                        </div>
                                        <span className={`text-xs font-medium ${isComplete ? 'text-zinc-400 line-through' : (isActive ? 'text-white' : 'text-zinc-600')}`}>
                                            {phase.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Stream Stats */}
                        <div className="flex items-center justify-between px-2">
                             <div className="flex flex-col items-start">
                                <span className="text-[9px] text-zinc-500 font-bold uppercase">Payload Size</span>
                                <span className="text-xs text-white font-mono tracking-tighter">{streamSize.toLocaleString()} <span className="text-zinc-600">chars</span></span>
                             </div>
                             <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-blue-600 transition-all duration-300 shadow-[0_0_10px_rgba(37,99,235,0.5)]" 
                                    style={{ width: `${Math.min(100, (streamSize / 5000) * 100)}%` }}
                                ></div>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
        )}
        
        {processedHtml ? (
            <iframe ref={iframeRef} title="Preview" srcDoc={processedHtml} className="w-full h-full border-none" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin" />
        ) : creation?.originalImage ? (
             creation.originalImage.startsWith('data:application/pdf') ? (
                <PdfRenderer dataUrl={creation.originalImage} />
             ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center p-8"><img src={creation.originalImage} alt="Reference" className="max-w-full max-h-full object-contain opacity-50" /></div>
             )
        ) : null}
      </div>
    </div>
  );
};
