
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useCallback, useState, useEffect, useRef } from 'react';
import { 
    ArrowUpTrayIcon, 
    MicrophoneIcon, 
    PaperAirplaneIcon, 
    DocumentDuplicateIcon, 
    ChevronDownIcon, 
    CloudArrowUpIcon, 
    Cog6ToothIcon 
} from '@heroicons/react/24/outline';

interface InputAreaProps {
  onGenerate: (prompt: string, files?: File[], template?: string) => void;
  isGenerating: boolean;
  disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ onGenerate, isGenerating, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('auto');
  const recognitionRef = useRef<any>(null);

  const handleFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validFiles = fileArray.filter(file => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (validFiles.length > 0) onGenerate(prompt, validFiles, selectedTemplate);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || isGenerating) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }, [disabled, isGenerating, prompt, selectedTemplate]);

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
    } else {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) return;
      const recognition = new SpeechRecognition();
      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => setPrompt(prev => prev + " " + event.results[0][0].transcript);
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
    <div 
        className={`relative w-full transition-all duration-300 ${isDragging ? 'scale-[0.98]' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
    >
        {isDragging && (
            <div className="absolute -inset-2 z-50 bg-blue-600/10 border-2 border-dashed border-blue-500 rounded-2xl flex flex-col items-center justify-center backdrop-blur-sm pointer-events-none">
                <CloudArrowUpIcon className="w-8 h-8 text-blue-400 animate-bounce mb-1" />
                <span className="text-[10px] font-black uppercase text-blue-300">Release Signal</span>
            </div>
        )}

        <div className="bg-black/40 border border-zinc-800 rounded-2xl overflow-hidden focus-within:border-zinc-600 transition-all shadow-xl">
            {/* Top Toolbar */}
            <div className="flex items-center gap-1 p-1 px-2 bg-zinc-950 border-b border-zinc-800">
                <div className="relative">
                    <select 
                        value={selectedTemplate}
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="appearance-none bg-zinc-900 text-zinc-500 text-[9px] font-black uppercase tracking-wider pl-3 pr-8 py-1.5 rounded-lg border border-zinc-800 focus:outline-none hover:text-zinc-300 transition-colors cursor-pointer"
                        disabled={isGenerating}
                    >
                        <option value="auto">Auto-Detect</option>
                        <option value="troubleshooting">Triage</option>
                        <option value="howto">Procedure</option>
                        <option value="faq">FAQ</option>
                        <option value="sop">SOP Policy</option>
                    </select>
                    <ChevronDownIcon className="w-2.5 h-2.5 text-zinc-700 absolute right-3 top-2 pointer-events-none" />
                </div>
                <div className="h-4 w-px bg-zinc-800 mx-1"></div>
                <button 
                    onClick={() => document.getElementById('file-upload-input')?.click()}
                    className="p-1.5 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900 rounded-lg transition-all"
                    title="Upload Source Assets"
                >
                    <ArrowUpTrayIcon className="w-4 h-4" />
                </button>
                <input id="file-upload-input" type="file" className="hidden" multiple accept="image/*,application/pdf" onChange={handleFileChange} />
                
                <button 
                    onClick={toggleListening}
                    className={`p-1.5 rounded-lg transition-all ${isListening ? 'text-red-500 bg-red-500/10' : 'text-zinc-600 hover:text-zinc-300 hover:bg-zinc-900'}`}
                >
                    <MicrophoneIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Input Bar */}
            <div className="flex items-center gap-2 p-3">
                <textarea 
                    rows={1}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); }}}
                    placeholder="Enter technical signal or drop files..."
                    className="flex-1 bg-transparent border-none focus:outline-none focus:ring-0 text-white placeholder-zinc-700 text-xs md:text-sm resize-none scrollbar-hide py-1 min-h-[24px]"
                    disabled={isGenerating}
                />
                <button 
                    onClick={handleTextSubmit}
                    disabled={!prompt.trim() || isGenerating}
                    className={`p-2 rounded-xl transition-all shadow-md ${!prompt.trim() || isGenerating ? 'text-zinc-700' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                >
                    <PaperAirplaneIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    </div>
  );
};
