/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect, useMemo } from 'react';
import { Creation } from './components/CreationHistory';
import { bringToLife, ChatMessage, Attachment } from './services/gemini';
import { Chat, Message } from './components/Chat';
import { LivePreview } from './components/LivePreview';
import { InputArea } from './components/InputArea';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeCreation, setActiveCreation] = useState<Creation | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Map ID -> Base64 for LivePreview image resolution
  const [imageMap, setImageMap] = useState<Record<string, string>>({});

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

  const handleSendMessage = async (text: string, files: File[] = [], fileType: 'source' | 'screenshot' = 'source') => {
    setIsGenerating(true);
    
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

    setMessages(prev => [...prev, newUserMsg]);

    try {
      // Prepare attachments for Gemini
      const geminiAttachments: Attachment[] = [];

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
                  setImageMap(prev => ({
                      ...prev,
                      [id]: `data:${file.type};base64,${base64}`
                  }));
              }
          } catch (e) {
              console.error(`Failed to process file ${file.name}`, e);
          }
      }

      // Convert internal Message format to Gemini ChatMessage format
      const historyForGemini: ChatMessage[] = await Promise.all(messages.map(async m => {
          let textContent = m.content;
          const histImages: { data: string; mimeType: string }[] = [];

          if (m.attachments && m.attachments.length > 0) {
              for (const att of m.attachments) {
                  if (att.type === 'image') {
                      try {
                        const b64 = await blobUrlToBase64(att.url);
                        // We attempt to guess mime type from fetch or default
                        const mime = 'image/png'; // Simplified for history reconstruction
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
      // Check if we are uploading screenshots (Analysis) or Sources (Generation)
      let modifiedText = text;
      const isScreenshotAnalysis = files.length > 0 && fileType === 'screenshot';
      const isSourceUpload = files.length > 0 && fileType === 'source';
      
      if (isScreenshotAnalysis) {
        modifiedText = `[KB CONTEXT ANALYSIS] I am uploading screenshots for context. Please analyze the UI elements, error messages, and visual state shown in these images. Do not generate the full KB article yet. Instead, generate a "Screenshot Analysis Report" in HTML that lists the observed errors, UI state, and potential issues. This will be used as context for the future KB article.\n\nUser Note: ${text}`;
      } else if (isSourceUpload) {
        modifiedText = `[KB GENERATION] Here are the source documents (notes/PDFs). Please convert them into a ServiceNow KB Article using the template specifications. Use any previous screenshot analyses in the history as context to enrich the article (e.g., adding specific error codes found in screenshots). If you use a screenshot, reference it by its ID provided in the system prompt.\n\nUser Note: ${text}`;
      } else if (files.length === 0 && messages.some(m => m.attachments?.some(a => a.category === 'screenshot'))) {
          // No file, but we have screenshots in history, likely a refinement request
          modifiedText = `${text}\n\n[System: Remember to use existing image IDs (e.g. img-...) if you need to insert an image.]`;
      }

      const html = await bringToLife(historyForGemini, modifiedText, geminiAttachments);
      
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

      setMessages(prev => [...prev, aiMsg]);
      setActiveCreation(newCreation);

    } catch (error) {
      console.error("Failed to generate:", error);
      const errorMsg: Message = {
          id: crypto.randomUUID(),
          role: 'model',
          content: "Sorry, I encountered an error generating the artifact. Please try again.",
          timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle Updates from LivePreview Editor
  const handleUpdateArtifact = (id: string, newHtml: string) => {
      // Update active creation if it matches
      if (activeCreation && activeCreation.id === id) {
          setActiveCreation(prev => prev ? { ...prev, html: newHtml } : null);
      }

      // Update the persistent message history
      setMessages(prev => prev.map(msg => {
          if (msg.artifact && msg.artifact.id === id) {
              return {
                  ...msg,
                  artifact: {
                      ...msg.artifact,
                      html: newHtml
                  }
              };
          }
          return msg;
      }));
  };

  return (
    <div className="flex h-[100dvh] bg-[#09090b] text-zinc-50 overflow-hidden font-sans">
        {/* Left Panel: Chat & Inputs (40% width on desktop) */}
        <div className="w-full md:w-[450px] lg:w-[35%] h-full flex-shrink-0 z-10 flex flex-col">
            {messages.length === 0 ? (
                // Show InputArea (Hero) when no messages
                <div className="flex-1 flex items-center justify-center p-4 bg-[#0E0E10] border-r border-zinc-800">
                    <InputArea 
                        onGenerate={(prompt, files) => handleSendMessage(prompt, files, 'source')} 
                        isGenerating={isGenerating} 
                    />
                </div>
            ) : (
                // Show Chat when conversation starts
                <Chat 
                    messages={messages} 
                    onSendMessage={handleSendMessage} 
                    isGenerating={isGenerating} 
                    onSelectArtifact={setActiveCreation}
                    activeArtifactId={activeCreation?.id}
                />
            )}
        </div>

        {/* Right Panel: Workspace / Preview (Rest of width) */}
        <div className="hidden md:block flex-1 h-full bg-[#121214] relative">
            {/* Dot Grid Background for "Empty" feel if needed, but Preview usually covers it */}
            <div className="absolute inset-0 bg-dot-grid opacity-20 pointer-events-none"></div>
            
            <LivePreview 
                creation={activeCreation} 
                isLoading={isGenerating} 
                className="w-full h-full shadow-2xl"
                imageMap={imageMap}
                onUpdateArtifact={handleUpdateArtifact}
            />
        </div>

        {/* Mobile Preview Overlay (Only visible on small screens when artifact is active) */}
        {activeCreation && (
            <div className="md:hidden fixed inset-0 z-50 bg-[#09090b]">
                <button 
                    onClick={() => setActiveCreation(null)}
                    className="absolute top-3 left-3 z-50 bg-black/50 text-white px-3 py-1 rounded-full text-xs backdrop-blur-md"
                >
                    ← Back to Chat
                </button>
                <LivePreview 
                    creation={activeCreation} 
                    isLoading={isGenerating} 
                    imageMap={imageMap}
                    onUpdateArtifact={handleUpdateArtifact}
                />
            </div>
        )}
    </div>
  );
};

export default App;