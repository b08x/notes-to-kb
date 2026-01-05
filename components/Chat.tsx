
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useRef, useEffect } from 'react';
import { PaperClipIcon, CodeBracketIcon, SparklesIcon, PhotoIcon, CameraIcon, PencilSquareIcon, MicrophoneIcon, XMarkIcon, PlusIcon, BoltIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';
import { InputArea } from './InputArea';

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
  artifact?: Creation; 
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
  isLive?: boolean;
}

export const Chat: React.FC<ChatProps> = ({ 
  messages, 
  onSendMessage, 
  isGenerating, 
  onSelectArtifact,
  activeArtifactId,
  isLive
}) => {
  const [showImprovementMenu, setShowImprovementMenu] = useState(false);
  const [showRefineDialog, setShowRefineDialog] = useState(false);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [refineFiles, setRefineFiles] = useState<File[]>([]);
  
  const [showAddContextDialog, setShowAddContextDialog] = useState(false);
  const [contextPrompt, setContextPrompt] = useState('');
  const [contextFiles, setContextFiles] = useState<File[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleRefineSubmit = () => {
    if (!refinePrompt.trim() && refineFiles.length === 0) return;
    onSendMessage(refinePrompt, refineFiles.length > 0 ? refineFiles : undefined, 'source');
    setRefinePrompt('');
    setRefineFiles([]);
    setShowRefineDialog(false);
  };

  const handleAddContextSubmit = () => {
    if (contextFiles.length === 0) return;
    onSendMessage(contextPrompt || "Analyze these screenshots for context.", contextFiles, 'screenshot');
    setContextPrompt('');
    setContextFiles([]);
    setShowAddContextDialog(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'refine' | 'context') => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      if (target === 'refine') setRefineFiles(prev => [...prev, ...newFiles]);
      else setContextFiles(prev => [...prev, ...newFiles]);
    }
    e.target.value = '';
  };

  const removeFile = (index: number, target: 'refine' | 'context') => {
      if (target === 'refine') setRefineFiles(prev => prev.filter((_, i) => i !== index));
      else setContextFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="relative flex flex-col h-full bg-[#0c0c0e]">
      
      {/* Refine Modal Overlay */}
      {showRefineDialog && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/40">
              <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <PencilSquareIcon className="w-4 h-4 text-blue-500" />
                  Update Article
              </h3>
              <button onClick={() => setShowRefineDialog(false)} className="text-zinc-500 hover:text-white transition-colors">
                  <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                placeholder="Instructions for refinement..."
                className="w-full h-32 bg-black border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 focus:outline-none focus:border-blue-500 resize-none placeholder-zinc-700"
              />
              <div className="flex flex-wrap gap-2">
                 {refineFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] text-blue-300 font-bold">
                        <span className="truncate max-w-[100px]">{f.name}</span>
                        <button onClick={() => removeFile(i, 'refine')}><XMarkIcon className="w-3 h-3" /></button>
                    </div>
                 ))}
                 <button onClick={() => sourceInputRef.current?.click()} className="flex items-center gap-1 px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-[10px] rounded-lg border border-zinc-700 transition-colors">
                    <PlusIcon className="w-3 h-3" /> Add Files
                 </button>
                 <input ref={sourceInputRef} type="file" className="hidden" multiple onChange={(e) => handleFileSelect(e, 'refine')} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowRefineDialog(false)} className="text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 px-4">Cancel</button>
                  <button onClick={handleRefineSubmit} className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black uppercase px-6 py-2 rounded-lg shadow-lg shadow-blue-900/20">Refine Protocol</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Message Stream */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-5 space-y-8 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-2 px-1">
                <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{msg.role === 'user' ? 'User Signal' : 'Assistant Node'}</span>
                <span className="text-[8px] font-medium text-zinc-800">{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
            </div>
            
            <div className={`
              max-w-[95%] p-4 rounded-2xl text-[13px] leading-relaxed shadow-sm
              ${msg.role === 'user' 
                ? 'bg-blue-600/10 text-blue-50 border border-blue-500/20 rounded-tr-sm' 
                : 'bg-zinc-900 text-zinc-300 border border-zinc-800 rounded-tl-sm'
              }
            `}>
              {msg.attachments && (
                  <div className="mb-3 flex flex-wrap gap-2">
                       {msg.attachments.map((att, idx) => (
                           <div key={idx} className="rounded-lg overflow-hidden border border-zinc-800 bg-black/40 shadow-xl max-w-[150px]">
                               {att.type === 'image' && <img src={att.url} className="w-full h-auto object-cover opacity-80" alt="Context" />}
                               {att.type === 'pdf' && <div className="p-3 text-[10px] font-bold text-zinc-500 flex items-center gap-2"><PaperClipIcon className="w-3 h-3" /> DOC_SRC</div>}
                           </div>
                       ))}
                  </div>
              )}
              {msg.content}
            </div>

            {msg.artifact && (
              <button
                onClick={() => msg.artifact && onSelectArtifact(msg.artifact)}
                className={`
                  w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group
                  ${activeArtifactId === msg.artifact.id 
                     ? 'bg-emerald-600/10 border-emerald-500/40 shadow-inner' 
                     : 'bg-black border-zinc-800 hover:border-zinc-700'
                  }
                `}
              >
                <div className={`p-2 rounded-lg ${activeArtifactId === msg.artifact.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-900 text-zinc-500 group-hover:text-zinc-300'}`}>
                    <CodeBracketIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className={`text-[11px] font-bold truncate ${activeArtifactId === msg.artifact.id ? 'text-emerald-300' : 'text-zinc-400'}`}>
                        {msg.artifact.name}
                    </h4>
                    <p className="text-[9px] text-zinc-600 uppercase font-black tracking-tighter">Click to activate workspace</p>
                </div>
              </button>
            )}
          </div>
        ))}
        {isGenerating && (
            <div className="flex flex-col gap-2 items-start animate-pulse">
                <div className="px-1"><span className="text-[8px] font-black uppercase text-zinc-700">Synthesizing...</span></div>
                <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-2xl rounded-tl-sm flex gap-1.5 shadow-lg">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-100"></div>
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        )}
      </div>

      {/* Interaction Footer */}
      <div className="p-5 bg-[#0c0c0e] border-t border-zinc-800 shadow-[0_-10px_30px_rgba(0,0,0,0.4)]">
        {activeArtifactId && !isGenerating && (
            <div className="flex items-center justify-center gap-3 mb-5 animate-in slide-in-from-bottom-2">
                <button onClick={() => setShowRefineDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 text-[10px] font-black uppercase rounded-lg border border-blue-500/20 transition-all">
                    <PencilSquareIcon className="w-3.5 h-3.5" /> Refine
                </button>
                <button onClick={() => setShowAddContextDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 text-[10px] font-black uppercase rounded-lg border border-purple-500/20 transition-all">
                    <CameraIcon className="w-3.5 h-3.5" /> Context
                </button>
            </div>
        )}
        <InputArea onGenerate={onSendMessage} isGenerating={isGenerating} />
        <div className="mt-3 flex items-center justify-center gap-4">
             <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest">Protocol 3.1</span>
             <div className="w-1 h-1 bg-zinc-800 rounded-full"></div>
             <span className="text-[8px] font-bold text-zinc-700 uppercase tracking-widest">Signal Encrypted</span>
        </div>
      </div>

      {/* Add Context Modal */}
      {showAddContextDialog && (
         <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-6 animate-in fade-in duration-300">
           <div className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
             <div className="px-5 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/40">
               <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                   <CameraIcon className="w-4 h-4 text-purple-500" />
                   Add Screenshot Context
               </h3>
               <button onClick={() => setShowAddContextDialog(false)} className="text-zinc-500 hover:text-white transition-colors">
                   <XMarkIcon className="w-4 h-4" />
               </button>
             </div>
             <div className="p-5 space-y-4">
               <div className="border-2 border-dashed border-zinc-800 rounded-xl p-8 flex flex-col items-center justify-center bg-black/20 hover:border-purple-500/40 cursor-pointer transition-colors" onClick={() => screenshotInputRef.current?.click()}>
                  <PhotoIcon className="w-8 h-8 text-zinc-700 mb-2" />
                  <span className="text-[10px] font-bold text-zinc-600 uppercase">Drop Visual evidence here</span>
                  <input ref={screenshotInputRef} type="file" className="hidden" multiple accept="image/*" onChange={(e) => handleFileSelect(e, 'context')} />
               </div>
               {contextFiles.length > 0 && (
                   <div className="flex flex-wrap gap-2">
                       {contextFiles.map((f, i) => (
                           <div key={i} className="px-2 py-1 bg-purple-500/10 border border-purple-500/20 rounded-lg text-[10px] text-purple-300 font-bold flex items-center gap-1">
                               {f.name} <button onClick={() => removeFile(i, 'context')}><XMarkIcon className="w-3 h-3" /></button>
                           </div>
                       ))}
                   </div>
               )}
               <textarea value={contextPrompt} onChange={(e) => setContextPrompt(e.target.value)} placeholder="Visual analysis instructions..." className="w-full h-24 bg-black border border-zinc-800 rounded-xl p-4 text-sm text-zinc-200 focus:outline-none focus:border-purple-500 resize-none placeholder-zinc-700" />
               <div className="flex justify-end gap-3 pt-2">
                  <button onClick={() => setShowAddContextDialog(false)} className="text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 px-4">Cancel</button>
                  <button onClick={handleAddContextSubmit} disabled={contextFiles.length === 0} className="bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-black uppercase px-6 py-2 rounded-lg shadow-lg shadow-purple-900/20 disabled:opacity-50 transition-all">Inject Context</button>
               </div>
             </div>
           </div>
         </div>
      )}
    </div>
  );
};
