
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

  public async speak(text: string) {
    if (!text.trim()) return;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
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
    } catch (e) {
      console.error("Gemini TTS Error:", e);
    }
  }

  private async playBase64Audio(base64: string) {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.connect(this.audioContext.destination);
      this.startVolumeMonitoring();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    try {
      // The API returns raw PCM data. We need to decode it.
      // However, the helper functions for standard PCM decoding are required here.
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Convert PCM16 to Float32
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
