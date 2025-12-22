
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ArrowDownTrayIcon, CodeBracketIcon, DocumentTextIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, PaintBrushIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, SparklesIcon, BoltIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';
import { DocxGenerator } from '../lib/services/DocxGenerator';

interface LivePreviewProps {
  creation: Creation | null;
  isLoading: boolean;
  loadingMessage?: string;
  className?: string;
  imageMap?: Record<string, string>; // Map ID -> Data URL
  onUpdateArtifact?: (id: string, html: string) => void;
  isLive?: boolean;
  onToggleLive?: () => void;
}

// Add type definition for the global pdfjsLib
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

// --- Audio Feedback Utilities ---
const createAudioContext = () => {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
};

const playGeneratingSound = () => {
    try {
        const ctx = createAudioContext();
        
        // Sci-fi drone sound
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 120;
        
        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = 124; // Slight dissonance for texture

        const gain1 = ctx.createGain();
        gain1.gain.value = 0.02;
        
        const gain2 = ctx.createGain();
        gain2.gain.value = 0.02;
        
        // LFO for pulsing effect
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.5; // Slow pulse
        
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.01; 
        
        lfo.connect(lfoGain);
        lfoGain.connect(gain1.gain); // Modulate gain
        
        osc1.connect(gain1);
        osc2.connect(gain2);
        
        gain1.connect(ctx.destination);
        gain2.connect(ctx.destination);
        
        osc1.start();
        osc2.start();
        lfo.start();
        
        // Return stop function
        return () => {
            const now = ctx.currentTime;
            // Fade out
            gain1.gain.setTargetAtTime(0, now, 0.1);
            gain2.gain.setTargetAtTime(0, now, 0.1);
            setTimeout(() => {
                osc1.stop();
                osc2.stop();
                lfo.stop();
                ctx.close();
            }, 200);
        };
    } catch (e) {
        // Audio might be blocked or not supported
        return () => {};
    }
};

const playCompletionSound = () => {
    try {
        const ctx = createAudioContext();
        const now = ctx.currentTime;
        
        // Pleasant rising chord (C Major ish)
        const freqs = [523.25, 659.25, 783.99, 1046.50]; 
        
        freqs.forEach((f, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.value = f;
            
            // Envelope
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.05 + (i * 0.05));
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0 + (i * 0.1));
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(now + (i * 0.05));
            osc.stop(now + 2);
        });
        
        setTimeout(() => ctx.close(), 2500);
    } catch (e) {
        // Ignore errors
    }
};


const PdfRenderer = ({ dataUrl }: { dataUrl: string }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const renderPdf = async () => {
      if (!window.pdfjsLib) {
        setLoading(false);
        return;
      }
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
      } catch (err) {
        setLoading(false);
      }
    };
    renderPdf();
  }, [dataUrl]);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4">
        <canvas ref={canvasRef} className={`max-w-full max-h-full shadow-lg ${loading ? 'opacity-0' : 'opacity-100'}`}/>
    </div>
  );
};

// Helper to convert RGB to Hex for color inputs
const rgbToHex = (rgb: string) => {
    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    if (rgb.startsWith('#')) return rgb;
    const sep = rgb.indexOf(",") > -1 ? "," : " ";
    const rgbVal = rgb.substr(4).split(")")[0].split(sep);
    let r = (+rgbVal[0]).toString(16),
        g = (+rgbVal[1]).toString(16),
        b = (+rgbVal[2]).toString(16);
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

export const LivePreview: React.FC<LivePreviewProps> = ({ creation, isLoading, loadingMessage, className = "", imageMap = {}, onUpdateArtifact, isLive, onToggleLive }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showStyleEditor, setShowStyleEditor] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
    const [styleValues, setStyleValues] = useState({
        color: '#000000',
        backgroundColor: '#ffffff',
        fontSize: '',
        padding: '',
        margin: '',
        borderRadius: '',
        maxWidth: '',
        boxShadow: ''
    });

    const [styleHistory, setStyleHistory] = useState<StyleAction[]>([]);
    const [styleRedoStack, setStyleRedoStack] = useState<StyleAction[]>([]);
    
    // Audio Feedback State Refs
    const stopGenerationSoundRef = useRef<(() => void) | null>(null);
    const prevIsLoadingRef = useRef(isLoading);

    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Audio Feedback Effect
    useEffect(() => {
        // Detect Start of Loading
        if (isLoading && !prevIsLoadingRef.current) {
            stopGenerationSoundRef.current = playGeneratingSound();
        } 
        // Detect End of Loading
        else if (!isLoading && prevIsLoadingRef.current) {
            if (stopGenerationSoundRef.current) {
                stopGenerationSoundRef.current();
                stopGenerationSoundRef.current = null;
            }
            // Only play success if we actually were generating (avoids noise on mount)
            playCompletionSound();
        }
        
        prevIsLoadingRef.current = isLoading;
    }, [isLoading]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (stopGenerationSoundRef.current) {
                stopGenerationSoundRef.current();
            }
        };
    }, []);

    // Reset style history when style editor is toggled off
    useEffect(() => {
        if (!showStyleEditor) {
            setStyleHistory([]);
            setStyleRedoStack([]);
        }
    }, [showStyleEditor]);

    // Process HTML to inject image data and edit styles
    const processedHtml = useMemo(() => {
        if (!creation?.html) return "";
        let html = creation.html;
        
        // Find all img tags with src NOT starting with http or data
        // We assume IDs are simple strings like "msg-uuid"
        Object.entries(imageMap).forEach(([id, dataUrl]) => {
            // Replace exact matches of the ID in src
            // Inject data-kb-id to preserve the reference for saving later
            const regex = new RegExp(`src=["']${id}["']`, 'g');
            html = html.replace(regex, `src="${dataUrl}" data-kb-id="${id}"`);
        });

        // Inject Base Styles + Edit Styles
        const styleTag = `<style id="kb-edit-style">
            /* Default KB Styles for Preview */
            body { 
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; 
                line-height: 1.6; 
                color: #1f2937; 
                max-width: 900px; 
                margin: 0 auto; 
                padding: 40px; 
                background-color: #ffffff;
            }
            h1 { font-size: 2.25rem; font-weight: 700; letter-spacing: -0.025em; color: #111827; margin-bottom: 0.5rem; }
            h2 { font-size: 1.5rem; font-weight: 600; color: #1f2937; margin-top: 2.5rem; margin-bottom: 1rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.5rem; }
            h3 { font-size: 1.25rem; font-weight: 600; color: #374151; margin-top: 1.5rem; margin-bottom: 0.75rem; }
            h4 { font-size: 1.1rem; font-weight: 600; color: #374151; margin-top: 1.25rem; margin-bottom: 0.5rem; }
            p, li { font-size: 1rem; color: #4b5563; }
            ul, ol { padding-left: 1.5rem; margin-bottom: 1rem; }
            li { margin-bottom: 0.5rem; }
            
            /* Image Styles - Aesthetic Resizing & Placement */
            img { 
                max-width: 85%; 
                height: auto; 
                display: block; 
                margin: 2rem auto; 
                border-radius: 8px; 
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); 
                border: 1px solid #f3f4f6;
                transition: transform 0.2s ease;
            }
            img:hover {
                transform: scale(1.01);
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            }
            
            .metadata { color: #9ca3af; font-size: 0.875rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; margin-bottom: 3rem; }
            
            /* Warning/Info Boxes */
            .warning-box, .warning {
                background-color: #fef2f2;
                border-left: 4px solid #ef4444;
                padding: 1rem;
                margin: 1.5rem 0;
                border-radius: 0 0.5rem 0.5rem 0;
            }
            .warning-box p, .warning p, .warning strong { color: #b91c1c; margin: 0; }

            /* Edit Mode Styles */
            [contenteditable="true"] { outline: none; }
            [contenteditable="true"]:hover { background: rgba(59, 130, 246, 0.05); cursor: text; border-radius: 4px; }
            [contenteditable="true"]:focus { background: rgba(59, 130, 246, 0.1); border-radius: 4px; }
            body.editing-mode { cursor: text; }
        </style>`;
        
        if (html.includes('</body>')) {
             html = html.replace('</body>', `${styleTag}</body>`);
        } else {
             html += styleTag;
        }

        return html;
    }, [creation?.html, imageMap]);

    // Handle Edit Mode Toggling (Content)
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const toggleEdit = () => {
             try {
                 const doc = iframe.contentDocument;
                 if (!doc) return;
                 
                 // If style editor or live selection is active, ensure content editable is OFF
                 if (showStyleEditor || isLive) {
                     doc.body.contentEditable = "false";
                     doc.body.classList.remove('editing-mode');
                     return;
                 }

                 doc.body.contentEditable = isEditing ? "true" : "false";
                 if (isEditing) {
                     doc.body.classList.add('editing-mode');
                 } else {
                     doc.body.classList.remove('editing-mode');
                 }
             } catch (e) {
                 console.error("Cannot access iframe document for editing", e);
             }
        };

        // Try immediately and on load
        toggleEdit();
        iframe.onload = toggleEdit;
    }, [isEditing, processedHtml, showStyleEditor, isLive]);

    // Handle Style Editor & Live Selection Mode Toggling
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const setupSelectionOverlay = () => {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // Cleanup function
            const cleanup = () => {
                const style = doc.getElementById('kb-style-editor-css');
                if (style) style.remove();
                doc.querySelectorAll('.kb-style-selected').forEach(el => el.classList.remove('kb-style-selected'));
                doc.querySelectorAll('.kb-style-hover').forEach(el => el.classList.remove('kb-style-hover'));
                doc.querySelectorAll('.kb-live-selected').forEach(el => el.classList.remove('kb-live-selected'));
            };

            if (showStyleEditor || isLive) {
                // Inject styles for selection/hover
                const style = doc.createElement('style');
                style.id = 'kb-style-editor-css';
                style.textContent = `
                    @keyframes kb-pulse-blue {
                        0% { box-shadow: 0 0 0 0px rgba(59, 130, 246, 0.4); }
                        70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                        100% { box-shadow: 0 0 0 0px rgba(59, 130, 246, 0); }
                    }
                    @keyframes kb-pulse-live {
                        0% { box-shadow: 0 0 0 0px rgba(239, 68, 68, 0.4); }
                        70% { box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
                        100% { box-shadow: 0 0 0 0px rgba(239, 68, 68, 0); }
                    }
                    .kb-style-hover { outline: 2px dashed #60a5fa !important; cursor: pointer !important; }
                    .kb-style-selected { 
                        outline: 2px solid #3b82f6 !important; 
                        box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2); 
                        animation: kb-pulse-blue 2s infinite;
                    }
                    /* Specialized Live Selection Indicator */
                    .kb-live-selected {
                        outline: 2px solid #ef4444 !important;
                        box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.2);
                        animation: kb-pulse-live 2s infinite;
                    }
                    .kb-style-hover.kb-live-hover { outline-color: #f87171 !important; }
                `;
                doc.head.appendChild(style);

                // Define handlers
                const handleClick = (e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const target = e.target as HTMLElement;
                    if (target === doc.body || target === doc.documentElement) {
                        setSelectedEl(null);
                        return;
                    }

                    // Manage classes
                    doc.querySelectorAll('.kb-style-selected').forEach(el => el.classList.remove('kb-style-selected'));
                    doc.querySelectorAll('.kb-live-selected').forEach(el => el.classList.remove('kb-live-selected'));
                    
                    if (isLive) {
                        target.classList.add('kb-live-selected');
                    } else {
                        target.classList.add('kb-style-selected');
                    }
                    setSelectedEl(target);
                };

                const handleOver = (e: Event) => {
                    const target = e.target as HTMLElement;
                    if (target !== doc.body && target !== doc.documentElement) {
                        target.classList.add('kb-style-hover');
                        if (isLive) target.classList.add('kb-live-hover');
                    }
                };

                const handleOut = (e: Event) => {
                    const target = e.target as HTMLElement;
                    target.classList.remove('kb-style-hover');
                    target.classList.remove('kb-live-hover');
                };

                // Attach
                doc.body.addEventListener('click', handleClick);
                doc.body.addEventListener('mouseover', handleOver);
                doc.body.addEventListener('mouseout', handleOut);

                return () => {
                    doc.body.removeEventListener('click', handleClick);
                    doc.body.removeEventListener('mouseover', handleOver);
                    doc.body.removeEventListener('mouseout', handleOut);
                    cleanup();
                };
            } else {
                cleanup();
                setSelectedEl(null);
            }
        };

        let cleanupFn: (() => void) | undefined;
        // Run setup
        if (iframe.contentDocument && iframe.contentDocument.readyState === 'complete') {
             cleanupFn = setupSelectionOverlay();
        } else {
            iframe.onload = () => {
                if (cleanupFn) cleanupFn();
                cleanupFn = setupSelectionOverlay();
            };
        }

        return () => {
            if (cleanupFn) cleanupFn();
        };

    }, [showStyleEditor, isLive, processedHtml]);

    // Update style values when selected element changes
    useEffect(() => {
        if (!selectedEl) return;
        const win = iframeRef.current?.contentWindow;
        if (!win) return;

        const comp = win.getComputedStyle(selectedEl);
        setStyleValues({
            color: rgbToHex(comp.color),
            backgroundColor: rgbToHex(comp.backgroundColor),
            fontSize: comp.fontSize,
            padding: comp.padding,
            margin: comp.margin,
            borderRadius: comp.borderRadius,
            maxWidth: comp.maxWidth,
            boxShadow: comp.boxShadow
        });
    }, [selectedEl]);

    const handleStyleChange = (prop: string, value: string) => {
        if (!selectedEl) return;
        
        const oldValue = (selectedEl.style as any)[prop];
        (selectedEl.style as any)[prop] = value;
        setStyleValues(prev => ({ ...prev, [prop]: value }));

        // History
        setStyleHistory(prev => [...prev, {
            element: selectedEl,
            property: prop,
            oldValue: oldValue || '',
            newValue: value
        }]);
        setStyleRedoStack([]);
    };

    const handleUndo = () => {
        if (showStyleEditor) {
            setStyleHistory(prev => {
                if (prev.length === 0) return prev;
                const newHistory = [...prev];
                const action = newHistory.pop()!;
                
                (action.element.style as any)[action.property] = action.oldValue;
                
                if (selectedEl === action.element) {
                    setStyleValues(v => ({ ...v, [action.property]: action.oldValue }));
                }

                setStyleRedoStack(redo => [...redo, action]);
                return newHistory;
            });
        } else {
            iframeRef.current?.contentDocument?.execCommand('undo');
        }
    };

    const handleRedo = () => {
        if (showStyleEditor) {
            setStyleRedoStack(prev => {
                if (prev.length === 0) return prev;
                const newRedo = [...prev];
                const action = newRedo.pop()!;
                
                (action.element.style as any)[action.property] = action.newValue;

                if (selectedEl === action.element) {
                    setStyleValues(v => ({ ...v, [action.property]: action.newValue }));
                }

                setStyleHistory(hist => [...hist, action]);
                return newRedo;
            });
        } else {
            iframeRef.current?.contentDocument?.execCommand('redo');
        }
    };

    const handleSaveEdit = () => {
        if (!iframeRef.current?.contentDocument) return;
        const doc = iframeRef.current.contentDocument;
        
        // 1. CLEANUP DOM
        // Remove selection specific elements
        const editorStyle = doc.getElementById('kb-style-editor-css');
        if (editorStyle) editorStyle.remove();
        
        const previewStyle = doc.getElementById('kb-edit-style');
        if (previewStyle) previewStyle.remove();

        // Cleanup classes and attributes
        const cleanNode = (node: Element) => {
            node.removeAttribute('contenteditable');
            node.classList.remove('editing-mode');
            node.classList.remove('kb-style-selected');
            node.classList.remove('kb-style-hover');
            node.classList.remove('kb-live-selected');
            node.classList.remove('kb-live-hover');
            // If class attribute is empty, remove it
            if (node.getAttribute('class') === '') node.removeAttribute('class');
            
            Array.from(node.children).forEach(child => cleanNode(child));
        };
        cleanNode(doc.body);

        // 2. Revert images: Swap data URL back to ID
        const imgs = doc.querySelectorAll('img[data-kb-id]');
        imgs.forEach(img => {
            const id = img.getAttribute('data-kb-id');
            if (id) {
                img.setAttribute('src', id);
                img.removeAttribute('data-kb-id');
            }
        });

        // 3. Get HTML
        let newHtml = doc.documentElement.outerHTML;
        
        // 4. Update Parent
        if (creation && onUpdateArtifact) {
            onUpdateArtifact(creation.id, newHtml);
        }
        setIsEditing(false);
        setShowStyleEditor(false);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setShowStyleEditor(false);
        setSelectedEl(null);
        // Force reset iframe content to original prop
        if (iframeRef.current) {
            iframeRef.current.srcdoc = processedHtml;
        }
    };

    // STRICT DOCX EXPORT (Standard Compatible)
    const handleExportDocx = async () => {
        if (!creation || !processedHtml) return;
        setIsExporting(true);

        try {
            const generator = new DocxGenerator();
            const blob = await generator.generate(processedHtml);
            
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${creation.name.replace(/[^a-z0-9]/gi, '_').substring(0, 50)}_KB.docx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Failed to generate DOCX:", error);
            alert("Failed to generate DOCX. Please try again.");
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportJson = () => {
        if (!creation) return;
        const dataStr = JSON.stringify(creation, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${creation.name}_artifact.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (!creation && !isLoading) {
        return (
            <div className={`h-full flex flex-col items-center justify-center bg-[#09090b] text-zinc-500 ${className}`}>
                <div className="p-4 rounded-full bg-zinc-900 mb-4 border border-zinc-800">
                    <CodeBracketIcon className="w-8 h-8 opacity-50" />
                </div>
                <p className="text-sm font-mono uppercase tracking-widest">No Artifact Loaded</p>
            </div>
        );
    }

  return (
    <div className={`flex flex-col h-full bg-[#121214] border-l border-zinc-800 ${className} ${isFullScreen ? '!fixed !inset-0 !z-[100] !w-screen !h-screen !border-0' : ''}`}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 bg-[#121214] shrink-0">
        <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {isLoading ? 'Compiling...' : (isEditing ? 'Text Edit Mode' : (showStyleEditor ? 'Style Mode' : (isLive ? 'Live Connection' : 'Preview')))}
            </span>
            {creation && (
                <span className="text-xs text-zinc-600 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                    {creation.name}
                </span>
            )}
        </div>
        
        {/* Actions */}
        {creation && (
            <div className="flex items-center space-x-2">
                {/* Mode Controls */}
                {!isEditing && !showStyleEditor ? (
                    <>
                        <button 
                            onClick={() => setIsEditing(true)}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg transition-all shadow-sm disabled:opacity-50"
                            title="Edit Content Text"
                        >
                            <PencilIcon className="w-4 h-4" />
                            <span>Edit Text</span>
                        </button>
                        <button 
                            onClick={() => setShowStyleEditor(true)}
                            disabled={isLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg transition-all shadow-sm disabled:opacity-50"
                            title="Edit Styles"
                        >
                            <PaintBrushIcon className="w-4 h-4" />
                            <span>Style</span>
                        </button>
                    </>
                ) : (
                    <>
                        {/* Undo / Redo - Enabled for both Text and Style modes */}
                         {(isEditing || showStyleEditor) && (
                             <div className="flex items-center space-x-1 border-r border-zinc-800 pr-2 mr-1">
                                <button
                                    onClick={handleUndo}
                                    disabled={showStyleEditor ? styleHistory.length === 0 : false}
                                    className={`p-1.5 rounded-md transition-colors ${
                                        (showStyleEditor && styleHistory.length === 0) 
                                        ? 'text-zinc-700 cursor-not-allowed' 
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                    }`}
                                    title="Undo"
                                >
                                    <ArrowUturnLeftIcon className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={showStyleEditor ? styleRedoStack.length === 0 : false}
                                    className={`p-1.5 rounded-md transition-colors ${
                                        (showStyleEditor && styleRedoStack.length === 0) 
                                        ? 'text-zinc-700 cursor-not-allowed' 
                                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                                    }`}
                                    title="Redo"
                                >
                                    <ArrowUturnRightIcon className="w-4 h-4" />
                                </button>
                            </div>
                         )}

                         <button 
                            onClick={handleSaveEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-lg transition-all shadow-sm"
                        >
                            <CheckIcon className="w-4 h-4" />
                            <span>Save</span>
                        </button>
                        <button 
                            onClick={handleCancelEdit}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-zinc-800 border border-transparent hover:border-zinc-700 rounded-lg transition-all"
                        >
                            <XMarkIcon className="w-4 h-4" />
                            <span>Cancel</span>
                        </button>
                    </>
                )}

                <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                {onToggleLive && (
                    <button 
                        onClick={onToggleLive}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all shadow-sm border ${isLive ? 'bg-red-500/20 text-red-200 border-red-500/40 hover:bg-red-500/30 shadow-red-900/20' : 'text-zinc-200 bg-zinc-800 border-zinc-700 hover:border-zinc-500'}`}
                        title={isLive ? "Stop Live Session" : "Start Live Editing"}
                    >
                        <BoltIcon className={`w-4 h-4 ${isLive ? 'animate-pulse' : ''}`} />
                        <span>{isLive ? 'Live Active' : 'Live Edit'}</span>
                    </button>
                )}

                <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                <button 
                    onClick={handleExportDocx}
                    disabled={isExporting || isEditing || showStyleEditor}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-zinc-200 bg-zinc-800 border border-zinc-700 hover:border-zinc-500 rounded-lg transition-all shadow-sm disabled:opacity-50"
                    title="Export as Standard Compatible Word Doc"
                >
                    {isExporting ? (
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <DocumentTextIcon className="w-4 h-4" />
                    )}
                    <span>Export DOCX</span>
                </button>
                <button 
                    onClick={handleExportJson}
                    className="p-2 text-zinc-400 bg-zinc-800/30 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700 rounded-lg transition-all"
                    title="Export JSON"
                >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                </button>

                <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                <button 
                    onClick={() => setIsFullScreen(!isFullScreen)}
                    className="p-2 text-zinc-400 bg-zinc-800/30 hover:bg-zinc-800 hover:text-white border border-transparent hover:border-zinc-700 rounded-lg transition-all"
                    title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
                >
                    {isFullScreen ? (
                        <ArrowsPointingInIcon className="w-4 h-4" />
                    ) : (
                        <ArrowsPointingOutIcon className="w-4 h-4" />
                    )}
                </button>
            </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-white w-full overflow-hidden">
        {/* Rich Live Assistant Overlay */}
        {isLoading && (
            <div className="absolute inset-0 z-50 bg-[#09090b]/90 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
                <div className="relative max-w-sm w-full p-8 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl flex flex-col items-center text-center">
                    
                    {/* Animated Avatar */}
                    <div className="relative mb-6">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <SparklesIcon className="w-8 h-8 text-blue-400 animate-pulse" />
                        </div>
                        {/* Orbiting dots */}
                        <div className="absolute inset-0 animate-spin-slow opacity-50">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-blue-400 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.8)]"></div>
                        </div>
                        <div className="absolute inset-0 animate-spin-reverse-slower opacity-30">
                            <div className="absolute bottom-1 right-1 w-1 h-1 bg-purple-400 rounded-full"></div>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-white mb-2 tracking-tight">Assistant Working</h3>
                    
                    {/* Live Progress Text */}
                    <div className="h-12 flex items-center justify-center w-full">
                        <p className="text-zinc-400 text-sm animate-pulse font-mono">
                            {loadingMessage || "Initializing generation..."}
                        </p>
                    </div>

                    {/* Simple Progress Bar */}
                    <div className="w-full h-1 bg-zinc-800 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-600 to-purple-600 w-1/2 animate-[shimmer_2s_infinite]"></div>
                    </div>
                </div>
            </div>
        )}

        {/* Style Editor Floating Panel */}
        {showStyleEditor && (
            <div className="absolute top-4 right-4 z-30 w-64 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/50 rounded-lg shadow-2xl p-4 animate-in fade-in slide-in-from-right-4">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-700">
                    <h3 className="text-xs font-bold text-zinc-100 uppercase tracking-wide flex items-center gap-2">
                        <PaintBrushIcon className="w-3 h-3 text-blue-400" /> Style Editor
                    </h3>
                    <button onClick={() => setShowStyleEditor(false)} className="text-zinc-500 hover:text-zinc-300">
                        <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                </div>
                
                {selectedEl ? (
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                             <div className="col-span-1">
                                <label className="block text-[10px] text-zinc-400 mb-1">Color</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="color" 
                                        value={styleValues.color}
                                        onChange={(e) => handleStyleChange('color', e.target.value)}
                                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" 
                                    />
                                    <span className="text-[10px] font-mono text-zinc-500">{styleValues.color}</span>
                                </div>
                             </div>
                             <div className="col-span-1">
                                <label className="block text-[10px] text-zinc-400 mb-1">Background</label>
                                <div className="flex items-center gap-2">
                                    <input 
                                        type="color" 
                                        value={styleValues.backgroundColor}
                                        onChange={(e) => handleStyleChange('backgroundColor', e.target.value)}
                                        className="w-6 h-6 rounded cursor-pointer bg-transparent border-none p-0" 
                                    />
                                </div>
                             </div>
                        </div>

                        <div>
                             <label className="block text-[10px] text-zinc-400 mb-1">Font Size</label>
                             <input 
                                type="text" 
                                value={styleValues.fontSize}
                                onChange={(e) => handleStyleChange('fontSize', e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                placeholder="16px"
                             />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2">
                             <div>
                                 <label className="block text-[10px] text-zinc-400 mb-1">Padding</label>
                                 <input 
                                    type="text" 
                                    value={styleValues.padding}
                                    onChange={(e) => handleStyleChange('padding', e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                    placeholder="0px"
                                 />
                             </div>
                             <div>
                                 <label className="block text-[10px] text-zinc-400 mb-1">Margin</label>
                                 <input 
                                    type="text" 
                                    value={styleValues.margin}
                                    onChange={(e) => handleStyleChange('margin', e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                    placeholder="0px"
                                 />
                             </div>
                        </div>
                         
                        <div>
                             <label className="block text-[10px] text-zinc-400 mb-1">Border Radius</label>
                             <input 
                                type="text" 
                                value={styleValues.borderRadius}
                                onChange={(e) => handleStyleChange('borderRadius', e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                placeholder="4px"
                             />
                        </div>

                        {/* Image Specific Controls */}
                        {selectedEl.tagName === 'IMG' && (
                             <>
                                <div className="mt-3 pt-3 border-t border-zinc-700/50">
                                    <h4 className="text-[10px] font-bold text-zinc-300 mb-2 uppercase tracking-wider">Image Styles</h4>
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <div>
                                            <label className="block text-[10px] text-zinc-400 mb-1">Max Width</label>
                                            <input 
                                                type="text" 
                                                value={styleValues.maxWidth}
                                                onChange={(e) => handleStyleChange('maxWidth', e.target.value)}
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                                placeholder="100%"
                                            />
                                        </div>
                                         <div>
                                            <label className="block text-[10px] text-zinc-400 mb-1">Shadow</label>
                                            <input 
                                                type="text" 
                                                value={styleValues.boxShadow}
                                                onChange={(e) => handleStyleChange('boxShadow', e.target.value)}
                                                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                                                placeholder="none"
                                            />
                                        </div>
                                    </div>
                                </div>
                             </>
                        )}
                    </div>
                ) : (
                    <div className="py-8 text-center">
                        <p className="text-xs text-zinc-500">Click an element in the preview to style it.</p>
                    </div>
                )}
            </div>
        )}
        
        {processedHtml ? (
            <iframe
                ref={iframeRef}
                title="Preview"
                srcDoc={processedHtml}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-same-origin"
            />
        ) : creation?.originalImage ? (
            // Fallback to showing image if no code yet
             creation.originalImage.startsWith('data:application/pdf') ? (
                <div className="w-full h-full bg-zinc-900"><PdfRenderer dataUrl={creation.originalImage} /></div>
             ) : (
                <div className="w-full h-full bg-zinc-900 flex items-center justify-center p-8">
                     <img src={creation.originalImage} alt="Reference" className="max-w-full max-h-full object-contain opacity-50" />
                </div>
             )
        ) : null}
      </div>
    </div>
  );
};
