
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React from 'react';
import { PlusIcon, FolderIcon, TrashIcon, CubeIcon } from '@heroicons/react/24/outline';

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
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  projects, 
  activeProjectId, 
  onSelectProject, 
  onNewProject,
  onDeleteProject 
}) => {
  return (
    <div className="hidden md:flex w-64 bg-[#09090b] border-r border-zinc-800 flex-col h-full flex-shrink-0 z-20">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-zinc-800">
         <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <CubeIcon className="w-5 h-5 text-white" />
         </div>
         <span className="font-bold text-zinc-100 tracking-tight">GenArtifact</span>
      </div>

      <div className="p-3">
        <button
          onClick={onNewProject}
          className="w-full flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white p-2.5 rounded-lg transition-colors text-sm font-medium border border-zinc-700 hover:border-zinc-600"
        >
          <PlusIcon className="w-4 h-4" />
          <span>New Project</span>
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        <div className="px-2 py-1.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          Sessions
        </div>
        {projects.map(project => (
          <div 
            key={project.id}
            className={`group relative flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
              project.id === activeProjectId 
                ? 'bg-blue-900/20 text-blue-100 border border-blue-800/50' 
                : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'
            }`}
            onClick={() => onSelectProject(project.id)}
          >
            <FolderIcon className={`w-4 h-4 flex-shrink-0 ${project.id === activeProjectId ? 'text-blue-400' : 'text-zinc-500'}`} />
            <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{project.name}</div>
                <div className="text-[10px] text-zinc-600 truncate">
                    {project.lastModified.toLocaleDateString()} {project.lastModified.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                </div>
            </div>
             {projects.length > 1 && (
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if(confirm('Delete this project?')) onDeleteProject(project.id);
                    }}
                    className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-900/30 rounded text-zinc-500 hover:text-red-400 transition-all"
                    title="Delete Project"
                >
                    <TrashIcon className="w-3.5 h-3.5" />
                </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
