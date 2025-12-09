
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon, SignalIcon, SpeakerWaveIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onUpdateHtml?: (html: string) => void;
  mode?: 'overlay' | 'panel';
  liveConfig: { model: string; voice: string };
}

export const LivePulse: React.FC<LivePulseProps> = ({ onClose, isActive, currentHtml, onUpdateHtml, mode = 'overlay', liveConfig }) => {
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'active' | 'error'>('connecting');
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
                
                // Initialize Client with Tool Handler
                const client = new LiveClient(
                    apiKey, 
                    currentHtml || "", 
                    (newHtml) => {
                        if (callbacksRef.current.onUpdateHtml) {
                            console.log("Live Pulse received new HTML, updating...");
                            callbacksRef.current.onUpdateHtml(newHtml);
                        }
                    }
                );
                
                clientRef.current = client;
                
                client.setVolumeCallback((vol) => {
                    // Smooth volume
                    setVolume(prev => prev * 0.8 + vol * 0.2);
                });

                await client.connect(() => {
                    onClose();
                }, liveConfig);
                
                setStatus('active');
            } catch (e) {
                console.error("Failed to start live session", e);
                setStatus('error');
                setTimeout(onClose, 2000);
            }
        };
        initSession();
    }

    return () => {
        // Clean up when component unmounts or modal closes
        clientRef.current?.stop();
        clientRef.current = null;
    };
  }, [isActive, onClose, liveConfig]); // Re-connect if config changes (though practically modal closes first)

  if (!isActive) return null;

  // PANEL MODE (Split Screen)
  if (mode === 'panel') {
      return (
        <div className="w-full h-full bg-[#09090b] flex flex-col items-center justify-center relative overflow-hidden border-t border-zinc-800">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl opacity-50 animate-pulse"></div>
            </div>

            {/* Header / Status */}
            <div className="absolute top-6 left-6 flex items-center gap-3">
                 <div className={`w-2 h-2 rounded-full ${status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                 <span className="text-zinc-400 text-xs font-mono uppercase tracking-widest">
                     {status === 'active' ? 'LIVE SESSION ACTIVE' : 'CONNECTING...'}
                 </span>
            </div>

            <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition-colors"
            >
                <XMarkIcon className="w-6 h-6" />
            </button>

            {/* Main Visualizer */}
            <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-2xl px-8">
                <div className="flex items-center justify-center gap-4 w-full h-32">
                    {/* Left Bar */}
                    <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden flex justify-end">
                        <div 
                            className="h-full bg-gradient-to-l from-blue-500 to-transparent transition-all duration-75 ease-out"
                            style={{ width: `${Math.min(100, volume * 400)}%` }}
                        ></div>
                    </div>
                    
                    {/* Center Orb */}
                    <div className="relative flex-shrink-0 w-24 h-24 flex items-center justify-center">
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
                </div>

                {/* Instructions / Feedback */}
                <div className="text-center space-y-2">
                    <h2 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                        Listening<span className="animate-pulse">...</span>
                    </h2>
                    <p className="text-zinc-500 text-sm md:text-base max-w-md mx-auto">
                        Speak naturally to refine the document. Try saying "Change the header color to blue" or "Add a section about prerequisites."
                    </p>
                </div>
            </div>
            
            {/* Waveform Footer Decoration */}
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
        </div>
      );
  }

  // OVERLAY MODE (Original)
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
        
        {/* Floating Card */}
        <div className="pointer-events-auto relative w-72 bg-[#121214]/90 backdrop-blur-md border border-zinc-700/50 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-4">
            
            {/* Visualizer Orb */}
            <div className="relative w-12 h-12 flex-shrink-0 flex items-center justify-center">
                <div className={`
                    absolute w-8 h-8 rounded-full transition-all duration-100 ease-out
                    ${status === 'active' ? 'bg-gradient-to-tr from-blue-500 to-purple-500' : 'bg-zinc-700'}
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

            {/* Status Text */}
            <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-white leading-tight flex items-center gap-1.5">
                    Gemini Live
                    <BoltIcon className="w-3 h-3 text-yellow-500 animate-pulse" />
                </h3>
                <p className="text-[10px] text-zinc-400 truncate">
                    {status === 'connecting' ? 'Connecting...' : 'Listening... Say "Change..."'}
                </p>
            </div>

            {/* Close Button */}
            <button 
                onClick={onClose}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors border border-zinc-700"
            >
                <XMarkIcon className="w-4 h-4" />
            </button>
        </div>
        
        {/* Connection Error Toast */}
        {status === 'error' && (
            <div className="mt-2 bg-red-900/80 text-red-200 text-xs px-3 py-1.5 rounded-lg backdrop-blur-sm border border-red-500/30">
                Connection Failed
            </div>
        )}
    </div>
  );
};