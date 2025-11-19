
export class AudioAnalyzer {
  audioContext: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  source: MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null = null;
  dataArray: Uint8Array | null = null;
  stream: MediaStream | null = null;

  constructor() {
    // Initialize lazily
  }

  ensureContext() {
    if (!this.audioContext) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.85;
            this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        }
    }
    // Resume if suspended (browser policy)
    if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
    }
    return !!this.audioContext;
  }

  // Method 1: Connect to Microphone
  async startMic() {
    this.stop(); // Cleanup previous
    if (!this.ensureContext()) return false;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.source = this.audioContext!.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser!);
      return true;
    } catch (err) {
      console.warn("Mic access denied", err);
      return false;
    }
  }

  // Method 2: Connect to <audio> element (YouTube/OpenLib)
  connectMediaElement(element: HTMLMediaElement) {
    this.stop();
    if (!this.ensureContext()) return false;

    try {
        // Create source from element
        // Note: element must have crossorigin="anonymous" if loading from external URL
        if (!(element as any)._sourceNode) {
            (element as any)._sourceNode = this.audioContext!.createMediaElementSource(element);
        }
        this.source = (element as any)._sourceNode;
        
        // Connect to analyser AND destination (so we can hear it)
        this.source!.connect(this.analyser!);
        this.analyser!.connect(this.audioContext!.destination);
        return true;
    } catch (e) {
        console.error("Error connecting media element", e);
        return false;
    }
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    // Disconnect source but don't close context if possible to reuse
    if (this.source) {
        try { this.source.disconnect(); } catch(e) {}
        this.source = null;
    }
  }

  getAnalysis() {
    if (!this.analyser || !this.dataArray) return { bass: 0, mid: 0, treble: 0, raw: new Uint8Array(0) };

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
