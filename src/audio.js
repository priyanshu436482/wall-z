// Audio Synthesis Module using Web Audio API

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterVolume = null;
    this.isMuted = false;
  }

  init() {
    if (this.ctx) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();

      this.masterVolume = this.ctx.createGain();
      this.masterVolume.gain.setValueAtTime(0.3, this.ctx.currentTime);
      this.masterVolume.connect(this.ctx.destination);
    } catch (e) {
      console.warn('Web Audio API is not supported in this browser:', e);
    }
  }

  async resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterVolume && this.ctx) {
      this.masterVolume.gain.setValueAtTime(
        this.isMuted ? 0 : 0.3,
        this.ctx.currentTime
      );
    }
    return this.isMuted;
  }

  async playMove() {
    await this.resume();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.exponentialRampToValueAtTime(783.99, t + 0.08);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, t);
    filter.frequency.exponentialRampToValueAtTime(600, t + 0.15);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  async playWallPlace() {
    await this.resume();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const subOsc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);

    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(70, t);
    subOsc.frequency.linearRampToValueAtTime(30, t + 0.2);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.linearRampToValueAtTime(100, t + 0.25);

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);

    osc.start(t);
    subOsc.start(t);
    osc.stop(t + 0.26);
    subOsc.stop(t + 0.26);
  }

  async playInvalid() {
    await this.resume();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(110, t);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(113, t);

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, t);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterVolume);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.26);
    osc2.stop(t + 0.26);
  }

  async playVictory() {
    await this.resume();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.0, 523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, index) => {
      const noteTime = t + index * 0.08;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.8, noteTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.4);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1500, noteTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterVolume);

      osc.start(noteTime);
      osc.stop(noteTime + 0.42);
    });
  }

  async playDefeat() {
    await this.resume();
    if (!this.ctx || this.isMuted) return;

    const t = this.ctx.currentTime;
    const notes = [261.63, 220.0, 174.61, 130.81];

    notes.forEach((freq, index) => {
      const noteTime = t + index * 0.18;

      const osc = this.ctx.createOscillator();
      const sub = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      sub.type = 'sine';
      sub.frequency.setValueAtTime(freq / 2, noteTime);

      gain.gain.setValueAtTime(0, noteTime);
      gain.gain.linearRampToValueAtTime(0.6, noteTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.6);

      osc.connect(gain);
      sub.connect(gain);
      gain.connect(this.masterVolume);

      osc.start(noteTime);
      sub.start(noteTime);
      osc.stop(noteTime + 0.62);
      sub.stop(noteTime + 0.62);
    });
  }
}

export const audio = new AudioEngine();
