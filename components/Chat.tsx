
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect } from 'react';
import { PaperClipIcon, CodeBracketIcon, SparklesIcon, PhotoIcon, CameraIcon, PencilSquareIcon, MicrophoneIcon, XMarkIcon, PlusIcon, BoltIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  artifact?: Creation; // If the model generated something, it's attached here
  attachments?: {
    type: 'image' | 'pdf';
    url: string;
    category?: 'source' | 'screenshot';
  }[];
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (text: string, files?: File[], fileType?: 'source' | 'screenshot') => void;
  isGenerating: boolean;
  onSelectArtifact: (creation: Creation) => void;
  activeArtifactId?: string;
  onStartLive?: () => void;
  isLive?: boolean;
}

export const Chat: React.FC<ChatProps> = ({ 
  messages, 
  onSendMessage, 
  isGenerating, 
  onSelectArtifact,
  activeArtifactId,
  onStartLive,
  isLive
}) => {
  const [isListening, setIsListening] = useState(false);
  const [showImprovementMenu, setShowImprovementMenu] = useState(false);
  
  // Refinement Dialog State
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refineFiles, setRefineFiles] = useState<File[]>([]);
  
  // Add Context Dialog State (Screenshots)
  const [showAddContextDialog, setShowAddContextDialog] = useState(false);
  const [contextPrompt, setContextPrompt] = useState('');
  const [contextFiles, setContextFiles] = useState<File[]>([]);

  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const refineInputRef = useRef<HTMLTextAreaElement>(null);
  const contextInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus inputs when dialogs open
  useEffect(() => {
    if (showRefineDialog && refineInputRef.current) {
      refineInputRef.current.focus();
    }
  }, [showRefineDialog]);

  useEffect(() => {
    if (showAddContextDialog && contextInputRef.current) {
      contextInputRef.current.focus();
    }
  }, [showAddContextDialog]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = (target: 'refine' | 'context') => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        const setter = target === 'refine' ? setRefinePrompt : setContextPrompt;
        
        setter((prev) => {
           const trimmedPrev = prev.trim();
           return trimmedPrev ? `${trimmedPrev} ${transcript}` : transcript;
        });
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
            setIsListening(false);
            return;
        }
        setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const handleRefineSubmit = () => {
    if (!refinePrompt.trim() && refineFiles.length === 0) return;
    onSendMessage(refinePrompt, refineFiles.length > 0 ? refineFiles : undefined, 'source');
    setRefinePrompt('');
    setRefineFiles([]);
    setShowRefineDialog(false);
  };

  const handleAddContextSubmit = () => {
    if (contextFiles.length === 0) {
        alert("Please add at least one screenshot for context.");
        return;
    }
    onSendMessage(contextPrompt || "Analyze these screenshots for context.", contextFiles, 'screenshot');
    setContextPrompt('');
    setContextFiles([]);
    setShowAddContextDialog(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'refine' | 'context') => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      if (target === 'refine') {
        setRefineFiles(prev => [...prev, ...newFiles]);
      } else {
        setContextFiles(prev => [...prev, ...newFiles]);
      }
    }
    e.target.value = '';
  };

  const removeFile = (index: number, target: 'refine' | 'context') => {
      if (target === 'refine') {
        setRefineFiles(prev => prev.filter((_, i) => i !== index));
      } else {
        setContextFiles(prev => prev.filter((_, i) => i !== index));
      }
  };

  const handleSuggestion = (prompt: string) => {
    onSendMessage(prompt);
  };

  return (
    <div className="relative flex flex-col h-full bg-[#0E0E10] border-r border-zinc-800">
      
      {/* Refine Content Modal */}
      {showRefineDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <PencilSquareIcon className="w-4 h-4 text-blue-400" />
                  Refine Content
              </h3>
              <button onClick={() => setShowRefineDialog(false)} className="text-zinc-500 hover:text-zinc-300">
                  <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] text-zinc-400 font-medium uppercase tracking-tight">Refinement Details & Context Files</p>
                {refineFiles.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                        {refineFiles.map((f, i) => (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-300">
                                <PaperClipIcon className="w-2.5 h-2.5" />
                                <span className="truncate max-w-[120px]">{f.name}</span>
                                <button onClick={() => removeFile(i, 'refine')} className="hover:text-white ml-1"><XMarkIcon className="w-3 h-3" /></button>
                            </div>
                        ))}
                    </div>
                )}
              </div>
              
              <div className="relative">
                <textarea
                    ref={refineInputRef}
                    value={refinePrompt}
                    onChange={(e) => setRefinePrompt(e.target.value)}
                    placeholder="Describe adjustments... (Source files added here will be used as context only)"
                    className="w-full h-32 bg-black/20 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none placeholder-zinc-600 leading-relaxed"
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-zinc-900/80 p-1 rounded-lg backdrop-blur-sm border border-zinc-800">
                   <button 
                        onClick={() => toggleListening('refine')}
                        className={`p-1.5 rounded-md hover:bg-zinc-800 transition-colors ${isListening ? 'text-red-500 animate-pulse bg-red-500/10' : 'text-zinc-500'}`}
                        title="Voice Input"
                    >
                        <MicrophoneIcon className="w-4 h-4" />
                    </button>
                    <button 
                        onClick={() => sourceInputRef.current?.click()}
                        className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                        title="Add Reference Source File"
                    >
                        <PlusIcon className="w-4 h-4" />
                    </button>
                    <input ref={sourceInputRef} type="file" className="hidden" accept="image/*,application/pdf" multiple onChange={(e) => handleFileSelect(e, 'refine')} />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                  <button 
                      onClick={() => setShowRefineDialog(false)}
                      className="px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={handleRefineSubmit}
                      disabled={!refinePrompt.trim() && refineFiles.length === 0}
                      className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all"
                  >
                      Update Content
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Context Modal (Screenshots) */}
      {showAddContextDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <CameraIcon className="w-4 h-4 text-purple-400" />
                  Add Screenshot Context
              </h3>
              <button onClick={() => setShowAddContextDialog(false)} className="text-zinc-500 hover:text-zinc-300">
                  <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="space-y-3">
                <p className="text-xs text-zinc-400 leading-relaxed">
                    Upload screenshots of your UI or error states for visual evidence and troubleshooting.
                </p>
                
                <div 
                    onClick={() => screenshotInputRef.current?.click()}
                    className="group border-2 border-dashed border-zinc-800 hover:border-purple-500/50 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer bg-black/10 transition-all"
                >
                    {contextFiles.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-2">
                            {contextFiles.map((f, i) => (
                                <div key={i} className="relative w-12 h-12 rounded border border-zinc-700 overflow-hidden">
                                     <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center"><PhotoIcon className="w-6 h-6 text-purple-400/50" /></div>
                                     <button onClick={(e) => { e.stopPropagation(); removeFile(i, 'context'); }} className="absolute top-0 right-0 bg-black/50 text-white p-0.5 rounded-bl hover:bg-red-500 transition-colors z-10"><XMarkIcon className="w-3 h-3" /></button>
                                </div>
                            ))}
                            <div className="w-12 h-12 rounded border border-dashed border-zinc-700 flex items-center justify-center text-zinc-600 hover:text-purple-400"><PlusIcon className="w-5 h-5" /></div>
                        </div>
                    ) : (
                        <>
                            <div className="p-3 bg-purple-500/10 rounded-full mb-2 group-hover:scale-110 transition-transform">
                                <PhotoIcon className="w-6 h-6 text-purple-400" />
                            </div>
                            <span className="text-xs font-medium text-zinc-500 group-hover:text-purple-300">Click to add screenshots</span>
                        </>
                    )}
                    <input ref={screenshotInputRef} type="file" className="hidden" accept="image/*" multiple onChange={(e) => handleFileSelect(e, 'context')} />
                </div>
              </div>
              
              <div className="relative">
                <textarea
                    ref={contextInputRef}
                    value={contextPrompt}
                    onChange={(e) => setContextPrompt(e.target.value)}
                    placeholder="Specific analysis instructions for these screenshots..."
                    className="w-full h-24 bg-black/20 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none placeholder-zinc-600"
                />
                 <button 
                    onClick={() => toggleListening('context')}
                    className={`absolute bottom-3 right-3 p-1.5 rounded-md hover:bg-zinc-800 transition-colors ${isListening ? 'text-red-500 animate-pulse bg-red-500/10' : 'text-zinc-500'}`}
                    title="Voice Input"
                >
                    <MicrophoneIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-end gap-2">
                  <button 
                      onClick={() => setShowAddContextDialog(false)}
                      className="px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={handleAddContextSubmit}
                      disabled={contextFiles.length === 0}
                      className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-lg shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all"
                  >
                      Analyze Context
                  </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Chat History */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-6 scroll-smooth"
      >
        {messages.length === 0 && (
           <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-8">
               <SparklesIcon className="w-12 h-12 mb-4 text-zinc-500" />
               <p className="text-zinc-400 font-medium">Start by uploading source notes or screenshots.</p>
           </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] sm:max-w-[85%] space-y-2`}>
              
              {/* Message Bubble */}
              <div 
                className={`
                  p-3 sm:p-4 rounded-2xl text-sm sm:text-base leading-relaxed whitespace-pre-wrap
                  ${msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-sm' 
                    : 'bg-zinc-800 text-zinc-200 rounded-tl-sm shadow-xl'
                  }
                `}
              >
                {/* Attachments Preview */}
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                         {msg.attachments.map((att, idx) => (
                             <div key={idx} className="rounded-lg overflow-hidden border border-white/10 bg-black/20 max-w-[200px] shadow-lg">
                                {att.type === 'image' && (
                                     <div className="relative group">
                                       <img src={att.url} className="w-full h-auto max-h-48 object-cover transition-transform group-hover:scale-105" alt={`Attachment ${idx}`} />
                                       {att.category && (
                                         <span className={`absolute bottom-1 right-1 px-1.5 py-0.5 text-[10px] text-white rounded backdrop-blur-md uppercase font-bold ${att.category === 'screenshot' ? 'bg-purple-600/60' : 'bg-blue-600/60'}`}>
                                           {att.category}
                                         </span>
                                       )}
                                     </div>
                                 )}
                                 {att.type === 'pdf' && (
                                     <div className="flex items-center gap-2 p-3 text-xs font-mono">
                                         <PaperClipIcon className="w-4 h-4 text-zinc-400" />
                                         Source Doc
                                         <span className="ml-auto px-1.5 py-0.5 bg-white/10 rounded uppercase text-[9px]">REF</span>
                                     </div>
                                 )}
                             </div>
                         ))}
                    </div>
                )}
                {msg.content}
              </div>

              {/* Artifact Card */}
              {msg.artifact && (
                <button
                  onClick={() => msg.artifact && onSelectArtifact(msg.artifact)}
                  className={`
                    w-full group flex items-center gap-3 p-3 rounded-xl border transition-all text-left
                    ${activeArtifactId === msg.artifact.id 
                       ? 'bg-blue-500/10 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.2)]' 
                       : 'bg-zinc-900 border-zinc-700 hover:border-zinc-500'
                    }
                  `}
                >
                  <div className={`
                    p-2 rounded-lg 
                    ${activeArtifactId === msg.artifact.id ? 'bg-blue-500 text-white' : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'}
                  `}>
                    <CodeBracketIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-sm font-medium truncate ${activeArtifactId === msg.artifact.id ? 'text-blue-400' : 'text-zinc-300'}`}>
                        {msg.artifact.name}
                    </h4>
                    <p className="text-xs text-zinc-500 truncate">
                        v{msg.timestamp.toLocaleTimeString()} • Click to view
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
        ))}
        
        {isGenerating && (
            <div className="flex justify-start">
                <div className="bg-zinc-800 p-4 rounded-2xl rounded-tl-sm flex items-center gap-2 shadow-lg">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        )}
      </div>

      {/* Input Area (Quick Actions Area Only) */}
      <div className="p-4 bg-[#0E0E10] border-t border-zinc-800 shadow-[0_-10px_20px_rgba(0,0,0,0.3)]">
        
        {/* Quick Actions Area */}
        {activeArtifactId && !isGenerating && (
          <div className="flex flex-wrap justify-center gap-3 mb-1 px-1 items-center min-h-[44px]">
             {!showImprovementMenu ? (
                 <>
                    {/* Live Pulse - Toggle via App state */}
                    {onStartLive && (
                        <button
                            onClick={onStartLive}
                            className={`flex items-center gap-2 px-5 py-2.5 text-xs rounded-full border transition-all whitespace-nowrap font-bold uppercase tracking-tight ${
                                isLive 
                                ? 'bg-purple-600 text-white border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.4)]' 
                                : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/60 hover:border-purple-400'
                            }`}
                            title="Start Live Voice Session: Talk to the assistant to edit the document in real-time."
                        >
                            <BoltIcon className={`w-4 h-4 ${isLive ? 'animate-pulse' : ''}`} />
                            <span>Live Pulse</span>
                        </button>
                    )}

                    {/* Add Context - Purple (Order: 1) */}
                    <button
                        onClick={() => setShowAddContextDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 text-xs rounded-full border border-purple-500/60 hover:border-purple-400 transition-all whitespace-nowrap font-bold uppercase tracking-tight shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                        title="Add Visual Context: Upload UI screenshots or error messages to help the AI troubleshoot specific layout or functional issues."
                    >
                        <CameraIcon className="w-4 h-4" />
                        <span>Add Context</span>
                    </button>

                    {/* Refine Content - Blue (Order: 2) */}
                    <button 
                        onClick={() => setShowRefineDialog(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 text-xs rounded-full border border-blue-500/60 hover:border-blue-400 transition-all whitespace-nowrap font-bold uppercase tracking-tight shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                        title="Update Existing Content: Supply reference PDFs, text notes, or voice instructions to iterate on the document's facts and flow."
                    >
                        <PencilSquareIcon className="w-4 h-4" />
                        <span>Refine Content</span>
                    </button>

                    {/* Suggest Improvements - Emerald (Order: 3) */}
                    <button 
                        onClick={() => setShowImprovementMenu(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-200 text-xs rounded-full border border-emerald-500/60 hover:border-emerald-400 transition-all whitespace-nowrap font-bold uppercase tracking-tight shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                        title="Get Smart Suggestions: Let the AI review your document structure for formatting, clarity, and missing logical steps."
                    >
                        <SparklesIcon className="w-4 h-4" />
                        <span>Suggest Improvements</span>
                    </button>
                 </>
             ) : (
                <div className="flex flex-wrap justify-center items-center gap-3 animate-in slide-in-from-left-2 duration-200 w-full">
                    <button onClick={() => setShowImprovementMenu(false)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors shrink-0">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider hidden sm:inline shrink-0">Improve:</span>
                    
                    <button 
                       onClick={() => { handleSuggestion("Review the article structure and strictly enforce standard KB formatting rules (Headers, Spacing, Image placement). Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 text-[10px] font-bold uppercase tracking-tight rounded-full border border-emerald-500/60 whitespace-nowrap transition-colors shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                       title="Normalize Structure: Enforce standard technical documentation hierarchy and styling."
                    >
                       Fix Format
                    </button>
                    <button 
                       onClick={() => { handleSuggestion("Analyze the content for clarity and rewrite ambiguous sections to be concise, direct, and professional. Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 text-[10px] font-bold uppercase tracking-tight rounded-full border border-emerald-500/60 whitespace-nowrap transition-colors shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                       title="Polished Writing: Enhance readability and professional tone throughout the document."
                    >
                       Enhance Clarity
                    </button>
                     <button 
                       onClick={() => { handleSuggestion("Audit the article for potential missing steps, prerequisites, safety warnings, or logic gaps. Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-5 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100 text-[10px] font-bold uppercase tracking-tight rounded-full border border-emerald-500/60 whitespace-nowrap transition-colors shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                       title="Quality Audit: Identify and fill missing safety warnings or technical prerequisites."
                    >
                       Find Gaps
                    </button>
                </div>
             )}
          </div>
        )}
        
        <p className="text-[10px] text-center text-zinc-600 mt-3 font-medium tracking-wide">
            AI can make mistakes. Review generated documentation carefully.
        </p>
      </div>
    </div>
  );
};
