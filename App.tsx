
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState } from 'react';
import { Creation } from './components/CreationHistory';
import { bringToLife, ChatMessage, Attachment } from './services/gemini';
import { Chat, Message } from './components/Chat';
import { LivePreview } from './components/LivePreview';
import { InputArea } from './components/InputArea';
import { Sidebar, ProjectSummary } from './components/Sidebar';
import { LivePulse } from './components/LivePulse';

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
  const [isLiveActive, setIsLiveActive] = useState(false);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  const updateActiveProject = (updater: (project: ProjectData) => ProjectData) => {
      setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...updater(p), lastModified: new Date() } : p));
  };

  const handleNewProject = () => {
      const newProject: ProjectData = {
          id: crypto.randomUUID(),
          name: 'New Project',
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

  // Helper to convert file to base64
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
  
  // Helper to convert blob URL to base64 (for history)
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
    setGenerationStatus("Initializing...");
    
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

    // 1. Add User Message immediately
    updateActiveProject(p => ({
        ...p,
        messages: [...p.messages, newUserMsg]
    }));

    try {
      // Prepare attachments for Gemini
      const geminiAttachments: Attachment[] = [];
      const newImageMapEntries: Record<string, string> = {};

      for (const file of files) {
          try {
              const base64 = await fileToBase64(file);
              const id = `img-${crypto.randomUUID().substring(0, 8)}`; // Generate short ID for prompt ref
              
              geminiAttachments.push({
                  data: base64,
                  mimeType: file.type,
                  id: id
              });

              // Add to global image map for the live preview to resolve
              if (file.type.startsWith('image/')) {
                  newImageMapEntries[id] = `data:${file.type};base64,${base64}`;
              }
          } catch (e) {
              console.error(`Failed to process file ${file.name}`, e);
          }
      }

      // Update image map in state if we have new images
      if (Object.keys(newImageMapEntries).length > 0) {
          updateActiveProject(p => ({
              ...p,
              imageMap: { ...p.imageMap, ...newImageMapEntries }
          }));
      }

      // 2. Prepare History from CURRENT project state
      // Note: We need to access the 'messages' we just updated. 
      // Since functional update is async/batched, let's reconstruct local history including the new msg.
      const currentHistory = [...activeProject.messages, newUserMsg];
      
      const historyForGemini: ChatMessage[] = await Promise.all(currentHistory.map(async m => {
          let textContent = m.content;
          const histImages: { data: string; mimeType: string }[] = [];

          if (m.attachments && m.attachments.length > 0) {
              for (const att of m.attachments) {
                  if (att.type === 'image') {
                      try {
                        const b64 = await blobUrlToBase64(att.url);
                        // We attempt to guess mime type from fetch or default
                        const mime = 'image/png'; 
                        histImages.push({ data: b64, mimeType: mime });
                      } catch (e) {
                          console.error("Failed to restore history image", e);
                      }
                  }
              }
          }

          if (m.artifact) {
              textContent += `\n\n[SYSTEM: The user can see the following generated artifact (HTML). Use this as context for refinements]:\n\`\`\`html\n${m.artifact.html}\n\`\`\``;
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
      
      if (isScreenshotAnalysis) {
        modifiedText = `[KB CONTEXT ANALYSIS] I am uploading screenshots for context. Please analyze the UI elements, error messages, and visual state shown in these images. Do not generate the full KB article yet. Instead, generate a "Screenshot Analysis Report" in HTML that lists the observed errors, UI state, and potential issues. This will be used as context for the future KB article.\n\nUser Note: ${text}`;
      } else if (isSourceUpload) {
        modifiedText = `[KB GENERATION] Here are the source documents (notes/PDFs). Please convert them into a ${templateType !== 'auto' ? templateType : 'Standard KB Article'} using the template specifications. Use any previous screenshot analyses in the history as context to enrich the article (e.g., adding specific error codes found in screenshots). If you use a screenshot, reference it by its ID provided in the system prompt.\n\nUser Note: ${text}`;
      } else if (files.length === 0 && currentHistory.some(m => m.attachments?.some(a => a.category === 'screenshot'))) {
          // No file, but we have screenshots in history, likely a refinement request
          modifiedText = `${text}\n\n[System: Remember to use existing image IDs (e.g. img-...) if you need to insert an image.]`;
      }

      const html = await bringToLife(historyForGemini, modifiedText, geminiAttachments, templateType, (partialText) => {
        // Live Assistant Status Logic based on streaming content
        const lower = partialText.toLowerCase();
        
        // Basic heuristics to make the assistant feel "alive"
        if (lower.length < 50) {
            setGenerationStatus("Analyzing your inputs...");
        } else if (lower.includes('<style')) {
            setGenerationStatus("Designing visual theme...");
        } else if (lower.includes('<script')) {
            setGenerationStatus("Coding interactivity...");
        } else if (lower.includes('<img')) {
            setGenerationStatus("Embedding assets...");
        } else if (lower.includes('h2') || lower.includes('h3')) {
            setGenerationStatus("Structuring content...");
        } else if (lower.includes('<ul>') || lower.includes('<ol>')) {
            setGenerationStatus("Drafting procedures...");
        } else if (lower.length > 500) {
            setGenerationStatus("Refining details...");
        } else {
            setGenerationStatus("Generating content...");
        }
      });
      
      const creationId = crypto.randomUUID();
      
      // Determine a name for the artifact
      let artifactName = `Artifact ${new Date().toLocaleTimeString()}`;
      if (files.length === 1) {
          artifactName = isScreenshotAnalysis ? `Analysis: ${files[0].name}` : files[0].name;
      } else if (files.length > 1) {
          artifactName = isScreenshotAnalysis ? `Analysis: ${files.length} Files` : `KB from ${files.length} Files`;
      }

      // Pick the first image as the "Original Image" for preview fallback, or undefined
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
              ? "I've analyzed the screenshots and created a context report." 
              : "I've generated the KB article based on your sources and context.",
          timestamp: new Date(),
          artifact: newCreation
      };

      // 3. Update State with AI Message and Active Artifact
      updateActiveProject(p => {
          let newName = p.name;
          // Rename project if it is untitled and we just generated something
          if ((p.name === 'Untitled Project' || p.name === 'New Project') && activeProject.messages.length === 0) {
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
          content: "Sorry, I encountered an error generating the artifact. Please try again.",
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

  // Handle Updates from LivePreview Editor OR LivePulse Tool
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

  return (
    <div className="flex h-[100dvh] bg-[#09090b] text-zinc-50 overflow-hidden font-sans relative">
        {/* Sidebar for Sessions */}
        <Sidebar 
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
            onNewProject={handleNewProject}
            onDeleteProject={handleDeleteProject}
        />

        {/* Left Panel: Chat & Inputs (40% width on desktop) */}
        <div className="w-full md:w-[450px] lg:w-[35%] h-full flex-shrink-0 z-10 flex flex-col bg-[#0E0E10] border-r border-zinc-800">
            {activeProject.messages.length === 0 ? (
                // Show InputArea (Hero) when no messages
                <div className="flex-1 flex items-center justify-center p-4">
                    <InputArea 
                        onGenerate={(prompt, files, template) => handleSendMessage(prompt, files, 'source', template)} 
                        isGenerating={isGenerating}
                        onStartLive={() => setIsLiveActive(true)}
                    />
                </div>
            ) : (
                // Show Chat when conversation starts
                <Chat 
                    messages={activeProject.messages} 
                    onSendMessage={(text, files, type) => handleSendMessage(text, files, type)} 
                    isGenerating={isGenerating} 
                    onSelectArtifact={(creation) => updateActiveProject(p => ({ ...p, activeCreation: creation }))}
                    activeArtifactId={activeProject.activeCreation?.id}
                />
            )}
        </div>

        {/* Right Panel: Workspace / Preview (Rest of width) */}
        <div className="hidden md:block flex-1 h-full bg-[#121214] relative">
            {/* Dot Grid Background for "Empty" feel if needed, but Preview usually covers it */}
            <div className="absolute inset-0 bg-dot-grid opacity-20 pointer-events-none"></div>
            
            <LivePreview 
                creation={activeProject.activeCreation} 
                isLoading={isGenerating} 
                loadingMessage={generationStatus}
                className="w-full h-full shadow-2xl"
                imageMap={activeProject.imageMap}
                onUpdateArtifact={(id, html) => handleUpdateArtifact(id, html)}
            />
        </div>

        {/* Mobile Preview Overlay (Only visible on small screens when artifact is active) */}
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
                />
            </div>
        )}

        {/* Live Pulse Assistant Overlay */}
        <LivePulse 
            isActive={isLiveActive} 
            onClose={() => setIsLiveActive(false)}
            currentHtml={activeProject.activeCreation?.html}
            onUpdateHtml={(newHtml) => {
                if (activeProject.activeCreation?.id) {
                    handleUpdateArtifact(activeProject.activeCreation.id, newHtml);
                }
            }} 
        />
    </div>
  );
};

export default App;
