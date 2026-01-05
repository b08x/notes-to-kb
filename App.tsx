
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo, useRef } from 'react';
import { Creation } from './components/CreationHistory';
import { bringToLife, ChatMessage, Attachment } from './services/gemini';
import { Chat, Message } from './components/Chat';
import { LivePreview } from './components/LivePreview';
import { Sidebar, ProjectSummary } from './components/Sidebar';
import { LivePulse } from './components/LivePulse';
import { SettingsModal, AppSettings } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';
import { AppOverview } from './components/AppOverview';
import { SessionConfigView } from './components/SessionConfigView';

interface ProjectData extends ProjectSummary {
    messages: Message[];
    activeCreation: Creation | null;
    imageMap: Record<string, string>;
}

const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectData[]>([
      {
          id: crypto.randomUUID(),
          name: 'Untitled Project',
          lastModified: new Date(),
          messages: [],
          activeCreation: null,
          imageMap: {}
      }
  ]);
  const [activeProjectId, setActiveProjectId] = useState<string>(projects[0].id);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>("");
  const [streamSize, setStreamSize] = useState<number>(0);
  
  const [isLiveActive, setIsLiveActive] = useState(false);
  const livePulseRef = useRef<any>(null);
  
  const [showHelp, setShowHelp] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
      provider: 'gemini',
      enableLiveApi: true,
      liveModel: 'gemini-3-flash-preview', 
      liveVoice: 'Fenrir',
      livePromptMode: 'witty',
      customLivePrompt: '',
      generationModel: 'gemini-3-flash-preview',
      geminiKey: '',
      openRouterKey: '',
      openRouterModel: 'google/gemini-flash-1.5',
      temperature: 0.2,
      topP: 0.95,
      thinkingBudget: 2048,
      voiceEngine: 'gemini',
      elevenLabsKey: '',
      elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM'
  });

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];
  const isInitialState = activeProject.messages.length === 0 && !isGenerating;

  const currentArtifacts = useMemo(() => {
      const arts: Creation[] = [];
      const seenIds = new Set<string>();
      activeProject.messages.forEach(m => {
          if (m.artifact && !seenIds.has(m.artifact.id)) {
              arts.push(m.artifact);
              seenIds.add(m.artifact.id);
          }
      });
      return arts.reverse();
  }, [activeProject.messages]);

  const updateActiveProject = (updater: (project: ProjectData) => ProjectData) => {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...updater(p), lastModified: new Date() } : p));
  };

  const handleNewProject = () => {
    const newProject: ProjectData = {
      id: crypto.randomUUID(),
      name: 'Untitled Project',
      lastModified: new Date(),
      messages: [],
      activeCreation: null,
      imageMap: {}
    };
    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newProject.id);
    setIsLiveActive(false); 
  };

  const handleDeleteProject = (id: string) => {
    setProjects(prev => {
      const newProjects = prev.filter(p => p.id !== id);
      if (newProjects.length === 0) {
        const defaultProject: ProjectData = {
          id: crypto.randomUUID(),
          name: 'Untitled Project',
          lastModified: new Date(),
          messages: [],
          activeCreation: null,
          imageMap: {}
        };
        setActiveProjectId(defaultProject.id);
        return [defaultProject];
      }
      if (activeProjectId === id) {
        setActiveProjectId(newProjects[0].id);
      }
      return newProjects;
    });
  };

  const handleUpdateArtifact = (id: string, html: string, isManualEdit: boolean = false) => {
      updateActiveProject(p => {
          const newMessages = p.messages.map(m => (m.artifact?.id === id ? { ...m, artifact: { ...m.artifact, html } } : m));
          const newActiveCreation = p.activeCreation?.id === id ? { ...p.activeCreation, html } : p.activeCreation;
          return { ...p, messages: newMessages, activeCreation: newActiveCreation };
      });
      
      if (isManualEdit && isLiveActive && livePulseRef.current) {
          livePulseRef.current.sendUpdate(`[SYSTEM] User manually updated the document. NEW_STATE:\n\`\`\`html\n${html.substring(0, 15000)}\n\`\`\``);
      }
  };

  const handleAtomicUpdate = (toolName: string, args: any) => {
    if (!activeProject.activeCreation) return;
    
    const iframe = document.querySelector('iframe');
    if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
            type: toolName === 'update_element' ? 'UPDATE_ELEMENT' : 'APPEND_ELEMENT',
            selector: args.selector,
            html: args.html
        }, '*');
    }

    const { id, html: currentHtml } = activeProject.activeCreation;
    const parser = new DOMParser();
    const doc = parser.parseFromString(currentHtml, 'text/html');
    try {
        if (toolName === 'update_element') {
            const target = doc.querySelector(args.selector);
            if (target) target.innerHTML = args.html;
        } else if (toolName === 'append_element') {
            const target = doc.querySelector(args.selector) || doc.body;
            target.insertAdjacentHTML('beforeend', args.html);
        }
        const updatedHtml = doc.documentElement.outerHTML;
        handleUpdateArtifact(id, updatedHtml, false);
    } catch (e) { console.error("Atomic Update Failed:", e); }
  };

  const handleSendMessage = async (text: string, files: File[] = [], fileType: 'source' | 'screenshot' = 'source', templateType: string = 'auto') => {
    setIsGenerating(true);
    setGenerationStatus("Synthesizing Input Context");
    setStreamSize(0);
    
    const pastMessages = [...activeProject.messages];
    const newUserMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: new Date(),
        attachments: files.length > 0 ? files.map(f => ({
            type: f.type === 'application/pdf' ? 'pdf' : 'image',
            url: URL.createObjectURL(f),
            category: fileType
        })) : undefined
    };

    updateActiveProject(p => ({ ...p, messages: [...p.messages, newUserMsg] }));

    try {
      const geminiAttachments: Attachment[] = [];
      const newImageMapEntries: Record<string, string> = {};

      for (const file of files) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
              reader.onload = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(file);
          });
          const id = `img-${crypto.randomUUID().substring(0, 8)}`; 
          
          let extractedText: string | undefined;
          if (file.type === 'application/pdf') {
              setGenerationStatus(`Parsing ${file.name}`);
              const arrayBuffer = await file.arrayBuffer();
              const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
              let fullText = "";
              for (let i = 1; i <= pdf.numPages; i++) {
                  const page = await pdf.getPage(i);
                  const content = await page.getTextContent();
                  fullText += content.items.map((item: any) => item.str).join(" ") + "\n";
              }
              extractedText = fullText;
          }
          
          geminiAttachments.push({ data: base64, mimeType: file.type, id, extractedText });
          if (file.type.startsWith('image/')) newImageMapEntries[id] = `data:${file.type};base64,${base64}`;
      }

      if (Object.keys(newImageMapEntries).length > 0) {
          updateActiveProject(p => ({ ...p, imageMap: { ...p.imageMap, ...newImageMapEntries } }));
      }

      const historyForGemini: ChatMessage[] = await Promise.all(pastMessages.map(async m => {
          let textContent = m.content;
          const histImages: { data: string; mimeType: string }[] = [];
          if (m.attachments) {
              for (const att of m.attachments) {
                  if (att.type === 'image') {
                      const response = await fetch(att.url);
                      const blob = await response.blob();
                      const b64 = await new Promise<string>((resolve) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve((reader.result as string).split(',')[1]);
                          reader.readAsDataURL(blob);
                      });
                      histImages.push({ data: b64, mimeType: 'image/png' });
                  }
              }
          }
          if (m.artifact) textContent += `\n\n[CONTEXT ARTIFACT]:\n\`\`\`html\n${m.artifact.html}\n\`\`\``;
          return { role: m.role, text: textContent, images: histImages };
      }));

      const html = await bringToLife(
          historyForGemini, 
          text, 
          geminiAttachments, 
          templateType, 
          (partialText) => setStreamSize(partialText.length),
          appSettings.provider === 'gemini' ? appSettings.generationModel : appSettings.openRouterModel,
          appSettings.provider,
          appSettings.openRouterKey,
          {
            temperature: appSettings.temperature,
            topP: appSettings.topP,
            thinkingBudget: appSettings.thinkingBudget,
            geminiKey: appSettings.geminiKey // New: Pass key to service
          }
      );
      
      const newArtifact: Creation = {
          id: crypto.randomUUID(),
          name: text.split(' ').slice(0, 3).join(' ') || "New KB Article",
          html: html,
          originalImage: files.length > 0 ? newUserMsg.attachments?.[0].url : undefined,
          timestamp: new Date()
      };

      updateActiveProject(p => ({
          ...p,
          messages: [...p.messages, {
              id: crypto.randomUUID(),
              role: 'model',
              content: "Artifact successfully generated.",
              timestamp: new Date(),
              artifact: newArtifact
          }],
          activeCreation: newArtifact
      }));

      // Auto-enable live if user has it set in global settings
      if (appSettings.enableLiveApi && !isLiveActive) {
          setIsLiveActive(true);
      }

    } catch (error: any) {
      updateActiveProject(p => ({
          ...p,
          messages: [...p.messages, {
              id: crypto.randomUUID(),
              role: 'model',
              content: error.message,
              timestamp: new Date()
          }]
      }));
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <Sidebar 
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={setActiveProjectId}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
          onOpenHelp={() => setShowHelp(true)}
          onOpenSettings={() => setShowSettings(true)}
          artifacts={currentArtifacts}
          onSelectArtifact={(c) => updateActiveProject(p => ({ ...p, activeCreation: c }))}
          activeArtifactId={activeProject.activeCreation?.id}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <div className="w-full md:w-[420px] border-r border-zinc-800 flex flex-col h-full bg-[#0c0c0e] shrink-0 overflow-hidden">
            {isInitialState ? (
                <SessionConfigView 
                    settings={appSettings} 
                    onUpdateSettings={setAppSettings} 
                    onStart={(prompt, files, template) => handleSendMessage(prompt, files, 'source', template)}
                    isGenerating={isGenerating}
                />
            ) : isLiveActive ? (
                <LivePulse 
                    ref={livePulseRef}
                    isActive={isLiveActive}
                    onClose={() => setIsLiveActive(false)}
                    currentHtml={activeProject.activeCreation?.html}
                    onAtomicUpdate={handleAtomicUpdate}
                    mode="panel"
                    liveConfig={{
                        model: appSettings.liveModel,
                        voice: appSettings.liveVoice,
                        promptMode: appSettings.livePromptMode,
                        customPrompt: appSettings.customLivePrompt,
                        provider: appSettings.provider,
                        openRouterKey: appSettings.openRouterKey,
                        voiceEngine: appSettings.voiceEngine,
                        elevenLabs: {
                            key: appSettings.elevenLabsKey,
                            voiceId: appSettings.elevenLabsVoiceId
                        }
                    }}
                />
            ) : (
                <Chat 
                    messages={activeProject.messages}
                    onSendMessage={handleSendMessage}
                    isGenerating={isGenerating}
                    onSelectArtifact={(c) => updateActiveProject(p => ({ ...p, activeCreation: c }))}
                    activeArtifactId={activeProject.activeCreation?.id}
                    onToggleLive={() => setIsLiveActive(true)}
                    isLive={isLiveActive}
                />
            )}
        </div>

        <div className="flex-1 h-full bg-[#09090b] overflow-hidden">
             {isInitialState ? (
                <AppOverview />
             ) : (
                <LivePreview 
                    creation={activeProject.activeCreation}
                    isLoading={isGenerating}
                    loadingMessage={generationStatus}
                    streamSize={streamSize}
                    imageMap={activeProject.imageMap}
                    onUpdateArtifact={handleUpdateArtifact}
                    isLive={isLiveActive}
                />
             )}
        </div>
      </div>

      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} settings={appSettings} onUpdateSettings={setAppSettings} />
    </div>
  );
};

export default App;
