export class AudioAnalyzer {
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  dataArray: Uint8Array | null = null;
  stream: MediaStream | null = null;

  constructor() {
    // Initialize lazily
  }

  async start() {
    this.stop(); // Cleanup previous session

    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        alert("Web Audio API is not supported in this browser.");
        return false;
      }
      
      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      
      // FFT Size determines resolution. 2048 = 1024 freq bins.
      this.analyser.fftSize = 2048; 
      this.analyser.smoothingTimeConstant = 0.85; 

      // Request Microphone Access
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch (err: any) {
        console.warn("Microphone access denied:", err);
        alert("Microphone access was denied. Please allow microphone access to use Real-time Sync.");
        return false;
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      return true;
    } catch (err: any) {
      console.error("Audio Init Error:", err);
      return false;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
  }

  getAnalysis() {
    if (!this.analyser || !this.dataArray) return { bass: 0, mid: 0, treble: 0, raw: new Uint8Array(0) };

    // Cast to any to avoid TypeScript "ArrayBufferLike vs ArrayBuffer" mismatch error
    this.analyser.getByteFrequencyData(this.dataArray as any);

    const bassCount = Math.floor(this.dataArray.length * 0.05); 
    const midCount = Math.floor(this.dataArray.length * 0.25); 
    
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    for (let i = 0; i < this.dataArray.length; i++) {
      const val = this.dataArray[i];
      if (i < bassCount) bassSum += val;
      else if (i < bassCount + midCount) midSum += val;
      else trebleSum += val;
    }

    return {
      bass: bassSum / bassCount / 255,       
      mid: midSum / midCount / 255,          
      treble: trebleSum / (this.dataArray.length - bassCount - midCount) / 255, 
      raw: this.dataArray
    };
  }
}

export const audioManager = new AudioAnalyzer();