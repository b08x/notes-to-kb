
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState } from 'react';
import { 
    XMarkIcon, 
    CpuChipIcon, 
    KeyIcon, 
    EyeIcon, 
    MusicalNoteIcon, 
    BoltIcon,
    SpeakerWaveIcon,
    InformationCircleIcon
} from '@heroicons/react/24/outline';

export type LivePromptMode = 'witty' | 'professional' | 'custom';
export type Provider = 'gemini' | 'openrouter';
export type VoiceEngine = 'gemini' | 'elevenlabs';

export interface AppSettings {
    provider: Provider;
    enableLiveApi: boolean;
    liveModel: string;
    liveVoice: string; // Prebuilt Gemini Voice name
    livePromptMode: LivePromptMode;
    customLivePrompt: string;
    generationModel: string;
    geminiKey: string; 
    openRouterKey: string;
    openRouterModel: string;
    // Generation Parameters
    temperature: number;
    topP: number;
    thinkingBudget: number; 
    // Voice Settings
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

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    const [showKey, setShowKey] = useState(false);

    if (!isOpen) return null;

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    const GEMINI_VOICES = [
        { id: 'Puck', label: 'Puck (Youthful & Bright)' },
        { id: 'Charon', label: 'Charon (Deep & Resonant)' },
        { id: 'Kore', label: 'Kore (Clear & Professional)' },
        { id: 'Fenrir', label: 'Fenrir (Stoic & Measured)' },
        { id: 'Zephyr', label: 'Zephyr (Warm & Airy)' }
    ];

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                    <h3 className="text-lg font-bold text-white">System Configuration</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><XMarkIcon className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    
                    {/* Voice Protocol Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <MusicalNoteIcon className="w-4 h-4 text-pink-500" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Voice Protocol</h4>
                        </div>
                        <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800 space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Voice Engine</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button 
                                        onClick={() => handleChange('voiceEngine', 'gemini')}
                                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.voiceEngine === 'gemini' ? 'bg-blue-600/10 border-blue-500/50 text-blue-100' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                    >
                                        Gemini Native
                                    </button>
                                    <button 
                                        onClick={() => handleChange('voiceEngine', 'elevenlabs')}
                                        className={`px-3 py-2 text-[10px] font-black uppercase rounded-lg border transition-all ${settings.voiceEngine === 'elevenlabs' ? 'bg-orange-600/10 border-orange-500/50 text-orange-100' : 'bg-black/20 border-zinc-800 text-zinc-600'}`}
                                    >
                                        ElevenLabs
                                    </button>
                                </div>
                            </div>

                            {settings.voiceEngine === 'gemini' ? (
                                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Selected Voice</label>
                                    <select 
                                        value={settings.liveVoice} 
                                        onChange={(e) => handleChange('liveVoice', e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 appearance-none"
                                    >
                                        {GEMINI_VOICES.map(v => (
                                            <option key={v.id} value={v.id}>{v.label}</option>
                                        ))}
                                    </select>
                                    <div className="flex items-center gap-2 px-1 text-[9px] text-zinc-500">
                                        <InformationCircleIcon className="w-3 h-3" />
                                        <span>Gemini voices provide the lowest latency for real-time interactions.</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">ElevenLabs API Key</label>
                                        <div className="relative">
                                            <input 
                                                type={showKey ? "text" : "password"}
                                                placeholder="elevenlabs_..."
                                                value={settings.elevenLabsKey || ''}
                                                onChange={(e) => handleChange('elevenLabsKey', e.target.value)}
                                                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                                            />
                                            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white">
                                                <EyeIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Voice ID</label>
                                        <input 
                                            type="text"
                                            placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
                                            value={settings.elevenLabsVoiceId || ''}
                                            onChange={(e) => handleChange('elevenLabsVoiceId', e.target.value)}
                                            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 px-1 text-[9px] text-zinc-500">
                                        <InformationCircleIcon className="w-3 h-3" />
                                        <span>High-fidelity voices from ElevenLabs. Requires an active API key.</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>

                    <hr className="border-zinc-800" />

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <CpuChipIcon className="w-4 h-4 text-blue-400" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Model Parameters</h4>
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
                            </div>
                        </div>
                    </section>

                    <hr className="border-zinc-800" />

                    <section className="space-y-4">
                        <div className="flex items-center gap-2">
                            <KeyIcon className="w-4 h-4 text-amber-400" />
                            <h4 className="text-sm font-bold text-zinc-200 uppercase tracking-widest">Access Credentials</h4>
                        </div>
                        <div className="space-y-3 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Gemini API Key</label>
                                <div className="relative">
                                    <input 
                                        type={showKey ? "text" : "password"}
                                        placeholder="AIzaSy..."
                                        value={settings.geminiKey || ''}
                                        onChange={(e) => handleChange('geminiKey', e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                    />
                                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-white">
                                        <EyeIcon className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">OpenRouter API Key</label>
                                <input 
                                    type={showKey ? "text" : "password"}
                                    placeholder="sk-or-v1-..."
                                    value={settings.openRouterKey}
                                    onChange={(e) => handleChange('openRouterKey', e.target.value)}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                                />
                            </div>
                        </div>
                    </section>
                </div>
                <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-800/20 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-lg shadow-blue-900/20">Apply & Sync</button>
                </div>
            </div>
        </div>
    );
};
