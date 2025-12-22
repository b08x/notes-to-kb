
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { getSystemInstruction, GENERIC_SYSTEM_INSTRUCTION } from "../lib/prompts/kb-article";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ChatMessage {
    role: 'user' | 'model';
    text: string;
    images?: { data: string; mimeType: string }[];
}

export interface Attachment {
    data: string; // base64
    mimeType: string;
    id?: string;
}

export async function bringToLife(
    history: ChatMessage[], 
    currentPrompt: string, 
    attachments: Attachment[] = [],
    templateType: string = 'auto',
    onChunk?: (text: string) => void,
    modelName: string = 'gemini-3-pro-preview',
    provider: 'gemini' | 'openrouter' = 'gemini',
    apiKey?: string
): Promise<string> {
  const combinedText = (currentPrompt + " " + history.map(h => h.text).join(" ")).toLowerCase();
  const isKBContext = combinedText.includes("kb") || 
                      combinedText.includes("article") || 
                      combinedText.includes("documentation") || 
                      combinedText.includes("troubleshoot") || 
                      combinedText.includes("guide");

  let systemInstruction = GENERIC_SYSTEM_INSTRUCTION;
  if (isKBContext || templateType !== 'auto') {
      systemInstruction = getSystemInstruction(templateType, combinedText);
  }

  // Common Prompt Construction
  let finalPrompt = attachments.length > 0
    ? `NEW REQUEST: ${currentPrompt || (isKBContext ? `Convert these documents into a ${templateType === 'auto' ? 'Standard KB Article' : templateType.toUpperCase() + ' document'}.` : "Bring this idea to life.")}`
    : `NEW REQUEST: ${currentPrompt}`;

  if (attachments.length > 0) {
      const ids = attachments.filter(a => a.id).map(a => `ID: "${a.id}"`).join(", ");
      if (ids) {
          finalPrompt = `[System Context: The following attached images have specific IDs to use in the HTML <img> tags: ${ids}]\n` + finalPrompt;
      }
  }

  let fullText = "";

  if (provider === 'openrouter') {
    if (!apiKey) throw new Error("OpenRouter API Key is required.");
    
    // Construct messages for OpenRouter/OpenAI Vision format
    const messages: any[] = [
        {
            role: 'system',
            content: systemInstruction
        }
    ];

    // Build history
    history.forEach(h => {
        const content: any[] = [{ type: 'text', text: h.text }];
        
        if (h.images && h.images.length > 0) {
            h.images.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: {
                        url: `data:${img.mimeType};base64,${img.data}`
                    }
                });
            });
        }

        messages.push({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: content
        });
    });

    // Add current prompt and new attachments
    const currentMessageContent: any[] = [{ type: 'text', text: finalPrompt }];
    
    attachments.forEach(att => {
        // Most OpenRouter models handle images via image_url
        // PDFs are more tricky; we send as data URL and hope for model support or treat as context
        const isImage = att.mimeType.startsWith('image/');
        currentMessageContent.push({
            type: 'image_url',
            image_url: {
                url: `data:${att.mimeType};base64,${att.data}`
            }
        });
    });

    messages.push({
        role: 'user',
        content: currentMessageContent
    });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "AI Doc Assistant"
        },
        body: JSON.stringify({
            model: modelName,
            messages: messages,
            stream: true
        })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || "OpenRouter Request Failed");
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) throw new Error("Failed to read stream from OpenRouter");

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
            if (line.includes('[DONE]')) continue;
            if (line.startsWith('data: ')) {
                try {
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;
                    const data = JSON.parse(dataStr);
                    const content = data.choices[0]?.delta?.content;
                    if (content) {
                        fullText += content;
                        if (onChunk) onChunk(fullText);
                    }
                } catch (e) {
                    // Occasionally parsing error happens on non-json stream lines
                    console.debug("Stream parse skip", e);
                }
            }
        }
    }
  } else {
    // Gemini Native Implementation
    const parts: any[] = [];
    if (history.length > 0) {
        parts.push({ text: "HISTORY OF CONVERSATION:\n" });
        history.forEach(msg => {
            parts.push({ text: `${msg.role.toUpperCase()}: ${msg.text}\n` });
            if (msg.images && msg.images.length > 0) {
                msg.images.forEach(img => {
                    parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
                });
            }
        });
        parts.push({ text: "END HISTORY\n\n" });
    }

    parts.push({ text: finalPrompt });
    attachments.forEach(att => {
        parts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
    });

    const responseStream = await ai.models.generateContentStream({
      model: modelName,
      contents: { parts: parts },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.5,
      },
    });

    for await (const chunk of responseStream) {
        const textChunk = chunk.text;
        if (textChunk) {
            fullText += textChunk;
            if (onChunk) onChunk(fullText);
        }
    }
  }

  // Unified Cleanup Logic
  let text = fullText || "<!-- Failed to generate content -->";
  text = text.replace(/^```html\s*/, '').replace(/^```\s*/, '').replace(/```$/, '');
  
  // Find valid HTML start
  const doctypeIdx = text.indexOf('<!DOCTYPE');
  const htmlIdx = text.indexOf('<html');
  let startIdx = -1;
  if (doctypeIdx !== -1 && htmlIdx !== -1) startIdx = Math.min(doctypeIdx, htmlIdx);
  else if (doctypeIdx !== -1) startIdx = doctypeIdx;
  else if (htmlIdx !== -1) startIdx = htmlIdx;
  
  if (startIdx > 0) text = text.substring(startIdx);

  return text;
}
