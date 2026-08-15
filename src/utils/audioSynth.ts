/**
 * Web Audio API Sound Synthesizer for AI Video Lab
 * Generates procedural soundtracks and sound effects synced to video frames and FPS.
 */

export type SoundTheme = 'cyberpunk' | 'cinematic' | 'ambient' | 'synthwave' | 'action' | 'lofi' | 'horror';

export class VideoAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.5;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private theme: SoundTheme = 'cinematic';
  private loopInterval: number | null = null;

  constructor() {
    // Lazy init on user interaction
  }

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.isMuted ? 0 : this.volume;
      this.masterGain.connect(this.ctx.destination);

      // Create stream destination for recording
      this.streamDest = this.ctx.createMediaStreamDestination();
      this.masterGain.connect(this.streamDest);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getAudioStreamTrack(): MediaStreamTrack | null {
    this.initContext();
    if (this.streamDest && this.streamDest.stream) {
      const tracks = this.streamDest.stream.getAudioTracks();
      return tracks.length > 0 ? tracks[0] : null;
    }
    return null;
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this.isMuted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx?.currentTime || 0, 0.05);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.isMuted ? 0 : this.volume, this.ctx?.currentTime || 0, 0.05);
    }
    return this.isMuted;
  }

  public setTheme(theme: SoundTheme) {
    this.theme = theme;
  }

  /**
   * Triggers a synchronized Sound Effect (SFX) when a video frame changes
   */
  public triggerFrameSfx(frameIndex: number, totalFrames: number, sfxType?: string) {
    this.initContext();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const progress = totalFrames > 0 ? frameIndex / totalFrames : 0;

    // Detect sfx intent or pick based on theme & rhythm
    const type = (sfxType || '').toLowerCase();

    if (type.includes('laser') || type.includes('blast') || this.theme === 'cyberpunk' && frameIndex % 3 === 0) {
      this.playLaser(now);
    } else if (type.includes('whoosh') || type.includes('wind') || type.includes('transição') || frameIndex === 0) {
      this.playWhoosh(now);
    } else if (type.includes('impact') || type.includes('hit') || type.includes('explos') || frameIndex === Math.floor(totalFrames / 2)) {
      this.playImpact(now);
    } else if (type.includes('riser') || type.includes('tension') || progress > 0.7) {
      this.playRiser(now, progress);
    } else {
      // Melodic chime / rhythmic pulse based on frame number
      this.playNoteStep(now, frameIndex, totalFrames);
    }
  }

  private playNoteStep(time: number, step: number, total: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    // Pentatonic scale base frequencies
    const scales: Record<SoundTheme, number[]> = {
      cyberpunk: [110, 130.81, 146.83, 164.81, 196.00, 220, 261.63, 293.66],
      cinematic: [65.41, 98.0, 130.81, 196.0, 261.63, 329.63, 392.0],
      ambient: [130.81, 164.81, 196.0, 246.94, 261.63, 329.63, 392.0],
      synthwave: [110, 138.59, 164.81, 220, 277.18, 329.63, 440],
      action: [73.42, 110.0, 146.83, 174.61, 220.0, 293.66],
      lofi: [130.81, 155.56, 174.61, 196.0, 233.08, 261.63],
      horror: [55.0, 58.27, 77.78, 110.0, 116.54, 155.56]
    };

    const notes = scales[this.theme] || scales.cinematic;
    const freq = notes[step % notes.length];

    osc.type = this.theme === 'cyberpunk' ? 'sawtooth' : this.theme === 'ambient' ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.theme === 'lofi' ? 800 : 2500, time);

    gain.gain.setValueAtTime(0.001, time);
    gain.gain.exponentialRampToValueAtTime(0.18, time + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.38);
  }

  private playWhoosh(time: number) {
    if (!this.ctx || !this.masterGain) return;
    // Noise buffer for whoosh
    const bufferSize = this.ctx.sampleRate * 0.4;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(200, time);
    filter.frequency.exponentialRampToValueAtTime(1800, time + 0.2);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.4);
    filter.Q.setValueAtTime(3, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(0.25, time + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.4);
  }

  private playImpact(time: number) {
    if (!this.ctx || !this.masterGain) return;

    // Sub-bass punch
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(35, time + 0.3);

    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.52);
  }

  private playLaser(time: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(900, time);
    osc.frequency.exponentialRampToValueAtTime(120, time + 0.15);

    gain.gain.setValueAtTime(0.2, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.17);
  }

  private playRiser(time: number, progress: number) {
    if (!this.ctx || !this.masterGain) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    const startFreq = 200 + progress * 200;
    osc.frequency.setValueAtTime(startFreq, time);
    osc.frequency.linearRampToValueAtTime(startFreq * 1.5, time + 0.25);

    gain.gain.setValueAtTime(0.05, time);
    gain.gain.linearRampToValueAtTime(0.18, time + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  /**
   * Starts ambient background soundtrack drone
   */
  public startSoundtrackDrone() {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;
    this.stopSoundtrackDrone();

    const rootFreq = this.theme === 'cyberpunk' ? 55 : this.theme === 'horror' ? 45 : 65.4;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const droneGain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(rootFreq, this.ctx.currentTime);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(rootFreq * 1.5, this.ctx.currentTime); // Perfect fifth

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, this.ctx.currentTime);

    droneGain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    droneGain.gain.linearRampToValueAtTime(0.08, this.ctx.currentTime + 1.0);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(this.masterGain);

    osc1.start();
    osc2.start();

    this.activeOscillators = [osc1, osc2];
  }

  public stopSoundtrackDrone() {
    this.activeOscillators.forEach(osc => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (e) {}
    });
    this.activeOscillators = [];
  }

  public dispose() {
    this.stopSoundtrackDrone();
    if (this.ctx && this.ctx.state !== 'closed') {
      this.ctx.close();
    }
    this.ctx = null;
  }
}

export const audioEngine = new VideoAudioEngine();
