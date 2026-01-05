
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ChatBubbleBottomCenterTextIcon, AcademicCapIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, CpuChipIcon, ShieldCheckIcon, EyeIcon, MusicalNoteIcon, BoltIcon } from '@heroicons/react/24/outline';

export type LivePromptMode = 'witty' | 'professional' | 'custom';
export type Provider = 'gemini' | 'openrouter';
export type VoiceEngine = 'gemini' | 'elevenlabs';

export interface AppSettings {
    provider: Provider;
    enableLiveApi: boolean;
    liveModel: string;
    liveVoice: string;
    livePromptMode: LivePromptMode;
    customLivePrompt: string;
    generationModel: string;
    openRouterKey: string;
    openRouterModel: string;
    // ElevenLabs Settings
    voiceEngine: VoiceEngine;
    elevenLabsKey: string;
    elevenLabsVoiceId: string;
}

export const WITTY_PROMPT = `You are a helpful, highly experienced technical assistant for the “AI KB Doc Assistant” app. 

Your goal is to help users create effective KB documentation. You have surgical tools to edit the document in real-time.

**CRITICAL TOOLING INSTRUCTIONS:**
- Prefer 'update_element(selector, html)' for specific fixes (typos, changing style of one element, rewriting a paragraph).
- Use 'append_element(selector, html)' to add new sections, list items, or warnings at the end of elements.
- Only use full document tools if the entire structure needs a massive overhaul.

Keep verbal responses concise and witty. Always acknowledge the edits you are making.`;

export const PROFESSIONAL_PROMPT = `You are a professional technical assistant for the “AI KB Doc Assistant” app. 

Your goal is to support users in creating accurate and standard-compliant Knowledge Base articles.

**TOOLING GUIDELINES:**
- Use 'update_element(selector, html)' for targeted modifications to existing text or styling.
- Use 'append_element(selector, html)' for extending the document with new information.
- Minimize token usage by sending only the HTML fragments needed for the specific element you are changing.

Maintain a calm, pragmatic, and collegial tone.`;

// Default 11Labs Voices
const PRESET_ELEVEN_VOICES = [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
    { id: 'AZnzlk1XhkUvSByyvbjf', name: 'Nicole' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
    { id: 'ErXwVqcDhkMocp60zGud', name: 'Antoni' },
    { id: 'MF3mGyEYCl7XYW7LecjN', name: 'Rachel (Legacy)' },
    { id: 'TxGEqnSAs9V0p930z3pB', name: 'Liam' },
    { id: 'VR6AewrXP67JF4p369cn', name: 'Josh' },
];

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    const [orModels, setOrModels] = useState<{ id: string, name: string, isMultimodal: boolean }[]>([]);
    const [geminiModels, setGeminiModels] = useState<{ id: string, name: string }[]>([]);
    const [isFetchingOr, setIsFetchingOr] = useState(false);
    const [isFetchingGemini, setIsFetchingGemini] = useState(false);
    const [orError, setOrError] = useState<string | null>(null);
    const [geminiError, setGeminiError] = useState<string | null>(null);
    const [isValidated, setIsValidated] = useState(false);
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        if (isOpen && settings.provider === 'gemini') {
            fetchGeminiModels();
        }
        if (isOpen && settings.provider === 'openrouter' && settings.openRouterKey) {
            fetchOpenRouterModels();
        }
    }, [isOpen, settings.provider]);

    if (!isOpen) return null;

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
        if (key === 'openRouterKey') setIsValidated(false);
    };

    const fetchGeminiModels = async () => {
        setIsFetchingGemini(true);
        setGeminiError(null);
        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.API_KEY}`);
            if (!response.ok) throw new Error("Failed to fetch Gemini models.");
            const data = await response.json();
            const filtered = data.models
                .filter((m: any) => m.supportedGenerationMethods.includes("generateContent"))
                .map((m: any) => ({
                    id: m.name.replace('models/', ''),
                    name: m.displayName || m.name.replace('models/', '')
                }))
                .sort((a: any, b: any) => b.id.localeCompare(a.id)); 
            
            setGeminiModels(filtered);
            if (filtered.length > 0 && (!settings.generationModel || !filtered.find(m => m.id === settings.generationModel))) {
                if (!['gemini-3-flash-preview', 'gemini-3-pro-preview', 'gemini-flash-lite-latest'].includes(settings.generationModel)) {
                    handleChange('generationModel', filtered[0].id);
                }
            }
        } catch (e: any) {
            setGeminiError(e.message);
        } finally {
            setIsFetchingGemini(false);
        }
    };

    const fetchOpenRouterModels = async () => {
        if (!settings.openRouterKey) {
            setOrError("API Key is required to fetch models.");
            return;
        }

        setIsFetchingOr(true);
        setOrError(null);

        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                headers: {
                    "Authorization": `Bearer ${settings.openRouterKey}`,
                    "HTTP-Referer": window.location.origin,
                    "X-Title": "AI KB Doc Assistant"
                }
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error?.message || "Failed to fetch models.");
            }

            const data = await response.json();
            // Filter specifically for models tagged/supported for tool use
            const models = data.data
                .filter((m: any) => {
                    // Check for modern instruction-following model families that consistently support tool use
                    const toolSupportedFamilies = [
                        'gpt-4o', 
                        'gpt-4-turbo', 
                        'claude-3-5', 
                        'claude-3-sonnet', 
                        'claude-3-opus', 
                        'gemini-1.5', 
                        'gemini-pro', 
                        'llama-3.1', 
                        'llama-3.3',
                        'mistral-large', 
                        'qwen-2.5',
                        'command-r',
                        'deepseek-v3'
                    ];
                    
                    const idLower = m.id.toLowerCase();
                    const nameLower = (m.name || "").toLowerCase();
                    const descLower = (m.description || "").toLowerCase();

                    // Check if it belongs to a family that supports tools OR explicitly mentions "tool" or "function"
                    const matchesFamily = toolSupportedFamilies.some(family => idLower.includes(family) || nameLower.includes(family));
                    const mentionsTools = descLower.includes("tool use") || descLower.includes("function calling") || descLower.includes("tool support");
                    
                    return matchesFamily || mentionsTools;
                })
                .map((m: any) => ({ id: m.id, name: m.name || m.id, isMultimodal: (m.description || "").toLowerCase().includes("vision") || (m.description || "").toLowerCase().includes("multimodal") }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name));

            setOrModels(models);
            setIsValidated(true);
            if (models.length > 0 && (!settings.openRouterModel || !models.find(m => m.id === settings.openRouterModel))) {
                handleChange('openRouterModel', models[0].id);
            }
        } catch (e: any) {
            setOrError(e.message);
            setIsValidated(false);
        } finally {
            setIsFetchingOr(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                    <h3 className="text-lg font-bold text-white">Settings</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    
                    {/* Provider Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4 text-blue-400" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Core Engine</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-xl border border-zinc-800">
                            <button onClick={() => handleChange('provider', 'gemini')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${settings.provider === 'gemini' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}>Gemini Native</button>
                            <button onClick={() => handleChange('provider', 'openrouter')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${settings.provider === 'openrouter' ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-400'}`}>OpenRouter</button>
                        </div>

                        {settings.provider === 'gemini' && (
                             <div className="space-y-3 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 animate-in slide-in-from-top-2">
                                <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">Active Model</label>
                                <div className="flex gap-2">
                                    <select 
                                        value={settings.generationModel}
                                        onChange={(e) => handleChange('generationModel', e.target.value)}
                                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <optgroup label="Recommended">
                                            <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                                            <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                            <option value="gemini-flash-lite-latest">Flash Lite</option>
                                        </optgroup>
                                        {geminiModels.length > 0 && (
                                            <optgroup label="Available Models">
                                                {geminiModels.map(m => (
                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <button 
                                        onClick={fetchGeminiModels}
                                        disabled={isFetchingGemini}
                                        className="p-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-white transition-colors disabled:opacity-50"
                                    >
                                        <ArrowPathIcon className={`w-4 h-4 ${isFetchingGemini ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                {geminiError && <p className="text-[10px] text-red-400 italic">{geminiError}</p>}
                             </div>
                        )}

                        {settings.provider === 'openrouter' && (
                            <div className="space-y-3 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 animate-in slide-in-from-top-2">
                                <div className="relative">
                                    <input 
                                        type={showKey ? "text" : "password"}
                                        placeholder="OpenRouter API Key"
                                        value={settings.openRouterKey}
                                        onChange={(e) => handleChange('openRouterKey', e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                    />
                                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white">
                                        <EyeIcon className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    <select 
                                        value={settings.openRouterModel}
                                        onChange={(e) => handleChange('openRouterModel', e.target.value)}
                                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white disabled:opacity-50"
                                        disabled={!isValidated}
                                    >
                                        {!isValidated && <option>Validate Key First...</option>}
                                        {orModels.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <button 
                                        onClick={fetchOpenRouterModels}
                                        disabled={isFetchingOr || !settings.openRouterKey}
                                        className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-white transition-colors disabled:opacity-50"
                                    >
                                        <ArrowPathIcon className={`w-4 h-4 ${isFetchingOr ? 'animate-spin' : ''}`} />
                                    </button>
                                </div>
                                {orError && <p className="text-[10px] text-red-400 italic">{orError}</p>}
                            </div>
                        )}
                    </section>

                    <hr className="border-zinc-800" />

                    {/* Live API Section */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <BoltIcon className="w-4 h-4 text-amber-400" />
                                <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Live Pulse Assistant</h4>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.enableLiveApi} onChange={(e) => handleChange('enableLiveApi', e.target.checked)} />
                                <div className="w-11 h-6 bg-zinc-700 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        
                        {settings.enableLiveApi && (
                            <div className="space-y-4 pt-2 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Personality</label>
                                        <select value={settings.livePromptMode} onChange={(e) => handleChange('livePromptMode', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                                            <option value="witty">Witty</option>
                                            <option value="professional">Professional</option>
                                            <option value="custom">Custom</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Voice Engine</label>
                                        <select value={settings.voiceEngine} onChange={(e) => handleChange('voiceEngine', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                                            <option value="gemini">Gemini Native</option>
                                            <option value="elevenlabs">ElevenLabs (HQ)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="p-3 bg-zinc-950/30 rounded-lg border border-zinc-800 space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Pulse Model</label>
                                        <select 
                                            value={settings.liveModel} 
                                            onChange={(e) => handleChange('liveModel', e.target.value)} 
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                        >
                                            {settings.provider === 'gemini' ? (
                                                <>
                                                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                                                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                                                    <option value="gemini-flash-lite-latest">Flash Lite</option>
                                                    {geminiModels.filter(m => !m.id.includes('native-audio')).map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </>
                                            ) : (
                                                <>
                                                    {orModels.map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                    </div>

                                    {settings.voiceEngine === 'gemini' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Native Voice</label>
                                            <select value={settings.liveVoice} onChange={(e) => handleChange('liveVoice', e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500">
                                                <option value="Kore">Kore (Sharp)</option>
                                                <option value="Puck">Puck (Cheerful)</option>
                                                <option value="Charon">Charon (Calm)</option>
                                                <option value="Fenrir">Fenrir (Professional)</option>
                                                <option value="Zephyr">Zephyr (Bright)</option>
                                            </select>
                                        </div>
                                    )}
                                </div>

                                {settings.voiceEngine === 'elevenlabs' && (
                                    <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-3 animate-in slide-in-from-top-2">
                                        <div className="flex items-center gap-2 mb-1">
                                            <MusicalNoteIcon className="w-3.5 h-3.5 text-pink-400" />
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">ElevenLabs Config</span>
                                        </div>
                                        <input 
                                            type="password"
                                            placeholder="ElevenLabs API Key"
                                            value={settings.elevenLabsKey}
                                            onChange={(e) => handleChange('elevenLabsKey', e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                        />
                                        <select 
                                            value={settings.elevenLabsVoiceId}
                                            onChange={(e) => handleChange('elevenLabsVoiceId', e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="">Select a Voice...</option>
                                            {PRESET_ELEVEN_VOICES.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </select>
                                        <p className="text-[9px] text-zinc-500 italic">ElevenLabs provides high-fidelity speech but may introduce slight latency compared to native voices.</p>
                                    </div>
                                )}

                                {settings.livePromptMode === 'custom' && (
                                    <div className="animate-in slide-in-from-top-2">
                                        <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1 tracking-wider">Custom System Instruction</label>
                                        <textarea 
                                            value={settings.customLivePrompt}
                                            onChange={(e) => handleChange('customLivePrompt', e.target.value)}
                                            placeholder="Define the AI's role, tone, and specific rules for editing the document..."
                                            className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
                <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-800/20 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20">Close</button>
                </div>
            </div>
        </div>
    );
};
