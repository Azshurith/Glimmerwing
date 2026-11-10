/**
 * Sound effects, synthesised on the fly with Web Audio: no audio files, so the
 * game stays a single page. Every sound is original. Fields queue named events
 * (see Field.sfx); the Game drains them each step and calls play().
 */

export type Sfx =
  | 'shot' | 'pop' | 'send' | 'charge' | 'release' | 'extra' | 'boss' | 'reverse'
  | 'hurt' | 'stun' | 'heal' | 'bomb' | 'fever' | 'shatter' | 'bossIn' | 'banish'
  | 'reel' | 'clash' | 'crow' | 'death' | 'tick' | 'ok' | 'start' | 'win' | 'lose';

const STORE = 'glimmerwing.sound';

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private last = new Map<string, number>();
  muted = false;
  volume = 0.6;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? '{}');
      if (typeof s.muted === 'boolean') this.muted = s.muted;
      if (typeof s.volume === 'number') this.volume = s.volume;
    } catch { /* storage unavailable: defaults */ }
  }

  /** Browsers only allow audio after a user gesture; call this from one. */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      // A gentle limiter so big chains don't clip.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 6;
      this.master.connect(comp).connect(this.ctx.destination);
      this.applyVolume();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolume();
    this.save();
    return this.muted;
  }

  private applyVolume(): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
  }

  private save(): void {
    try { localStorage.setItem(STORE, JSON.stringify({ muted: this.muted, volume: this.volume })); } catch { /* ignore */ }
  }

  /** Skip a sound if the same one played less than `gap` seconds ago. */
  private throttle(key: string, gap: number): boolean {
    const now = this.ctx!.currentTime;
    if (now - (this.last.get(key) ?? -1) < gap) return true;
    this.last.set(key, now);
    return false;
  }

  // ---- building blocks -------------------------------------------------------

  private out(pan: number, vol: number): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p).connect(this.master!);
    } else g.connect(this.master!);
    return g;
  }

  /** A pitched blip with a quick attack and exponential decay, optionally sliding. */
  private tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; to?: number; at?: number; pan?: number; hold?: boolean } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.at ?? 0);
    const o = ctx.createOscillator();
    o.type = opts.type ?? 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (opts.to) o.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = this.out(opts.pan ?? 0, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + 0.008);
    if (opts.hold) g.gain.setValueAtTime(opts.vol ?? 0.3, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o.start(t); o.stop(t + dur + 0.02);
  }

  /** Filtered noise: hisses, whooshes and booms. */
  private noise(dur: number, opts: { vol?: number; freq?: number; to?: number; q?: number; type?: BiquadFilterType; at?: number; pan?: number; hold?: boolean } = {}): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + (opts.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.5 + Math.random();
    const f = ctx.createBiquadFilter();
    f.type = opts.type ?? 'bandpass';
    f.Q.value = opts.q ?? 1;
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + dur);
    const g = this.out(opts.pan ?? 0, 0);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.3, t + 0.01);
    if (opts.hold) g.gain.setValueAtTime(opts.vol ?? 0.3, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  private arp(notes: number[], step: number, opts: { type?: OscillatorType; vol?: number; dur?: number; pan?: number } = {}): void {
    notes.forEach((n, i) => this.tone(n, opts.dur ?? 0.16, { type: opts.type ?? 'triangle', vol: opts.vol ?? 0.22, at: i * step, pan: opts.pan }));
  }

  /**
   * Each fairy's bomb sounds like what it does:
   * 0 dash (Sunflare): a streak whooshing across, then a bright white flash
   * 1 blast (Thornquake): a huge boom with a long, slowed-down rumble
   * 2 vortex (Frost gale): swirling icy wind with glittering crystal chimes
   * 3 fan (Petal storm): a flurry of soft petals fanning out
   * 4 beam (Ember lance): a laser that hums as it sweeps across
   * 5 hole (Duskfall): a deep suck inward, then crackling lightning
   */
  private bomb(style: number, pan: number, vol: number): void {
    const v = (x: number) => x * vol;
    const note = (semi: number) => 440 * Math.pow(2, semi / 12);
    switch (style) {
      case 0: // Sunflare: left-to-right streak, then the flash at ~0.5s
        this.noise(0.5, { vol: v(0.4), freq: 500, to: 4000, q: 1.5, hold: true, pan: pan - 0.4 });
        this.noise(0.4, { vol: v(0.3), freq: 800, to: 5000, q: 1.5, at: 0.12, hold: true, pan: pan + 0.4 });
        for (let i = 0; i < 5; i++) this.tone(note(-12 + i * 2), 0.12, { type: 'square', vol: v(0.09), at: i * 0.09, pan: pan - 0.5 + i * 0.25 });
        this.tone(note(24), 0.6, { type: 'sine', vol: v(0.3), to: note(36), at: 0.5, pan });
        this.noise(0.7, { vol: v(0.4), freq: 7000, q: 0.7, at: 0.5, pan });
        break;
      case 1: // Thornquake: boom, then a rumble that drags (the slowdown)
        this.noise(1.6, { vol: v(0.4), freq: 1800, to: 50, type: 'lowpass', pan });
        this.tone(90, 1.6, { type: 'sine', vol: v(0.32), to: 28, pan });
        this.tone(60, 1.8, { type: 'triangle', vol: v(0.15), to: 35, at: 0.1, hold: true, pan });
        break;
      case 2: // Frost gale: swirling wind panning around, with ice chimes
        for (let i = 0; i < 4; i++) this.noise(0.5, { vol: v(0.32), freq: 2500 + i * 700, to: 900, q: 4, at: i * 0.18, hold: true, pan: [-0.6, 0.6, -0.3, 0.3][i] });
        for (let i = 0; i < 8; i++) this.tone(note(28 + ((i * 5) % 12)), 0.35, { type: 'sine', vol: v(0.12), at: 0.05 + i * 0.09, pan: Math.sin(i) * 0.6 });
        break;
      case 3: // Petal storm: a soft flurry fanning out
        for (let i = 0; i < 14; i++) {
          this.tone(note(14 + ((i * 7) % 15)), 0.12, { type: 'triangle', vol: v(0.14), to: note(10 + ((i * 7) % 15)), at: i * 0.03, pan: -0.7 + (i / 13) * 1.4 });
        }
        this.noise(0.5, { vol: v(0.2), freq: 5000, q: 0.8, hold: true, pan });
        break;
      case 4: // Ember lance: a humming beam sweeping left to right for the whole sweep
        this.tone(140, 0.85, { type: 'sawtooth', vol: v(0.16), to: 210, hold: true, pan: pan - 0.5 });
        this.tone(560, 0.85, { type: 'square', vol: v(0.06), to: 840, hold: true, pan: pan + 0.5 });
        this.noise(0.85, { vol: v(0.22), freq: 1200, to: 2400, q: 6, hold: true, pan });
        this.tone(note(19), 0.15, { type: 'square', vol: v(0.08), pan });
        break;
      case 5: // Duskfall: a deep suck in, then lightning cracks at ~0.5s
        this.tone(200, 0.5, { type: 'sine', vol: v(0.3), to: 35, hold: true, pan });
        this.noise(0.5, { vol: v(0.2), freq: 3000, to: 150, type: 'lowpass', hold: true, pan });
        for (let i = 0; i < 6; i++) this.noise(0.12, { vol: v(0.3), freq: 3500 + (i % 3) * 1500, q: 0.5, type: 'highpass', at: 0.5 + i * 0.07, pan: Math.sin(i * 2.3) * 0.7 });
        this.tone(55, 0.8, { type: 'sawtooth', vol: v(0.15), to: 30, at: 0.5, pan });
        break;
    }
  }

  // ---- the sounds ------------------------------------------------------------

  /**
   * Play an event. `p` is an optional parameter (chain length, charge level);
   * `pan` places it toward the meadow it came from; `vol` scales it (the CPU's
   * meadow plays quieter).
   */
  play(name: Sfx, p = 0, pan = 0, vol = 1): void {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const v = (x: number) => x * vol;
    const note = (semi: number) => 440 * Math.pow(2, semi / 12);
    switch (name) {
      case 'shot':
        if (this.throttle('shot' + pan, 0.05)) return;
        this.tone(1400, 0.05, { type: 'square', vol: v(0.035), to: 900, pan });
        break;
      case 'pop': {
        // Pops climb a major scale as a chain grows.
        if (this.throttle('pop' + pan, 0.03)) return;
        const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
        const f = note(3 + scale[Math.min(scale.length - 1, Math.max(0, p - 1))]);
        this.tone(f * 1.5, 0.11, { type: 'sine', vol: v(0.22), to: f, pan });
        this.noise(0.05, { vol: v(0.06), freq: 4000, q: 2, pan });
        break;
      }
      case 'send':
        this.arp([note(15), note(19), note(22), note(27)].slice(0, 2 + Math.min(2, Math.floor(p / 3))), 0.045, { vol: v(0.16), type: 'sine', pan });
        break;
      case 'charge':
        // One rising chime per charge level reached.
        this.tone(note(7 + p * 5), 0.25, { type: 'triangle', vol: v(0.18), to: note(12 + p * 5), pan });
        break;
      case 'release':
        this.noise(0.25, { vol: v(0.2), freq: 600, to: 3000, q: 1.5, pan });
        this.tone(note(-5 + p * 4), 0.2, { type: 'sawtooth', vol: v(0.08), to: note(7 + p * 4), pan });
        break;
      case 'extra':
        this.arp([note(10), note(14), note(17)], 0.06, { type: 'square', vol: v(0.07), pan });
        break;
      case 'boss':
        this.arp([note(-12), note(-5), note(0), note(7)], 0.09, { type: 'sawtooth', vol: v(0.09), dur: 0.3, pan });
        this.noise(0.6, { vol: v(0.12), freq: 300, to: 1800, pan });
        break;
      case 'reverse':
        this.tone(note(19), 0.12, { type: 'square', vol: v(0.07), to: note(24), pan });
        break;
      case 'hurt':
        this.noise(0.35, { vol: v(0.35), freq: 900, to: 120, type: 'lowpass', pan });
        this.tone(220, 0.35, { type: 'sawtooth', vol: v(0.12), to: 70, pan });
        break;
      case 'stun':
        this.tone(330, 0.5, { type: 'triangle', vol: v(0.16), to: 150, pan });
        this.tone(345, 0.5, { type: 'triangle', vol: v(0.1), to: 140, pan });
        break;
      case 'heal':
        this.arp([note(12), note(16), note(19)], 0.07, { type: 'sine', vol: v(0.12), pan });
        break;
      case 'bomb':
        this.bomb(p, pan, vol);
        break;
      case 'fever':
        this.arp([note(0), note(4), note(7), note(12), note(16), note(19), note(24)], 0.05, { vol: v(0.16), pan });
        break;
      case 'shatter':
        for (let i = 0; i < 5; i++) this.tone(note(24 + i * 3), 0.25, { type: 'sine', vol: v(0.07), at: i * 0.02, pan });
        this.noise(0.3, { vol: v(0.15), freq: 6000, q: 4, pan });
        break;
      case 'bossIn':
        this.tone(note(-17), 0.4, { type: 'sawtooth', vol: v(0.1), to: note(-12), pan });
        this.tone(note(-17), 0.4, { type: 'sawtooth', vol: v(0.1), to: note(-12), at: 0.45, pan });
        break;
      case 'banish':
        this.noise(0.8, { vol: v(0.35), freq: 1500, to: 60, type: 'lowpass', pan });
        this.arp([note(12), note(7), note(4), note(0)], 0.06, { type: 'triangle', vol: v(0.12), pan });
        break;
      case 'reel':
        this.tone(note(5), 0.18, { type: 'square', vol: v(0.07), to: note(-2), pan });
        break;
      case 'clash':
        this.noise(0.5, { vol: v(0.35), freq: 3000, to: 200, pan });
        this.tone(880, 0.4, { type: 'square', vol: v(0.08), to: 110 });
        break;
      case 'crow':
        this.tone(note(-7), 0.7, { type: 'sawtooth', vol: v(0.08), to: note(-19), pan });
        this.tone(note(-6), 0.7, { type: 'sawtooth', vol: v(0.06), to: note(-18), pan });
        break;
      case 'death':
        this.tone(note(-10), 1.0, { type: 'sawtooth', vol: v(0.2), to: 30, pan });
        this.noise(1.0, { vol: v(0.3), freq: 400, to: 40, type: 'lowpass', pan });
        break;
      case 'tick':
        this.tone(1200, 0.04, { type: 'square', vol: v(0.04) });
        break;
      case 'ok':
        this.arp([note(7), note(14)], 0.06, { type: 'square', vol: v(0.06) });
        break;
      case 'start':
        this.arp([note(0), note(7), note(12)], 0.1, { type: 'triangle', vol: v(0.18), dur: 0.2 });
        break;
      case 'win':
        this.arp([note(0), note(4), note(7), note(12), note(7), note(12), note(16)], 0.09, { type: 'triangle', vol: v(0.2), dur: 0.22 });
        break;
      case 'lose':
        this.arp([note(7), note(3), note(0), note(-5)], 0.16, { type: 'triangle', vol: v(0.18), dur: 0.3 });
        break;
    }
  }
}
