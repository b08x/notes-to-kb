
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { ElevenLabsTTS } from "./elevenlabs";
import { GeminiNativeTTS } from "./gemini-tts";

const updateElementTool: FunctionDeclaration = {
  name: "update_element",
  description: "Update the content of a specific element using a CSS selector. Best for surgical changes.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector (e.g., 'h1', 'p:nth-of-type(2)')" },
      html: { type: Type.STRING, description: "New HTML content" }
    },
    required: ["selector", "html"]
  }
};

const appendElementTool: FunctionDeclaration = {
  name: "append_element",
  description: "Append new content into an existing element.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector of the parent" },
      html: { type: Type.STRING, description: "HTML content to append" }
    },
    required: ["selector", "html"]
  }
};

/**
 * Parses complex API error responses into human-readable strings.
 */
function parseError(error: any): string {
    const rawMessage = error.message || String(error);
    
    // Check for network errors
    if (rawMessage.includes("Failed to fetch")) {
        return "Network connection failed. Please check your internet.";
    }

    try {
        // Find the JSON part if it's wrapped in other text
        let jsonStr = rawMessage;
        const start = rawMessage.indexOf("{");
        const end = rawMessage.lastIndexOf("}");
        if (start !== -1 && end !== -1) {
            jsonStr = rawMessage.substring(start, end + 1);
        }

        const parsed = JSON.parse(jsonStr);
        const apiError = parsed.error || parsed;

        // Handle nested error messages (common in some SDK/Proxy layers)
        if (typeof apiError.message === 'string' && apiError.message.includes("{")) {
            return parseError({ message: apiError.message });
        }

        if (apiError.code === 429 || apiError.status === "RESOURCE_EXHAUSTED") {
            const retryDelay = apiError.details?.find((d: any) => d.retryDelay)?.retryDelay || "shortly";
            return `Rate limit exceeded (429). Please wait about ${retryDelay} before trying again.`;
        }

        if (apiError.message) return apiError.message;
    } catch (e) {
        // Not JSON, return raw if it's not too long
    }
    
    return rawMessage.length > 200 ? "An unexpected API error occurred." : rawMessage;
}

/**
 * Helper to call a function with exponential backoff retry for transient errors.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
            
            // Exponential backoff: 1.5s, 3s, 4.5s...
            const delay = Math.pow(2, attempt) * 1500;
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastError;
}

/**
 * Normalizes tool parameters for non-Gemini providers (OpenRouter/Mistral/OpenAI)
 * which expect lowercase types (e.g. 'string' instead of 'STRING').
 */
function normalizeSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const newSchema = { ...schema };
  if (newSchema.type && typeof newSchema.type === 'string') {
    newSchema.type = newSchema.type.toLowerCase();
  }
  if (newSchema.properties) {
    const newProps: any = {};
    for (const key in newSchema.properties) {
      newProps[key] = normalizeSchema(newSchema.properties[key]);
    }
    newSchema.properties = newProps;
  }
  if (newSchema.items) {
    newSchema.items = normalizeSchema(newSchema.items);
  }
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
    onToolCall?: (toolName: string, args: any) => void;
    onVolume?: (vol: number) => void;
    onTranscription?: (text: string, source: 'user' | 'model') => void;
    onStatusChange?: (status: 'listening' | 'thinking' | 'speaking' | 'idle') => void;
    onError?: (error: Error) => void;
}

export class LiveClient {
  private ai: GoogleGenAI | null = null;
  private recognition: any = null;
  private ttsService: ElevenLabsTTS | GeminiNativeTTS | null = null;
  private currentConfig: LiveConfig | null = null;
  private initialContext: string = "";
  private callbacks: LiveClientCallbacks;
  private isConnected = false;
  private isProcessing = false;
  private currentAbortController: AbortController | null = null;

  constructor(initialContext: string = "", callbacks: LiveClientCallbacks = {}) {
    this.initialContext = initialContext;
    this.callbacks = callbacks;
  }

  private sanitizeModel(modelId: string): string {
    const defaultModel = this.currentConfig?.provider === 'gemini' ? 'gemini-3-flash-preview' : 'google/gemini-flash-1.5';
    if (!modelId) return defaultModel;
    
    if (modelId.toLowerCase().includes('native-audio')) {
      return 'gemini-3-flash-preview';
    }
    return modelId;
  }

  async connect(onClose: () => void, config: LiveConfig) {
    this.currentConfig = { ...config, model: this.sanitizeModel(config.model) };
    if (this.currentConfig.provider === 'gemini') {
        this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    this.isConnected = true;

    // Initialize TTS
    if (config.voiceEngine === 'elevenlabs' && config.elevenLabs?.key) {
        const el = new ElevenLabsTTS(config.elevenLabs.key, config.elevenLabs.voiceId);
        el.setOnVolume((vol) => this.callbacks.onVolume?.(vol));
        this.ttsService = el;
    } else {
        const gem = new GeminiNativeTTS(config.voice);
        gem.setOnVolume((vol) => this.callbacks.onVolume?.(vol));
        this.ttsService = gem;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
        throw new Error("Speech recognition not supported in this browser.");
    }

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
        if (interimTranscript) this.callbacks.onTranscription?.(interimTranscript, 'user');
        if (finalTranscript && !this.isProcessing) {
            // INTERRUPT CURRENT AUDIO IF USER SPEAKS
            if (this.ttsService) this.ttsService.stopAudio();
            this.processUserCommand(finalTranscript);
        }
    };

    this.recognition.onerror = (event: any) => {
        if (event.error === 'no-speech') return;
        console.error("STT Error:", event.error);
        this.callbacks.onError?.(new Error(`Speech recognition error: ${event.error}`));
    };

    this.recognition.onend = () => { 
        if (this.isConnected) {
            try { this.recognition.start(); } catch (e) {}
        }
    };

    this.recognition.start();
    this.callbacks.onStatusChange?.('listening');
    this.processUserCommand("[SYSTEM] Connection established. Greet the user briefly.");
  }

  private async processUserCommand(text: string) {
    if (this.isProcessing) {
        this.currentAbortController?.abort();
    }
    
    this.isProcessing = true;
    this.currentAbortController = new AbortController();
    this.callbacks.onStatusChange?.('thinking');
    this.callbacks.onTranscription?.(text, 'user');

    try {
        await withRetry(async () => {
            if (this.currentConfig?.provider === 'gemini') {
                await this.processWithGemini(text);
            } else {
                await this.processWithOpenRouter(text);
            }
        });
    } catch (error: any) {
        if (error.name === 'AbortError') return;
        
        const friendlyMsg = parseError(error);
        console.error("Pulse Processing Error:", error);
        this.callbacks.onError?.(new Error(friendlyMsg));
    } finally {
        this.isProcessing = false;
        this.callbacks.onStatusChange?.('listening');
    }
  }

  private async processWithGemini(text: string) {
    if (!this.ai) return;
    const stream = await this.ai.models.generateContentStream({
        model: this.currentConfig?.model || 'gemini-3-flash-preview',
        contents: [{ role: 'user', parts: [{ text: `DOCUMENT_CONTEXT:\n${this.initialContext}\n\nUSER_COMMAND: ${text}` }] }],
        config: {
            systemInstruction: this.currentConfig?.prompt,
            tools: [{ functionDeclarations: [updateElementTool, appendElementTool] }],
            temperature: 0.3
        }
    });

    let fullModelResponse = "";
    this.callbacks.onStatusChange?.('speaking');
    for await (const chunk of stream) {
        if (this.currentAbortController?.signal.aborted) break;
        
        if (chunk.functionCalls) {
            for (const call of chunk.functionCalls) this.callbacks.onToolCall?.(call.name, call.args);
        }
        const textPart = chunk.text;
        if (textPart) {
            fullModelResponse += textPart;
            this.callbacks.onTranscription?.(fullModelResponse, 'model');
            if (this.ttsService) this.ttsService.speak(textPart);
        }
    }
  }

  private async processWithOpenRouter(text: string) {
    const apiKey = this.currentConfig?.openRouterKey;
    if (!apiKey) throw new Error("OpenRouter API Key is missing.");

    const normalizedUpdateParams = normalizeSchema(updateElementTool.parameters);
    const normalizedAppendParams = normalizeSchema(appendElementTool.parameters);

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
            messages: [
                { role: 'system', content: this.currentConfig?.prompt },
                { role: 'user', content: `DOCUMENT_CONTEXT:\n${this.initialContext}\n\nUSER_COMMAND: ${text}` }
            ],
            tools: [
                { type: 'function', function: { name: "update_element", description: updateElementTool.description, parameters: normalizedUpdateParams } },
                { type: 'function', function: { name: "append_element", description: appendElementTool.description, parameters: normalizedAppendParams } }
            ],
            stream: true,
            temperature: 0.3
        }),
        signal: this.currentAbortController?.signal
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText);
    }
    
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) return;

    let fullModelResponse = "";
    this.callbacks.onStatusChange?.('speaking');

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
                    const delta = data.choices[0]?.delta;
                    
                    if (delta?.tool_calls) {
                        for (const tc of delta.tool_calls) {
                            if (tc.function?.arguments) {
                                try {
                                    const args = JSON.parse(tc.function.arguments);
                                    this.callbacks.onToolCall?.(tc.function.name, args);
                                } catch (e) {}
                            }
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
    this.currentAbortController?.abort();
    if (this.recognition) { 
        try { this.recognition.stop(); } catch(e) {}
        this.recognition = null; 
    }
    if (this.ttsService) { 
        this.ttsService.stop(); 
        this.ttsService = null; 
    }
    this.ai = null;
  }
}
