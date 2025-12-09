
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect } from 'react';
import { PaperAirplaneIcon, PaperClipIcon, CodeBracketIcon, SparklesIcon, PhotoIcon, CameraIcon, PencilSquareIcon, MicrophoneIcon, XMarkIcon } from '@heroicons/react/24/outline';
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
}

export const Chat: React.FC<ChatProps> = ({ 
  messages, 
  onSendMessage, 
  isGenerating, 
  onSelectArtifact,
  activeArtifactId 
}) => {
  const [input, setInput] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadType, setUploadType] = useState<'source' | 'screenshot'>('source');
  
  const [isListening, setIsListening] = useState(false);
  const [showImprovementMenu, setShowImprovementMenu] = useState(false);
  
  // Refinement Dialog State
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  
  const recognitionRef = useRef<any>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);
  const refineInputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus refine input when dialog opens
  useEffect(() => {
    if (showRefineDialog && refineInputRef.current) {
      refineInputRef.current.focus();
    }
  }, [showRefineDialog]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
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

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => {
           // Append nicely
           const trimmedPrev = prev.trim();
           return trimmedPrev ? `${trimmedPrev} ${transcript}` : transcript;
        });
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || isGenerating) return;
    
    // Default to 'source' if not specified
    onSendMessage(input, selectedFiles.length > 0 ? selectedFiles : undefined, selectedFiles.length > 0 ? uploadType : undefined);
    setInput('');
    setSelectedFiles([]);
    setUploadType('source'); // Reset to default
    setShowImprovementMenu(false);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
      setUploadType('source'); // Default drag-and-drop to source
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'source' | 'screenshot') => {
    if (e.target.files && e.target.files.length > 0) {
      // Append files or replace? Let's append if type matches, or replace if different type (simpler UX for now to replace to avoid mixed types)
      setSelectedFiles(prev => {
          if (uploadType !== type) return Array.from(e.target.files!);
          return [...prev, ...Array.from(e.target.files!)];
      });
      setUploadType(type);
    }
    // Reset value to allow selecting same files again
    e.target.value = '';
  };

  const removeFile = (index: number) => {
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSuggestion = (prompt: string) => {
    onSendMessage(prompt);
  };

  const handleRefineSubmit = () => {
    if (!refinePrompt.trim()) return;
    onSendMessage(refinePrompt);
    setRefinePrompt('');
    setShowRefineDialog(false);
  };

  return (
    <div className="relative flex flex-col h-full bg-[#0E0E10] border-r border-zinc-800">
      
      {/* Refine Dialog Overlay */}
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
              <p className="text-xs text-zinc-400">
                  Describe how you want to change or improve the document.
              </p>
              <textarea
                  ref={refineInputRef}
                  value={refinePrompt}
                  onChange={(e) => setRefinePrompt(e.target.value)}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleRefineSubmit();
                      }
                  }}
                  placeholder="e.g., Change the tone to be more friendly, add a section about API keys, fix the typo in step 2..."
                  className="w-full h-32 bg-black/20 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none placeholder-zinc-600"
              />
              <div className="flex justify-end gap-2">
                  <button 
                      onClick={() => setShowRefineDialog(false)}
                      className="px-3 py-2 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                  >
                      Cancel
                  </button>
                  <button 
                      onClick={handleRefineSubmit}
                      disabled={!refinePrompt.trim()}
                      className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                      Refine
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
                    : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'
                  }
                `}
              >
                {/* Attachments Preview */}
                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                         {msg.attachments.map((att, idx) => (
                             <div key={idx} className="rounded-lg overflow-hidden border border-white/10 bg-black/20 max-w-[200px]">
                                {att.type === 'image' && (
                                     <div className="relative">
                                       <img src={att.url} className="w-full h-auto max-h-48 object-cover" alt={`Attachment ${idx}`} />
                                       {att.category && (
                                         <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 text-[10px] text-white rounded backdrop-blur-sm uppercase">
                                           {att.category}
                                         </span>
                                       )}
                                     </div>
                                 )}
                                 {att.type === 'pdf' && (
                                     <div className="flex items-center gap-2 p-3 text-xs font-mono">
                                         <PhotoIcon className="w-4 h-4" />
                                         PDF Doc
                                         <span className="ml-auto px-1.5 py-0.5 bg-white/10 rounded uppercase">Source</span>
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
                <div className="bg-zinc-800 p-4 rounded-2xl rounded-tl-sm flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#0E0E10] border-t border-zinc-800">
        
        {/* Quick Actions for Active Artifact */}
        {activeArtifactId && !isGenerating && (
          <div className="flex gap-2 mb-3 px-1 overflow-x-auto scrollbar-hide items-center min-h-[32px]">
             {!showImprovementMenu ? (
                 <>
                     <button 
                        onClick={() => setShowImprovementMenu(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/20 transition-colors whitespace-nowrap"
                     >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        Suggest Improvements
                     </button>
                     <button 
                        onClick={() => setShowRefineDialog(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs rounded-full border border-blue-500/20 transition-colors whitespace-nowrap"
                     >
                        <PencilSquareIcon className="w-3.5 h-3.5" />
                        Refine Content
                     </button>
                 </>
             ) : (
                <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-200 w-full">
                    <button onClick={() => setShowImprovementMenu(false)} className="p-1 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors shrink-0">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider hidden sm:inline shrink-0">Improve:</span>
                    
                    <button 
                       onClick={() => { handleSuggestion("Review the article structure and strictly enforce standard KB formatting rules (Headers, Spacing, Image placement). Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/20 whitespace-nowrap transition-colors"
                    >
                       Fix Format
                    </button>
                    <button 
                       onClick={() => { handleSuggestion("Analyze the content for clarity and rewrite ambiguous sections to be concise, direct, and professional. Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/20 whitespace-nowrap transition-colors"
                    >
                       Enhance Clarity
                    </button>
                     <button 
                       onClick={() => { handleSuggestion("Audit the article for potential missing steps, prerequisites, safety warnings, or logic gaps. Regenerate the FULL HTML."); setShowImprovementMenu(false); }}
                       className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs rounded-full border border-emerald-500/20 whitespace-nowrap transition-colors"
                    >
                       Find Gaps
                    </button>
                </div>
             )}
          </div>
        )}

        {/* Selected Files Preview Chip Area */}
        {selectedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2 px-1">
                {selectedFiles.map((file, idx) => (
                    <div key={idx} className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded border animate-in fade-in slide-in-from-bottom-2 duration-300 ${uploadType === 'screenshot' ? 'bg-purple-500/10 border-purple-500/30 text-purple-200' : 'bg-blue-500/10 border-blue-500/30 text-blue-200'}`}>
                        <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                            {uploadType === 'screenshot' ? <CameraIcon className="w-3 h-3 flex-shrink-0" /> : <PaperClipIcon className="w-3 h-3 flex-shrink-0" />}
                            <span className="truncate">{file.name}</span>
                        </div>
                        <button onClick={() => removeFile(idx)} className="opacity-60 hover:opacity-100 ml-1 rounded-full hover:bg-white/10 p-0.5"><XMarkIcon className="w-3 h-3" /></button>
                    </div>
                ))}
            </div>
        )}

        <form 
            onSubmit={handleSubmit}
            className={`
                relative flex items-end gap-2 p-2 rounded-xl bg-zinc-900 border transition-colors
                ${dragActive ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-700 focus-within:border-zinc-600'}
            `}
            onDragEnter={handleDrag} 
            onDragLeave={handleDrag} 
            onDragOver={handleDrag} 
            onDrop={handleDrop}
        >
          {dragActive && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-900/90 backdrop-blur-sm rounded-xl">
                  <span className="text-blue-400 font-medium">Drop to upload files</span>
              </div>
          )}

          {/* Screenshot Upload Button - IMPROVED VISIBILITY */}
          <div className="relative group/btn">
            <button
              type="button"
              onClick={() => screenshotInputRef.current?.click()}
              className={`
                flex items-center gap-2 p-2 sm:px-3 sm:py-2 rounded-lg transition-all border
                ${selectedFiles.length > 0 && uploadType === 'screenshot' 
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                  : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/50 hover:bg-purple-500/10 hover:text-purple-300 hover:border-purple-500/30'
                }
              `}
              title="Upload Context Screenshots"
            >
              <CameraIcon className="w-5 h-5" />
              <span className="hidden sm:inline text-xs font-medium">Add Context</span>
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-xs text-zinc-300 rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap border border-zinc-700">
              Upload Screenshot (Context)
            </div>
            <input 
               ref={screenshotInputRef}
               type="file" 
               className="hidden" 
               accept="image/*"
               multiple
               onChange={(e) => handleFileSelect(e, 'screenshot')}
            />
          </div>

          {/* Source/File Button */}
          <div className="relative group/btn">
            <button
              type="button"
              onClick={() => sourceInputRef.current?.click()}
              className={`
                 p-2 rounded-lg transition-colors border
                 ${selectedFiles.length > 0 && uploadType === 'source' 
                    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                    : 'bg-zinc-800/50 text-zinc-400 border-transparent hover:bg-zinc-800 hover:text-zinc-200'
                 }
              `}
              title="Upload Source (Notes/PDF)"
            >
              <PaperClipIcon className="w-5 h-5" />
            </button>
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-zinc-800 text-xs text-zinc-300 rounded opacity-0 group-hover/btn:opacity-100 pointer-events-none whitespace-nowrap border border-zinc-700">
              Upload Source (Notes/PDF)
            </div>
            <input 
               ref={sourceInputRef}
               type="file" 
               className="hidden" 
               accept="image/*,application/pdf"
               multiple
               onChange={(e) => handleFileSelect(e, 'source')}
            />
          </div>

          {/* Text Input */}
          <div className="flex-1 min-w-0 flex flex-col">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit();
                    }
                }}
                placeholder={messages.length > 0 ? "Ask for changes or add context..." : "Type instructions or upload..."}
                className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none max-h-32 py-2 text-sm"
                rows={1}
                style={{ minHeight: '40px' }}
              />
          </div>

          {/* Microphone Button */}
          <button
            type="button"
            onClick={toggleListening}
            className={`
                p-2 rounded-lg transition-all
                ${isListening 
                    ? 'bg-red-500/20 text-red-500 animate-pulse' 
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }
            `}
            title="Voice Input"
          >
            <MicrophoneIcon className="w-5 h-5" />
          </button>

          {/* Send Button */}
          <button
            type="submit"
            disabled={(!input.trim() && selectedFiles.length === 0) || isGenerating}
            className={`
                p-2 rounded-lg transition-all
                ${(!input.trim() && selectedFiles.length === 0) || isGenerating
                    ? 'bg-zinc-800 text-zinc-600' 
                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20'
                }
            `}
          >
            <PaperAirplaneIcon className="w-5 h-5" />
          </button>
        </form>
        <p className="text-[10px] text-center text-zinc-600 mt-2">
            AI can make mistakes. Review generated code.
        </p>
      </div>
    </div>
  );
};
