
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ArrowPathIcon, ExclamationTriangleIcon, KeyIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';
import { WITTY_PROMPT, PROFESSIONAL_PROMPT, LivePromptMode } from './SettingsModal';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onUpdateHtml?: (html: string) => void;
  mode?: 'overlay' | 'panel';
  onToggleMode?: () => void;
  liveConfig: { 
      model: string; 
      voice: string;
      promptMode: LivePromptMode;
      customPrompt?: string;
  };
}

// Fix: Removed declare global for Window as it conflicted with existing environment types.
// We use (window as any).aistudio to safely access the API.

export const LivePulse: React.FC<LivePulseProps> = ({ 
    onClose, 
    isActive, 
    currentHtml, 
    onUpdateHtml, 
    mode = 'overlay', 
    onToggleMode,
    liveConfig 
}) => {
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'key_required'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<{user: string, model: string}>({ user: '', model: '' });
  const clientRef = useRef<LiveClient | null>(null);
  const retryCountRef = useRef(0);

  const callbacksRef = useRef({ onUpdateHtml });
  useEffect(() => {
    callbacksRef.current = { onUpdateHtml };
  }, [onUpdateHtml]);

  const initSession = async () => {
    if (!isActive) return;
    
    setStatus('connecting');
    setErrorMessage(null);

    try {
        // High-tier model key selection check
        // Fix: Use type assertion for aistudio access to satisfy TypeScript constraints
        const aiStudio = (window as any).aistudio;
        if (aiStudio) {
            const hasKey = await aiStudio.hasSelectedApiKey();
            if (!hasKey) {
                setStatus('key_required');
                return;
            }
        }

        let prompt = WITTY_PROMPT;
        if (liveConfig.promptMode === 'professional') prompt = PROFESSIONAL_PROMPT;
        else if (liveConfig.promptMode === 'custom' && liveConfig.customPrompt) {
            prompt = liveConfig.customPrompt;
        }

        const client = new LiveClient(
            currentHtml || "", 
            {
                onToolCall: (newHtml) => {
                    if (callbacksRef.current.onUpdateHtml) callbacksRef.current.onUpdateHtml(newHtml);
                },
                onVolume: (vol) => setVolume(prev => prev * 0.8 + vol * 0.2),
                onTranscription: (text, source) => {
                    setTranscription(prev => {
                        if (source === 'user') {
                            if (prev.model) return { user: text, model: '' };
                            return { user: prev.user + text, model: '' };
                        } else {
                            if (prev.user) return { user: '', model: text };
                            return { user: '', model: prev.model + text };
                        }
                    });
                },
                onError: (err) => {
                    if (err.message.toLowerCase().includes("not found") || err.message.toLowerCase().includes("permission")) {
                        setStatus('key_required');
                    } else {
                        setErrorMessage(err.message);
                        setStatus('error');
                    }
                }
            }
        );
        
        clientRef.current = client;

        await client.connect(() => {
            if (status !== 'error' && status !== 'key_required') {
                setStatus('error');
                setErrorMessage("Session ended unexpectedly.");
            }
        }, {
            model: liveConfig.model,
            voice: liveConfig.voice,
            prompt: prompt
        });
        
        setStatus('active');
        retryCountRef.current = 0;
    } catch (e: any) {
        console.error("Failed to start live session", e);
        if (e.message?.toLowerCase().includes("not found") || e.message?.toLowerCase().includes("permission")) {
            setStatus('key_required');
        } else {
            setStatus('error');
            setErrorMessage(e.message || "Failed to establish secure connection.");
        }
    }
  };

  const handleOpenKeySelector = async () => {
      // Fix: Use type assertion for aistudio access to satisfy TypeScript constraints
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
          await aiStudio.openSelectKey();
          // Assume success after trigger as per instructions
          initSession();
      }
  };

  useEffect(() => {
    if (isActive && !clientRef.current) {
        initSession();
    }

    return () => {
        if (!isActive && clientRef.current) {
            clientRef.current.stop();
            clientRef.current = null;
        }
    };
  }, [isActive, liveConfig]); 

  const handleRetry = () => {
      if (clientRef.current) {
          clientRef.current.stop();
          clientRef.current = null;
      }
      retryCountRef.current++;
      initSession();
  };

  if (!isActive) return null;

  const isPanel = mode === 'panel';

  const getStatusText = () => {
      switch (status) {
          case 'connecting': return 'Securing Handshake...';
          case 'active': return 'Live Assistant Ready';
          case 'error': return 'Connection Interrupted';
          case 'key_required': return 'API Key Selection Required';
          default: return '';
      }
  };

  return (
    <div className={`
        relative w-full h-full flex flex-col overflow-hidden transition-all duration-300
        ${isPanel ? 'bg-[#09090b]' : 'bg-[#121214]/95 backdrop-blur-md rounded-2xl border border-zinc-700/50 shadow-2xl'}
    `}>
        {isPanel && (
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl transition-colors duration-1000 ${status === 'active' ? 'bg-blue-500/10' : (status === 'error' || status === 'key_required' ? 'bg-red-500/5' : 'bg-yellow-500/5')} opacity-50 animate-pulse`}></div>
            </div>
        )}

        <div className={`flex items-center justify-between z-20 ${isPanel ? 'absolute top-6 left-6 right-6' : 'p-3 border-b border-white/5'}`}>
             <div className="flex items-center gap-3">
                 <div className="relative">
                    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                        status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 
                        (status === 'error' || status === 'key_required' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-amber-400 animate-ping shadow-[0_0_8px_rgba(251,191,36,0.8)]')
                    }`}></div>
                    {status === 'active' && <div className="absolute inset-0 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping opacity-20"></div>}
                 </div>
                 
                 <div className="flex flex-col">
                    <span className={`text-[10px] font-mono uppercase tracking-widest ${
                        status === 'active' ? 'text-emerald-400' : (status === 'error' || status === 'key_required' ? 'text-red-400' : 'text-amber-400')
                    }`}>
                        {getStatusText()}
                    </span>
                 </div>
             </div>

             <div className="flex items-center gap-2">
                 {(status === 'error' || status === 'key_required') && (
                     <button
                        onClick={status === 'key_required' ? handleOpenKeySelector : handleRetry}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:text-white bg-zinc-800 rounded-md border border-zinc-700 hover:border-zinc-500 transition-all"
                     >
                         {status === 'key_required' ? <KeyIcon className="w-3 h-3" /> : <ArrowPathIcon className="w-3 h-3" />}
                         {status === 'key_required' ? 'Select API Key' : 'Retry'}
                     </button>
                 )}
                 {onToggleMode && (
                     <button
                        onClick={onToggleMode}
                        className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                     >
                         {isPanel ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
                     </button>
                 )}
                <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                    <XMarkIcon className={isPanel ? "w-6 h-6" : "w-4 h-4"} />
                </button>
             </div>
        </div>

        <div className={`flex flex-col items-center justify-center flex-1 z-10 ${isPanel ? 'px-8' : 'px-4 py-2'}`}>
            <div className={`relative flex flex-col items-center justify-center transition-all duration-300 w-full ${isPanel ? 'max-w-3xl space-y-8' : 'space-y-2'}`}>
                {status === 'error' ? (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                        </div>
                        <p className="text-zinc-500 text-sm max-w-xs text-center">{errorMessage || "Network error: Connection failed."}</p>
                    </div>
                ) : status === 'key_required' ? (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <KeyIcon className="w-8 h-8 text-blue-500" />
                        </div>
                        <div className="text-center space-y-2">
                            <p className="text-zinc-200 text-sm font-bold">Paid API Key Required</p>
                            <p className="text-zinc-500 text-xs max-w-xs leading-relaxed">High-tier native audio models require an API key from a project with billing enabled. Visit <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="text-blue-400 hover:underline">ai.google.dev/gemini-api/docs/billing</a> for more info.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Audio Visualization */}
                        <div className={`flex items-center justify-center gap-1 w-full ${isPanel ? 'h-32' : 'h-10'}`}>
                            {[...Array(isPanel ? 40 : 15)].map((_, i) => (
                                <div 
                                    key={i}
                                    className="w-1 bg-blue-500 rounded-full transition-all duration-75"
                                    style={{ 
                                        height: status === 'connecting' ? '10%' : `${10 + (volume * 100 * (1 + Math.sin(i * 0.5)))}%`,
                                        opacity: status === 'connecting' ? 0.2 : 0.6 + (volume * 0.4)
                                    }}
                                ></div>
                            ))}
                        </div>

                        {/* Transcriptions */}
                        <div className={`w-full max-w-2xl bg-black/20 rounded-xl p-4 border border-white/5 transition-opacity duration-500 ${isPanel ? 'opacity-100 min-h-[100px]' : 'opacity-80 text-center'}`}>
                             {transcription.user && (
                                 <div className="flex gap-3 animate-in slide-in-from-bottom-2 duration-300">
                                     <div className="w-6 h-6 rounded-full bg-zinc-800 flex-shrink-0 flex items-center justify-center">
                                         <MicrophoneIcon className="w-3.5 h-3.5 text-zinc-500" />
                                     </div>
                                     <p className="text-sm text-zinc-300 font-medium italic leading-relaxed">"{transcription.user}"</p>
                                 </div>
                             )}
                             {transcription.model && (
                                 <div className="flex gap-3 animate-in slide-in-from-bottom-2 duration-300">
                                     <div className="w-6 h-6 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center">
                                         <BoltIcon className="w-3.5 h-3.5 text-white" />
                                     </div>
                                     <p className="text-sm text-blue-200 font-medium leading-relaxed">{transcription.model}</p>
                                 </div>
                             )}
                             {!transcription.user && !transcription.model && (
                                 <div className="flex items-center justify-center h-full text-zinc-600 text-xs italic tracking-wide">
                                     {status === 'active' ? "Speak to the assistant to edit the document..." : "Waiting for connection..."}
                                 </div>
                             )}
                        </div>
                    </>
                )}
            </div>
        </div>
        
        {!isPanel && (
            <div className="px-4 py-2 bg-blue-500/5 text-[9px] text-zinc-500 text-center border-t border-white/5 uppercase tracking-tighter">
                Gemini 2.5 Native Audio Engine
            </div>
        )}
    </div>
  );
};
