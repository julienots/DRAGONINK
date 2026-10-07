// Identité sonore originale de XalaMonsters, entièrement synthétisée :
// musique générative par île (gammes, tempo, timbres), ambiances (vent, eau)
// et effets sonores. Aucun fichier audio externe.

import { seededRng, hashString } from '../core/util';

export interface MusicTheme { root: number; scale: number[]; tempo: number; wave: OscillatorType; key: string; drums?: boolean; minor?: boolean }

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private theme: MusicTheme | null = null;
  private nextNoteTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private progression: number[][] = [];
  private melody: (number | null)[] = [];
  private ambience: { src: AudioBufferSourceNode; gain: GainNode }[] = [];
  musicVolume = 0.6;
  sfxVolume = 0.8;
  private lastSfx = new Map<string, number>();

  /** Doit être appelé suite à un geste utilisateur (politique des navigateurs). */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
    } catch { return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9; this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = this.musicVolume * 0.5; this.musicBus.connect(comp);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.sfxVolume; this.sfxBus.connect(comp);
    this.ambBus = c.createGain(); this.ambBus.gain.value = this.musicVolume * 0.35; this.ambBus.connect(comp);
    this.noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.timer = setInterval(() => this.schedule(), 60);
    if (this.theme) this.setTheme(this.theme, true);
  }

  setVolumes(music: number, sfx: number): void {
    this.musicVolume = music; this.sfxVolume = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.1);
    this.ambBus.gain.setTargetAtTime(music * 0.35, this.ctx.currentTime, 0.1);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  suspend(): void { void this.ctx?.suspend(); }
  resume(): void { void this.ctx?.resume(); }

  // ————————————————————————— musique générative —————————————————————————

  setTheme(theme: MusicTheme, force = false): void {
    if (!force && this.theme?.key === theme.key) return;
    this.theme = theme;
    const rng = seededRng(hashString(theme.key));
    const minor = theme.minor ?? theme.scale[2] === 3;
    const degs = minor ? [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4]] : [[0, 4, 5, 3], [0, 3, 4, 4], [0, 5, 3, 4], [5, 3, 0, 4]];
    const prog = degs[Math.floor(rng() * degs.length)];
    this.progression = prog.map((deg) => [deg, deg + 2, deg + 4]);
    // mélodie de 32 pas (8 temps × 4 mesures) en marche aléatoire sur la gamme
    this.melody = [];
    let cur = 7 + Math.floor(rng() * 3);
    for (let i = 0; i < 64; i++) {
      if (rng() < (i % 4 === 0 ? 0.85 : 0.35)) {
        cur = Math.max(4, Math.min(13, cur + Math.round((rng() - 0.5) * 4)));
        this.melody.push(cur);
      } else this.melody.push(null);
    }
    this.step = 0;
    if (this.ctx) {
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.musicBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicBus.gain.setValueAtTime(0, this.ctx.currentTime);
      this.musicBus.gain.linearRampToValueAtTime(this.musicVolume * 0.5, this.ctx.currentTime + 1.5);
    }
  }

  private note(scale: number[], root: number, degree: number): number {
    const oct = Math.floor(degree / scale.length);
    const idx = ((degree % scale.length) + scale.length) % scale.length;
    return root + scale[idx] + oct * 12;
  }

  private schedule(): void {
    const c = this.ctx;
    if (!c || !this.theme || c.state !== 'running') return;
    const th = this.theme;
    const stepDur = 60 / th.tempo / 2; // croches
    while (this.nextNoteTime < c.currentTime + 0.25) {
      const t = this.nextNoteTime;
      const s = this.step;
      const bar = Math.floor(s / 8) % this.progression.length;
      const chord = this.progression[bar];
      // basse
      if (s % 4 === 0) this.tone(mtof(this.note(th.scale, th.root - 24, chord[0])), t, stepDur * 3.5, 'triangle', 0.16, this.musicBus);
      // nappe d'accord au début de chaque mesure
      if (s % 8 === 0) for (const d of chord) this.tone(mtof(this.note(th.scale, th.root - 12, d)), t, stepDur * 7.5, 'sine', 0.045, this.musicBus, 0.25);
      // arpège
      if (s % 2 === 1) this.tone(mtof(this.note(th.scale, th.root, chord[(s >> 1) % 3])), t, stepDur * 0.9, th.wave, 0.035, this.musicBus);
      // mélodie
      const m = this.melody[s % this.melody.length];
      if (m !== null && m !== undefined) this.tone(mtof(this.note(th.scale, th.root, m)), t, stepDur * 1.6, 'triangle', 0.075, this.musicBus, 0.02, true);
      // percussions légères
      if (th.drums) {
        if (s % 4 === 0) this.kick(t);
        if (s % 2 === 1) this.hat(t, 0.025);
        if (s % 8 === 4) this.hat(t, 0.06, 1800);
      }
      this.nextNoteTime += stepDur;
      this.step++;
    }
  }

  private tone(freq: number, t: number, dur: number, type: OscillatorType, vol: number, bus: GainNode, attack = 0.01, vibrato = false): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (vibrato) {
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = freq * 0.006;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private kick(t: number): void {
    const c = this.ctx!;
    const o = c.createOscillator(); const g = c.createGain();
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.musicBus);
    o.start(t); o.stop(t + 0.2);
  }

  private hat(t: number, vol: number, freq = 7000): void {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    s.connect(f); f.connect(g); g.connect(this.musicBus);
    s.start(t, Math.random()); s.stop(t + 0.06);
  }

  // ————————————————————————— ambiances —————————————————————————

  setAmbience(kinds: ('wind' | 'water' | 'lava' | 'space')[]): void {
    if (!this.ctx) return;
    const c = this.ctx;
    for (const a of this.ambience) { a.gain.gain.setTargetAtTime(0, c.currentTime, 0.4); a.src.stop(c.currentTime + 2); }
    this.ambience = [];
    for (const k of kinds) {
      const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      const f = c.createBiquadFilter();
      const g = c.createGain(); g.gain.value = 0;
      if (k === 'wind') { f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6; }
      if (k === 'water') { f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2; }
      if (k === 'lava') { f.type = 'lowpass'; f.frequency.value = 220; }
      if (k === 'space') { f.type = 'bandpass'; f.frequency.value = 3000; f.Q.value = 8; }
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = k === 'wind' ? 0.12 : 0.4; lg.gain.value = k === 'wind' ? 250 : 300;
      lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      src.connect(f); f.connect(g); g.connect(this.ambBus);
      g.gain.setTargetAtTime(k === 'lava' ? 0.5 : 0.22, c.currentTime, 1);
      src.start();
      this.ambience.push({ src, gain: g });
    }
  }

  // ————————————————————————— effets sonores —————————————————————————

  sfx(name: string, opts: { freq?: number } = {}): void {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const now = c.currentTime;
    const last = this.lastSfx.get(name) ?? 0;
    if (now - last < 0.04) return;
    this.lastSfx.set(name, now);
    const B = this.sfxBus;
    const seq = (notes: number[], step: number, type: OscillatorType, vol: number, dur = 0.18) => notes.forEach((n, i) => this.tone(mtof(n), now + i * step, dur, type, vol, B));
    switch (name) {
      case 'click': this.tone(1200, now, 0.05, 'square', 0.04, B); break;
      case 'coins': seq([88, 93, 96], 0.05, 'square', 0.06, 0.12); break;
      case 'harvest': seq([72, 76, 79, 84], 0.05, 'triangle', 0.1); break;
      case 'plant': this.tone(500, now, 0.08, 'sine', 0.12, B); this.tone(800, now + 0.05, 0.08, 'sine', 0.08, B); break;
      case 'build': for (let i = 0; i < 3; i++) this.noiseHit(now + i * 0.12, 300, 0.25, 0.08); break;
      case 'egg': seq([79, 84], 0.08, 'sine', 0.12, 0.25); break;
      case 'crack': this.noiseHit(now, 2500, 0.3, 0.06); this.noiseHit(now + 0.1, 3000, 0.25, 0.05); break;
      case 'hatch': this.noiseHit(now, 2500, 0.3, 0.08); seq([72, 76, 79, 84, 88, 91], 0.07, 'triangle', 0.12, 0.35); break;
      case 'levelup': seq([72, 76, 79, 84, 79, 84, 88], 0.08, 'square', 0.07, 0.25); break;
      case 'reward': seq([84, 88, 91, 96], 0.07, 'sine', 0.12, 0.4); break;
      case 'buy': seq([91, 96], 0.07, 'square', 0.07, 0.2); this.noiseHit(now + 0.12, 6000, 0.1, 0.03); break;
      case 'error': this.tone(140, now, 0.18, 'sawtooth', 0.08, B); this.tone(110, now + 0.1, 0.2, 'sawtooth', 0.08, B); break;
      case 'breed': seq([76, 81, 85, 88], 0.09, 'sine', 0.11, 0.5); break;
      case 'evolve': {
        const o = c.createOscillator(); const g = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(200, now); o.frequency.exponentialRampToValueAtTime(1600, now + 1.2);
        g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.08, now + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2500;
        o.connect(f); f.connect(g); g.connect(B); o.start(now); o.stop(now + 1.5);
        seq([84, 88, 91, 96], 0.1, 'triangle', 0.1, 0.5);
        break;
      }
      case 'attack': this.noiseHit(now, 900, 0.25, 0.15, 'bandpass'); break;
      case 'hit': this.noiseHit(now, 400, 0.35, 0.1); this.tone(90, now, 0.12, 'sine', 0.2, B); break;
      case 'ult': this.noiseHit(now, 600, 0.4, 0.5); seq([60, 67, 72, 79], 0.06, 'sawtooth', 0.06, 0.4); break;
      case 'victory': seq([72, 72, 72, 76, 79, 76, 79, 84], 0.12, 'square', 0.07, 0.3); break;
      case 'defeat': seq([72, 67, 64, 60], 0.18, 'triangle', 0.1, 0.4); break;
      case 'eat': for (let i = 0; i < 3; i++) this.noiseHit(now + i * 0.09, 1200, 0.15, 0.04); break;
      case 'unlock': seq([79, 83, 86, 91, 95], 0.06, 'sine', 0.1, 0.5); break;
      case 'energy': this.tone(600, now, 0.15, 'square', 0.05, B); this.tone(1200, now + 0.05, 0.15, 'square', 0.04, B); break;
      case 'essence': seq([88, 92, 95, 100, 104], 0.05, 'sine', 0.08, 0.6); break;
      case 'cook': this.noiseHit(now, 4000, 0.12, 0.5, 'highpass'); break;
      case 'open': seq([67, 72], 0.05, 'sine', 0.06, 0.12); break;
      case 'cry': {
        const f0 = opts.freq ?? 300;
        const o = c.createOscillator(); const m = c.createOscillator(); const mg = c.createGain(); const g = c.createGain();
        o.type = 'triangle'; o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f0 * 1.6, now + 0.12); o.frequency.exponentialRampToValueAtTime(f0 * 0.9, now + 0.3);
        m.frequency.value = f0 * 0.5; mg.gain.value = f0 * 0.3; m.connect(mg); mg.connect(o.frequency);
        g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.12, now + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        o.connect(g); g.connect(B); o.start(now); m.start(now); o.stop(now + 0.4); m.stop(now + 0.4);
        break;
      }
      default: this.tone(880, now, 0.08, 'sine', 0.05, B);
    }
  }

  private noiseHit(t: number, freq: number, vol: number, dur: number, type: BiquadFilterType = 'lowpass'): void {
    const c = this.ctx!;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    void this.ctx?.close();
    this.ctx = null;
  }
}

export const audio = new AudioEngine();
