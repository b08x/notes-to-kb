
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { XMarkIcon, BoltIcon, ExclamationTriangleIcon, ChevronDownIcon, MusicalNoteIcon, StopIcon, SignalIcon, ChatBubbleBottomCenterIcon } from '@heroicons/react/24/solid';
// Added missing icon imports
import { ArrowPathIcon, MicrophoneIcon } from '@heroicons/react/24/outline';
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
    mode = 'panel', 
    liveConfig 
}, ref) => {
  const [volume, setVolume] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const [status, setStatus] = useState<'connecting' | 'listening' | 'thinking' | 'speaking' | 'error' | 'key_required'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [transcriptionHistory, setTranscriptionHistory] = useState<{source: 'user' | 'model', text: string}[]>([]);
  const [userText, setUserText] = useState("");
  const [modelText, setModelText] = useState("");
  
  const clientRef = useRef<LiveClient | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  
  const callbacksRef = useRef({ onAtomicUpdate });
  useEffect(() => {
    callbacksRef.current = { onAtomicUpdate };
  }, [onAtomicUpdate]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [transcriptionHistory, userText, modelText]);

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
    <div className="flex flex-col h-full bg-[#0c0c0e] animate-in slide-in-from-left-4 duration-500 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 bg-[#0c0c0e] shrink-0">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <BoltIcon className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-black text-white tracking-tighter">Live Protocol</h2>
                </div>
                <button 
                    onClick={onClose}
                    className="p-1.5 text-zinc-600 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                >
                    <XMarkIcon className="w-4 h-4" />
                </button>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status === 'listening' ? 'bg-emerald-500 animate-pulse' : (status === 'speaking' ? 'bg-blue-500 animate-bounce' : (status === 'thinking' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-700'))}`}></div>
                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{status}</span>
                </div>
                {latency && (
                    <div className="flex items-center gap-1">
                        <SignalIcon className="w-2.5 h-2.5 text-zinc-700" />
                        <span className="text-[9px] font-mono text-zinc-600">{latency}ms</span>
                    </div>
                )}
            </div>
        </div>

        {/* Dynamic Waveform Area */}
        <div className="flex-1 overflow-hidden flex flex-col p-6 bg-black/20">
            
            <div className="flex-1 relative flex flex-col">
                {/* Waveform Visualization */}
                <div className="h-24 flex items-center justify-center gap-1.5 mb-8">
                    {[...Array(32)].map((_, i) => {
                        const displayVol = Math.max(0.05, volume);
                        const isPrimary = i > 12 && i < 20;
                        const height = isPrimary ? (20 + (displayVol * 120)) : (10 + (displayVol * 60));
                        return (
                            <div 
                                key={i} 
                                className={`w-1 rounded-full transition-all duration-75 ${status === 'speaking' ? 'bg-blue-500/80 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-emerald-500/20'}`} 
                                style={{ 
                                    height: `${height}%`,
                                    opacity: 0.2 + (displayVol * 0.8)
                                }}
                            ></div>
                        );
                    })}
                </div>

                {/* Transcription Log */}
                <div 
                    ref={logRef}
                    className="flex-1 overflow-y-auto space-y-6 scrollbar-hide mask-fade-top"
                >
                    {status === 'error' ? (
                        <div className="flex flex-col items-center justify-center h-full text-center gap-4 py-8 animate-in fade-in zoom-in-95">
                            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                                 <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                            </div>
                            <div className="space-y-2">
                                <p className="text-white text-sm font-bold">Engine Fault</p>
                                <p className="text-zinc-500 text-[11px] leading-relaxed max-w-[240px]">{errorMessage || "Protocol link severed."}</p>
                                <button onClick={initSession} className="mt-4 px-6 py-2 bg-zinc-800 text-white text-[10px] font-black uppercase rounded-lg border border-zinc-700 hover:bg-zinc-700 transition-all">Retry Link</button>
                            </div>
                        </div>
                    ) : status === 'connecting' ? (
                        <div className="flex flex-col items-center justify-center h-full gap-4 opacity-50">
                            <ArrowPathIcon className="w-8 h-8 text-zinc-700 animate-spin" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-700">Calibrating Audio Link</p>
                        </div>
                    ) : (
                        <>
                            {userText && (
                                <div className="animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">User Input</div>
                                    <p className="text-sm font-medium text-zinc-400 italic border-l-2 border-blue-500/30 pl-4 py-1 leading-relaxed">
                                        "{userText}"
                                    </p>
                                </div>
                            )}

                            {modelText && (
                                <div className="animate-in slide-in-from-bottom-2 duration-300">
                                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-1">Assistant Response</div>
                                    <div className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 shadow-xl">
                                        <p className="text-sm font-bold text-zinc-100 leading-relaxed">
                                            {modelText}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {(!userText && !modelText) && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center gap-4">
                                    <MicrophoneIcon className="w-12 h-12 text-zinc-700" />
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-700">Listening for Signal...</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* Footer Controls */}
        <div className="p-6 border-t border-zinc-800 bg-[#0c0c0e] shrink-0">
             <div className="flex items-center justify-between gap-4">
                <div className="flex-1 h-12 bg-black/40 border border-zinc-800 rounded-xl px-4 flex items-center justify-between group hover:border-zinc-700 transition-colors">
                    <span className="text-[10px] font-black text-zinc-700 uppercase tracking-widest group-hover:text-zinc-500">VOICE ACTIVE</span>
                    <div className="flex gap-1">
                        <div className={`w-1 h-3 bg-blue-500/40 rounded-full ${status === 'speaking' ? 'animate-pulse' : ''}`}></div>
                        <div className={`w-1 h-4 bg-blue-500/60 rounded-full ${status === 'speaking' ? 'animate-pulse delay-75' : ''}`}></div>
                        <div className={`w-1 h-2 bg-blue-500/20 rounded-full ${status === 'speaking' ? 'animate-pulse delay-150' : ''}`}></div>
                    </div>
                </div>

                {status === 'speaking' && (
                    <button 
                        onClick={handleStopAudio}
                        className="w-12 h-12 flex items-center justify-center bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all shadow-lg shadow-red-900/10"
                        title="Interrupt"
                    >
                        <StopIcon className="w-6 h-6" />
                    </button>
                )}

                <button 
                    onClick={onClose}
                    className="w-12 h-12 flex items-center justify-center bg-zinc-800 text-zinc-400 border border-zinc-700 rounded-xl hover:bg-zinc-700 hover:text-white transition-all"
                    title="Return to Chat"
                >
                    <ChatBubbleBottomCenterIcon className="w-5 h-5" />
                </button>
             </div>
             
             <div className="mt-4 flex items-center justify-center gap-4 opacity-30">
                 <span className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Protocol 3.1</span>
                 <div className="w-1 h-1 bg-zinc-800 rounded-full"></div>
                 <span className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">Signal Stable</span>
            </div>
        </div>

        <style>{`
            .mask-fade-top {
                mask-image: linear-gradient(to top, black 85%, transparent 100%);
            }
            @keyframes gradient {
                0% { background-position: 0% 50%; }
                100% { background-position: 100% 50%; }
            }
        `}</style>
    </div>
  );
});
