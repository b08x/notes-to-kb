
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class ElevenLabsTTS {
  private socket: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private nextStartTime = 0;
  private apiKey: string;
  private voiceId: string;
  private sources = new Set<AudioBufferSourceNode>();
  private textBuffer = "";
  private onVolumeCallback?: (vol: number) => void;
  private connectionPromise: Promise<void> | null = null;
  private isMonitoring = false;

  constructor(apiKey: string, voiceId: string = '21m00Tcm4TlvDq8ikWAM') {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  public setOnVolume(cb: (vol: number) => void) {
      this.onVolumeCallback = cb;
      // If we already have an analyser, start monitoring now
      if (this.analyser && !this.isMonitoring) {
          this.startVolumeMonitoring();
      }
  }

  private async initSocket(): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) return;
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = new Promise((resolve, reject) => {
      const model = 'eleven_turbo_v2_5';
      const url = `wss://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream-input?model_id=${model}`;
      
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.onopen = () => {
        try {
            socket.send(JSON.stringify({
              text: " ",
              voice_settings: { stability: 0.5, similarity_boost: 0.8 },
              xi_api_key: this.apiKey
            }));
            resolve();
        } catch (e) {
            reject(new Error("Handshake failed during socket opening."));
        }
      };

      socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.audio) {
                await this.playBase64Audio(data.audio);
            }
        } catch (e) {
            console.error("Error parsing ElevenLabs message:", e);
        }
      };

      socket.onerror = (err) => {
          this.connectionPromise = null;
          reject(err);
      };
      
      socket.onclose = () => { 
          if (this.socket === socket) {
              this.socket = null; 
              this.connectionPromise = null;
              this.isMonitoring = false;
          }
      };
    });

    return this.connectionPromise;
  }

  public async speak(text: string) {
    if (!text.trim()) return;
    this.textBuffer += text;
    
    if (this.textBuffer.length < 5 && !text.includes('.') && !text.includes('?') && !text.includes('!')) return;

    try {
        await this.initSocket();
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                text: this.textBuffer,
                try_trigger_generation: true
            }));
            this.textBuffer = "";
        }
    } catch (e) {
        console.error("ElevenLabs Error:", e);
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
    
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();

    try {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        
        const audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer);
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
        console.error("Audio Decoding Error:", e);
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
          // Normalize volume for UI display
          this.onVolumeCallback?.(average / 128);
          requestAnimationFrame(check);
      };
      check();
  }

  /**
   * Stops current playback only.
   */
  public stopAudio() {
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    this.nextStartTime = 0;
    this.textBuffer = "";
  }

  public stop() {
    this.stopAudio();
    this.isMonitoring = false;
    this.connectionPromise = null;
    if (this.socket) { 
        this.socket.close(); 
        this.socket = null; 
    }
  }
}
