
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect } from 'react';
import { XMarkIcon, ChatBubbleBottomCenterTextIcon, AcademicCapIcon, AdjustmentsHorizontalIcon, ArrowPathIcon, CpuChipIcon, ShieldCheckIcon, EyeIcon } from '@heroicons/react/24/outline';

export type LivePromptMode = 'witty' | 'professional' | 'custom';
export type Provider = 'gemini' | 'openrouter';

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

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    const [orModels, setOrModels] = useState<{ id: string, name: string, isMultimodal: boolean }[]>([]);
    const [isFetchingOr, setIsFetchingOr] = useState(false);
    const [orError, setOrError] = useState<string | null>(null);
    const [isValidated, setIsValidated] = useState(false);

    if (!isOpen) return null;

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
        if (key === 'openRouterKey') setIsValidated(false);
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
                    const keywords = ['vision', 'multimodal', 'vl', 'llava', 'pixtral', 'phi-3-vision', 'gpt-4o', 'gemini-1.5', 'claude-3'];
                    return keywords.some(k => m.id.toLowerCase().includes(k) || (m.name || "").toLowerCase().includes(k));
                })
                .map((m: any) => ({ id: m.id, name: m.name || m.id, isMultimodal: true }))
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
                    <section className="space-y-4">
                        <h4 className="text-sm font-bold text-zinc-200">AI Provider</h4>
                        <div className="grid grid-cols-2 gap-2 bg-black/30 p-1 rounded-xl border border-zinc-800">
                            <button onClick={() => handleChange('provider', 'gemini')} className={`px-4 py-2 text-xs font-bold rounded-lg ${settings.provider === 'gemini' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>Gemini</button>
                            <button onClick={() => handleChange('provider', 'openrouter')} className={`px-4 py-2 text-xs font-bold rounded-lg ${settings.provider === 'openrouter' ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}>OpenRouter</button>
                        </div>
                    </section>
                    <hr className="border-zinc-800" />
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-zinc-200">Live API (Native Audio)</h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.enableLiveApi} onChange={(e) => handleChange('enableLiveApi', e.target.checked)} />
                                <div className="w-11 h-6 bg-zinc-700 rounded-full peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        {settings.enableLiveApi && (
                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Voice</label>
                                    <select value={settings.liveVoice} onChange={(e) => handleChange('liveVoice', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                                        <option value="Kore">Kore</option>
                                        <option value="Puck">Puck</option>
                                        <option value="Charon">Charon</option>
                                        <option value="Fenrir">Fenrir</option>
                                        <option value="Zephyr">Zephyr</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Personality</label>
                                    <select value={settings.livePromptMode} onChange={(e) => handleChange('livePromptMode', e.target.value)} className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white">
                                        <option value="witty">Witty</option>
                                        <option value="professional">Professional</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};
