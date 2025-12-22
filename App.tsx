
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useMemo } from 'react';
import { Creation } from './components/CreationHistory';
import { bringToLife, ChatMessage, Attachment } from './services/gemini';
import { Chat, Message } from './components/Chat';
import { LivePreview } from './components/LivePreview';
import { InputArea } from './components/InputArea';
import { Sidebar, ProjectSummary } from './components/Sidebar';
import { LivePulse } from './components/LivePulse';
import { SettingsModal, AppSettings } from './components/SettingsModal';
import { HelpModal } from './components/HelpModal';

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
  
  // Live State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLivePanelOpen, setIsLivePanelOpen] = useState(false);
  
  // Settings & Help State
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
      provider: 'gemini',
      enableLiveApi: true,
      liveModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
      liveVoice: 'Fenrir',
      livePromptMode: 'witty',
      customLivePrompt: '',
      generationModel: 'gemini-3-flash-preview',
      openRouterKey: '',
      openRouterModel: 'google/gemini-flash-1.5'
  });

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  // Determine if we are in the initial welcome state
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
          name: 'New Session',
          lastModified: new Date(),
          messages: [],
          activeCreation: null,
          imageMap: {}
      };
      setProjects(prev => [newProject, ...prev]);
      setActiveProjectId(newProject.id);
  };

  const handleDeleteProject = (id: string) => {
      const newProjects = projects.filter(p => p.id !== id);
      setProjects(newProjects);
      if (activeProjectId === id && newProjects.length > 0) {
          setActiveProjectId(newProjects[0].id);
      }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = (error) => reject(error);
    });
  };
  
  const blobUrlToBase64 = async (url: string): Promise<string> => {
      try {
          const response = await fetch(url);
          const blob = await response.blob();
          return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(blob);
              reader.onload = () => {
                 if (typeof reader.result === 'string') {
                     resolve(reader.result.split(',')[1]);
                 } else {
                     reject(new Error("Failed to convert blob"));
                 }
              };
              reader.onerror = reject;
          });
      } catch (e) {
          throw new Error(`Failed to fetch blob from URL: ${url}`);
      }
  };

  const handleSendMessage = async (text: string, files: File[] = [], fileType: 'source' | 'screenshot' = 'source', templateType: string = 'auto') => {
    setIsGenerating(true);
    setGenerationStatus("Analyzing Input Context");
    setStreamSize(0);
    
    const messageId = crypto.randomUUID();
    const newUserMsg: Message = {
        id: messageId,
        role: 'user',
        content: text,
        timestamp: new Date(),
        attachments: files.length > 0 ? files.map(f => ({
            type: f.type === 'application/pdf' ? 'pdf' : 'image',
            url: URL.createObjectURL(f),
            category: fileType
        })) : undefined
    };

    updateActiveProject(p => ({
        ...p,
        messages: [...p.messages, newUserMsg]
    }));

    try {
      const geminiAttachments: Attachment[] = [];
      const newImageMapEntries: Record<string, string> = {};

      for (const file of files) {
          try {
              const base64 = await fileToBase64(file);
              const id = `img-${crypto.randomUUID().substring(0, 8)}`; 
              
              geminiAttachments.push({
                  data: base64,
                  mimeType: file.type,
                  id: id
              });

              if (file.type.startsWith('image/')) {
                  newImageMapEntries[id] = `data:${file.type};base64,${base64}`;
              }
          } catch (e) {
              console.error(`Failed to process file ${file.name}`, e);
          }
      }

      if (Object.keys(newImageMapEntries).length > 0) {
          updateActiveProject(p => ({
              ...p,
              imageMap: { ...p.imageMap, ...newImageMapEntries }
          }));
      }

      const currentHistory = [...activeProject.messages, newUserMsg];
      
      const historyForGemini: ChatMessage[] = await Promise.all(currentHistory.map(async m => {
          let textContent = m.content;
          const histImages: { data: string; mimeType: string }[] = [];

          if (m.attachments && m.attachments.length > 0) {
              for (const att of m.attachments) {
                  if (att.type === 'image') {
                      try {
                        const b64 = await blobUrlToBase64(att.url);
                        const mime = 'image/png'; 
                        histImages.push({ data: b64, mimeType: mime });
                      } catch (e) {
                          console.error("Failed to restore history image", e);
                      }
                  }
              }
          }

          if (m.artifact) {
              textContent += `\n\n[SYSTEM ARTIFACT CONTEXT - Name: ${m.artifact.name}]:\n\`\`\`html\n${m.artifact.html}\n\`\`\``;
          }
          return {
              role: m.role,
              text: textContent,
              images: histImages
          };
      }));

      // CONTEXTUAL PROMPT LOGIC
      let modifiedText = text;
      const isScreenshotAnalysis = files.length > 0 && fileType === 'screenshot';
      const isSourceUpload = files.length > 0 && fileType === 'source';
      const isRefinement = activeProject.activeCreation !== null;
      
      if (isScreenshotAnalysis) {
        modifiedText = `[KB CONTEXT ANALYSIS] Analyze screenshots for UI elements, errors, and states. Generate a "Screenshot Analysis Report" in HTML.`;
      } else if (isSourceUpload) {
        if (isRefinement) {
            modifiedText = `[REFINEMENT CONTEXT] Update existing artifact using reference files. Refinement Request: ${text}`;
        } else {
            const hasAnalysis = currentHistory.some(m => m.artifact?.name.toLowerCase().includes('analysis'));
            const analysisContext = hasAnalysis ? "\n[System: Use previous screenshot analysis artifacts for visual labels.]" : "";
            modifiedText = `[KB GENERATION] Convert to ${templateType !== 'auto' ? templateType : 'Standard KB Article'}. ${analysisContext} ${text}`;
        }
      }

      const html = await bringToLife(
          historyForGemini, 
          modifiedText, 
          geminiAttachments, 
          templateType, 
          (partialText) => {
            setStreamSize(partialText.length);
            const lower = partialText.toLowerCase();
            if (lower.length < 100) {
                setGenerationStatus("Synthesizing Context");
            } else if (lower.includes('<style')) {
                setGenerationStatus("Drafting UI Theme");
            } else if (lower.includes('<h1') || lower.includes('<h2')) {
                setGenerationStatus("Structuring Content Hierarchy");
            } else if (lower.includes('<img')) {
                setGenerationStatus("Injecting Visual Evidence");
            } else if (lower.includes('<li>') || lower.includes('<ul>')) {
                setGenerationStatus("Formulating Step-by-Step Logic");
            } else {
                setGenerationStatus("Finalizing Documentation");
            }
          },
          appSettings.provider === 'gemini' ? appSettings.generationModel : appSettings.openRouterModel,
          appSettings.provider,
          appSettings.openRouterKey
      );
      
      const creationId = crypto.randomUUID();
      let artifactName = isScreenshotAnalysis ? `Analysis: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}` : (text.split(' ').slice(0, 3).join(' ') || "New Article");
      
      const newArtifact: Creation = {
          id: creationId,
          name: artifactName,
          html: html,
          originalImage: files.length > 0 ? newUserMsg.attachments?.[0].url : undefined,
          timestamp: new Date()
      };

      const modelMsg: Message = {
          id: crypto.randomUUID(),
          role: 'model',
          content: isScreenshotAnalysis ? "I've analyzed the screenshots. You can view the report in the preview pane." : "I've generated the documentation based on your input.",
          timestamp: new Date(),
          artifact: newArtifact
      };

      updateActiveProject(p => ({
          ...p,
          messages: [...p.messages, modelMsg],
          activeCreation: newArtifact
      }));

    } catch (error: any) {
      console.error("Generation failed", error);
      updateActiveProject(p => ({
          ...p,
          messages: [...p.messages, {
              id: crypto.randomUUID(),
              role: 'model',
              content: `Generation failed: ${error.message || "Something went wrong during generation."}`,
              timestamp: new Date()
          }]
      }));
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  const handleUpdateArtifact = (id: string, html: string) => {
      updateActiveProject(p => {
          const newMessages = p.messages.map(m => {
              if (m.artifact?.id === id) {
                  return { ...m, artifact: { ...m.artifact, html } };
              }
              return m;
          });
          const newActiveCreation = p.activeCreation?.id === id ? { ...p.activeCreation, html } : p.activeCreation;
          return { ...p, messages: newMessages, activeCreation: newActiveCreation };
      });
  };

  const handleSelectArtifact = (creation: Creation) => {
      updateActiveProject(p => ({ ...p, activeCreation: creation }));
  };

  return (
    <div className="flex h-screen w-full bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      {/* Conditionally hide sidebar if we are at the very beginning of a session */}
      {!isInitialState && (
        <Sidebar 
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onNewProject={handleNewProject}
            onDeleteProject={handleDeleteProject}
            onOpenSettings={() => setShowSettings(true)}
            onOpenHelp={() => setShowHelp(true)}
            artifacts={currentArtifacts}
            onSelectArtifact={handleSelectArtifact}
            activeArtifactId={activeProject.activeCreation?.id}
        />
      )}
      
      <main className="flex-1 flex flex-col min-w-0 relative">
        <div className={`flex-1 flex min-w-0 ${isInitialState ? 'flex-col items-center justify-center' : 'flex-col md:flex-row'}`}>
          
          <div className={`flex-1 flex flex-col transition-all duration-300 ${isLivePanelOpen ? 'w-0 opacity-0 pointer-events-none' : 'w-full opacity-100'}`}>
             <LivePreview 
                creation={activeProject.activeCreation}
                isLoading={isGenerating}
                loadingMessage={generationStatus}
                streamSize={streamSize}
                imageMap={activeProject.imageMap}
                onUpdateArtifact={handleUpdateArtifact}
                isLive={isLiveConnected}
                onToggleLive={() => setIsLivePanelOpen(true)}
             />
          </div>
          
          {/* Chat Panel - Hidden on initial state unless generating */}
          {!isInitialState && (
            <div className={`transition-all duration-300 ${isLivePanelOpen ? 'w-full' : 'w-full md:w-[400px] border-l border-zinc-800'}`}>
              {isLivePanelOpen ? (
                  <LivePulse 
                      isActive={isLivePanelOpen}
                      onClose={() => setIsLivePanelOpen(false)}
                      currentHtml={activeProject.activeCreation?.html}
                      onUpdateHtml={(html) => handleUpdateArtifact(activeProject.activeCreation?.id || '', html)}
                      mode="panel"
                      onToggleMode={() => setIsLivePanelOpen(false)}
                      liveConfig={{
                          model: appSettings.liveModel,
                          voice: appSettings.liveVoice,
                          promptMode: appSettings.livePromptMode,
                          customPrompt: appSettings.customLivePrompt
                      }}
                  />
              ) : (
                  <Chat 
                      messages={activeProject.messages}
                      onSendMessage={handleSendMessage}
                      isGenerating={isGenerating}
                      onSelectArtifact={handleSelectArtifact}
                      activeArtifactId={activeProject.activeCreation?.id}
                      onStartLive={() => setIsLivePanelOpen(true)}
                      isLive={isLiveConnected}
                  />
              )}
            </div>
          )}
        </div>
        
        {/* Floating / Center Input Area */}
        {(!activeProject.activeCreation || isInitialState) && !isGenerating && !isLivePanelOpen && (
            <div className={`${isInitialState ? 'relative w-full' : 'absolute inset-x-0 bottom-0'} p-4 md:p-8 z-10 animate-in fade-in slide-in-from-bottom-4 duration-700`}>
                <InputArea 
                    onGenerate={(prompt, files, template) => handleSendMessage(prompt, files, 'source', template)}
                    isGenerating={isGenerating}
                    onStartLive={() => setIsLivePanelOpen(true)}
                />
            </div>
        )}
      </main>

      <SettingsModal 
        isOpen={showSettings} 
        onClose={() => setShowSettings(false)} 
        settings={appSettings}
        onUpdateSettings={setAppSettings}
      />

      <HelpModal 
        isOpen={showHelp} 
        onClose={() => setShowHelp(false)} 
      />
    </div>
  );
};

export default App;
