
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
  
  // Live State
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [isLivePanelOpen, setIsLivePanelOpen] = useState(false);
  
  // Settings & Help State
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
      enableLiveApi: true,
      liveModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
      liveVoice: 'Fenrir',
      livePromptMode: 'witty',
      customLivePrompt: '',
      generationModel: 'gemini-3-pro-preview'
  });

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  // Derive artifacts from message history for the sidebar
  const currentArtifacts = useMemo(() => {
      const arts: Creation[] = [];
      const seenIds = new Set<string>();
      activeProject.messages.forEach(m => {
          if (m.artifact && !seenIds.has(m.artifact.id)) {
              arts.push(m.artifact);
              seenIds.add(m.artifact.id);
          }
      });
      return arts.reverse(); // Newest first
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
  };

  const handleSendMessage = async (text: string, files: File[] = [], fileType: 'source' | 'screenshot' = 'source', templateType: string = 'auto') => {
    setIsGenerating(true);
    setGenerationStatus("Preparing workspace...");
    
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
        modifiedText = `[KB CONTEXT ANALYSIS] I am uploading screenshots for context. Analyze these images for UI elements, errors, and functional states. 
        CRITICAL: Generate a comprehensive "Screenshot Analysis Report" in HTML. 
        This report MUST be structured and detailed as it will be used as the primary visual context for the future KB article. 
        List every Source ID (img-...) found in this analysis request clearly in the HTML so I can map them later.
        
        User Instructions: ${text}`;
      } else if (isSourceUpload) {
        if (isRefinement) {
            modifiedText = `[REFINEMENT CONTEXT] Refine the existing artifact using the uploaded reference files as context only. 
            Do NOT switch the main topic. Maintain document integrity. 
            Update the HTML with the new reference data.
            
            Refinement Request: ${text}`;
        } else {
            // Check history for any Analysis Reports
            const hasAnalysis = currentHistory.some(m => m.artifact?.name.toLowerCase().includes('analysis'));
            const analysisContext = hasAnalysis ? "\n[System: Use the 'Screenshot Analysis Report' artifacts in the history to enrich this KB with specific visual evidence, error codes, and UI labels.]" : "";
            
            modifiedText = `[KB GENERATION] Convert the source documents into a ${templateType !== 'auto' ? templateType : 'Standard KB Article'}. 
            ${analysisContext} 
            Use provided image IDs (img-...) if instructed or if you reference specific UI screens analyzed in previous reports.
            
            User Note: ${text}`;
        }
      }

      const html = await bringToLife(
          historyForGemini, 
          modifiedText, 
          geminiAttachments, 
          templateType, 
          (partialText) => {
            const lower = partialText.toLowerCase();
            if (lower.length < 50) {
                setGenerationStatus("Reading inputs...");
            } else if (lower.includes('<style')) {
                setGenerationStatus("Designing interface...");
            } else if (lower.includes('h2') || lower.includes('h3')) {
                setGenerationStatus("Building structure...");
            } else if (lower.length > 500) {
                setGenerationStatus("Refining documentation...");
            } else {
                setGenerationStatus("Generating content...");
            }
          },
          appSettings.generationModel
      );
      
      const creationId = crypto.randomUUID();
      
      let artifactName = isScreenshotAnalysis ? `Analysis: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}` : `Article: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      if (files.length === 1 && !isScreenshotAnalysis) {
          artifactName = files[0].name.split('.')[0];
      }

      const primaryImage = geminiAttachments.length > 0 
        ? `data:${geminiAttachments[0].mimeType};base64,${geminiAttachments[0].data}` 
        : undefined;

      const newCreation: Creation = {
          id: creationId,
          name: artifactName,
          html: html,
          originalImage: primaryImage,
          timestamp: new Date(),
      };

      const aiMsg: Message = {
          id: crypto.randomUUID(),
          role: 'model',
          content: isScreenshotAnalysis
              ? "Analysis complete. I've created a context report for your screenshots." 
              : "KB Article generated based on your sources and context.",
          timestamp: new Date(),
          artifact: newCreation
      };

      updateActiveProject(p => {
          let newName = p.name;
          if ((p.name === 'Untitled Project' || p.name === 'New Session') && activeProject.messages.length === 0) {
              newName = artifactName;
          }
          
          return {
              ...p,
              messages: [...p.messages, aiMsg],
              activeCreation: newCreation,
              name: newName
          };
      });

    } catch (error) {
      console.error("Failed to generate:", error);
      const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: 'model',
          content: "Sorry, I encountered an error. Please check your inputs or API key and try again.",
          timestamp: new Date()
      };
      updateActiveProject(p => ({
          ...p,
          messages: [...p.messages, errorMsg]
      }));
    } finally {
      setIsGenerating(false);
      setGenerationStatus("");
    }
  };

  const handleUpdateArtifact = (id: string, newHtml: string) => {
      updateActiveProject(p => {
        const updatedMessages = p.messages.map(msg => {
             if (msg.artifact && msg.artifact.id === id) {
                 return { ...msg, artifact: { ...msg.artifact, html: newHtml } };
             }
             return msg;
        });
        
        let updatedActiveCreation = p.activeCreation;
        if (updatedActiveCreation && updatedActiveCreation.id === id) {
            updatedActiveCreation = { ...updatedActiveCreation, html: newHtml };
        }
        
        return {
            ...p,
            messages: updatedMessages,
            activeCreation: updatedActiveCreation
        };
      });
  };

  const startLiveSession = () => {
      setIsLiveConnected(true);
      setIsLivePanelOpen(true);
  };

  return (
    <div className="flex h-[100dvh] bg-[#09090b] text-zinc-50 overflow-hidden font-sans relative">
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

        <Sidebar 
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onNewProject={handleNewProject}
            onDeleteProject={handleDeleteProject}
            onOpenSettings={() => setShowSettings(true)}
            onOpenHelp={() => setShowHelp(true)}
            artifacts={currentArtifacts}
            onSelectArtifact={(art) => updateActiveProject(p => ({ ...p, activeCreation: art }))}
            activeArtifactId={activeProject.activeCreation?.id}
        />

        <div className="w-full md:w-[450px] lg:w-[35%] h-full flex-shrink-0 z-10 flex flex-col bg-[#0E0E10] border-r border-zinc-800 shadow-2xl">
            {activeProject.messages.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-4">
                    <InputArea 
                        onGenerate={(prompt, files, template) => handleSendMessage(prompt, files, 'source', template)} 
                        isGenerating={isGenerating}
                        onStartLive={appSettings.enableLiveApi ? startLiveSession : undefined}
                    />
                </div>
            ) : (
                <Chat 
                    messages={activeProject.messages} 
                    onSendMessage={(text, files, type) => handleSendMessage(text, files, type)} 
                    isGenerating={isGenerating} 
                    onSelectArtifact={(creation) => updateActiveProject(p => ({ ...p, activeCreation: creation }))}
                    activeArtifactId={activeProject.activeCreation?.id}
                />
            )}
        </div>

        <div className="hidden md:flex flex-1 flex-col h-full bg-[#121214] relative overflow-hidden">
            <div className="absolute inset-0 bg-dot-grid opacity-20 pointer-events-none"></div>
            
            <div className="flex-1 flex flex-col relative w-full h-full">
                <div className={`w-full transition-all duration-500 ease-in-out relative ${isLiveConnected && isLivePanelOpen ? 'h-1/2' : 'h-full'}`}>
                    <LivePreview 
                        creation={activeProject.activeCreation} 
                        isLoading={isGenerating} 
                        loadingMessage={generationStatus}
                        className="w-full h-full shadow-2xl"
                        imageMap={activeProject.imageMap}
                        onUpdateArtifact={(id, html) => handleUpdateArtifact(id, html)}
                        isLive={isLiveConnected}
                        onToggleLive={appSettings.enableLiveApi ? () => {
                            if (!isLiveConnected) startLiveSession();
                            else setIsLiveConnected(false);
                        } : undefined}
                    />
                </div>

                {isLiveConnected && (
                    <div className={`
                        transition-all duration-500 ease-in-out z-50
                        ${isLivePanelOpen 
                            ? 'h-1/2 w-full relative border-t border-zinc-800' 
                            : 'absolute bottom-6 right-6 w-80 h-auto rounded-2xl'
                        }
                    `}>
                        <LivePulse 
                            isActive={isLiveConnected} 
                            onClose={() => setIsLiveConnected(false)}
                            currentHtml={activeProject.activeCreation?.html}
                            onUpdateHtml={(newHtml) => {
                                if (activeProject.activeCreation?.id) {
                                    handleUpdateArtifact(activeProject.activeCreation.id, newHtml);
                                }
                            }}
                            mode={isLivePanelOpen ? 'panel' : 'overlay'} 
                            onToggleMode={() => setIsLivePanelOpen(!isLivePanelOpen)}
                            liveConfig={{ 
                                model: appSettings.liveModel, 
                                voice: appSettings.liveVoice,
                                promptMode: appSettings.livePromptMode,
                                customPrompt: appSettings.customLivePrompt
                            }}
                        />
                    </div>
                )}
            </div>
        </div>

        {activeProject.activeCreation && (
            <div className="md:hidden fixed inset-0 z-50 bg-[#09090b]">
                <button 
                    onClick={() => updateActiveProject(p => ({ ...p, activeCreation: null }))}
                    className="absolute top-3 left-3 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-md"
                >
                    ← Back to Chat
                </button>
                <LivePreview 
                    creation={activeProject.activeCreation} 
                    isLoading={isGenerating} 
                    loadingMessage={generationStatus}
                    imageMap={activeProject.imageMap}
                    onUpdateArtifact={(id, html) => handleUpdateArtifact(id, html)}
                    isLive={isLiveConnected}
                    onToggleLive={appSettings.enableLiveApi ? () => {
                         if (!isLiveConnected) startLiveSession();
                         else setIsLiveConnected(false);
                    } : undefined}
                />
            </div>
        )}
    </div>
  );
};

export default App;
