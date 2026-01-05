
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useCallback } from 'react';
import { 
    CpuChipIcon, 
    BoltIcon,
    AdjustmentsVerticalIcon,
    ChevronRightIcon,
    KeyIcon,
    EyeIcon,
    EyeSlashIcon,
    ExclamationCircleIcon,
    ArrowPathIcon
} from '@heroicons/react/24/outline';
import { AppSettings } from './SettingsModal';
import { InputArea } from './InputArea';

interface SessionConfigViewProps {
    settings: AppSettings;
    onUpdateSettings: (settings: AppSettings) => void;
    onStart: (prompt: string, files?: File[], template?: string) => void;
    isGenerating: boolean;
}

export const SessionConfigView: React.FC<SessionConfigViewProps> = ({ 
    settings, 
    onUpdateSettings, 
    onStart,
    isGenerating
}) => {
    const [geminiModels, setGeminiModels] = useState<{ id: string, name: string }[]>([]);
    const [orModels, setOrModels] = useState<{ id: string, name: string }[]>([]);
    const [isFetchingGemini, setIsFetchingGemini] = useState(false);
    const [isFetchingOr, setIsFetchingOr] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showKeys, setShowKeys] = useState(false);

    const fetchGeminiModels = useCallback(async () => {
        setIsFetchingGemini(true);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY}`);
            const data = await response.json();
            if (data && data.models && Array.isArray(data.models)) {
                const filtered = data.models
                    .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
                    .map((m: any) => ({
                        id: m.name.replace('models/', ''),
                        name: m.displayName || m.name.replace('models/', '')
                    }));
                setGeminiModels(filtered);
            } else if (data && data.error) {
                console.warn("Gemini API Error:", data.error.message);
            }
        } catch (e) {
            console.error("Gemini fetch failed", e);
        } finally { setIsFetchingGemini(false); }
    }, []);

    const fetchOrModels = useCallback(async (key: string) => {
        if (!key) return;
        setIsFetchingOr(true);
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                headers: {
                    "Authorization": `Bearer ${key}`,
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "AI KB Doc Assistant"
                }
            });
            const data = await response.json();
            if (data && data.data && Array.isArray(data.data)) {
                const filtered = data.data
                    .filter((m: any) => m.id.includes('gemini') || m.id.includes('gpt-4') || m.id.includes('claude-3'))
                    .map((m: any) => ({
                        id: m.id,
                        name: m.name || m.id
                    }))
                    .sort((a: any, b: any) => a.name.localeCompare(b.name));
                setOrModels(filtered);
            }
        } catch (e) {
            console.error("OpenRouter fetch failed", e);
        } finally { setIsFetchingOr(false); }
    }, []);

    useEffect(() => {
        fetchGeminiModels();
    }, [fetchGeminiModels]);

    useEffect(() => {
        if (settings.openRouterKey) {
            fetchOrModels(settings.openRouterKey);
        }
    }, [settings.openRouterKey, fetchOrModels]);

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    const isOrKeyMissing = settings.provider === 'openrouter' && !settings.openRouterKey;

    return (
        <div className="flex flex-col h-full animate-in fade-in slide-in-from-left-4 duration-500 overflow-hidden">
            <div className="p-6 border-b border-zinc-800 bg-[#0c0c0e] shrink-0">
                <h2 className="text-xl font-black text-white tracking-tighter flex items-center gap-2">
                    <AdjustmentsVerticalIcon className="w-5 h-5 text-blue-500" />
                    Session Protocol
                </h2>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">Configure your AI workspace</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar scroll-smooth">
                
                {/* Model Engine */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <CpuChipIcon className="w-4 h-4 text-zinc-400" />
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Intelligence Node</span>
                    </div>
                    
                    <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2 p-1 bg-black/40 rounded-xl border border-zinc-800">
                             <button 
                                onClick={() => handleChange('provider', 'gemini')}
                                className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${settings.provider === 'gemini' ? 'bg-zinc-800 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'text-zinc-500 hover:text-zinc-400'}`}
                             >
                                Gemini
                             </button>
                             <button 
                                onClick={() => handleChange('provider', 'openrouter')}
                                className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${settings.provider === 'openrouter' ? 'bg-zinc-800 text-white shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'text-zinc-500 hover:text-zinc-400'}`}
                             >
                                OpenRouter
                             </button>
                        </div>

                        <div className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50 space-y-4">
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">Target Model</label>
                                        {(isFetchingGemini || isFetchingOr) && <ArrowPathIcon className="w-3 h-3 text-blue-500 animate-spin" />}
                                    </div>
                                    
                                    {settings.provider === 'gemini' ? (
                                        <select 
                                            value={settings.generationModel} 
                                            onChange={(e) => handleChange('generationModel', e.target.value)}
                                            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                                        >
                                            <option value="gemini-3-flash-preview">Gemini 3 Flash (Fast)</option>
                                            <option value="gemini-3-pro-preview">Gemini 3 Pro (Smart)</option>
                                            <option value="gemini-flash-lite-latest">Flash Lite (Efficient)</option>
                                            {geminiModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    ) : (
                                        <select 
                                            value={settings.openRouterModel} 
                                            onChange={(e) => handleChange('openRouterModel', e.target.value)}
                                            disabled={!settings.openRouterKey}
                                            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 appearance-none disabled:opacity-50"
                                        >
                                            <option value="google/gemini-flash-1.5">Default (Gemini Flash 1.5)</option>
                                            {orModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        </select>
                                    )}
                                </div>

                                {isOrKeyMissing && (
                                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg border bg-red-500/10 border-red-500/20 text-red-400">
                                        <div className="flex items-center gap-2">
                                            <ExclamationCircleIcon className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-bold">Key Missing - Configure Below</span>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="pt-2 border-t border-zinc-800/50">
                                    <button 
                                        onClick={() => setShowAdvanced(!showAdvanced)}
                                        className="w-full flex items-center justify-between text-[10px] font-black uppercase text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        <span>Model Parameters</span>
                                        <ChevronRightIcon className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                                    </button>
                                    
                                    {showAdvanced && (
                                        <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-bold text-zinc-600 uppercase">Temperature</span>
                                                    <span className="text-[10px] font-mono text-blue-400">{settings.temperature}</span>
                                                </div>
                                                <input 
                                                    type="range" min="0" max="1" step="0.1"
                                                    value={settings.temperature}
                                                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                                                    className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />
                                            </div>
                                            {settings.provider === 'gemini' && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center">
                                                        <span className="text-[9px] font-bold text-zinc-600 uppercase">Thinking Budget</span>
                                                        <span className="text-[10px] font-mono text-purple-400">{settings.thinkingBudget}</span>
                                                    </div>
                                                    <input 
                                                        type="range" min="0" max="32768" step="1024"
                                                        value={settings.thinkingBudget}
                                                        onChange={(e) => handleChange('thinkingBudget', parseInt(e.target.value))}
                                                        className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Interaction & Logic */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <BoltIcon className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Interface Logic</span>
                    </div>
                    <div className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-zinc-100">Live Pulse Interaction</span>
                                <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Real-time voice editing</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.enableLiveApi} onChange={(e) => handleChange('enableLiveApi', e.target.checked)} />
                                <div className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
                            </label>
                        </div>

                        {settings.enableLiveApi && (
                            <div className="space-y-4 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => handleChange('livePromptMode', 'witty')}
                                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.livePromptMode === 'witty' ? 'bg-blue-600/10 border-blue-500/50 text-blue-100' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                    >
                                        Witty
                                    </button>
                                    <button 
                                        onClick={() => handleChange('livePromptMode', 'professional')}
                                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.livePromptMode === 'professional' ? 'bg-blue-600/10 border-blue-500/50 text-blue-100' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                    >
                                        Stoic
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* External Credentials Section */}
                <div id="credentials-section" className="space-y-4 pt-4 border-t border-zinc-800/50 animate-in fade-in duration-700">
                    <div className="flex items-center gap-2">
                        <KeyIcon className="w-4 h-4 text-zinc-400" />
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">External Credentials</span>
                    </div>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/80 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-bold text-zinc-600 uppercase flex items-center justify-between">
                                OpenRouter API Key
                                <button onClick={() => setShowKeys(!showKeys)} className="text-zinc-500 hover:text-white transition-colors">
                                    {showKeys ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                </button>
                            </label>
                            <input 
                                type={showKeys ? "text" : "password"}
                                placeholder="sk-or-v1-..."
                                value={settings.openRouterKey || ''}
                                onChange={(e) => handleChange('openRouterKey', e.target.value)}
                                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 placeholder-zinc-800"
                            />
                        </div>
                        
                        <div className="space-y-2 pt-2 border-t border-zinc-800/40">
                            <label className="text-[9px] font-bold text-zinc-600 uppercase">ElevenLabs Key (Optional)</label>
                            <input 
                                type={showKeys ? "text" : "password"}
                                placeholder="elevenlabs_..."
                                value={settings.elevenLabsKey || ''}
                                onChange={(e) => handleChange('elevenLabsKey', e.target.value)}
                                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 placeholder-zinc-800"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="p-6 bg-[#0c0c0e]/80 backdrop-blur-xl border-t border-zinc-800 shrink-0">
                <InputArea 
                    onGenerate={onStart}
                    isGenerating={isGenerating}
                />
            </div>
        </div>
    );
};
