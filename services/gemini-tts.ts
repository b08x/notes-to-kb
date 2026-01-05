
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
  private ai: GoogleGenAI;
  private voiceName: string;
  private textBuffer = "";
  private isProcessing = false;

  constructor(voiceName: string = 'Fenrir') {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    this.voiceName = voiceName;
  }

  public setOnVolume(cb: (vol: number) => void) {
    this.onVolumeCallback = cb;
    if (this.analyser && !this.isMonitoring) {
      this.startVolumeMonitoring();
    }
  }

  public async prewarm() {
    // Gemini Native TTS is request-based, no long-lived socket to warm.
    return Promise.resolve();
  }

  /**
   * Buffers text and only sends to Gemini when a complete sentence is formed or forced.
   * This is critical to avoid hitting the 3 RPM (Requests Per Minute) free tier quota.
   */
  public async speak(text: string, isFinal = false) {
    if (!text && !isFinal) return;
    
    this.textBuffer += text;

    // Trigger only on sentence boundaries or if forced by isFinal/length.
    // This minimizes API calls significantly.
    const shouldTrigger = isFinal || 
                         this.textBuffer.length > 100 || 
                         /[.!?]\s*$/.test(this.textBuffer.trim());

    if (!shouldTrigger || !this.textBuffer.trim()) return;

    const textToSpeak = this.textBuffer.trim();
    this.textBuffer = "";
    
    await this.processTtsRequest(textToSpeak);
  }

  private async processTtsRequest(text: string) {
    try {
      // Use a fresh instance to ensure correct API key usage if rotated
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        // Adding "Convert the following text to speech:" helps prevent the 400 error 
        // where the model mistakenly tries to continue the text generation.
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
        // Log error but don't crash. If it's a 429, we might want to notify the user.
        const msg = e.message || "";
        if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
            console.warn("Gemini TTS Quota Exceeded (3 RPM Limit). Buffering more aggressively...");
            // Optionally put text back in buffer to try again later, 
            // but for a live session, skipping is often safer to avoid lag.
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

      // Gemini TTS returns raw 16-bit PCM at 24kHz
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
