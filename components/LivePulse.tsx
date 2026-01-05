
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { XMarkIcon, BoltIcon, ExclamationTriangleIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { LiveClient } from '../services/live-client';
import { WITTY_PROMPT, PROFESSIONAL_PROMPT, LivePromptMode } from './SettingsModal';

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
  const [status, setStatus] = useState<'connecting' | 'active' | 'error' | 'key_required'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Transcriptions usually stream in segments. We need to handle this.
  const [userText, setUserText] = useState("");
  const [modelText, setModelText] = useState("");
  
  const clientRef = useRef<LiveClient | null>(null);
  
  const callbacksRef = useRef({ onAtomicUpdate });
  useEffect(() => {
    callbacksRef.current = { onAtomicUpdate };
  }, [onAtomicUpdate]);

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
                onToolCall: (toolName, args) => {
                    if (callbacksRef.current.onAtomicUpdate) {
                        callbacksRef.current.onAtomicUpdate(toolName, args);
                    }
                },
                onVolume: (vol) => setVolume(vol),
                onTranscription: (text, source) => {
                    if (source === 'user') {
                        setUserText(text);
                        // When user speaks, clear the previous model response
                        setModelText(""); 
                    } else {
                        setModelText(prev => prev + text);
                    }
                },
                onError: (err) => {
                    if (err.message.toLowerCase().includes("not found")) setStatus('key_required');
                    else {
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
            model: liveConfig.model || 'gemini-2.5-flash-native-audio-preview-09-2025',
            voice: liveConfig.voice,
            prompt: prompt
        });
        setStatus('active');
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
    <div className={`fixed top-[100px] right-6 z-[150] flex flex-col items-end gap-3 transition-all duration-500 ${isExpanded ? 'w-[320px] sm:w-[380px]' : 'w-14 h-14'}`}>
        <div className={`relative w-full flex flex-col overflow-hidden bg-[#121214]/90 backdrop-blur-xl rounded-2xl border border-zinc-700/50 shadow-2xl transition-all duration-500 ${isExpanded ? 'h-[260px] opacity-100' : 'h-0 opacity-0 pointer-events-none'}`}>
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-[gradient_3s_linear_infinite] transition-opacity duration-500 ${status === 'active' ? 'opacity-100' : 'opacity-20'}`}></div>
            <div className="flex items-center justify-between p-3 border-b border-white/5 bg-black/20">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-emerald-500' : (status === 'error' ? 'bg-red-500' : 'bg-amber-400 animate-pulse')}`}></div>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Live Pulse</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsExpanded(false)} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg"><ChevronDownIcon className="w-4 h-4" /></button>
                    <button onClick={onClose} className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg"><XMarkIcon className="w-4 h-4" /></button>
                </div>
            </div>
            <div className="flex-1 p-4 flex flex-col justify-center">
                {status === 'active' ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-center gap-1 h-8">
                            {[...Array(20)].map((_, i) => (
                                <div key={i} className="w-1 bg-blue-500 rounded-full transition-all duration-75" style={{ height: `${15 + (volume * 150)}%`, opacity: 0.4 + (volume * 0.6) }}></div>
                            ))}
                        </div>
                        <div className="bg-black/40 rounded-xl p-3 border border-white/5 min-h-[80px] flex flex-col justify-center shadow-inner overflow-y-auto no-scrollbar">
                            {userText && <p className="text-[11px] text-zinc-400 font-medium italic mb-2">"{userText}"</p>}
                            {modelText ? (
                                <p className="text-[11px] text-blue-200 font-bold leading-relaxed">{modelText}</p>
                            ) : (
                                !userText && <p className="text-[10px] text-zinc-600 text-center italic tracking-wide">Listening...</p>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                             <ExclamationTriangleIcon className={`w-6 h-6 ${status === 'error' ? 'text-red-500' : 'text-amber-500 animate-pulse'}`} />
                        </div>
                        <p className="text-zinc-400 text-xs font-medium">{errorMessage || "Initializing Live Stream..."}</p>
                    </div>
                )}
            </div>
        </div>
        <button onClick={() => setIsExpanded(true)} className={`relative flex items-center justify-center rounded-full transition-all duration-500 shadow-2xl ${isExpanded ? 'scale-0 w-0 h-0 opacity-0' : 'scale-100 w-14 h-14 opacity-100 bg-blue-600 hover:bg-blue-500'}`}><BoltIcon className="w-6 h-6 text-white" /></button>
    </div>
  );
});
