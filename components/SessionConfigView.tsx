
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
    ArrowPathIcon,
    MusicalNoteIcon,
    SpeakerWaveIcon,
    ChatBubbleBottomCenterTextIcon,
    SparklesIcon
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

    const GEMINI_VOICES = [
        { id: 'Puck', label: 'Puck' },
        { id: 'Charon', label: 'Charon' },
        { id: 'Kore', label: 'Kore' },
        { id: 'Fenrir', label: 'Fenrir' },
        { id: 'Zephyr', label: 'Zephyr' }
    ];

    const fetchGeminiModels = useCallback(async (key?: string) => {
        const apiKey = key || settings.geminiKey || process.env.API_KEY;
        if (!apiKey) return;

        setIsFetchingGemini(true);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await response.json();
            if (data && data.models && Array.isArray(data.models)) {
                const filtered = data.models
                    .filter((m: any) => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
                    .map((m: any) => ({
                        id: m.name.replace('models/', ''),
                        name: m.displayName || m.name.replace('models/', '')
                    }));
                setGeminiModels(filtered);
            }
        } catch (e) {
            console.error("Gemini fetch failed", e);
        } finally { setIsFetchingGemini(false); }
    }, [settings.geminiKey]);

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

    const isGeminiKeyMissing = !settings.geminiKey && !process.env.API_KEY;
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
                
                {/* Intelligence Node */}
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
                                        <label className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">Target Model (Artifact Gen)</label>
                                        <button 
                                            onClick={() => settings.provider === 'gemini' ? fetchGeminiModels() : fetchOrModels(settings.openRouterKey)}
                                            className="text-zinc-500 hover:text-blue-400 transition-colors"
                                        >
                                            <ArrowPathIcon className={`w-3 h-3 ${(isFetchingGemini || isFetchingOr) ? 'animate-spin' : ''}`} />
                                        </button>
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

                {/* Interface Logic */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2">
                        <BoltIcon className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Interface Logic</span>
                    </div>
                    <div className="p-4 bg-zinc-900/30 rounded-xl border border-zinc-800/50 space-y-5">
                        <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-zinc-100">Live interaction</span>
                                <span className="text-[9px] text-zinc-500 uppercase tracking-tighter">Real-time voice editing</span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.enableLiveApi} onChange={(e) => handleChange('enableLiveApi', e.target.checked)} />
                                <div className="w-10 h-5 bg-zinc-800 rounded-full peer peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full shadow-inner"></div>
                            </label>
                        </div>

                        {settings.enableLiveApi && (
                            <div className="space-y-5 pt-4 border-t border-zinc-800/40 animate-in slide-in-from-top-2">
                                
                                {/* Live Brain Selector */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        <ChatBubbleBottomCenterTextIcon className="w-3.5 h-3.5 text-blue-400" />
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Live Logic Model (Brain)</label>
                                    </div>
                                    <select 
                                        value={settings.liveModel} 
                                        onChange={(e) => handleChange('liveModel', e.target.value)}
                                        className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                                    >
                                        <optgroup label="Native Logic">
                                            <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                                            <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                        </optgroup>
                                        {settings.provider === 'openrouter' && orModels.length > 0 && (
                                            <optgroup label="OpenRouter Selection">
                                                {orModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </optgroup>
                                        )}
                                        {settings.provider === 'gemini' && geminiModels.length > 0 && (
                                            <optgroup label="Available Gemini Nodes">
                                                {geminiModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                            </optgroup>
                                        )}
                                    </select>
                                </div>

                                {/* Persona Selection */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        <SparklesIcon className="w-3.5 h-3.5 text-yellow-400" />
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Persona Logic (Prompt)</label>
                                    </div>
                                    <select 
                                        value={settings.livePromptMode} 
                                        onChange={(e) => handleChange('livePromptMode', e.target.value)}
                                        className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                                    >
                                        <option value="witty">Witty & Sharp</option>
                                        <option value="professional">Professional & Technical</option>
                                        <option value="custom">Custom System Protocol</option>
                                    </select>
                                    {settings.livePromptMode === 'custom' && (
                                        <textarea 
                                            value={settings.customLivePrompt}
                                            onChange={(e) => handleChange('customLivePrompt', e.target.value)}
                                            placeholder="Define unique behavior parameters..."
                                            className="w-full bg-black border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 focus:outline-none focus:border-blue-500/50 min-h-[100px] font-mono mt-2"
                                        />
                                    )}
                                </div>

                                {/* Voice Protocol Selection */}
                                <div className="space-y-2">
                                    <div className="flex items-center gap-1.5">
                                        <MusicalNoteIcon className="w-3.5 h-3.5 text-pink-500" />
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Voice Engine (Speech)</label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button 
                                            onClick={() => handleChange('voiceEngine', 'gemini')}
                                            className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.voiceEngine === 'gemini' ? 'bg-zinc-800 border-zinc-700 text-white shadow-lg' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                        >
                                            Gemini Native
                                        </button>
                                        <button 
                                            onClick={() => handleChange('voiceEngine', 'elevenlabs')}
                                            className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.voiceEngine === 'elevenlabs' ? 'bg-zinc-800 border-zinc-700 text-white shadow-lg' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                        >
                                            ElevenLabs
                                        </button>
                                    </div>
                                </div>

                                {/* Specific Voice Configs */}
                                {settings.voiceEngine === 'gemini' ? (
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold text-zinc-600 uppercase">Gemini Voice</label>
                                        <select 
                                            value={settings.liveVoice}
                                            onChange={(e) => handleChange('liveVoice', e.target.value)}
                                            className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 appearance-none"
                                        >
                                            {GEMINI_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                                        </select>
                                    </div>
                                ) : (
                                    <div className="space-y-3 p-3 bg-black/40 border border-zinc-800 rounded-xl">
                                        <div className="space-y-1.5">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[9px] font-bold text-zinc-600 uppercase">Voice ID</label>
                                                <span className="text-[8px] bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded border border-orange-500/20 font-black">EL-TRANSCODE</span>
                                            </div>
                                            <input 
                                                type="text"
                                                placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                                                value={settings.elevenLabsVoiceId}
                                                onChange={(e) => handleChange('elevenLabsVoiceId', e.target.value)}
                                                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/50"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-bold text-zinc-600 uppercase">ElevenLabs API Key</label>
                                            <input 
                                                type={showKeys ? "text" : "password"}
                                                placeholder="eleven_..."
                                                value={settings.elevenLabsKey || ''}
                                                onChange={(e) => handleChange('elevenLabsKey', e.target.value)}
                                                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500/50"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* External Credentials */}
                <div id="credentials-section" className="space-y-4 pt-4 border-t border-zinc-800/50 animate-in fade-in duration-700">
                    <div className="flex items-center gap-2">
                        <KeyIcon className="w-4 h-4 text-zinc-400" />
                        <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest">Global Credentials</span>
                    </div>
                    <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800/80 space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-bold text-zinc-600 uppercase flex items-center justify-between">
                                Gemini API Key
                                <button onClick={() => setShowKeys(!showKeys)} className="text-zinc-500 hover:text-white transition-colors">
                                    {showKeys ? <EyeSlashIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                                </button>
                            </label>
                            <input 
                                type={showKeys ? "text" : "password"}
                                placeholder="AIzaSy..."
                                value={settings.geminiKey || ''}
                                onChange={(e) => {
                                    handleChange('geminiKey', e.target.value);
                                    if (e.target.value.length > 30) fetchGeminiModels(e.target.value);
                                }}
                                className="w-full bg-black border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500/50 placeholder-zinc-800"
                            />
                        </div>

                        <div className="space-y-2 pt-2 border-t border-zinc-800/40">
                            <label className="text-[9px] font-bold text-zinc-600 uppercase">OpenRouter API Key</label>
                            <input 
                                type={showKeys ? "text" : "password"}
                                placeholder="sk-or-v1-..."
                                value={settings.openRouterKey || ''}
                                onChange={(e) => handleChange('openRouterKey', e.target.value)}
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
