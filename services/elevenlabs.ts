
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
  private onStatusCallback?: (isTranscoding: boolean) => void;
  private connectionPromise: Promise<void> | null = null;
  private isMonitoring = false;
  private lastActivityTime = 0;
  private transcodingChunks = 0;

  constructor(apiKey: string, voiceId: string = '21m00Tcm4TlvDq8ikWAM') {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
  }

  public setOnVolume(cb: (vol: number) => void) {
      this.onVolumeCallback = cb;
      if (this.analyser && !this.isMonitoring) {
          this.startVolumeMonitoring();
      }
  }

  public setOnStatusChange(cb: (isTranscoding: boolean) => void) {
      this.onStatusCallback = cb;
  }

  public async prewarm() {
    try {
        await this.initSocket();
    } catch (e) {
        console.error("ElevenLabs prewarm failed:", e);
    }
  }

  private async initSocket(): Promise<void> {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
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
            this.lastActivityTime = Date.now();
            resolve();
        } catch (e) {
            this.connectionPromise = null;
            reject(new Error("ElevenLabs Handshake failed."));
        }
      };

      socket.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.audio) {
                this.transcodingChunks = Math.max(0, this.transcodingChunks - 1);
                if (this.transcodingChunks === 0) {
                    this.onStatusCallback?.(false);
                }
                await this.playBase64Audio(data.audio);
            }
        } catch (e) {
            console.error("Error parsing ElevenLabs message:", e);
        }
      };

      socket.onerror = (err) => {
          this.connectionPromise = null;
          this.onStatusCallback?.(false);
          reject(err);
      };
      
      socket.onclose = () => { 
          if (this.socket === socket) {
              this.socket = null; 
              this.connectionPromise = null;
              this.isMonitoring = false;
              this.transcodingChunks = 0;
              this.onStatusCallback?.(false);
          }
      };
    });

    return this.connectionPromise;
  }

  public async speak(text: string, isFinal = false) {
    if (!text && !isFinal) return;
    
    this.textBuffer += text;
    
    const shouldTrigger = isFinal || 
                         this.textBuffer.length > 25 || 
                         /[.!?]/.test(text);

    if (!shouldTrigger) return;

    try {
        await this.initSocket();
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.transcodingChunks++;
            this.onStatusCallback?.(true);
            this.socket.send(JSON.stringify({
                text: this.textBuffer,
                try_trigger_generation: true
            }));
            this.textBuffer = "";
            this.lastActivityTime = Date.now();
            
            if (isFinal) {
                this.socket.send(JSON.stringify({ text: "" }));
            }
        }
    } catch (e) {
        console.error("ElevenLabs speak error:", e);
        this.onStatusCallback?.(false);
    }
  }

  public async flush() {
    await this.speak("", true);
    if (this.socket) {
        this.socket.close();
        this.socket = null;
        this.connectionPromise = null;
    }
  }

  private async playBase64Audio(base64: string) {
    if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 256;
        this.analyser.connect(this.audioContext.destination);
    }
    
    // Crucial: AudioContext must be resumed inside a user-gesture (or as soon as possible after one)
    if (this.audioContext.state === 'suspended') {
        try { await this.audioContext.resume(); } catch(e) {}
    }

    try {
        const binaryString = atob(base64.replace(/\s/g, ''));
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
        
        if (!this.isMonitoring) this.startVolumeMonitoring();
    } catch (e) {
        console.debug("Audio chunk decoding partial failure:", e);
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
    this.sources.forEach(s => { try { s.stop(); } catch(e) {} });
    this.sources.clear();
    this.nextStartTime = 0;
    this.textBuffer = "";
    this.transcodingChunks = 0;
    this.onStatusCallback?.(false);
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ text: "" }));
        this.socket.close();
    }
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
