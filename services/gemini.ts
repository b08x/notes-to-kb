
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
    extractedText?: string; // Content of text-based files like PDFs
}

/**
 * Parses complex API error responses into human-readable strings.
 */
function parseError(error: any): string {
    if (error instanceof Error && error.message.includes("Failed to fetch")) {
        return "Network connection failed. Please check your internet and try again.";
    }

    try {
        const message = error.message || "";
        // Gemini SDK often wraps JSON in a string
        if (message.includes("{") && message.includes("}")) {
            const start = message.indexOf("{");
            const end = message.lastIndexOf("}");
            const jsonStr = message.substring(start, end + 1);
            const parsed = JSON.parse(jsonStr);
            
            const apiError = parsed.error || parsed;
            if (apiError.code === 429 || apiError.status === "RESOURCE_EXHAUSTED") {
                const retryDelay = apiError.details?.find((d: any) => d.retryDelay)?.retryDelay;
                return `Quota exceeded. Please try again ${retryDelay ? `in ${retryDelay}` : "shortly"}.`;
            }
            if (apiError.message) return apiError.message;
        }
    } catch (e) {
        // Fallback to raw message
    }
    
    return error.message || "An unexpected error occurred during generation.";
}

/**
 * Resolves the appropriate model name based on user input and task type.
 */
function resolveModelName(modelName: string, provider: 'gemini' | 'openrouter'): string {
    if (provider === 'openrouter') return modelName || 'google/gemini-flash-1.5';

    const name = modelName.toLowerCase();
    
    // Check if it's already a full model name (e.g., gemini-1.5-flash)
    if (name.includes('gemini-') && name.split('-').length > 2) {
        return modelName;
    }

    // Existing Alias Logic
    if (name.includes('gemini flash') || name.includes('flash lite')) return 'gemini-flash-lite-latest';
    if (name.includes('gemini-3-flash')) return 'gemini-3-flash-preview';
    if (name.includes('gemini-3-pro')) return 'gemini-3-pro-preview';
    
    return modelName || 'gemini-3-flash-preview';
}

/**
 * Helper to call a function with exponential backoff retry.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const message = error.message || "";
            // Only retry on network errors or 429s
            const isRetryable = message.includes("429") || 
                                message.includes("RESOURCE_EXHAUSTED") || 
                                message.includes("Failed to fetch");
            
            if (!isRetryable || attempt === maxRetries) break;
            
            // Exponential backoff: 1s, 2s, 4s...
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
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
    const contextString = (history.map(h => h.text).join(" ") + " " + currentPrompt).toLowerCase();
    const isKBContext = contextString.includes("kb") || contextString.includes("article");

    let systemInstruction = GENERIC_SYSTEM_INSTRUCTION;
    if (isKBContext || templateType !== 'auto') {
        systemInstruction = getSystemInstruction(templateType, contextString);
    }

    let finalPrompt = currentPrompt.trim();
    if (!finalPrompt && attachments.length > 0) {
        finalPrompt = isKBContext 
          ? `Generate a ${templateType === 'auto' ? 'Standard KB Article' : templateType.toUpperCase()} strictly based on the provided source documents.` 
          : "Analyze the attached files and convert them into a structured document.";
    }
    
    let attachmentContextText = "";
    if (attachments.length > 0) {
        const ids = attachments.filter(a => a.id).map(a => `ID: "${a.id}"`).join(", ");
        if (ids) attachmentContextText += `[System Context: Use these IDs for <img> tags: ${ids}]\n`;
        attachments.forEach(att => {
            if (att.extractedText) {
                attachmentContextText += `\n--- BEGIN SOURCE CONTENT (ID: ${att.id || 'N/A'}) ---\n${att.extractedText}\n--- END SOURCE CONTENT ---\n`;
            }
        });
    }
    
    const authoritativePrompt = attachmentContextText ? `${attachmentContextText}\nUSER REQUEST: ${finalPrompt}` : finalPrompt;

    try {
        return await withRetry(async () => {
            let fullText = "";
            if (provider === 'openrouter') {
                const sanitizedKey = (apiKey || "").trim();
                if (!sanitizedKey) throw new Error("OpenRouter API Key is missing in settings.");
                
                const messages: any[] = [{ role: 'system', content: systemInstruction }];
                history.forEach(h => {
                    const content: any[] = [{ type: 'text', text: h.text || "[Context]" }];
                    if (h.images) h.images.forEach(img => content.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } }));
                    messages.push({ role: h.role === 'model' ? 'assistant' : 'user', content: content });
                });
                const currentContent: any[] = [{ type: 'text', text: authoritativePrompt || "Generate artifact." }];
                attachments.forEach(att => { if (att.mimeType.startsWith('image/')) currentContent.push({ type: 'image_url', image_url: { url: `data:${att.mimeType};base64,${att.data}` } }); });
                messages.push({ role: 'user', content: currentContent });

                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { "Authorization": `Bearer ${sanitizedKey}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model: effectiveModel, messages, stream: true, temperature: 0.2 })
                });

                if (!response.ok) throw new Error(await response.text());

                const reader = response.body?.getReader();
                const decoder = new TextDecoder();
                if (!reader) throw new Error("Stream reader unavailable");

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
                            } catch (e) {}
                        }
                    }
                }
            } else {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
                const parts: any[] = [];
                if (history.length > 0) {
                    let historyText = "--- HISTORY ---\n";
                    history.forEach(msg => {
                        historyText += `${msg.role.toUpperCase()}: ${msg.text}\n`;
                        if (msg.images) msg.images.forEach(img => parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } }));
                    });
                    parts.push({ text: historyText });
                }
                parts.push({ text: authoritativePrompt });
                attachments.forEach(att => parts.push({ inlineData: { data: att.data, mimeType: att.mimeType } }));

                const stream = await ai.models.generateContentStream({
                  model: effectiveModel,
                  contents: { parts },
                  config: { systemInstruction, temperature: 0.2 }
                });

                for await (const chunk of stream) {
                    const t = chunk.text;
                    if (t) {
                        fullText += t;
                        if (onChunk) onChunk(fullText);
                    }
                }
            }

            let text = fullText || "<!-- Failed -->";
            text = text.replace(/^```html\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '');
            const startIdx = Math.max(text.indexOf('<!DOCTYPE'), text.indexOf('<html'));
            return startIdx >= 0 ? text.substring(startIdx) : text;
        });
    } catch (e: any) {
        throw new Error(parseError(e));
    }
}
