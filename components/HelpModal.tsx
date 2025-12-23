
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { XMarkIcon, BookOpenIcon, CommandLineIcon, DocumentTextIcon, ChatBubbleLeftRightIcon, PaintBrushIcon, ArrowDownTrayIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface HelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="w-full max-w-4xl h-[85vh] bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <BookOpenIcon className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg font-bold text-white">Help & Documentation</h3>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-8 text-zinc-300 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-transparent">
                    
                    {/* Intro */}
                    <section>
                        <h4 className="text-xl font-bold text-white mb-2">Welcome to AI KB Doc Assistant</h4>
                        <p className="text-sm leading-relaxed text-zinc-400">
                            This application is an AI-powered workspace designed to transform raw notes, screenshots, and documents into structured Knowledge Base (KB) articles. It combines Gemini's multimodal capabilities with a rich editing environment.
                        </p>
                    </section>

                    <hr className="border-zinc-800" />

                    {/* Quick Start */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-white">
                            <SparklesIcon className="w-5 h-5 text-yellow-500" />
                            <h4 className="text-lg font-bold">1. Creating Content</h4>
                        </div>
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h5 className="font-bold text-white mb-2 text-sm">Upload & Context</h5>
                                <ul className="list-disc list-inside space-y-2 text-xs text-zinc-400">
                                    <li><strong>Drag & Drop:</strong> Drop images or PDFs onto the main area.</li>
                                    <li><strong>Source vs. Context:</strong> 
                                        <ul className="pl-4 mt-1 space-y-1 list-circle">
                                            <li>Use <span className="text-blue-400">Source</span> for the main content you want converted (e.g. notes).</li>
                                            <li>Use <span className="text-purple-400">Context (Camera)</span> for screenshots of errors or UI state that needs analysis.</li>
                                        </ul>
                                    </li>
                                </ul>
                            </div>
                            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                                <h5 className="font-bold text-white mb-2 text-sm">Templates & Generation</h5>
                                <ul className="list-disc list-inside space-y-2 text-xs text-zinc-400">
                                    <li><strong>Templates:</strong> Select a template (Troubleshooting, How-To, FAQ, SOP) or let "Auto" decide based on your content.</li>
                                    <li><strong>Voice Input:</strong> Click the microphone to dictate your notes directly.</li>
                                    <li><strong>Chat:</strong> Use the chat bar to refine the generation (e.g., "Add a warning about data loss").</li>
                                </ul>
                            </div>
                        </div>
                    </section>

                    {/* Editor Features */}
                    <section className="space-y-4">
                         <div className="flex items-center gap-2 text-white">
                            <DocumentTextIcon className="w-5 h-5 text-emerald-500" />
                            <h4 className="text-lg font-bold">2. The Editor Workspace</h4>
                        </div>
                        <p className="text-sm text-zinc-400">
                            Once an article is generated, the workspace splits into the Chat (left) and the Live Preview (right).
                        </p>
                        
                        <div className="space-y-3">
                            <div className="flex gap-3 items-start">
                                <div className="p-1.5 bg-zinc-800 rounded mt-1"><ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-400" /></div>
                                <div>
                                    <h5 className="font-bold text-zinc-200 text-sm">Chat Refinement</h5>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Ask the AI to make changes. E.g., "Make the steps more concise", "Add a table for error codes". 
                                        You can also click <strong>"Suggest Improvements"</strong> for automated suggestions.
                                    </p>
                                </div>
                            </div>

                             <div className="flex gap-3 items-start">
                                <div className="p-1.5 bg-zinc-800 rounded mt-1"><CommandLineIcon className="w-4 h-4 text-zinc-400" /></div>
                                <div>
                                    <h5 className="font-bold text-zinc-200 text-sm">Text Edit Mode</h5>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Click <strong>"Edit Text"</strong> in the toolbar. You can click directly into the preview to type, delete, or fix typos manually. Click "Save" to apply changes.
                                    </p>
                                </div>
                            </div>

                             <div className="flex gap-3 items-start">
                                <div className="p-1.5 bg-zinc-800 rounded mt-1"><PaintBrushIcon className="w-4 h-4 text-pink-400" /></div>
                                <div>
                                    <h5 className="font-bold text-zinc-200 text-sm">Style Editor</h5>
                                    <p className="text-xs text-zinc-500 mt-1">
                                        Click <strong>"Style"</strong> to open the visual CSS editor. Click any element in the preview (headers, images, paragraphs) to adjust colors, fonts, padding, and margins visually. Includes Undo/Redo support.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Live API */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-white">
                            <ChatBubbleLeftRightIcon className="w-5 h-5 text-red-500" />
                            <h4 className="text-lg font-bold">3. Live Pulse (Real-time Audio)</h4>
                        </div>
                        <div className="bg-gradient-to-r from-red-900/20 to-orange-900/20 p-4 rounded-lg border border-red-900/30">
                            <p className="text-sm text-zinc-300">
                                Enabled via <strong>Settings > Live API</strong>. This feature connects you to Gemini via a low-latency WebSocket connection.
                            </p>
                            <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-zinc-400">
                                <li>Click the <span className="font-bold text-red-400">Live Edit</span> button to split the screen.</li>
                                <li>Talk naturally to the AI. It can see the document you are looking at.</li>
                                <li>Say commands like <em>"Change the header color to blue"</em> or <em>"Rewrite the introduction"</em> and watch it happen instantly.</li>
                            </ul>
                        </div>
                    </section>

                    {/* Export */}
                    <section className="space-y-4">
                         <div className="flex items-center gap-2 text-white">
                            <ArrowDownTrayIcon className="w-5 h-5 text-purple-500" />
                            <h4 className="text-lg font-bold">4. Exporting</h4>
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <li className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                                <span className="block text-sm font-bold text-white">DOCX Export</span>
                                <span className="text-xs text-zinc-500">
                                    Generates a standard-compliant Word document. It preserves headings, lists, images, and basic styling adjustments made in the Style Editor.
                                </span>
                            </li>
                             <li className="p-3 bg-zinc-800/50 rounded border border-zinc-700">
                                <span className="block text-sm font-bold text-white">JSON Export</span>
                                <span className="text-xs text-zinc-500">
                                    Exports the raw artifact data, including the full HTML code and metadata, useful for developer backups or integration.
                                </span>
                            </li>
                        </ul>
                    </section>

                </div>
            </div>
        </div>
    );
};
