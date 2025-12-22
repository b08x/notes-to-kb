
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// Tool Definition
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
}

export class LiveClient {
  private client: GoogleGenAI;
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

  constructor(apiKey: string, initialContext: string = "", callbacks: LiveClientCallbacks = {}) {
    this.client = new GoogleGenAI({ apiKey });
    this.initialContext = initialContext;
    this.callbacks = callbacks;
  }

  async connect(onClose: () => void, config?: LiveConfig) {
    // 1. Setup Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    const modelName = config?.model || 'gemini-2.5-flash-native-audio-preview-09-2025';
    const voiceName = config?.voice || 'Fenrir';
    const systemInstruction = config?.prompt || "You are a helpful assistant.";

    // 2. Setup Live Session
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
            onerror: (err) => {
              console.error("Live Session Error:", err);
              this.stop();
              onClose();
            }
          }
        });

        // Wait for connection to be fully established
        const session = await this.sessionPromise;

        // 3. Send Initial Context Post-Handshake
        if (this.initialContext) {
            // Truncate safely to ~20k chars to avoid hitting user message limits, 
            // though much higher than header limits.
            const contextSafe = this.initialContext.substring(0, 20000).replace(/`/g, "'");
            session.sendRealtimeInput({
                text: `[SYSTEM] Context Update. The user is currently viewing the following HTML content:\n\`\`\`html\n${contextSafe}\n\`\`\``
            });
        }

    } catch (error) {
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
      
      // Use ScriptProcessor for raw PCM access (Standard for this API currently)
      this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Calculate volume for visualizer
        if (this.callbacks.onVolume) {
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            this.callbacks.onVolume(rms);
        }

        // Convert to PCM and send
        const pcmData = this.float32ToInt16(inputData);
        const base64Data = this.arrayBufferToBase64(pcmData.buffer);

        this.sessionPromise?.then(session => {
            session.sendRealtimeInput({
                media: {
                    mimeType: "audio/pcm;rate=16000",
                    data: base64Data
                }
            });
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
          session.sendRealtimeInput({
              text: text
          });
      });
  }

  private async handleMessage(message: LiveServerMessage) {
    // Handle Audio Output
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      await this.playAudio(base64Audio);
    }

    if (message.serverContent?.interrupted) {
      this.stopAudioPlayback();
    }

    // Handle Transcription
    // Safely check for transcription text
    const outText = message.serverContent?.outputTranscription?.text;
    if (outText) {
        this.callbacks.onTranscription?.(outText, 'model');
    }
    
    const inText = message.serverContent?.inputTranscription?.text;
    if (inText) {
        this.callbacks.onTranscription?.(inText, 'user');
    }

    // Handle Tool Calls
    if (message.toolCall) {
        const functionCalls = message.toolCall.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const responses = [];
            
            for (const call of functionCalls) {
                if (call.name === 'edit_document') {
                    console.log("Executing Tool: edit_document");
                    const newHtml = (call.args as any)['html'];
                    
                    if (newHtml && this.callbacks.onToolCall) {
                        this.callbacks.onToolCall(newHtml);
                    }

                    responses.push({
                        id: call.id,
                        name: call.name,
                        response: { result: "Document updated successfully on client." }
                    });
                }
            }

            // Send Response back to model
            if (responses.length > 0) {
                this.sessionPromise?.then(session => {
                    session.sendToolResponse({
                        functionResponses: responses
                    });
                });
            }
        }
    }
  }

  private async playAudio(base64: string) {
    if (!this.outputAudioContext || !this.outputNode) return;

    const arrayBuffer = this.base64ToArrayBuffer(base64);

    // Clone the buffer because decodeAudioData detaches the input buffer.
    // If native decoding fails (which happens for raw PCM), we need the clone for manual decoding.
    const bufferClone = arrayBuffer.slice(0);
    
    let audioBuffer: AudioBuffer;

    try {
        audioBuffer = await this.outputAudioContext.decodeAudioData(arrayBuffer);
    } catch (e) {
        // Fallback to manual PCM decode using the clone
        // The API typically returns raw PCM 16-bit 24kHz
        audioBuffer = this.decodePCM16(bufferClone, OUTPUT_SAMPLE_RATE);
    }

    const source = this.outputAudioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputNode);
    
    // Scheduling
    const currentTime = this.outputAudioContext.currentTime;
    if (this.nextStartTime < currentTime) {
        this.nextStartTime = currentTime;
    }
    
    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
    
    this.sources.add(source);
    source.onended = () => {
        this.sources.delete(source);
    };
  }

  // Manual PCM Decode
  private decodePCM16(buffer: ArrayBuffer, sampleRate: number): AudioBuffer {
     if (!this.outputAudioContext) throw new Error("No output context");
     
     const int16Array = new Int16Array(buffer);
     const float32Array = new Float32Array(int16Array.length);
     for (let i = 0; i < int16Array.length; i++) {
         float32Array[i] = int16Array[i] / 32768;
     }
     
     const audioBuffer = this.outputAudioContext.createBuffer(1, float32Array.length, sampleRate);
     audioBuffer.copyToChannel(float32Array, 0);
     return audioBuffer;
  }

  private stopAudioPlayback() {
    this.sources.forEach(source => {
        try { source.stop(); } catch (e) {}
    });
    this.sources.clear();
    this.nextStartTime = 0;
  }

  public stop() {
    this.stopAudioPlayback();
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') {
       this.inputAudioContext.close().catch(e => console.warn("Failed to close input audio context", e));
    }

    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') {
       this.outputAudioContext.close().catch(e => console.warn("Failed to close output audio context", e));
    }
    
    this.sessionPromise = null;
  }

  // UTILS
  private float32ToInt16(float32: Float32Array): Int16Array {
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
