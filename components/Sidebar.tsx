
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { PlusIcon, FolderIcon, TrashIcon, CubeIcon, Cog6ToothIcon, QuestionMarkCircleIcon, DocumentIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { Creation } from './CreationHistory';

export interface ProjectSummary {
  id: string;
  name: string;
  lastModified: Date;
}

interface SidebarProps {
  projects: ProjectSummary[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onOpenHelp?: () => void;
  onOpenSettings?: () => void;
  artifacts?: Creation[];
  onSelectArtifact?: (artifact: Creation) => void;
  activeArtifactId?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  projects, 
  activeProjectId, 
  onSelectProject, 
  onNewProject,
  onDeleteProject,
  onOpenHelp,
  onOpenSettings,
  artifacts = [],
  onSelectArtifact,
  activeArtifactId
}) => {
  return (
    <div className="w-72 bg-[#09090b] border-r border-zinc-800 flex flex-col h-full flex-shrink-0 z-20 overflow-hidden">
      <div className="h-16 flex items-center gap-3 px-5 border-b border-zinc-800/60 bg-[#09090b]/80 backdrop-blur-md">
         <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40 transform rotate-3">
            <CubeIcon className="w-5 h-5 text-white" />
         </div>
         <div className="flex flex-col">
            <span className="font-black text-white tracking-tighter text-sm uppercase">AI KB ASSISTANT</span>
            <span className="text-[9px] font-black text-zinc-600 tracking-[0.2em] uppercase leading-none">V2.5 PROTOCOL</span>
         </div>
      </div>

      <div className="p-4">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-2 bg-blue-600/10 hover:bg-blue-600 text-blue-500 hover:text-white p-2.5 rounded-xl transition-all text-[10px] font-black uppercase tracking-widest border border-blue-500/20 shadow-lg group"
        >
          <PlusIcon className="w-4 h-4 group-hover:scale-110 transition-transform" />
          <span>New Session</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-8 no-scrollbar">
        <div className="space-y-2">
            <div className="px-2 py-1 text-[9px] font-black text-zinc-700 uppercase tracking-[0.2em] flex items-center justify-between border-b border-zinc-800/40 pb-2">
                <span>Active Sessions</span>
                <span className="bg-zinc-900 text-zinc-500 px-2 py-0.5 rounded-full text-[8px] border border-zinc-800">{projects.length}</span>
            </div>
            <div className="space-y-1">
                {projects.map(project => (
                    <div 
                        key={project.id}
                        className={`group relative flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all ${
                        project.id === activeProjectId 
                            ? 'bg-zinc-800/50 text-white border border-zinc-700/50 shadow-inner' 
                            : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 border border-transparent'
                        }`}
                        onClick={() => onSelectProject(project.id)}
                    >
                        <FolderIcon className={`w-4 h-4 flex-shrink-0 ${project.id === activeProjectId ? 'text-blue-400' : 'text-zinc-600 group-hover:text-zinc-400'}`} />
                        <div className="flex-1 min-w-0">
                            <div className="truncate text-[11px] font-bold tracking-tight">{project.name}</div>
                            <div className="text-[8px] text-zinc-600 truncate uppercase font-bold tracking-tighter">
                                {project.lastModified.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {project.lastModified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                        </div>
                        {projects.length > 1 && (
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if(confirm('Terminate this session?')) onDeleteProject(project.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/10 rounded-lg text-zinc-600 hover:text-red-500 transition-all"
                                title="Delete Session"
                            >
                                <TrashIcon className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>

        {artifacts.length > 0 && (
            <div className="space-y-2 animate-in slide-in-from-top-2 duration-500">
                <div className="px-2 py-1 text-[9px] font-black text-zinc-700 uppercase tracking-[0.2em] flex items-center justify-between border-b border-zinc-800/40 pb-2">
                    <span>Artifact History</span>
                </div>
                <div className="space-y-1">
                    {artifacts.map((art) => (
                        <button
                            key={art.id}
                            onClick={() => onSelectArtifact?.(art)}
                            className={`w-full group flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                                activeArtifactId === art.id 
                                    ? 'bg-emerald-600/10 text-emerald-300 border border-emerald-500/20' 
                                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-400 border border-transparent'
                            }`}
                        >
                            <DocumentIcon className={`w-3.5 h-3.5 ${activeArtifactId === art.id ? 'text-emerald-400' : 'text-zinc-600'}`} />
                            <div className="flex-1 min-w-0">
                                <div className="truncate text-[11px] font-bold tracking-tight">{art.name}</div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
        )}
      </div>

      <div className="p-4 border-t border-zinc-800/60 space-y-1 bg-[#09090b]/80 shrink-0">
         {onOpenSettings && (
            <button 
                onClick={onOpenSettings}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all group"
            >
                <Cog6ToothIcon className="w-5 h-5 group-hover:text-blue-400" />
                <span className="text-[11px] font-bold tracking-tight uppercase">Settings</span>
            </button>
         )}
         {onOpenHelp && (
            <button 
                onClick={onOpenHelp}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 transition-all group"
            >
                <QuestionMarkCircleIcon className="w-5 h-5 group-hover:text-purple-400" />
                <span className="text-[11px] font-bold tracking-tight uppercase">System Manual</span>
            </button>
         )}
         <div className="px-5 py-2 flex items-center justify-between">
             <span className="text-[8px] font-black text-zinc-700 uppercase tracking-[0.2em]">Signal Stable</span>
             <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
         </div>
      </div>
    </div>
  );
};
