
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { PlusIcon, FolderIcon, TrashIcon, CubeIcon, Cog6ToothIcon, QuestionMarkCircleIcon, DocumentIcon, TableCellsIcon, PhotoIcon } from '@heroicons/react/24/outline';
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
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
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
  onOpenSettings,
  onOpenHelp,
  artifacts = [],
  onSelectArtifact,
  activeArtifactId
}) => {
  return (
    <div className="hidden md:flex w-72 bg-[#09090b] border-r border-zinc-800 flex-col h-full flex-shrink-0 z-20">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800">
         <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
            <CubeIcon className="w-5 h-5 text-white" />
         </div>
         <span className="font-bold text-zinc-100 tracking-tight">AI Doc Assistant</span>
      </div>

      <div className="p-3">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white p-2.5 rounded-lg transition-all text-sm font-medium border border-zinc-800 hover:border-zinc-700 shadow-sm"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Session</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
        {/* Sessions Section */}
        <div className="space-y-1">
            <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center justify-between">
                <span>Sessions</span>
                <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full text-[8px]">{projects.length}</span>
            </div>
            {projects.map(project => (
            <div 
                key={project.id}
                className={`group relative flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${
                project.id === activeProjectId 
                    ? 'bg-blue-900/10 text-blue-100 border border-blue-800/20' 
                    : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-300 border border-transparent'
                }`}
                onClick={() => onSelectProject(project.id)}
            >
                <FolderIcon className={`w-4 h-4 flex-shrink-0 ${project.id === activeProjectId ? 'text-blue-400' : 'text-zinc-500'}`} />
                <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-semibold">{project.name}</div>
                    <div className="text-[9px] text-zinc-600 truncate">
                        {project.lastModified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                </div>
                {projects.length > 1 && (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if(confirm('Delete this project?')) onDeleteProject(project.id);
                        }}
                        className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/30 rounded text-zinc-600 hover:text-red-400 transition-all"
                        title="Delete Session"
                    >
                        <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            ))}
        </div>

        {/* Artifacts Section (Nested under active session context) */}
        {artifacts.length > 0 && (
            <div className="space-y-1 animate-in slide-in-from-top-2 duration-300">
                <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center justify-between">
                    <span>Documents</span>
                    <span className="bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded-full text-[8px]">{artifacts.length}</span>
                </div>
                <div className="space-y-0.5">
                    {artifacts.map((art) => {
                        const isAnalysis = art.name.toLowerCase().includes('analysis');
                        return (
                            <button
                                key={art.id}
                                onClick={() => onSelectArtifact?.(art)}
                                className={`w-full group flex items-center gap-2.5 p-2 rounded-lg text-left transition-all ${
                                    activeArtifactId === art.id 
                                        ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/10' 
                                        : 'text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-400'
                                }`}
                            >
                                <div className={`p-1.5 rounded ${activeArtifactId === art.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-900 group-hover:bg-zinc-800'}`}>
                                    {isAnalysis ? <PhotoIcon className="w-3.5 h-3.5" /> : <DocumentIcon className="w-3.5 h-3.5" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="truncate text-[11px] font-medium leading-none mb-1">{art.name}</div>
                                    <div className="text-[9px] text-zinc-600">{isAnalysis ? 'Analysis Report' : 'KB Article'}</div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        )}
      </div>

      <div className="p-3 border-t border-zinc-800 space-y-1">
         {onOpenHelp && (
            <button 
                onClick={onOpenHelp}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
                <QuestionMarkCircleIcon className="w-5 h-5" />
                <span className="text-xs font-medium">Help & Documentation</span>
            </button>
         )}
         {onOpenSettings && (
            <button 
                onClick={onOpenSettings}
                className="w-full flex items-center gap-2 p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
                <Cog6ToothIcon className="w-5 h-5" />
                <span className="text-xs font-medium">Settings</span>
            </button>
         )}
      </div>
    </div>
  );
};
