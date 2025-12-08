
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { ArrowDownTrayIcon, CodeBracketIcon, DocumentTextIcon, PencilIcon, CheckIcon, XMarkIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, PaintBrushIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';
import { DocxGenerator } from '../lib/services/DocxGenerator';

interface LivePreviewProps {
  creation: Creation | null;
  isLoading: boolean;
  className?: string;
  imageMap?: Record<string, string>; // Map ID -> Data URL
  onUpdateArtifact?: (id: string, html: string) => void;
}

// Add type definition for the global pdfjsLib
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

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

export const LivePreview: React.FC<LivePreviewProps> = ({ creation, isLoading, className = "", imageMap = {}, onUpdateArtifact }) => {
    const [isExporting, setIsExporting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showStyleEditor, setShowStyleEditor] = useState(false);
    const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
    const [styleValues, setStyleValues] = useState({
        color: '#000000',
        backgroundColor: '#ffffff',
        fontSize: '',
        padding: '',
        margin: '',
        borderRadius: ''
    });

    const iframeRef = useRef<HTMLIFrameElement>(null);

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
                 
                 // If style editor is active, ensure content editable is OFF
                 if (showStyleEditor) {
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
    }, [isEditing, processedHtml, showStyleEditor]);

    // Handle Style Editor Mode Toggling
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe) return;

        const setupStyleEditor = () => {
            const doc = iframe.contentDocument;
            if (!doc) return;

            // Cleanup function
            const cleanup = () => {
                const style = doc.getElementById('kb-style-editor-css');
                if (style) style.remove();
                doc.querySelectorAll('.kb-style-selected').forEach(el => el.classList.remove('kb-style-selected'));
                doc.querySelectorAll('.kb-style-hover').forEach(el => el.classList.remove('kb-style-hover'));
                
                // Remove listeners if they were attached
                // Note: We use named functions in the scope of setupStyleEditor, so we can't easily remove them 
                // unless we keep references. Since we recreate them on each run, we need a way to clean up previous.
                // Simplified: We rely on the effect return cleanup.
            };

            if (showStyleEditor) {
                // Inject styles for selection/hover
                const style = doc.createElement('style');
                style.id = 'kb-style-editor-css';
                style.textContent = `
                    .kb-style-hover { outline: 2px dashed #60a5fa !important; cursor: pointer !important; }
                    .kb-style-selected { outline: 2px solid #3b82f6 !important; box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.2); }
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
                    target.classList.add('kb-style-selected');
                    setSelectedEl(target);
                };

                const handleOver = (e: Event) => {
                    const target = e.target as HTMLElement;
                    if (target !== doc.body && target !== doc.documentElement) {
                        target.classList.add('kb-style-hover');
                    }
                };

                const handleOut = (e: Event) => {
                    (e.target as HTMLElement).classList.remove('kb-style-hover');
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
             cleanupFn = setupStyleEditor();
        } else {
            iframe.onload = () => {
                if (cleanupFn) cleanupFn();
                cleanupFn = setupStyleEditor();
            };
        }

        return () => {
            if (cleanupFn) cleanupFn();
        };

    }, [showStyleEditor, processedHtml]);

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
            borderRadius: comp.borderRadius
        });
    }, [selectedEl]);

    const handleStyleChange = (prop: string, value: string) => {
        if (!selectedEl) return;
        (selectedEl.style as any)[prop] = value;
        setStyleValues(prev => ({ ...prev, [prop]: value }));
    };

    const handleUndo = () => {
        iframeRef.current?.contentDocument?.execCommand('undo');
    };

    const handleRedo = () => {
        iframeRef.current?.contentDocument?.execCommand('redo');
    };

    const handleSaveEdit = () => {
        if (!iframeRef.current?.contentDocument) return;
        const doc = iframeRef.current.contentDocument;
        
        // 1. CLEANUP DOM
        // Remove style editor specific elements
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

    // STRICT DOCX EXPORT (ServiceNow Compatible)
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
    <div className={`flex flex-col h-full bg-[#121214] border-l border-zinc-800 ${className}`}>
      {/* Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800 bg-[#121214] shrink-0">
        <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                {isLoading ? 'Compiling...' : (isEditing ? 'Text Edit Mode' : (showStyleEditor ? 'Style Mode' : 'Preview'))}
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
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors border border-transparent hover:border-zinc-700 disabled:opacity-50"
                            title="Edit Content Text"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                            <span>Edit Text</span>
                        </button>
                        <button 
                            onClick={() => setShowStyleEditor(true)}
                            disabled={isLoading}
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors border border-transparent hover:border-zinc-700 disabled:opacity-50"
                            title="Edit Styles"
                        >
                            <PaintBrushIcon className="w-3.5 h-3.5" />
                            <span>Style</span>
                        </button>
                    </>
                ) : (
                    <>
                        {/* Undo / Redo - Only for Text Edit really, but useful generally */}
                         {isEditing && (
                             <div className="flex items-center space-x-1 border-r border-zinc-800 pr-2 mr-1">
                                <button
                                    onClick={handleUndo}
                                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                                    title="Undo"
                                >
                                    <ArrowUturnLeftIcon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={handleRedo}
                                    className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
                                    title="Redo"
                                >
                                    <ArrowUturnRightIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                         )}

                         <button 
                            onClick={handleSaveEdit}
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors border border-emerald-500/20"
                        >
                            <CheckIcon className="w-3.5 h-3.5" />
                            <span>Save</span>
                        </button>
                        <button 
                            onClick={handleCancelEdit}
                            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800 rounded-md transition-colors"
                        >
                            <XMarkIcon className="w-3.5 h-3.5" />
                            <span>Cancel</span>
                        </button>
                    </>
                )}

                <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                <button 
                    onClick={handleExportDocx}
                    disabled={isExporting || isEditing || showStyleEditor}
                    className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors border border-transparent hover:border-zinc-700 disabled:opacity-50"
                    title="Export as ServiceNow Compatible Word Doc"
                >
                    {isExporting ? (
                        <div className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <DocumentTextIcon className="w-3.5 h-3.5" />
                    )}
                    <span>Export DOCX</span>
                </button>
                <button 
                    onClick={handleExportJson}
                    className="p-1.5 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors"
                    title="Export JSON"
                >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
            </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 relative bg-white w-full overflow-hidden">
        {isLoading && (
            <div className="absolute inset-0 z-20 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-white">
                    <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                    <span className="text-xs font-mono animate-pulse">GENERATING ARTIFACT...</span>
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
