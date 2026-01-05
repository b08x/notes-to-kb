
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, ArrowPathIcon, ExclamationTriangleIcon, KeyIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';
import { WITTY_PROMPT, PROFESSIONAL_PROMPT, LivePromptMode } from './SettingsModal';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onUpdateHtml?: (html: string) => void;
  mode?: 'overlay' | 'panel';
  liveConfig: { 
      model: string; 
      voice: string;
      promptMode: LivePromptMode;
      customPrompt?: string;
  };
}

export const LivePulse = forwardRef<any, LivePulseProps>(({ 
    onClose, 
    isActive, 
    currentHtml, 
    onUpdateHtml, 
    mode = 'overlay', 
    liveConfig 
}, ref) => {
  const [volume, setVolume] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'key_required'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<{user: string, model: string}>({ user: '', model: '' });
  const clientRef = useRef<LiveClient | null>(null);
  
  const callbacksRef = useRef({ onUpdateHtml });
  useEffect(() => {
    callbacksRef.current = { onUpdateHtml };
  }, [onUpdateHtml]);

  useImperativeHandle(ref, () => ({
    sendUpdate: (text: string) => {
      if (clientRef.current && status === 'active') {
        clientRef.current.sendText(text);
      }
    }
  }));

  const initSession = async () => {
    if (!isActive) return;
    
    setStatus('connecting');
    setErrorMessage(null);

    try {
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
                onVolume: (vol) => setVolume(prev => prev * 0.7 + vol * 0.3),
                onTranscription: (text, source) => {
                    setTranscription(prev => {
                        if (source === 'user') {
                            return { user: text, model: '' };
                        } else {
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
                setErrorMessage("Session ended.");
            }
        }, {
            model: liveConfig.model || 'gemini-2.4-flash-native-audio-preview-09-2025',
            voice: liveConfig.voice,
            prompt: prompt
        });
        
        setStatus('active');
    } catch (e: any) {
        if (e.message?.toLowerCase().includes("not found")) {
            setStatus('key_required');
        } else {
            setStatus('error');
            setErrorMessage(e.message || "Connection failed.");
        }
    }
  };

  const handleOpenKeySelector = async () => {
      const aiStudio = (window as any).aistudio;
      if (aiStudio) {
          await aiStudio.openSelectKey();
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

  if (!isActive) return null;

  return (
    <div className={`
        fixed top-[100px] right-6 z-[150] flex flex-col items-end gap-3 transition-all duration-500
        ${isExpanded ? 'w-[320px] sm:w-[380px]' : 'w-14 h-14'}
    `}>
        {/* Main Floating Card */}
        <div className={`
            relative w-full flex flex-col overflow-hidden bg-[#121214]/90 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-2xl transition-all duration-500
            ${isExpanded ? 'h-[240px] opacity-100' : 'h-0 opacity-0 pointer-events-none'}
        `}>
            {/* Glassy Background Pulse */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-[gradient_3s_linear_infinite] transition-opacity duration-500 ${status === 'active' ? 'opacity-100' : 'opacity-20'}`}></div>

            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <div className={`w-2 h-2 rounded-full transition-all duration-500 ${
                            status === 'active' ? 'bg-emerald-500' : 
                            (status === 'error' || status === 'key_required' ? 'bg-red-500' : 'bg-amber-400 animate-pulse')
                        }`}></div>
                        {status === 'active' && <div className="absolute inset-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-20"></div>}
                    </div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live Pulse Assistant</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsExpanded(false)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <ChevronDownIcon className="w-4 h-4" />
                    </button>
                    <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors">
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 p-4 flex flex-col justify-center">
                {status === 'error' ? (
                    <div className="flex flex-col items-center text-center gap-3">
                        <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                        <p className="text-zinc-500 text-xs">{errorMessage || "Connection lost."}</p>
                        <button onClick={() => initSession()} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-[10px] font-bold rounded-lg border border-zinc-700 transition-all uppercase">Retry</button>
                    </div>
                ) : status === 'key_required' ? (
                    <div className="flex flex-col items-center text-center gap-2">
                        <KeyIcon className="w-8 h-8 text-blue-500" />
                        <p className="text-zinc-200 text-[10px] font-bold uppercase">Paid API Key Required</p>
                        <button onClick={handleOpenKeySelector} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-all uppercase">Select Key</button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Audio Pulse visualization */}
                        <div className="flex items-center justify-center gap-1 h-8">
                            {[...Array(20)].map((_, i) => (
                                <div 
                                    key={i}
                                    className="w-1 bg-blue-500 rounded-full transition-all duration-75"
                                    style={{ 
                                        height: status === 'connecting' ? '15%' : `${15 + (volume * 100 * (1 + Math.sin(i * 0.8)))}%`,
                                        opacity: 0.4 + (volume * 0.6)
                                    }}
                                ></div>
                            ))}
                        </div>

                        {/* Transcription Bubble */}
                        <div className="bg-black/40 rounded-xl p-3 border border-white/5 min-h-[60px] flex flex-col justify-center shadow-inner text-center">
                            {transcription.user && (
                                <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    <p className="text-[11px] text-zinc-400 font-medium italic">"{transcription.user}"</p>
                                </div>
                            )}
                            {transcription.model && (
                                <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
                                    <p className="text-[11px] text-blue-200 font-bold leading-relaxed">{transcription.model}</p>
                                </div>
                            )}
                            {!transcription.user && !transcription.model && (
                                <p className="text-[10px] text-zinc-600 text-center italic tracking-wide">Assistant is listening...</p>
                            )}
                        </div>
                    </div>
                )}
            </div>
            
            <div className="px-4 py-2 bg-black/40 border-t border-white/5 flex items-center justify-between">
                <span className="text-[8px] text-zinc-600 uppercase font-mono">{liveConfig.voice} Voice Engine</span>
                <div className="flex gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-emerald-500' : 'bg-zinc-700'}`}></div>
                </div>
            </div>
        </div>

        {/* Minimized Orb Button */}
        <button 
            onClick={() => setIsExpanded(true)}
            className={`
                group relative flex items-center justify-center rounded-full transition-all duration-500 shadow-2xl
                ${isExpanded ? 'scale-0 w-0 h-0 opacity-0' : 'scale-100 w-14 h-14 opacity-100 bg-blue-600 hover:bg-blue-500'}
            `}
        >
            <div className={`absolute inset-0 rounded-full border-4 border-white/10 ${status === 'active' ? 'animate-ping opacity-20' : ''}`}></div>
            <div className={`absolute inset-0 rounded-full bg-blue-400 blur-xl opacity-0 group-hover:opacity-40 transition-opacity duration-300`}></div>
            <BoltIcon className="w-6 h-6 text-white relative z-10" />
            
            {/* Discrete Volume Ring */}
            <svg className="absolute inset-0 w-full h-full -rotate-90 pointer-events-none">
                <circle 
                    cx="28" cy="28" r="24" 
                    fill="none" 
                    stroke="white" 
                    strokeWidth="2" 
                    strokeDasharray="150.8" 
                    strokeDashoffset={150.8 - (150.8 * volume * 2)}
                    className="transition-all duration-75 opacity-30"
                />
            </svg>
        </button>

        <style>{`
            @keyframes gradient {
                0% { background-position: 0% 50%; }
                100% { background-position: 100% 50%; }
            }
        `}</style>
    </div>
  );
});
