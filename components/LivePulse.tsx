
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';
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
  const [status, setStatus] = useState<'connecting' | 'active' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<{user: string, model: string}>({ user: '', model: '' });
  const clientRef = useRef<LiveClient | null>(null);
  const retryCountRef = useRef(0);

  // Store callbacks in refs to prevent useEffect re-triggering
  const callbacksRef = useRef({ onUpdateHtml });
  useEffect(() => {
    callbacksRef.current = { onUpdateHtml };
  }, [onUpdateHtml]);

  const initSession = async () => {
    if (!isActive) return;
    
    setStatus('connecting');
    setErrorMessage(null);

    try {
        const apiKey = process.env.API_KEY || '';
        if (!apiKey) {
            throw new Error("API Key missing. Please check your environment.");
        }
        
        // Determine actual prompt
        let prompt = WITTY_PROMPT;
        if (liveConfig.promptMode === 'professional') prompt = PROFESSIONAL_PROMPT;
        else if (liveConfig.promptMode === 'custom' && liveConfig.customPrompt) {
            prompt = liveConfig.customPrompt;
        }

        // Initialize Client with Callbacks
        const client = new LiveClient(
            apiKey, 
            currentHtml || "", 
            {
                onToolCall: (newHtml) => {
                    if (callbacksRef.current.onUpdateHtml) {
                        callbacksRef.current.onUpdateHtml(newHtml);
                    }
                },
                onVolume: (vol) => {
                     setVolume(prev => prev * 0.8 + vol * 0.2);
                },
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
                }
            }
        );
        
        clientRef.current = client;

        await client.connect(() => {
            console.log("Live Client disconnected");
            setStatus('error');
            setErrorMessage("Session ended unexpectedly.");
        }, {
            model: liveConfig.model,
            voice: liveConfig.voice,
            prompt: prompt
        });
        
        setStatus('active');
        retryCountRef.current = 0;
    } catch (e: any) {
        console.error("Failed to start live session", e);
        setStatus('error');
        setErrorMessage(e.message || "Failed to establish secure connection.");
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

  // Informative status descriptions
  const getStatusText = () => {
      switch (status) {
          case 'connecting': return 'Securing Handshake...';
          case 'active': return 'Live Assistant Ready';
          case 'error': return 'Connection Interrupted';
          default: return '';
      }
  };

  return (
    <div className={`
        relative w-full h-full flex flex-col overflow-hidden transition-all duration-300
        ${isPanel ? 'bg-[#09090b]' : 'bg-[#121214]/95 backdrop-blur-md rounded-2xl border border-zinc-700/50 shadow-2xl'}
    `}>
        {/* Panel Background Effects */}
        {isPanel && (
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl transition-colors duration-1000 ${status === 'active' ? 'bg-blue-500/10' : (status === 'error' ? 'bg-red-500/5' : 'bg-yellow-500/5')} opacity-50 animate-pulse`}></div>
            </div>
        )}

        {/* Header / Controls */}
        <div className={`flex items-center justify-between z-20 ${isPanel ? 'absolute top-6 left-6 right-6' : 'p-3 border-b border-white/5'}`}>
             <div className="flex items-center gap-3">
                 <div className="relative">
                    <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                        status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 
                        (status === 'error' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-amber-400 animate-ping shadow-[0_0_8px_rgba(251,191,36,0.8)]')
                    }`}></div>
                    {status === 'active' && <div className="absolute inset-0 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping opacity-20"></div>}
                 </div>
                 
                 <div className="flex flex-col">
                    <span className={`text-[10px] font-mono uppercase tracking-widest ${
                        status === 'active' ? 'text-emerald-400' : (status === 'error' ? 'text-red-400' : 'text-amber-400')
                    }`}>
                        {getStatusText()}
                    </span>
                    {isPanel && status === 'error' && (
                        <span className="text-[9px] text-zinc-500 font-mono mt-0.5 max-w-[200px] truncate">{errorMessage}</span>
                    )}
                 </div>
             </div>

             <div className="flex items-center gap-2">
                 {status === 'error' && (
                     <button
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold text-zinc-300 hover:text-white bg-zinc-800 rounded-md border border-zinc-700 hover:border-zinc-500 transition-all"
                     >
                         <ArrowPathIcon className="w-3 h-3" />
                         Retry
                     </button>
                 )}
                 {onToggleMode && (
                     <button
                        onClick={onToggleMode}
                        className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        title={isPanel ? "Minimize" : "Expand"}
                     >
                         {isPanel ? <ArrowsPointingInIcon className="w-5 h-5" /> : <ArrowsPointingOutIcon className="w-4 h-4" />}
                     </button>
                 )}
                <button 
                    onClick={onClose}
                    className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                    title="End Session"
                >
                    <XMarkIcon className={isPanel ? "w-6 h-6" : "w-4 h-4"} />
                </button>
             </div>
        </div>

        {/* Content Area */}
        <div className={`flex flex-col items-center justify-center flex-1 z-10 ${isPanel ? 'gap-8 px-8' : 'gap-2 px-4 py-2'}`}>
            
            {/* Visualizer */}
            <div className={`relative flex items-center justify-center transition-all duration-300 ${isPanel ? 'w-full max-w-3xl h-32' : 'w-full h-12'}`}>
                {status === 'error' ? (
                    <div className="flex flex-col items-center gap-4 animate-in zoom-in-95 duration-300">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                        </div>
                        {isPanel && <p className="text-zinc-500 text-sm max-w-xs text-center">We lost contact with the technical assistant. Ensure your API key is valid and you have a stable network.</p>}
                    </div>
                ) : isPanel ? (
                    <>
                        {/* Left Bar */}
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                            <div 
                                className="h-full bg-gradient-to-l from-blue-500 to-transparent transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, volume * 400)}%`, opacity: status === 'connecting' ? 0.2 : 1 }}
                            ></div>
                        </div>
                        
                        {/* Center Orb */}
                        <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center mx-4">
                            <div className={`absolute inset-0 rounded-full border-4 ${status === 'active' ? 'border-blue-500/20 animate-[spin_4s_linear_infinite]' : 'border-amber-500/10'}`}></div>
                            <div className={`absolute inset-2 rounded-full border-2 ${status === 'active' ? 'border-purple-500/20 animate-[spin_3s_linear_infinite_reverse]' : 'border-amber-500/10'}`}></div>
                            <div 
                                className={`w-16 h-16 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-all duration-300 ${
                                    status === 'active' ? 'bg-gradient-to-br from-blue-600 to-purple-600' : 'bg-zinc-800 grayscale'
                                }`}
                                style={{ transform: `scale(${1 + volume})` }}
                            ></div>
                            <MicrophoneIcon className={`absolute w-6 h-6 text-white/90 ${status === 'connecting' ? 'animate-pulse' : ''}`} />
                        </div>

                        {/* Right Bar */}
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-transparent transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, volume * 400)}%`, opacity: status === 'connecting' ? 0.2 : 1 }}
                            ></div>
                        </div>
                    </>
                ) : (
                     <div className="flex items-center gap-4 w-full">
                         <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                            <div className={`
                                absolute w-8 h-8 rounded-full transition-all duration-100 ease-out
                                ${status === 'active' ? 'bg-gradient-to-tr from-blue-500 to-purple-500' : 'bg-zinc-700'}
                            `} 
                            style={{ transform: `scale(${1 + volume * 1.5})` }}
                            ></div>
                            <MicrophoneIcon className={`relative w-4 h-4 text-white z-10 opacity-90 ${status === 'connecting' ? 'animate-pulse' : ''}`} />
                        </div>
                        
                        <div className="flex-1 min-w-0 h-10 flex items-center">
                            {transcription.model ? (
                                <p className="text-[11px] text-white font-medium line-clamp-2 leading-tight">
                                    {transcription.model}
                                </p>
                            ) : transcription.user ? (
                                <p className="text-[11px] text-zinc-400 italic line-clamp-1 leading-tight">
                                    "{transcription.user}"
                                </p>
                            ) : (
                                <p className="text-[10px] text-zinc-500 truncate">
                                    {status === 'connecting' ? 'Connecting to assistant...' : 'Listening for input...'}
                                </p>
                            )}
                        </div>
                     </div>
                )}
            </div>

            {/* Panel Transcription Display */}
            {isPanel && status !== 'error' && (
                <div className="w-full min-h-[120px] flex flex-col items-center justify-center space-y-4 text-center">
                    {transcription.user && (
                         <p className="text-zinc-400 text-lg md:text-xl font-medium italic animate-in fade-in slide-in-from-bottom-2">
                             "{transcription.user}"
                         </p>
                    )}
                    {transcription.model ? (
                         <p className="text-white text-xl md:text-2xl font-bold leading-relaxed animate-in fade-in slide-in-from-bottom-2 text-balance">
                             {transcription.model}
                         </p>
                    ) : !transcription.user && (
                        <p className="text-zinc-600 text-sm">
                            {status === 'connecting' ? 'Establishing secure voice handshake...' : 'Start speaking to the assistant...'}
                        </p>
                    )}
                </div>
            )}
        </div>
        
        {/* Panel Footer Decoration */}
        {isPanel && status === 'active' && (
            <div className="absolute bottom-0 left-0 right-0 h-24 opacity-20 flex items-end justify-center gap-1 pointer-events-none">
                 {Array.from({ length: 40 }).map((_, i) => (
                     <div 
                        key={i} 
                        className="w-2 bg-zinc-500 rounded-t-sm transition-all duration-300"
                        style={{ 
                            height: `${10 + Math.random() * 40 + (volume * 100 * (i % 2 === 0 ? 1 : 0.5))}%`,
                            opacity: 0.2 + (volume * 0.5)
                        }}
                     ></div>
                 ))}
            </div>
        )}
    </div>
  );
};
