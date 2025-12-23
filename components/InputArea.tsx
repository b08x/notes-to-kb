
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { ArrowUpTrayIcon, SparklesIcon, CpuChipIcon, MicrophoneIcon, PaperAirplaneIcon, DocumentDuplicateIcon, ChevronDownIcon, BoltIcon, CloudArrowUpIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';

interface InputAreaProps {
  onGenerate: (prompt: string, files?: File[], template?: string) => void;
  isGenerating: boolean;
  onOpenSettings?: () => void;
  disabled?: boolean;
}

// --- Audio Feedback Utilities ---
const playDragHoverSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // Subtle rising "blip"
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.15);
        
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
    } catch (e) {
        // Ignore audio errors
    }
};

const playDropSound = () => {
    try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // Satisfying "thud/click"
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch (e) {
        // Ignore audio errors
    }
};

const CyclingText = () => {
    const words = [
        "tech support notes",
        "incident logs",
        "napkin sketches",
        "PDF manuals",
        "meeting minutes",
        "slack threads",
        "error screenshots"
    ];
    const [index, setIndex] = useState(0);
    const [fade, setFade] = useState(true);

    useEffect(() => {
        const interval = setInterval(() => {
            setFade(false); // fade out
            setTimeout(() => {
                setIndex(prev => (prev + 1) % words.length);
                setFade(true); // fade in
            }, 500); // Wait for fade out
        }, 3000); // Slower cycle to read longer text
        return () => clearInterval(interval);
    }, [words.length]);

    return (
        <span className={`inline-block whitespace-nowrap transition-all duration-500 transform ${fade ? 'opacity-100 translate-y-0 blur-0' : 'opacity-0 translate-y-2 blur-sm'} text-white font-medium pb-1 border-b-2 border-blue-500/50`}>
            {words[index]}
        </span>
    );
};

export const InputArea: React.FC<InputAreaProps> = ({ onGenerate, isGenerating, onOpenSettings, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('auto');
  const recognitionRef = useRef<any>(null);

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => file.type.startsWith('image/') || file.type === 'application/pdf');
    
    if (validFiles.length > 0) {
      playDropSound(); // Audio feedback on success
      onGenerate(prompt, validFiles, selectedTemplate);
    } else {
      alert("Please upload valid images or PDFs.");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isGenerating) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [disabled, isGenerating, prompt, selectedTemplate]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isGenerating) {
        if (!isDragging) {
            setIsDragging(true);
            playDragHoverSound(); // Play sound only on transition to dragging
        }
    }
  }, [disabled, isGenerating, isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we are actually leaving the container, not entering a child
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  }, []);

  // Speech Recognition Logic
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }
      
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setPrompt((prev) => {
            const trimmedPrev = prev.trim();
            return trimmedPrev ? `${trimmedPrev} ${transcript}` : transcript;
        });
      };

      recognition.onerror = (event: any) => {
        // Ignore benign errors like 'no-speech' (user didn't say anything) or 'aborted'
        if (event.error === 'no-speech' || event.error === 'aborted') {
            setIsListening(false);
            return;
        }
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    }
  };

  const handleTextSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    onGenerate(prompt, undefined, selectedTemplate);
    setPrompt("");
  };

  return (
    <div className="w-full max-w-4xl mx-auto perspective-1000 flex flex-col gap-6">
      <div 
        className={`relative group transition-all duration-300 ${isDragging ? 'scale-[1.02]' : ''}`}
      >
        <label
          className={`
            relative flex flex-col items-center justify-center
            h-56 sm:h-64 md:h-[22rem]
            bg-zinc-900/30 
            backdrop-blur-sm
            rounded-xl border border-dashed
            cursor-pointer overflow-hidden
            transition-all duration-300
            ${isDragging 
              ? 'border-blue-400 bg-blue-900/10 shadow-[0_0_40px_rgba(59,130,246,0.15)] ring-2 ring-blue-500/20' 
              : 'border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900/40'
            }
            ${isGenerating ? 'pointer-events-none' : ''}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
            {/* Technical Grid Background */}
            <div className={`absolute inset-0 transition-opacity duration-300 pointer-events-none ${isDragging ? 'opacity-20' : 'opacity-[0.03]'}`} 
                 style={{backgroundImage: 'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)', backgroundSize: '32px 32px'}}>
            </div>
            
            {/* Visual Drop Overlay */}
            <div className={`absolute inset-0 bg-zinc-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 transition-all duration-300 ${isDragging ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                 <CloudArrowUpIcon className="w-16 h-16 text-blue-400 mb-4 animate-bounce" />
                 <h3 className="text-2xl font-bold text-white tracking-tight">Release to Upload</h3>
                 <p className="text-blue-300/80 mt-2 text-sm">Magic awaits...</p>
            </div>
            
            {/* Corner Brackets for technical feel */}
            <div className={`absolute top-4 left-4 w-4 h-4 border-l-2 border-t-2 transition-all duration-300 ${isDragging ? 'border-blue-500 w-8 h-8' : 'border-zinc-600'}`}></div>
            <div className={`absolute top-4 right-4 w-4 h-4 border-r-2 border-t-2 transition-all duration-300 ${isDragging ? 'border-blue-500 w-8 h-8' : 'border-zinc-600'}`}></div>
            <div className={`absolute bottom-4 left-4 w-4 h-4 border-l-2 border-b-2 transition-all duration-300 ${isDragging ? 'border-blue-500 w-8 h-8' : 'border-zinc-600'}`}></div>
            <div className={`absolute bottom-4 right-4 w-4 h-4 border-r-2 border-b-2 transition-all duration-300 ${isDragging ? 'border-blue-500 w-8 h-8' : 'border-zinc-600'}`}></div>

            <div className="relative z-10 flex flex-col items-center text-center space-y-6 md:space-y-8 p-6 md:p-8 w-full transition-opacity duration-300">
                <div className={`relative w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center transition-transform duration-500 ${isDragging ? 'scale-110' : 'group-hover:-translate-y-1'}`}>
                    <div className={`absolute inset-0 rounded-2xl bg-zinc-800 border border-zinc-700 shadow-xl flex items-center justify-center ${isGenerating ? 'animate-pulse' : ''}`}>
                        {isGenerating ? (
                            <CpuChipIcon className="w-8 h-8 md:w-10 md:h-10 text-blue-400 animate-spin-slow" />
                        ) : (
                            <ArrowUpTrayIcon className={`w-8 h-8 md:w-10 md:h-10 text-zinc-300 transition-all duration-300 ${isDragging ? '-translate-y-1 text-blue-400' : ''}`} />
                        )}
                    </div>
                    {/* Badge for multiple files hint */}
                    <div className="absolute -right-3 -top-3 bg-zinc-800 border border-zinc-600 rounded-full p-1.5 shadow-lg">
                        <DocumentDuplicateIcon className="w-4 h-4 text-zinc-400" />
                    </div>
                </div>

                <div className="space-y-2 md:space-y-4 w-full max-w-3xl">
                    <h3 className="flex flex-col items-center justify-center text-xl sm:text-2xl md:text-4xl text-zinc-100 leading-none font-bold tracking-tighter gap-3">
                        <span>Turn</span>
                        {/* Fixed height container to prevent layout shifts */}
                        <div className="h-8 sm:h-10 md:h-14 flex items-center justify-center w-full">
                           <CyclingText />
                        </div>
                        <span>into KB Articles</span>
                    </h3>
                    <p className="text-zinc-500 text-xs sm:text-base md:text-lg font-light tracking-wide">
                        <span className="hidden md:inline">Drag & Drop files</span>
                        <span className="md:hidden">Tap</span> to upload documents (PDF/Images)
                    </p>
                </div>
            </div>

            <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                multiple
                onChange={handleFileChange}
                disabled={isGenerating || disabled}
            />
        </label>
      </div>

      {/* Input Bar for Text/Voice Start */}
      <div className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-2 flex items-center gap-2 backdrop-blur-sm transition-colors focus-within:border-zinc-600 focus-within:bg-zinc-900/80">
         {/* Template Selector */}
         <div className="relative flex items-center border-r border-zinc-800 pr-2">
            <select 
                value={selectedTemplate}
                onChange={(e) => setSelectedTemplate(e.target.value)}
                className="appearance-none bg-transparent text-zinc-300 text-sm pl-2 pr-8 py-2 focus:outline-none cursor-pointer hover:text-white"
                disabled={isGenerating}
            >
                <option value="auto">Auto-Detect</option>
                <option value="troubleshooting">Troubleshooting</option>
                <option value="howto">How-To Guide</option>
                <option value="faq">FAQ</option>
                <option value="sop">SOP Policy</option>
            </select>
            <ChevronDownIcon className="w-3 h-3 text-zinc-500 absolute right-4 pointer-events-none" />
         </div>

         {/* Settings Shortcut */}
         {onOpenSettings && (
             <button 
                onClick={onOpenSettings}
                className="p-3 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors border-r border-zinc-800 pr-4"
                title="Workspace Settings"
                disabled={isGenerating}
             >
                <Cog6ToothIcon className="w-5 h-5" />
             </button>
         )}

         <button 
            onClick={toggleListening} 
            className={`p-3 rounded-lg hover:bg-zinc-800 transition-colors ${isListening ? 'text-red-500 animate-pulse bg-red-500/10' : 'text-zinc-400'}`}
            title="Dictate text"
            disabled={isGenerating}
         >
            <MicrophoneIcon className="w-5 h-5" />
         </button>

         <input 
            type="text" 
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Or type/speak your notes to generate a KB article..." 
            className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-white placeholder-zinc-500 text-sm md:text-base"
            onKeyDown={e => e.key === 'Enter' && handleTextSubmit()}
            disabled={isGenerating}
         />
         <button 
            onClick={handleTextSubmit} 
            disabled={!prompt.trim() || isGenerating} 
            className={`p-3 rounded-lg transition-colors ${!prompt.trim() || isGenerating ? 'text-zinc-600' : 'text-blue-400 hover:bg-blue-500/10'}`}
         >
            <PaperAirplaneIcon className="w-5 h-5" />
         </button>
      </div>
    </div>
  );
};
