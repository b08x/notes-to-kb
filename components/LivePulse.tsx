
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onUpdateHtml?: (html: string) => void;
  mode?: 'overlay' | 'panel';
  onToggleMode?: () => void;
  liveConfig: { model: string; voice: string };
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
  const [transcription, setTranscription] = useState<{user: string, model: string}>({ user: '', model: '' });
  const clientRef = useRef<LiveClient | null>(null);

  // Store callbacks in refs to prevent useEffect re-triggering
  const callbacksRef = useRef({ onUpdateHtml });
  useEffect(() => {
    callbacksRef.current = { onUpdateHtml };
  }, [onUpdateHtml]);

  useEffect(() => {
    if (isActive && !clientRef.current) {
        const initSession = async () => {
            try {
                const apiKey = process.env.API_KEY || '';
                
                // Initialize Client with Callbacks
                const client = new LiveClient(
                    apiKey, 
                    currentHtml || "", 
                    {
                        onToolCall: (newHtml) => {
                            if (callbacksRef.current.onUpdateHtml) {
                                console.log("Live Pulse received new HTML, updating...");
                                callbacksRef.current.onUpdateHtml(newHtml);
                            }
                        },
                        onVolume: (vol) => {
                             setVolume(prev => prev * 0.8 + vol * 0.2);
                        },
                        onTranscription: (text, source) => {
                            setTranscription(prev => {
                                // Logic: Clear the other party's text when a new turn starts to focus the display
                                if (source === 'user') {
                                    if (prev.model) {
                                        return { user: text, model: '' };
                                    }
                                    return { user: prev.user + text, model: '' };
                                } else {
                                    if (prev.user) {
                                        return { user: '', model: text };
                                    }
                                    return { user: '', model: prev.model + text };
                                }
                            });
                        }
                    }
                );
                
                clientRef.current = client;

                await client.connect(() => {
                    console.log("Live Client disconnected");
                    onClose();
                }, liveConfig);
                
                setStatus('active');
            } catch (e) {
                console.error("Failed to start live session", e);
                setStatus('error');
            }
        };
        initSession();
    }

    return () => {
        // Only cleanup if isActive becomes false
        if (!isActive && clientRef.current) {
            clientRef.current.stop();
            clientRef.current = null;
        }
    };
  }, [isActive, onClose, liveConfig]); 

  // Notify model of context changes
  useEffect(() => {
      if (isActive && clientRef.current && currentHtml) {
          // Optional: Only send if significantly changed or user action.
          // For now, we rely on the initial context and user prompts.
          // clientRef.current.sendText(`[System: Context Updated. New Length: ${currentHtml.length}]`);
      }
  }, [currentHtml, isActive]);

  if (!isActive) return null;

  const isPanel = mode === 'panel';

  return (
    <div className={`
        relative w-full h-full flex flex-col overflow-hidden transition-all duration-300
        ${isPanel ? 'bg-[#09090b]' : 'bg-[#121214]/95 backdrop-blur-md rounded-2xl border border-zinc-700/50 shadow-2xl'}
    `}>
        {/* Panel Background Effects */}
        {isPanel && (
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-50 animate-pulse"></div>
            </div>
        )}

        {/* Header / Controls */}
        <div className={`flex items-center justify-between z-20 ${isPanel ? 'absolute top-6 left-6 right-6' : 'p-3 border-b border-white/5'}`}>
             <div className="flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : (status === 'error' ? 'bg-red-500' : 'bg-yellow-500')}`}></div>
                 {isPanel && (
                    <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">
                        {status === 'active' ? 'LIVE SESSION ACTIVE' : (status === 'error' ? 'CONNECTION ERROR' : 'CONNECTING...')}
                    </span>
                 )}
                 {!isPanel && (
                      <span className="text-white text-xs font-bold flex items-center gap-1">
                          Gemini Live
                          <BoltIcon className="w-3 h-3 text-yellow-500" />
                      </span>
                 )}
             </div>

             <div className="flex items-center gap-2">
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
                {isPanel ? (
                     // Panel Mode Visualizer
                    <>
                        {/* Left Bar */}
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                            <div 
                                className="h-full bg-gradient-to-l from-blue-500 to-transparent transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, volume * 400)}%` }}
                            ></div>
                        </div>
                        
                        {/* Center Orb */}
                        <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center mx-4">
                            <div className={`absolute inset-0 rounded-full border-4 border-blue-500/20 ${status === 'active' ? 'animate-[spin_4s_linear_infinite]' : ''}`}></div>
                            <div className={`absolute inset-2 rounded-full border-2 border-purple-500/20 ${status === 'active' ? 'animate-[spin_3s_linear_infinite_reverse]' : ''}`}></div>
                            <div 
                                className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-transform duration-75"
                                style={{ transform: `scale(${1 + volume})` }}
                            ></div>
                            <MicrophoneIcon className="absolute w-6 h-6 text-white/90" />
                        </div>

                        {/* Right Bar */}
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                <div 
                                className="h-full bg-gradient-to-r from-purple-500 to-transparent transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, volume * 400)}%` }}
                            ></div>
                        </div>
                    </>
                ) : (
                    // Overlay Mode Visualizer (Compact)
                     <div className="flex items-center gap-4 w-full">
                         <div className="relative w-10 h-10 flex-shrink-0 flex items-center justify-center">
                            <div className={`
                                absolute w-8 h-8 rounded-full transition-all duration-100 ease-out
                                ${status === 'active' ? 'bg-gradient-to-tr from-blue-500 to-purple-500' : (status === 'error' ? 'bg-red-500' : 'bg-zinc-700')}
                            `} 
                            style={{ transform: `scale(${1 + volume * 1.5})` }}
                            ></div>
                             {status === 'active' && (
                                <div className="absolute inset-0 rounded-full border border-blue-400/30"
                                    style={{ transform: `scale(${1 + volume * 2})`, opacity: Math.max(0, 0.6 - volume) }}>
                                </div>
                            )}
                            <MicrophoneIcon className="relative w-4 h-4 text-white z-10 opacity-90" />
                        </div>
                        
                        {/* Compact Transcription */}
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
                                    {status === 'connecting' ? 'Connecting...' : (status === 'error' ? 'Error' : 'Listening...')}
                                </p>
                            )}
                        </div>
                     </div>
                )}
            </div>

            {/* Panel Transcription Display */}
            {isPanel && (
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
                            {status === 'connecting' ? 'Establishing connection...' : 'Listening...'}
                        </p>
                    )}
                </div>
            )}
        </div>
        
        {/* Panel Footer Decoration */}
        {isPanel && (
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
