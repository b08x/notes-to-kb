
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { getSystemInstruction, GENERIC_SYSTEM_INSTRUCTION } from "../lib/prompts/kb-article";

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

/**
 * Resolves the appropriate model name based on user input and task type.
 * Adheres to the strict model naming guidelines.
 */
function resolveModelName(modelName: string, provider: 'gemini' | 'openrouter'): string {
    if (provider === 'openrouter') return modelName || 'google/gemini-flash-1.5';

    const name = modelName.toLowerCase();
    if (name.includes('gemini flash') || name.includes('flash lite')) return 'gemini-flash-lite-latest';
    if (name.includes('gemini-3-flash')) return 'gemini-3-flash-preview';
    if (name.includes('gemini-3-pro')) return 'gemini-3-pro-preview';
    
    return 'gemini-3-flash-preview';
}

export async function bringToLife(
    history: ChatMessage[], 
    currentPrompt: string, 
    attachments: Attachment[] = [],
    templateType: string = 'auto',
    onChunk?: (text: string) => void,
    modelName: string = 'gemini-3-flash-preview',
    provider: 'gemini' | 'openrouter' = 'gemini',
    apiKey?: string
): Promise<string> {
  const effectiveModel = resolveModelName(modelName, provider);

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
    const sanitizedKey = (apiKey || "").trim();
    if (!sanitizedKey) throw new Error("OpenRouter API Key is missing in settings.");
    
    const messages: any[] = [
        { role: 'system', content: systemInstruction }
    ];

    history.forEach(h => {
        const content: any[] = [{ type: 'text', text: h.text }];
        if (h.images && h.images.length > 0) {
            h.images.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.data}` }
                });
            });
        }
        messages.push({
            role: h.role === 'model' ? 'assistant' : 'user',
            content: content
        });
    });

    const currentMessageContent: any[] = [{ type: 'text', text: finalPrompt }];
    attachments.forEach(att => {
        // OpenRouter multimodal support depends on provider; usually handles images
        if (att.mimeType.startsWith('image/')) {
            currentMessageContent.push({
                type: 'image_url',
                image_url: { url: `data:${att.mimeType};base64,${att.data}` }
            });
        } else {
            // For non-images (like PDFs) in OpenRouter, we describe them or ignore if unsupported
            console.warn(`Attachment ${att.id} has mimeType ${att.mimeType} which might not be supported by the current OpenRouter model.`);
        }
    });

    messages.push({ role: 'user', content: currentMessageContent });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${sanitizedKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": window.location.origin,
                "X-Title": "Notes to KB"
            },
            body: JSON.stringify({
                model: effectiveModel,
                messages: messages,
                stream: true
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMsg = `OpenRouter API error (Status ${response.status})`;
            try {
                const errData = await response.json();
                errorMsg = errData.error?.message || errorMsg;
            } catch (e) { /* ignore parse error */ }
            throw new Error(errorMsg);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error("Failed to read stream from OpenRouter");

        let buffer = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (trimmed.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(trimmed.slice(6));
                        const content = data.choices[0]?.delta?.content;
                        if (content) {
                            fullText += content;
                            if (onChunk) onChunk(fullText);
                        }
                    } catch (e) {
                        console.debug("Stream chunk parse error", e, trimmed);
                    }
                }
            }
        }
    } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
            throw new Error("Request to OpenRouter timed out after 60 seconds.");
        }
        if (fetchError.message.includes('Failed to fetch') || fetchError.name === 'TypeError') {
            const isOnline = navigator.onLine;
            throw new Error(
                `Network error: Could not reach OpenRouter. ${!isOnline ? 'You appear to be offline.' : 'This could be due to a CORS policy, a blocked VPN, or an incorrect API endpoint. Please check your browser console for more details.'}`
            );
        }
        throw fetchError;
    }
  } else {
    // Gemini Native Implementation
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const parts: any[] = [];
    
    if (history.length > 0) {
        let historyText = "HISTORY OF CONVERSATION:\n";
        history.forEach(msg => {
            historyText += `${msg.role.toUpperCase()}: ${msg.text}\n`;
            if (msg.images && msg.images.length > 0) {
                msg.images.forEach(img => {
                    parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
                });
            }
        });
        parts.push({ text: historyText + "END HISTORY\n\n" });
    }

    parts.push({ text: finalPrompt });
    attachments.forEach(att => {
        parts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
    });

    try {
        const responseStream = await ai.models.generateContentStream({
          model: effectiveModel,
          contents: { parts: parts },
          config: {
            systemInstruction: systemInstruction,
            temperature: 0.4,
            topP: 0.95,
            topK: 40
          },
        });

        for await (const chunk of responseStream) {
            const textChunk = chunk.text;
            if (textChunk) {
                fullText += textChunk;
                if (onChunk) onChunk(fullText);
            }
        }
    } catch (geminiError: any) {
        console.error("Gemini Native Error:", geminiError);
        if (geminiError.message?.includes("Failed to fetch")) {
            throw new Error("Network error: Connection to Gemini API failed. This may be due to a blocked region or network connectivity issues.");
        }
        if (geminiError.message?.includes("No endpoints found")) {
            throw new Error(`The model '${effectiveModel}' does not support multimodal input or is unavailable.`);
        }
        throw geminiError;
    }
  }

  let text = fullText || "<!-- Failed to generate content -->";
  text = text.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '');
  
  const doctypeIdx = text.indexOf('<!DOCTYPE');
  const htmlIdx = text.indexOf('<html');
  let startIdx = -1;
  if (doctypeIdx !== -1 && htmlIdx !== -1) startIdx = Math.min(doctypeIdx, htmlIdx);
  else if (doctypeIdx !== -1) startIdx = doctypeIdx;
  else if (htmlIdx !== -1) startIdx = htmlIdx;
  
  if (startIdx > 0) text = text.substring(startIdx);

  return text;
}
