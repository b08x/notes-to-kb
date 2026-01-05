
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const VAD_THRESHOLD = 0.002; // Lowered threshold for better sensitivity

// Local interface for Gemini media blobs to avoid conflict with browser's built-in Blob
interface GenerativeBlob {
  data: string;
  mimeType: string;
}

const updateElementTool: FunctionDeclaration = {
  name: "update_element",
  description: "Update the content of a specific element using a CSS selector. Best for surgical changes (fixing a typo, changing a paragraph, updating a style).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector (e.g., 'h1', 'p:nth-of-type(2)', '.warning-box')" },
      html: { type: Type.STRING, description: "The new HTML content for that element's innerHTML." }
    },
    required: ["selector", "html"]
  }
};

const appendElementTool: FunctionDeclaration = {
  name: "append_element",
  description: "Append new content into an existing element. Useful for adding steps to a list or adding a new section at the end of a div.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      selector: { type: Type.STRING, description: "CSS selector of the parent (e.g., 'ul', 'body')" },
      html: { type: Type.STRING, description: "HTML content to append." }
    },
    required: ["selector", "html"]
  }
};

// Worklet code as a string to avoid separate file requirement
const workletCode = `
class LiveAudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.vadThreshold = ${VAD_THRESHOLD};
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0) {
      const channelData = input[0];
      if (channelData.length === 0) return true;
      
      // Calculate RMS for VAD (PERF-003)
      let sum = 0;
      for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sum / channelData.length);
      
      // Only send if energy is above threshold
      if (rms > this.vadThreshold) {
        this.port.postMessage({ audio: channelData, volume: rms });
      } else {
        this.port.postMessage({ silence: true, volume: rms });
      }
    }
    return true;
  }
}
registerProcessor('live-audio-processor', LiveAudioProcessor);
`;

export interface LiveConfig {
    model: string;
    voice: string;
    prompt?: string;
}

export interface LiveClientCallbacks {
    onToolCall?: (toolName: string, args: any) => void;
    onVolume?: (vol: number) => void;
    onTranscription?: (text: string, source: 'user' | 'model') => void;
    onError?: (error: Error) => void;
}

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
  private audioWorkletNode: AudioWorkletNode | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
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
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });

    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
    
    // Resume context to ensure audio processing starts
    if (this.inputAudioContext.state === 'suspended') {
        await this.inputAudioContext.resume();
    }
    if (this.outputAudioContext.state === 'suspended') {
        await this.outputAudioContext.resume();
    }

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
            tools: [{ functionDeclarations: [updateElementTool, appendElementTool] }],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } },
            },
            inputAudioTranscription: {}, // Enabled for UI feedback
            outputAudioTranscription: {}, // Enabled for UI feedback
            systemInstruction: systemInstruction,
          },
          callbacks: {
            onopen: async () => {
              console.log("Live Session Connected");
              await this.startAudioInput();
              
              // Immediate Handshake to confirm readiness
              this.sessionPromise?.then(session => {
                  session.sendRealtimeInput({
                      text: "Connection established. Please introduce yourself briefly and confirm you are ready to help with the KB article."
                  });
              });
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
              if (this.callbacks.onError) this.callbacks.onError(new Error(err.message || "Network error"));
              this.stop();
              onClose();
            }
          }
        });

        this.sessionPromise.then((session) => {
            if (this.initialContext) {
                const contextSafe = this.initialContext.substring(0, 15000).replace(/`/g, "'");
                session.sendRealtimeInput({
                    text: `[SYSTEM] CURRENT_DOCUMENT_STATE:\n\`\`\`html\n${contextSafe}\n\`\`\``
                });
            }
        });

    } catch (error: any) {
        this.stop();
        throw error;
    }
  }

  private async startAudioInput() {
    if (!this.inputAudioContext) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.inputSource = this.inputAudioContext.createMediaStreamSource(stream);

      // Initialize AudioWorklet
      const blob = new window.Blob([workletCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      await this.inputAudioContext.audioWorklet.addModule(url);
      
      this.audioWorkletNode = new AudioWorkletNode(this.inputAudioContext, 'live-audio-processor');
      
      this.audioWorkletNode.port.onmessage = (e) => {
        const { audio, volume, silence } = e.data;
        if (this.callbacks.onVolume) this.callbacks.onVolume(volume);

        if (silence) return; 

        const int16 = new Int16Array(audio.length);
        for (let i = 0; i < audio.length; i++) {
          int16[i] = audio[i] * 32768;
        }

        const pcmBlob: GenerativeBlob = {
          data: encode(new Uint8Array(int16.buffer)),
          mimeType: 'audio/pcm;rate=16000',
        };

        this.sessionPromise?.then(session => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      // Connect source to worklet
      this.inputSource.connect(this.audioWorkletNode);
      
      // CRITICAL: Connect worklet to a silenced destination to ensure process() is called
      const silence = this.inputAudioContext.createGain();
      silence.gain.value = 0;
      this.audioWorkletNode.connect(silence);
      silence.connect(this.inputAudioContext.destination);

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
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      if (base64Audio) await this.playAudio(base64Audio);
    }

    if (message.serverContent?.interrupted) this.stopAudioPlayback();

    const outText = message.serverContent?.outputTranscription?.text;
    if (outText) this.callbacks.onTranscription?.(outText, 'model');
    
    const inText = message.serverContent?.inputTranscription?.text;
    if (inText) this.callbacks.onTranscription?.(inText, 'user');
    
    // Clear transcription state on turn complete to prevent UI ghosting
    if (message.serverContent?.turnComplete) {
        // We handle this via the callback specifically in the UI component
    }

    if (message.toolCall) {
        const functionCalls = message.toolCall.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
            const responses: any[] = [];
            for (const call of functionCalls) {
                if (this.callbacks.onToolCall) {
                    this.callbacks.onToolCall(call.name, call.args);
                }
                responses.push({ id: call.id, name: call.name, response: { result: "ok" } });
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
    this.audioWorkletNode?.disconnect();
    this.inputSource?.disconnect();
    if (this.inputAudioContext && this.inputAudioContext.state !== 'closed') this.inputAudioContext.close().catch(() => {});
    if (this.outputAudioContext && this.outputAudioContext.state !== 'closed') this.outputAudioContext.close().catch(() => {});
    this.sessionPromise = null;
    this.client = null;
  }
}
