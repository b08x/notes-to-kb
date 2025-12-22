
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type, Blob } from "@google/genai";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const editDocumentTool: FunctionDeclaration = {
  name: "edit_document",
  description: "Update the HTML content of the document being viewed. Use this when the user asks to change, refine, or style the document.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      html: {
        type: Type.STRING,
        description: "The full, valid HTML code for the updated document."
      }
    },
    required: ["html"]
  }
};

export interface LiveConfig {
    model: string;
    voice: string;
    prompt?: string;
}

export interface LiveClientCallbacks {
    onToolCall?: (html: string) => void;
    onVolume?: (vol: number) => void;
    onTranscription?: (text: string, source: 'user' | 'model') => void;
    onError?: (error: Error) => void;
}

// Manual encoding/decoding as per requirements
function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class LiveClient {
  private client: GoogleGenAI | null = null;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private initialContext: string = "";
  private callbacks: LiveClientCallbacks;

  constructor(initialContext: string = "", callbacks: LiveClientCallbacks = {}) {
    this.initialContext = initialContext;
    this.callbacks = callbacks;
  }

  async connect(onClose: () => void, config?: LiveConfig) {
    // Create new client right before connection to ensure up-to-date API key
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });

    // Setup Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });
    
    // Explicitly resume contexts for browser policy compliance
    await this.inputAudioContext.resume();
    await this.outputAudioContext.resume();

    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    const modelName = config?.model || 'gemini-2.5-flash-native-audio-preview-09-2025';
    const voiceName = config?.voice || 'Fenrir';
    const systemInstruction = config?.prompt || "You are a helpful assistant.";

    try {
        this.sessionPromise = this.client.live.connect({
          model: modelName,
          config: {
            responseModalities: [Modality.AUDIO],
            tools: [{ functionDeclarations: [editDocumentTool] }],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
            },
            systemInstruction: systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
          callbacks: {
            onopen: async () => {
              console.log("Live Session Connected");
              await this.startAudioInput();
            },
            onmessage: async (msg: LiveServerMessage) => {
              this.handleMessage(msg);
            },
            onclose: () => {
              console.log("Live Session Closed");
              this.stop();
              onClose();
            },
            onerror: (err: any) => {
              console.error("Live Session Error:", err);
              if (this.callbacks.onError) {
                  this.callbacks.onError(new Error(err.message || "Network error in Live session"));
              }
              this.stop();
              onClose();
            }
          }
        });

        // Send initial state safely after session is established
        this.sessionPromise.then((session) => {
            if (this.initialContext) {
                // Truncate context to avoid payload size errors
                const contextSafe = this.initialContext.substring(0, 10000).replace(/`/g, "'");
                session.sendRealtimeInput({
                    text: `[SYSTEM] The current document content is below. Use it as a base for refinements:\n\`\`\`html\n${contextSafe}\n\`\`\``
                });
            }
        });

    } catch (error: any) {
        console.error("Failed to establish Live Session:", error);
        this.stop();
        throw error;
    }
  }

  private async startAudioInput() {
    if (!this.inputAudioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);
      
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Track volume for UI feedback
        if (this.callbacks.onVolume) {
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
            this.callbacks.onVolume(Math.sqrt(sum / inputData.length));
        }

        const l = inputData.length;
        const int16 = new Int16Array(l);
        for (let i = 0; i < l; i++) {
            int16[i] = inputData[i] * 32768;
        }

        const pcmBlob: Blob = {
            data: encode(new Uint8Array(int16.buffer)),
            mimeType: 'audio/pcm;rate=16000',
        };

        // Always use sessionPromise to avoid stale closures
        this.sessionPromise?.then(session => {
            session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      this.inputSource.connect(this.processor);
      this.processor.connect(this.inputAudioContext.destination);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  }
  
  public sendText(text: string) {
      this.sessionPromise?.then(session => {
          session.sendRealtimeInput({ text: text });
      });
  }

  private async handleMessage(message: LiveServerMessage) {
    // Process model's audio turn
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      if (base64Audio) {
        await this.playAudio(base64Audio);
      }
    }

    // Handle interruptions (e.g., user starts talking)
    if (message.serverContent?.interrupted) {
      this.stopAudioPlayback();
    }

    // Handle transcriptions
    const outText = message.serverContent?.outputTranscription?.text;
    if (outText) this.callbacks.onTranscription?.(outText, 'model');
    
    const inText = message.serverContent?.inputTranscription?.text;
    if (inText) this.callbacks.onTranscription?.(inText, 'user');

    // Handle function calls (edit_document)
    if (message.toolCall) {
        const functionCalls = message.toolCall.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const responses: any[] = [];
            for (const call of functionCalls) {
                if (call.name === 'edit_document') {
                    const newHtml = (call.args as any)['html'];
                    if (newHtml && this.callbacks.onToolCall) this.callbacks.onToolCall(newHtml);
                    responses.push({ id: call.id, name: call.name, response: { result: "ok" } });
                }
            }
            if (responses.length > 0) {
                this.sessionPromise?.then(session => {
                    session.sendToolResponse({ functionResponses: responses });
                });
            }
        }
    }
  }

  private async playAudio(base64: string) {
    if (!this.outputAudioContext || !this.outputNode) return;
    
    const bytes = decode(base64);
    const audioBuffer = await decodeAudioData(bytes, this.outputAudioContext, OUTPUT_SAMPLE_RATE, 1);

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    
    const currentTime = this.outputAudioContext.currentTime;
    this.nextStartTime = Math.max(this.nextStartTime, currentTime);
    
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    this.sources.add(source);
    source.onended = () => this.sources.delete(source);
  }

  private stopAudioPlayback() {
    this.sources.forEach(source => { try { source.stop(); } catch (e) {} });
    this.sources.clear();
    this.nextStartTime = 0;
  }

  public stop() {
    this.stopAudioPlayback();
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') this.inputAudioContext.close().catch(() => {});
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') this.outputAudioContext.close().catch(() => {});
    this.sessionPromise = null;
    this.client = null;
  }
}
