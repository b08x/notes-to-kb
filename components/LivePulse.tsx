
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon, MicrophoneIcon } from '@heroicons/react/24/solid';
import { LiveClient } from '../services/live-client';

interface LivePulseProps {
  onClose: () => void;
  isActive: boolean;
}

export const LivePulse: React.FC<LivePulseProps> = ({ onClose, isActive }) => {
  const [volume, setVolume] = useState(0);
  const [status, setStatus] = useState<'connecting' | 'active' | 'error'>('connecting');
  const clientRef = useRef<LiveClient | null>(null);

  useEffect(() => {
    if (isActive && !clientRef.current) {
        const initSession = async () => {
            try {
                const apiKey = process.env.API_KEY || '';
                const client = new LiveClient(apiKey);
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
        clientRef.current?.stop();
        clientRef.current = null;
    };
  }, [isActive, onClose]);

  if (!isActive) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
        <div className="relative w-full max-w-md mx-4 bg-[#121214] border border-zinc-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
            
            <button 
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-zinc-800 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors"
            >
                <XMarkIcon className="w-5 h-5" />
            </button>

            <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Gemini Live</h2>
                <p className="text-zinc-400 text-sm">
                    {status === 'connecting' ? 'Connecting to audio stream...' : 'Listening... speak now.'}
                </p>
            </div>

            {/* Visualizer */}
            <div className="relative w-40 h-40 flex items-center justify-center mb-8">
                {/* Core Orb */}
                <div className={`
                    absolute w-24 h-24 rounded-full transition-all duration-100 ease-out
                    ${status === 'active' ? 'bg-gradient-to-tr from-blue-500 to-purple-500' : 'bg-zinc-700'}
                `} 
                style={{ transform: `scale(${1 + volume * 5})` }}
                ></div>
                
                {/* Glow Ring 1 */}
                <div className={`
                    absolute inset-0 rounded-full border-2 border-blue-500/30 transition-all duration-100
                `}
                style={{ transform: `scale(${1 + volume * 8})`, opacity: Math.max(0, 0.5 - volume) }}
                ></div>

                {/* Glow Ring 2 */}
                <div className={`
                    absolute -inset-4 rounded-full border border-purple-500/20 transition-all duration-200 delay-75
                `}
                style={{ transform: `scale(${1 + volume * 10})`, opacity: Math.max(0, 0.3 - volume) }}
                ></div>

                <MicrophoneIcon className="relative w-10 h-10 text-white z-10 opacity-80" />
            </div>

            <div className="w-full flex justify-center">
                <button 
                    onClick={onClose}
                    className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full text-sm font-medium transition-colors border border-zinc-700"
                >
                    End Session
                </button>
            </div>

            {status === 'error' && (
                <div className="absolute bottom-4 text-red-400 text-xs">Connection failed</div>
            )}
        </div>
    </div>
  );
};
