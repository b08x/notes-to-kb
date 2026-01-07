
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Modality } from "@google/genai";

export class GeminiNativeTTS {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private onVolumeCallback?: (vol: number) => void;
  private isMonitoring = false;
  private voiceName: string;
  private textBuffer = "";
  
  // Rate limiting for 3 RPM (1 request per 20s)
  private lastRequestTime = 0;
  private isProcessing = false;
  private requestQueue: string[] = [];
  private readonly COOLDOWN_MS = 21000; // 21s to be safe

  constructor(voiceName: string = 'Fenrir') {
    this.voiceName = voiceName;
  }

  public setOnVolume(cb: (vol: number) => void) {
    this.onVolumeCallback = cb;
    if (this.analyser && !this.isMonitoring) {
      this.startVolumeMonitoring();
    }
  }

  public async prewarm() {
    return Promise.resolve();
  }

  public async speak(text: string, isFinal = false) {
    if (!text && !isFinal) return;
    
    this.textBuffer += text;

    // Trigger on sentence boundaries or if the buffer is getting large.
    const shouldTrigger = isFinal || 
                         this.textBuffer.length > 200 || 
                         /[.!?]\s*$/.test(this.textBuffer.trim());

    if (!shouldTrigger || !this.textBuffer.trim()) return;

    const textToSpeak = this.textBuffer.trim();
    this.textBuffer = "";
    
    this.requestQueue.push(textToSpeak);
    
    // Only keep the most recent 2 items in queue to prevent massive lag
    if (this.requestQueue.length > 2) {
        this.requestQueue.shift();
    }

    this.processQueue();
  }

  private async processQueue() {
      if (this.isProcessing || this.requestQueue.length === 0) return;

      const now = Date.now();
      const timeSinceLast = now - this.lastRequestTime;

      if (timeSinceLast < this.COOLDOWN_MS) {
          // Schedule next check
          setTimeout(() => this.processQueue(), this.COOLDOWN_MS - timeSinceLast);
          return;
      }

      this.isProcessing = true;
      const text = this.requestQueue.shift()!;
      
      try {
          await this.processTtsRequest(text);
          this.lastRequestTime = Date.now();
      } catch (e) {
          console.error("Queue processing error:", e);
      } finally {
          this.isProcessing = false;
          this.processQueue();
      }
  }

  private async processTtsRequest(text: string) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Convert the following text to speech: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: this.voiceName },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        await this.playBase64Audio(base64Audio);
      }
    } catch (e: any) {
        const msg = e.message || "";
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
            console.warn("Gemini TTS Quota Exceeded. Cooldown reset.");
            this.lastRequestTime = Date.now() + 10000; // Add penalty
        } else {
            console.error("Gemini TTS Error:", e);
        }
    }
  }

  public async flush() {
    if (this.textBuffer.trim()) {
        await this.speak("", true);
    }
  }

  private async playBase64Audio(base64: string) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
      this.startVolumeMonitoring();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const dataInt16 = new Int16Array(bytes.buffer);
      const audioBuffer = this.audioContext.createBuffer(1, dataInt16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
        channelData[i] = dataInt16[i] / 32768.0;
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser!);

      const currentTime = this.audioContext.currentTime;
      this.nextStartTime = Math.max(this.nextStartTime, currentTime);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      this.sources.add(source);
      source.onended = () => this.sources.delete(source);
    } catch (e) {
      console.error("Gemini Audio Decoding Error:", e);
    }
  }

  private startVolumeMonitoring() {
    if (!this.analyser || !this.onVolumeCallback || this.isMonitoring) return;
    this.isMonitoring = true;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    const check = () => {
      if (!this.analyser || !this.isMonitoring) return;
      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const average = sum / dataArray.length;
      this.onVolumeCallback?.(average / 128);
      requestAnimationFrame(check);
    };
    check();
  }

  public stopAudio() {
    this.sources.forEach(s => { try { s.stop(); } catch (e) { } });
    this.sources.clear();
    this.nextStartTime = 0;
    this.textBuffer = "";
    this.requestQueue = [];
    this.isProcessing = false;
  }

  public stop() {
    this.stopAudio();
    this.isMonitoring = false;
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
