
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { 
    CloudArrowUpIcon, 
    Square3Stack3DIcon, 
    ChatBubbleLeftRightIcon, 
    ArrowDownTrayIcon,
    CpuChipIcon,
    SparklesIcon
} from '@heroicons/react/24/outline';

export const AppOverview: React.FC = () => (
    <div className="w-full h-full overflow-y-auto bg-[#09090b] flex flex-col items-center justify-start p-8 md:p-10 animate-in fade-in duration-700">
        <div className="max-w-xl w-full space-y-10">
            
            {/* Header */}
            <div className="text-center space-y-4">
                <div className="inline-flex p-3 bg-blue-600/10 rounded-2xl border border-blue-500/20 mb-2">
                    <CpuChipIcon className="w-8 h-8 text-blue-400" />
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tighter">
                    Documentation <span className="text-blue-500">Workspace</span>
                </h1>
                <p className="text-zinc-400 text-xs font-medium max-w-lg mx-auto leading-relaxed">
                    A collaborative environment where AI transforms your raw technical inputs into professional Knowledge Base articles.
                </p>
            </div>

            {/* Steps Grid */}
            <div className="space-y-4">
                
                {/* Step 1 */}
                <div className="group p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-blue-600/20 group-hover:text-blue-400 transition-colors shrink-0">
                            <CloudArrowUpIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">1. Upload Sources</h3>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Drag and drop PDF manuals, text notes, or raw technical drafts. Gemini analyzes your documents to build a foundation.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 2 */}
                <div className="group p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-purple-600/20 group-hover:text-purple-400 transition-colors shrink-0">
                            <Square3Stack3DIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">2. Analyze Context</h3>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Use <span className="text-purple-400 font-bold uppercase text-[9px]">Add Context</span> to upload UI screenshots for precise troubleshooting.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 3 */}
                <div className="group p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-emerald-600/20 group-hover:text-emerald-400 transition-colors shrink-0">
                            <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">3. Chat & Refine</h3>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Iterate using natural language. Ask to simplify steps, add warnings, or use <strong>Live Pulse</strong> for voice editing.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Step 4 */}
                <div className="group p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all">
                    <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-100 group-hover:text-zinc-900 transition-colors shrink-0">
                            <ArrowDownTrayIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white mb-1">4. Professional Export</h3>
                            <p className="text-[11px] text-zinc-500 leading-relaxed">
                                Download your final documentation as a standard-compliant Word (.docx) file with custom styling.
                            </p>
                        </div>
                    </div>
                </div>

            </div>

            {/* Footer Prompt */}
            <div className="flex flex-col items-center gap-4 pt-4 border-t border-zinc-800/50">
                <div className="flex items-center gap-2 px-4 py-2 bg-zinc-900 rounded-full border border-zinc-800">
                    <SparklesIcon className="w-3 h-3 text-blue-400" />
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Select a document from the sidebar to begin</span>
                </div>
            </div>

        </div>
    </div>
);
