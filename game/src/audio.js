// audio.js — fully synthesized WebAudio: SFX (shots, crashes, sirens, jingles)
// and 4 procedural radio stations (step sequencer, no audio files).
import { STATIONS } from './config.js';

export function createAudio() {
  const A = {
    ctx: null, master: null, radioGain: null, sfxGain: null,
    station: -1, // -1 = off
    nextNote: 0, step: 0, timer: null, noiseBuf: null,
    ensure() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = 0.5;
        this.sfxGain.connect(this.master);
        this.radioGain = this.ctx.createGain(); this.radioGain.gain.value = 0.16;
        this.radioGain.connect(this.master);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      } catch (e) { this.ctx = null; }
    },
    tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = null) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + when;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t0); o.stop(t0 + dur + 0.02);
    },
    noise(dur, vol = 0.3, filterFreq = 1200, when = 0) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + when;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t0); src.stop(t0 + dur + 0.02);
    },
    sfx(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'shot': this.noise(0.12, 0.5, 3200); this.tone(180, 0.1, 'square', 0.25, 0, 60); break;
        case 'empty': this.tone(1200, 0.05, 'square', 0.12); break;
        case 'crash': this.noise(0.35, 0.5, 700); this.tone(90, 0.3, 'sawtooth', 0.3, 0, 40); break;
        case 'pickup': this.tone(660, 0.1, 'sine', 0.3); this.tone(990, 0.16, 'sine', 0.3, 0.09); break;
        case 'mission': this.tone(523, 0.12, 'triangle', 0.3); this.tone(659, 0.12, 'triangle', 0.3, 0.1); this.tone(784, 0.2, 'triangle', 0.3, 0.2); break;
        case 'complete': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.3, i * 0.11)); break;
        case 'fail': this.tone(392, 0.2, 'sawtooth', 0.25); this.tone(311, 0.35, 'sawtooth', 0.25, 0.18); break;
        case 'steal': this.tone(220, 0.08, 'square', 0.2); this.tone(330, 0.08, 'square', 0.2, 0.07); break;
        case 'click': this.tone(880, 0.04, 'square', 0.12); break;
        case 'heli': this.noise(0.8, 0.2, 500); break;
        case 'explosion': this.noise(0.9, 0.6, 400); this.tone(60, 0.8, 'sine', 0.5, 0, 30); break;
        case 'siren': this.tone(700, 0.4, 'sine', 0.08, 0, 950); break;
        case 'buy': this.tone(880, 0.08, 'sine', 0.3); this.tone(1174, 0.14, 'sine', 0.3, 0.07); break;
        case 'heal': this.tone(440, 0.12, 'sine', 0.25); this.tone(554, 0.12, 'sine', 0.25, 0.1); this.tone(659, 0.2, 'sine', 0.25, 0.2); break;
      }
    },
    // --- radio: 16-step sequencer per station, scheduled ahead ---
    radioName() { return this.station < 0 ? 'off' : STATIONS[this.station].name; },
    setStation(i) {
      this.ensure();
      this.station = i;
      this.step = 0;
      if (this.ctx) this.nextNote = this.ctx.currentTime + 0.1;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (i >= 0 && this.ctx) this.timer = setInterval(() => this.schedule(), 40);
    },
    nextStation() { this.setStation(this.station >= STATIONS.length - 1 ? -1 : this.station + 1); },
    midi(m) { return 440 * Math.pow(2, (m - 69) / 12); },
    schedule() {
      if (!this.ctx || this.station < 0) return;
      const st = STATIONS[this.station];
      const spb = 60 / st.bpm / 4; // 16th notes
      while (this.nextNote < this.ctx.currentTime + 0.18) {
        const s = this.step % 16;
        const t0 = this.nextNote;
        const root = st.root;
        const scale = st.scale;
        // bass on beats
        if (s % 4 === 0) this.radioTone(this.midi(root + scale[(s / 4) % scale.length] - 12), spb * 3.5, st.bass, 0.5, t0);
        // arp sparkle
        if (s % 2 === 0) this.radioTone(this.midi(root + 12 + scale[(s * 2 + 1) % scale.length]), spb * 0.9, st.wave, 0.10, t0);
        // pad on bar start
        if (s === 0) {
          this.radioTone(this.midi(root + 12 + scale[0]), spb * 16, 'sine', 0.06, t0);
          this.radioTone(this.midi(root + 12 + scale[2]), spb * 16, 'sine', 0.05, t0);
        }
        // hat tick
        if (s % 2 === 1) this.radioNoise(0.03, 0.06, 8000, t0);
        // kick
        if (s % 4 === 0 || (st.bpm > 120 && s % 4 === 2)) this.radioTone(120, 0.12, 'sine', 0.5, t0, 45);
        this.step++;
        this.nextNote += spb;
      }
    },
    radioTone(freq, dur, type, vol, when, slideTo) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, when);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, when + dur);
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      o.connect(g); g.connect(this.radioGain);
      o.start(when); o.stop(when + dur + 0.02);
    },
    radioNoise(dur, vol, freq, when) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, when);
      g.gain.exponentialRampToValueAtTime(0.001, when + dur);
      src.connect(f); f.connect(g); g.connect(this.radioGain);
      src.start(when); src.stop(when + dur + 0.02);
    },
  };
  return A;
}
