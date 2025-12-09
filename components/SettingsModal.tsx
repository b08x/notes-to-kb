/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

export interface AppSettings {
    enableLiveApi: boolean;
    liveModel: string;
    liveVoice: string;
    generationModel: string;
}

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
                
                <div className="p-6 space-y-6">
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
                                <div>
                                    <label className="block text-xs font-medium text-zinc-400 mb-1">Live Model</label>
                                    <select 
                                        value={settings.liveModel}
                                        onChange={(e) => handleChange('liveModel', e.target.value)}
                                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="gemini-2.5-flash-native-audio-preview-09-2025">Gemini 2.5 Flash Native (Preview)</option>
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