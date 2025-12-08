
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";

const DATA_PKT_HEADER_SIZE = 0; // Header size if any, 0 for raw PCM

// Audio Config
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

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
  private onVolumeUpdate?: (level: number) => void;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async connect(onClose: () => void) {
    // 1. Setup Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: INPUT_SAMPLE_RATE,
    });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: OUTPUT_SAMPLE_RATE,
    });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    // 2. Setup Live Session
    this.sessionPromise = this.client.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: `You are a helpful, expert technical assistant for the "Notes to KB" app. 
        Your goal is to help the user understand how to create Knowledge Base articles, suggest improvements, or just chat about their documentation needs.
        Keep responses concise and conversational.`,
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

    await this.sessionPromise;
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
        if (this.onVolumeUpdate) {
            let sum = 0;
            for (let i = 0; i < inputData.length; i++) {
                sum += inputData[i] * inputData[i];
            }
            const rms = Math.sqrt(sum / inputData.length);
            this.onVolumeUpdate(rms);
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

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
      const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
      await this.playAudio(base64Audio);
    }

    if (message.serverContent?.interrupted) {
      this.stopAudioPlayback();
    }
  }

  private async playAudio(base64: string) {
    if (!this.outputAudioContext || !this.outputNode) return;

    const arrayBuffer = this.base64ToArrayBuffer(base64);
    const audioBuffer = await this.outputAudioContext.decodeAudioData(arrayBuffer).catch(async () => {
        // Fallback for raw PCM if decodeAudioData fails (Browsers prefer headers)
        // Since API returns Raw PCM, we usually need manual decoding or WAV header injection.
        // However, the updated SDK examples suggest standard decode might work if headers are present, 
        // OR we manually decode PCM. Let's manually decode PCM 16-bit 24kHz.
        return this.decodePCM16(arrayBuffer, 24000);
    });

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
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    this.sessionPromise = null;
  }

  public setVolumeCallback(cb: (vol: number) => void) {
      this.onVolumeUpdate = cb;
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
