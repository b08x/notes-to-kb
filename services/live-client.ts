
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, FunctionDeclaration, Type, Chat } from "@google/genai";
import { ElevenLabsTTS } from "./elevenlabs";
import { GeminiNativeTTS } from "./gemini-tts";

const updateElementTool: FunctionDeclaration = {
  name: "update_element",
  description: "Surgically update an existing element's inner HTML. Use specific CSS selectors like 'h1', 'p', or 'div.note'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector (e.g., 'h1', 'p:nth-of-type(2)')" },
      html: { type: Type.STRING, description: "New HTML content for inside the element." }
    },
    required: ["selector", "html"]
  }
};

const appendElementTool: FunctionDeclaration = {
  name: "append_element",
  description: "Add new content into an existing element (e.g., adding a new list item to a 'ul' or a paragraph to a 'div').",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector of the parent container." },
      html: { type: Type.STRING, description: "HTML content to append." }
    },
    required: ["selector", "html"]
  }
};

function parseError(error: any): string {
    const rawMessage = error.message || String(error);
    if (rawMessage.includes("Failed to fetch")) return "Network connection failed. Reconnecting...";
    try {
        let jsonStr = rawMessage;
        const start = rawMessage.indexOf("{");
        const end = rawMessage.lastIndexOf("}");
        if (start !== -1 && end !== -1) jsonStr = rawMessage.substring(start, end + 1);
        const parsed = JSON.parse(jsonStr);
        const apiError = parsed.error || parsed;
        if (apiError.code === 429 || apiError.status === "RESOURCE_EXHAUSTED") {
            return "Rate limit exceeded. Waiting to reconnect...";
        }
        if (apiError.message) return apiError.message;
    } catch (e) {}
    return rawMessage.length > 200 ? "An unexpected API error occurred." : rawMessage;
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, signal?: AbortSignal): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (signal?.aborted) throw new Error("AbortError");
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const message = String(error.message || "");
            const isRetryable = message.includes("429") || 
                                message.includes("RESOURCE_EXHAUSTED") || 
                                message.includes("Failed to fetch") ||
                                message.includes("503") ||
                                message.includes("504");
            
            if (!isRetryable || attempt === maxRetries) break;
            
            const delay = (Math.pow(2, attempt) * 1000) + (Math.random() * 500);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

function normalizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const newSchema = { ...schema };
  if (newSchema.type && typeof newSchema.type === 'string') newSchema.type = newSchema.type.toLowerCase();
  if (newSchema.properties) {
    const newProps: any = {};
    for (const key in newSchema.properties) newProps[key] = normalizeSchema(newSchema.properties[key]);
    newSchema.properties = newProps;
  }
  if (newSchema.items) newSchema.items = normalizeSchema(newSchema.items);
  return newSchema;
}

export interface LiveConfig {
    model: string;
    voice: string;
    prompt?: string;
    provider: 'gemini' | 'openrouter';
    openRouterKey?: string;
    voiceEngine: 'gemini' | 'elevenlabs';
    elevenLabs?: {
        key: string;
        voiceId: string;
    };
}

export interface LiveClientCallbacks {
    onToolCall?: (toolName: string, args: any) => { success: boolean; error?: string };
    onVolume?: (vol: number) => void;
    onTranscription?: (text: string, source: 'user' | 'model') => void;
    onStatusChange?: (status: 'listening' | 'thinking' | 'speaking' | 'idle' | 'transcoding') => void;
    onError?: (error: Error) => void;
    onLatency?: (ms: number) => void;
}

export class LiveClient {
  private ai: GoogleGenAI | null = null;
  private chat: Chat | null = null;
  private orHistory: any[] = [];
  private recognition: any = null;
  private isRecognitionActive = false;
  private ttsService: ElevenLabsTTS | GeminiNativeTTS | null = null;
  private currentConfig: LiveConfig | null = null;
  private initialContext: string = "";
  private callbacks: LiveClientCallbacks;
  private isConnected = false;
  private isProcessing = false;
  private currentAbortController: AbortController | null = null;
  private reconnectTimeout: any = null;
  private startTime: number = 0;

  constructor(initialContext: string = "", callbacks: LiveClientCallbacks = {}) {
    this.initialContext = initialContext;
    this.callbacks = callbacks;
  }

  public updateContext(html: string) {
      if (!this.isConnected || !html) return;
      this.initialContext = html;
      this.sendText(`[SYSTEM] The document has been updated. Use this new structure for all subsequent edits:\n\`\`\`html\n${html.substring(0, 15000)}\n\`\`\``);
  }

  private sanitizeModel(modelId: string): string {
    const defaultModel = this.currentConfig?.provider === 'gemini' ? 'gemini-3-flash-preview' : 'google/gemini-flash-1.5';
    if (!modelId) return defaultModel;
    if (modelId.toLowerCase().includes('native-audio')) return 'gemini-3-flash-preview';
    return modelId;
  }

  async connect(onClose: () => void, config: LiveConfig) {
    this.currentConfig = { ...config, model: this.sanitizeModel(config.model) };
    
    if (this.currentConfig.provider === 'gemini') {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        this.chat = this.ai.chats.create({
            model: this.currentConfig.model,
            config: {
                systemInstruction: `${config.prompt}\n\nCRITICAL: You are editing an HTML document live. Use CSS selectors precisely.\nDOCUMENT_CONTEXT:\n${this.initialContext}`,
                tools: [{ functionDeclarations: [updateElementTool, appendElementTool] }],
                temperature: 0.3
            }
        });
    } else {
        this.orHistory = [{ 
            role: 'system', 
            content: `${config.prompt}\n\nCRITICAL: You are editing an HTML document live. Use CSS selectors precisely.\nDOCUMENT_CONTEXT:\n${this.initialContext}` 
        }];
    }

    this.isConnected = true;

    if (config.voiceEngine === 'elevenlabs' && config.elevenLabs?.key) {
        const el = new ElevenLabsTTS(config.elevenLabs.key, config.elevenLabs.voiceId);
        el.setOnVolume((vol) => this.callbacks.onVolume?.(vol));
        el.setOnStatusChange((isTranscoding) => {
            if (isTranscoding && !this.isProcessing) this.callbacks.onStatusChange?.('transcoding');
            else if (!isTranscoding && !this.isProcessing) this.callbacks.onStatusChange?.('speaking');
        });
        this.ttsService = el;
    } else {
        const gem = new GeminiNativeTTS(config.voice);
        gem.setOnVolume((vol) => this.callbacks.onVolume?.(vol));
        this.ttsService = gem;
    }

    this.initSTT();
    this.processUserCommand("[SYSTEM] Protocol connection stabilized. Awaiting user input.");
  }

  private initSTT() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) throw new Error("Speech recognition not supported.");

    if (this.recognition && this.isRecognitionActive) return;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'en-US';

    this.recognition.onresult = (event: any) => {
        let interimTranscript = '';
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
        }
        
        if (finalTranscript && this.ttsService) {
            this.ttsService.prewarm();
        }

        if (interimTranscript) this.callbacks.onTranscription?.(interimTranscript, 'user');
        if (finalTranscript && !this.isProcessing) {
            if (this.ttsService) this.ttsService.stopAudio();
            this.processUserCommand(finalTranscript);
        }
    };

    this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
            this.isRecognitionActive = false;
            return;
        }
        console.warn("STT Engine Warning:", event.error);
        this.isRecognitionActive = false;
        this.scheduleReconnect();
    };

    this.recognition.onstart = () => {
        this.isRecognitionActive = true;
        this.callbacks.onStatusChange?.('listening');
    };

    this.recognition.onend = () => { 
        this.isRecognitionActive = false;
        if (this.isConnected) this.scheduleReconnect();
    };

    try { 
        this.recognition.start(); 
    } catch(e) {
        this.isRecognitionActive = false;
    }
  }

  private scheduleReconnect() {
      if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
          if (this.isConnected && !this.isRecognitionActive) this.initSTT();
      }, 2000);
  }

  private async processUserCommand(text: string) {
    if (this.isProcessing) this.currentAbortController?.abort();
    
    this.isProcessing = true;
    this.currentAbortController = new AbortController();
    this.callbacks.onStatusChange?.('thinking');
    this.callbacks.onTranscription?.(text, 'user');
    this.startTime = performance.now();

    try {
        await withRetry(async () => {
            if (this.currentConfig?.provider === 'gemini') {
                await this.processWithGemini(text);
            } else {
                await this.processWithOpenRouter(text);
            }
        }, 3, this.currentAbortController.signal);
    } catch (error: any) {
        if (error.name === 'AbortError' || error.message === 'AbortError') return;
        const friendlyMsg = parseError(error);
        this.callbacks.onError?.(new Error(friendlyMsg));
    } finally {
        this.isProcessing = false;
        this.callbacks.onStatusChange?.('listening');
    }
  }

  private async processWithGemini(text: string) {
    if (!this.chat) return;
    const stream = await this.chat.sendMessageStream({ message: text });

    let fullModelResponse = "";
    let firstChunkReceived = false;

    for await (const chunk of stream) {
        if (this.currentAbortController?.signal.aborted) break;
        if (!firstChunkReceived) {
            this.callbacks.onStatusChange?.('speaking');
            this.callbacks.onLatency?.(Math.round(performance.now() - this.startTime));
            firstChunkReceived = true;
        }
        
        if (chunk.functionCalls) {
            for (const call of chunk.functionCalls) {
                const res = this.callbacks.onToolCall?.(call.name, call.args);
                if (res && !res.success) {
                    console.warn(`Assistant Tool Failure: ${res.error}`);
                }
            }
        }
        
        // Use part-based extraction to avoid SDK concatenation warnings
        const textPart = chunk.candidates?.[0]?.content?.parts
            ?.filter(p => p.text)
            ?.map(p => p.text)
            ?.join('') || "";

        if (textPart) {
            fullModelResponse += textPart;
            this.callbacks.onTranscription?.(fullModelResponse, 'model');
            if (this.ttsService) this.ttsService.speak(textPart);
        }
    }
    if (this.ttsService && 'flush' in this.ttsService) this.ttsService.flush();
  }

  private async processWithOpenRouter(text: string) {
    const apiKey = this.currentConfig?.openRouterKey;
    if (!apiKey) throw new Error("API Key missing.");

    this.orHistory.push({ role: 'user', content: text });

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": window.location.origin,
            "X-Title": "AI KB Pulse"
        },
        body: JSON.stringify({
            model: this.currentConfig?.model,
            messages: this.orHistory,
            tools: [
                { type: 'function', function: { name: "update_element", description: updateElementTool.description, parameters: normalizeSchema(updateElementTool.parameters) } },
                { type: 'function', function: { name: "append_element", description: appendElementTool.description, parameters: normalizeSchema(appendElementTool.parameters) } }
            ],
            stream: true,
            temperature: 0.3
        }),
        signal: this.currentAbortController?.signal
    });

    if (!response.ok) throw new Error(await response.text());
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    let fullModelResponse = "";
    let firstChunkReceived = false;
    let pendingToolCalls: Record<number, { name: string; args: string }> = {};

    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!firstChunkReceived) {
            this.callbacks.onStatusChange?.('speaking');
            this.callbacks.onLatency?.(Math.round(performance.now() - this.startTime));
            firstChunkReceived = true;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
                try {
                    const data = JSON.parse(trimmed.slice(6));
                    const delta = data.choices[0]?.delta;
                    
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            const index = tc.index ?? 0;
                            if (!pendingToolCalls[index]) pendingToolCalls[index] = { name: '', args: '' };
                            if (tc.function?.name) pendingToolCalls[index].name = tc.function.name;
                            if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments;
                        }
                    }

                    if (delta?.content) {
                        fullModelResponse += delta.content;
                        this.callbacks.onTranscription?.(fullModelResponse, 'model');
                        if (this.ttsService) this.ttsService.speak(delta.content);
                    }
                } catch (e) {}
            }
        }
    }

    // Process all aggregated tool calls at the end of the stream
    for (const tc of Object.values(pendingToolCalls)) {
        try {
            const parsedArgs = JSON.parse(tc.args);
            const res = this.callbacks.onToolCall?.(tc.name, parsedArgs);
            if (res && !res.success) console.warn(`Tool failure: ${res.error}`);
        } catch (e) {
            console.error("Failed to parse tool arguments from OpenRouter stream:", tc.args);
        }
    }

    this.orHistory.push({ role: 'assistant', content: fullModelResponse });
    if (this.ttsService && 'flush' in this.ttsService) this.ttsService.flush();
  }

  public stopAudio() {
      if (this.ttsService) this.ttsService.stopAudio();
      this.currentAbortController?.abort();
      this.callbacks.onStatusChange?.('listening');
  }

  public sendText(text: string) {
      this.processUserCommand(text);
  }

  public stop() {
    this.isConnected = false;
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.currentAbortController?.abort();
    if (this.recognition) { 
        try { 
            this.recognition.onend = null;
            this.recognition.onerror = null;
            this.recognition.onresult = null;
            this.recognition.stop(); 
        } catch(e) {} 
    }
    if (this.ttsService) this.ttsService.stop();
  }
}
