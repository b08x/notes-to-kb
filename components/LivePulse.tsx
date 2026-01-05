
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { XMarkIcon, BoltIcon, ExclamationTriangleIcon, ChevronDownIcon, MusicalNoteIcon, StopIcon, SignalIcon } from '@heroicons/react/24/solid';
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { LiveClient } from '../services/live-client';
import { WITTY_PROMPT, PROFESSIONAL_PROMPT, LivePromptMode, VoiceEngine, Provider } from './SettingsModal';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onAtomicUpdate?: (toolName: string, args: any) => void;
  mode?: 'overlay' | 'panel';
  liveConfig: { 
      model: string; 
      voice: string;
      promptMode: LivePromptMode;
      customPrompt?: string;
      provider: Provider;
      openRouterKey?: string;
      voiceEngine: VoiceEngine;
      elevenLabs: {
          key: string;
          voiceId: string;
      };
  };
}

export const LivePulse = forwardRef<any, LivePulseProps>(({ 
    onClose, 
    isActive, 
    currentHtml, 
    onAtomicUpdate, 
    mode = 'overlay', 
    liveConfig 
}, ref) => {
  const [volume, setVolume] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [latency, setLatency] = useState<number | null>(null);
  const [status, setStatus] = useState<'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'key_required'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [userText, setUserText] = useState("");
  const [modelText, setModelText] = useState("");
  
  const clientRef = useRef<LiveClient | null>(null);
  
  const callbacksRef = useRef({ onAtomicUpdate });
  useEffect(() => {
    callbacksRef.current = { onAtomicUpdate };
  }, [onAtomicUpdate]);

  useImperativeHandle(ref, () => ({
    sendUpdate: (text: string) => {
      if (clientRef.current && status !== 'connecting' && status !== 'error') {
        clientRef.current.sendText(text);
      }
    }
  }));

  const handleStopAudio = () => {
    if (clientRef.current) {
        clientRef.current.stopAudio();
        setModelText("");
        setVolume(0);
        setStatus('listening');
    }
  };

  const initSession = async () => {
    if (!isActive) return;
    setStatus('connecting');
    setErrorMessage(null);

    try {
        let prompt = WITTY_PROMPT;
        if (liveConfig.promptMode === 'professional') prompt = PROFESSIONAL_PROMPT;
        else if (liveConfig.promptMode === 'custom' && liveConfig.customPrompt) {
            prompt = liveConfig.customPrompt;
        }

        const client = new LiveClient(
            currentHtml || "", 
            {
                onToolCall: (toolName, args) => {
                    if (callbacksRef.current.onAtomicUpdate) {
                        callbacksRef.current.onAtomicUpdate(toolName, args);
                    }
                },
                onVolume: (vol) => setVolume(vol),
                onStatusChange: (s) => setStatus(s as any),
                onTranscription: (text, source) => {
                    if (source === 'user') {
                        setUserText(text);
                        setModelText(""); 
                    } else {
                        setModelText(text);
                    }
                },
                onLatency: (ms) => setLatency(ms),
                onError: (err) => {
                    setErrorMessage(err.message);
                    setStatus('error');
                }
            }
        );
        
        clientRef.current = client;
        await client.connect(() => {
            onClose();
        }, {
            model: liveConfig.model || 'gemini-3-flash-preview',
            voice: liveConfig.voice,
            prompt: prompt,
            provider: liveConfig.provider,
            openRouterKey: liveConfig.openRouterKey,
            voiceEngine: liveConfig.voiceEngine,
            elevenLabs: liveConfig.elevenLabs
        });
    } catch (e: any) {
        setStatus('error');
        setErrorMessage(e.message || "Connection failed.");
    }
  };

  useEffect(() => {
    if (isActive && !clientRef.current) initSession();
    return () => {
        if (!isActive && clientRef.current) {
            clientRef.current.stop();
            clientRef.current = null;
        }
    };
  }, [isActive, liveConfig]); 

  if (!isActive) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[160] flex flex-col items-end gap-3 transition-all duration-500 ${isExpanded ? 'w-[320px] sm:w-[380px]' : 'w-14 h-14'}`}>
        <div className={`relative w-full flex flex-col overflow-hidden bg-[#121214]/98 backdrop-blur-3xl rounded-3xl border border-zinc-700/50 shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-500 ${isExpanded ? 'h-[360px] opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-[gradient_3s_linear_infinite] transition-opacity duration-500 ${status !== 'connecting' && status !== 'error' ? 'opacity-100' : 'opacity-20'}`}></div>
            
            <div className="flex items-center justify-between p-4 border-b border-white/5 bg-black/40">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${status === 'listening' ? 'bg-emerald-500 animate-pulse' : (status === 'speaking' ? 'bg-blue-500 animate-bounce' : (status === 'thinking' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'))}`}></div>
                        <span className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.15em]">
                            {status === 'listening' ? 'Mic Active' : (status === 'thinking' ? 'Processing' : (status === 'speaking' ? 'AI Pulse' : 'Connecting'))}
                        </span>
                    </div>
                    {latency && (
                        <div className="flex items-center gap-1 opacity-60">
                            <SignalIcon className="w-2.5 h-2.5 text-zinc-500" />
                            <span className="text-[8px] font-mono text-zinc-500">{latency}ms response</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border shadow-sm ${liveConfig.voiceEngine === 'elevenlabs' ? 'bg-pink-500/10 border-pink-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                        <MusicalNoteIcon className={`w-2.5 h-2.5 ${liveConfig.voiceEngine === 'elevenlabs' ? 'text-pink-400' : 'text-blue-400'}`} />
                        <span className={`text-[8px] font-black uppercase tracking-tighter ${liveConfig.voiceEngine === 'elevenlabs' ? 'text-pink-400' : 'text-blue-400'}`}>
                            {liveConfig.voiceEngine === 'elevenlabs' ? '11Labs' : 'Native'}
                        </span>
                    </div>
                    {status === 'speaking' && (
                        <button onClick={handleStopAudio} className="p-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/40 rounded-lg transition-all" title="Mute">
                            <StopIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={() => setIsExpanded(false)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><ChevronDownIcon className="w-4 h-4" /></button>
                    <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"><XMarkIcon className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="flex-1 p-5 flex flex-col justify-between">
                {status !== 'error' && status !== 'connecting' ? (
                    <>
                        <div className="flex items-end justify-center gap-1.5 h-16 mb-5">
                            {[...Array(24)].map((_, i) => {
                                const baseJitter = 0.02;
                                const displayVol = Math.max(baseJitter, volume);
                                const colorClass = liveConfig.voiceEngine === 'elevenlabs' 
                                    ? (status === 'speaking' ? 'bg-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.4)]' : 'bg-emerald-500')
                                    : (status === 'speaking' ? 'bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.4)]' : 'bg-emerald-500');
                                return (
                                    <div key={i} className={`w-1 rounded-full transition-all duration-75 ${colorClass}`} style={{ height: `${10 + (displayVol * 180 * (0.4 + Math.random() * 0.6))}%`, opacity: 0.2 + (displayVol * 0.8) }}></div>
                                );
                            })}
                        </div>
                        
                        <div className="bg-black/50 rounded-2xl p-4 border border-white/5 min-h-[160px] max-h-[160px] flex flex-col shadow-inner overflow-y-auto no-scrollbar relative">
                            {userText && <p className="text-[11px] text-zinc-500 font-semibold italic mb-3 border-l-2 border-blue-500/50 pl-2 leading-relaxed">"{userText}"</p>}
                            {modelText ? (
                                <p className={`text-xs font-bold leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-300 ${liveConfig.voiceEngine === 'elevenlabs' ? 'text-pink-100' : 'text-blue-100'}`}>{modelText}</p>
                            ) : (
                                status === 'thinking' ? (
                                    <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
                                        <div className="flex gap-1.5">
                                            <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce delay-100"></div>
                                            <div className="w-2 h-2 bg-zinc-600 rounded-full animate-bounce delay-200"></div>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-zinc-700 text-center italic tracking-wide h-full flex items-center justify-center">Awaiting signal...</p>
                                )
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-center gap-5 py-8">
                        <div className="w-16 h-16 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg">
                             <ExclamationTriangleIcon className={`w-8 h-8 ${status === 'error' ? 'text-red-500' : 'text-blue-500 animate-pulse'}`} />
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-white text-sm font-bold tracking-tight">{status === 'connecting' ? 'Calibrating Assistant' : 'Engine Warning'}</p>
                            <p className="text-zinc-500 text-[10px] font-medium max-w-[220px] mx-auto leading-relaxed">{errorMessage || "Initializing high-fidelity voice stream..."}</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
        
        <button onClick={() => setIsExpanded(true)} className={`group relative flex items-center justify-center rounded-full transition-all duration-500 shadow-[0_10px_30px_rgba(59,130,246,0.3)] ${isExpanded ? 'scale-0 w-0 h-0 opacity-0' : 'scale-100 w-16 h-16 opacity-100 bg-blue-600 hover:bg-blue-500 ring-4 ring-blue-600/10 hover:ring-blue-500/20'}`}>
            <BoltIcon className="w-8 h-8 text-white" />
            <div className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-20"></div>
        </button>
    </div>
  );
});
