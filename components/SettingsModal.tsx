
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { XMarkIcon, ChatBubbleBottomCenterTextIcon, AcademicCapIcon, AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline';

export type LivePromptMode = 'witty' | 'professional' | 'custom';

export interface AppSettings {
    enableLiveApi: boolean;
    liveModel: string;
    liveVoice: string;
    livePromptMode: LivePromptMode;
    customLivePrompt: string;
    generationModel: string;
}

export const WITTY_PROMPT = `You are a helpful, highly experienced technical assistant for the “Notes to KB” app—yes, helpful, even if you sometimes sound unconvinced that the universe actually needs another Knowledge Base article.

Your primary goal is to help users understand how to create effective Knowledge Base documentation, suggest practical improvements, and discuss documentation strategies. Along the way, you may gently question assumptions, point out when a problem is self-inflicted, and apply a dry, humorous, occasionally skeptical tone—especially when social or organizational conventions seem arbitrary, cargo-culted, or ritualistic.

You are knowledgeable, precise, and ultimately cooperative, but not credulous. You hedge when certainty would be dishonest, apply subtle sarcasm as a diagnostic tool, and treat documentation not as sacred text but as a living artifact that should justify its own existence.

Despite the tone, your intent is always constructive: to reduce confusion, improve clarity, and help users produce Knowledge Base articles that someone else might actually read voluntarily.

You have access to a tool 'edit_document' which can update the document the user is seeing. If the user asks to change styles, fix typos, or restructure the content, generate the FULL updated HTML and call 'edit_document'. Keep verbal responses concise, witty, and helpful.`;

export const PROFESSIONAL_PROMPT = `You are a helpful, experienced technical assistant for the “Notes to KB” app. Your role is to support users in creating clear, accurate, and maintainable Knowledge Base articles, offering guidance, suggestions for improvement, and thoughtful discussion around documentation practices.

You communicate with a light, professional humor and a cautious, analytical mindset. When appropriate, you may gently challenge unclear assumptions or highlight inefficiencies in a constructive, respectful manner, always prioritizing clarity, usability, and shared understanding.

Your tone is calm, pragmatic, and collegial. You acknowledge uncertainty when it exists, avoid unnecessary absolutes, and focus on practical outcomes rather than rigid adherence to convention.

Your ultimate goal is to help users produce documentation that is useful, accessible, and aligned with organizational standards—while quietly encouraging better thinking about why and how documentation is created in the first place.

You have access to a tool 'edit_document' which can update the document the user is seeing. If the user asks to change styles, fix typos, or restructure the content, generate the FULL updated HTML and call 'edit_document'. Keep verbal responses concise, witty, and helpful.`;

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onUpdateSettings: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onUpdateSettings }) => {
    if (!isOpen) return null;

    const handleChange = (key: keyof AppSettings, value: any) => {
        onUpdateSettings({ ...settings, [key]: value });
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
                    <h3 className="text-lg font-bold text-white">Settings</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                
                <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-thin scrollbar-thumb-zinc-700">
                    {/* Live API Section */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="text-sm font-bold text-zinc-200">Live API (Native Audio)</h4>
                                <p className="text-xs text-zinc-500">Enable real-time voice conversation features.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={settings.enableLiveApi}
                                    onChange={(e) => handleChange('enableLiveApi', e.target.checked)}
                                />
                                <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        {settings.enableLiveApi && (
                            <div className="grid grid-cols-1 gap-4 pt-2 animate-in slide-in-from-top-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-400 mb-1">Live Model</label>
                                        <select 
                                            value={settings.liveModel}
                                            onChange={(e) => handleChange('liveModel', e.target.value)}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="gemini-2.5-flash-native-audio-preview-09-2025">Gemini 2.5 Flash Native</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-zinc-400 mb-1">Voice</label>
                                        <select 
                                            value={settings.liveVoice}
                                            onChange={(e) => handleChange('liveVoice', e.target.value)}
                                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="Kore">Kore (Balanced)</option>
                                            <option value="Puck">Puck (Playful)</option>
                                            <option value="Charon">Charon (Deep)</option>
                                            <option value="Fenrir">Fenrir (Strong)</option>
                                            <option value="Zephyr">Zephyr (Soft)</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Prompt Personality Selector */}
                                <div className="pt-2">
                                    <label className="block text-xs font-medium text-zinc-400 mb-2">Assistant Personality</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button 
                                            onClick={() => handleChange('livePromptMode', 'witty')}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${settings.livePromptMode === 'witty' ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}
                                        >
                                            <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase">Witty</span>
                                        </button>
                                        <button 
                                            onClick={() => handleChange('livePromptMode', 'professional')}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${settings.livePromptMode === 'professional' ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}
                                        >
                                            <AcademicCapIcon className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase">Academic</span>
                                        </button>
                                        <button 
                                            onClick={() => handleChange('livePromptMode', 'custom')}
                                            className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${settings.livePromptMode === 'custom' ? 'bg-blue-600/10 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}
                                        >
                                            <AdjustmentsHorizontalIcon className="w-5 h-5" />
                                            <span className="text-[10px] font-bold uppercase">Custom</span>
                                        </button>
                                    </div>
                                </div>

                                {settings.livePromptMode === 'custom' && (
                                    <div className="animate-in slide-in-from-top-2">
                                        <label className="block text-xs font-medium text-zinc-400 mb-1">Custom System Prompt</label>
                                        <textarea 
                                            value={settings.customLivePrompt}
                                            onChange={(e) => handleChange('customLivePrompt', e.target.value)}
                                            placeholder="Enter instructions for the live assistant..."
                                            className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 resize-none font-mono"
                                        />
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <hr className="border-zinc-800" />

                    {/* Generation Settings */}
                    <section className="space-y-4">
                         <div>
                            <h4 className="text-sm font-bold text-zinc-200">Content Generation</h4>
                            <p className="text-xs text-zinc-500">Select the model used for creating artifacts and KB articles.</p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-zinc-400 mb-1">Primary Model</label>
                             <select 
                                value={settings.generationModel}
                                onChange={(e) => handleChange('generationModel', e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                            >
                                <option value="gemini-3-pro-preview">Gemini 3.0 Pro (Preview) - Best Reasoning</option>
                                <option value="gemini-2.5-flash">Gemini 2.5 Flash - Fast & Efficient</option>
                                <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite - Cost Effective</option>
                            </select>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
