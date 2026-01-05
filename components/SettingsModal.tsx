
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
    // Generation Parameters
    temperature: number;
    topP: number;
    thinkingBudget: number; // For Gemini 3/2.5 models
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
            const models = data.data
                .filter((m: any) => {
                    const toolSupportedFamilies = ['gpt-4o', 'gpt-4-turbo', 'claude-3-5', 'claude-3-sonnet', 'claude-3-opus', 'gemini-1.5', 'gemini-pro', 'llama-3.1', 'llama-3.3', 'mistral-large', 'qwen-2.5', 'command-r', 'deepseek-v3'];
                    const idLower = m.id.toLowerCase();
                    const nameLower = (m.name || "").toLowerCase();
                    const descLower = (m.description || "").toLowerCase();
                    const matchesFamily = toolSupportedFamilies.some(family => idLower.includes(family) || nameLower.includes(family));
                    const mentionsTools = descLower.includes("tool use") || descLower.includes("function calling") || descLower.includes("tool support");
                    return matchesFamily || mentionsTools;
                })
                .map((m: any) => ({ id: m.id, name: m.name || m.id, isMultimodal: (m.description || "").toLowerCase().includes("vision") || (m.description || "").toLowerCase().includes("multimodal") }))
                .sort((a: any, b: any) => a.name.localeCompare(b.name));

            setOrModels(models);
            setIsValidated(true);
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
                    <h3 className="text-lg font-bold text-white">Advanced Settings</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4 text-blue-400" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Global Parameters</h4>
                        </div>
                        <div className="space-y-4 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Temperature: {settings.temperature.toFixed(1)}</label>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.1"
                                    value={settings.temperature}
                                    onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase">Thinking Budget: {settings.thinkingBudget}</label>
                                </div>
                                <input 
                                    type="range" min="0" max="32768" step="1024"
                                    value={settings.thinkingBudget}
                                    onChange={(e) => handleChange('thinkingBudget', parseInt(e.target.value))}
                                    className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                                <p className="text-[8px] text-zinc-600 mt-1 italic">Controls reasoning depth for Gemini 3 series.</p>
                            </div>
                        </div>
                    </section>

                    <hr className="border-zinc-800" />

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <BoltIcon className="w-4 h-4 text-amber-400" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">External Credentials</h4>
                        </div>
                        <div className="space-y-3 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">OpenRouter API Key</label>
                                <div className="relative">
                                    <input 
                                        type={showKey ? "text" : "password"}
                                        placeholder="sk-or-v1-..."
                                        value={settings.openRouterKey}
                                        onChange={(e) => handleChange('openRouterKey', e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                    />
                                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white">
                                        <EyeIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">ElevenLabs API Key</label>
                                <input 
                                    type="password"
                                    placeholder="elevenlabs_..."
                                    value={settings.elevenLabsKey}
                                    onChange={(e) => handleChange('elevenLabsKey', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </section>
                </div>
                <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-800/20 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20">Save & Close</button>
                </div>
            </div>
        </div>
    );
};
