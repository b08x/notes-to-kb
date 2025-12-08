
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon, BoltIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
  currentHtml?: string;
  onUpdateHtml?: (html: string) => void;
}

export const LivePulse: React.FC<LivePulseProps> = ({ onClose, isActive, currentHtml, onUpdateHtml }) => {
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'active' | 'error'>('connecting');
  const clientRef = useRef<LiveClient | null>(null);

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
                        if (onUpdateHtml) {
                            console.log("Live Pulse received new HTML, updating...");
                            onUpdateHtml(newHtml);
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
                });
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
  }, [isActive, onClose, currentHtml, onUpdateHtml]);

  if (!isActive) return null;

  return (
    // Non-blocking Overlay Container (Bottom Right)
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
        
        {/* Floating Card - Pointer events auto to allow clicking */}
        <div className="pointer-events-auto relative w-72 bg-[#121214]/90 backdrop-blur-md border border-zinc-700/50 rounded-2xl p-4 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300 flex items-center gap-4">
            
            {/* Visualizer Orb (Smaller) */}
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
