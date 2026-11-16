import type { AudioPrefs, MusicTrack, Sfx } from '@/types';
import { Music } from './music';
import { PATCHES, fmNote, makeReverb, type PatchName } from './synth';

/**
 * Sound effects, synthesised on the fly with Web Audio: no audio files, so the
 * game stays a single page. Every sound is original. Fields queue named events
 * (see Field.sfx); the Game drains them each step and calls play().
 */

const STORE = 'glimmerwing.sound';

/**
 * Synthesized sound effects: every sound is built from oscillators and noise with WebAudio, no audio files. Starts
 * silent until `unlock()` runs inside a user gesture.
 */
export class Sound {
    private ctx: AudioContext | null = null;
    private master: GainNode | null = null;
    /** Effects and music each go through their own gain, so each has its own volume. */
    private sfxBus: GainNode | null = null;
    private musicBus: GainNode | null = null;
    /** The fairies' voices go through a bus of their own too. */
    private voiceBus: GainNode | null = null;
    /** Each voice clip once decoded, by url; and the line each speaker is saying now. */
    private clips = new Map<string, Promise<AudioBuffer | null>>();
    private speaking = new Map<string, AudioBufferSourceNode>();
    /** Sends into the room reverb, one for the effects and one for the music, each at its own volume. */
    private sfxRoom: GainNode | null = null;
    private musicRoom: GainNode | null = null;
    private noiseBuf: AudioBuffer | null = null;
    private last = new Map<string, number>();
    private music: Music | null = null;
    /** The music asked for, kept until audio is unlocked. */
    private track: MusicTrack | null = null;
    muted = false;
    /** Effects volume, 0 to 1. */
    volume = 0.7;
    /** Music volume, 0 to 1. */
    musicVolume = 0.5;
    /** Voice volume, 0 to 1. */
    voiceVolume = 0.8;
    /** Called whenever mute or a volume changes (the account sends them on to the server). */
    onChange: (() => void) | null = null;

    constructor() {
        try {
            const s = JSON.parse(localStorage.getItem(STORE) ?? '{}') as {
                muted?: unknown;
                volume?: unknown;
                music?: unknown;
                voice?: unknown;
            };
            if (typeof s.muted === 'boolean') this.muted = s.muted;
            if (typeof s.volume === 'number') this.volume = s.volume;
            if (typeof s.music === 'number') this.musicVolume = s.music;
            if (typeof s.voice === 'number') this.voiceVolume = s.voice;
        } catch {
            /* storage unavailable: defaults */
        }
    }

    /** Browsers only allow audio after a user gesture; call this from one. */
    unlock(): void {
        if (!this.ctx) {
            const AC =
                window.AudioContext ??
                (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            // A gentle limiter so big chains don't clip.
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.ratio.value = 6;
            this.master.connect(comp).connect(this.ctx.destination);
            this.sfxBus = this.ctx.createGain();
            this.sfxBus.connect(this.master);
            this.musicBus = this.ctx.createGain();
            this.musicBus.connect(this.master);
            this.voiceBus = this.ctx.createGain();
            this.voiceBus.connect(this.master);
            // A small room both share, each sending into it at its own volume.
            const reverb = makeReverb(this.ctx);
            const roomOut = this.ctx.createGain();
            roomOut.gain.value = 0.6;
            reverb.connect(roomOut).connect(this.master);
            this.sfxRoom = this.ctx.createGain();
            this.sfxRoom.connect(reverb);
            this.musicRoom = this.ctx.createGain();
            this.musicRoom.connect(reverb);
            this.applyVolume();
            const len = this.ctx.sampleRate;
            this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
            const d = this.noiseBuf.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
            this.music = new Music(this.ctx, this.musicBus, this.noiseBuf, this.musicRoom);
            this.music.play(this.track);
        }
        if (this.ctx.state === 'suspended') void this.ctx.resume();
    }

    /** Flip mute on or off, remember the choice, and return the new state. */
    toggleMute(): boolean {
        this.muted = !this.muted;
        this.applyVolume();
        this.save();
        return this.muted;
    }

    /** Set the effects volume (0 to 1) and remember it. */
    setVolume(v: number): void {
        this.volume = Math.max(0, Math.min(1, v));
        this.applyVolume();
        this.save();
    }

    /** Set the music volume (0 to 1) and remember it. */
    setMusicVolume(v: number): void {
        this.musicVolume = Math.max(0, Math.min(1, v));
        this.applyVolume();
        this.save();
    }

    /** Set the voice volume (0 to 1) and remember it. */
    setVoiceVolume(v: number): void {
        this.voiceVolume = Math.max(0, Math.min(1, v));
        this.applyVolume();
        this.save();
    }

    /** A voice clip's decoded audio (decoding it the first time), or null if it can't be had yet. */
    private clip(url: string): Promise<AudioBuffer | null> {
        let c = this.clips.get(url);
        if (!c && this.ctx) {
            const ctx = this.ctx;
            c = fetch(url)
                .then(r => r.arrayBuffer())
                .then(data => ctx.decodeAudioData(data))
                .catch(() => null);
            this.clips.set(url, c);
        }
        return c ?? Promise.resolve(null);
    }

    /** Decode voice clips ahead, so the first time each is said it comes at once. */
    preloadVoice(urls: readonly string[]): void {
        for (const u of urls) void this.clip(u);
    }

    /**
     * Say a voice line for `speaker` (one line at a time each: while one is being said another is dropped, unless
     * `interrupt` cuts it off). Panned and scaled like the speaker's other sounds.
     */
    speak(url: string, speaker: string, pan = 0, vol = 1, interrupt = false): void {
        if (!this.ctx || !this.voiceBus || this.muted) return;
        if (this.speaking.has(speaker) && !interrupt) return;
        const ctx = this.ctx,
            bus = this.voiceBus;
        void this.clip(url).then(buf => {
            if (!buf) return;
            const was = this.speaking.get(speaker);
            if (was && !interrupt) return;
            if (was) {
                was.onended = null;
                was.stop();
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain();
            g.gain.value = vol;
            let tail: AudioNode = src.connect(g);
            if (pan && ctx.createStereoPanner) {
                const p = ctx.createStereoPanner();
                p.pan.value = pan;
                tail = tail.connect(p);
            }
            tail.connect(bus);
            src.onended = () => {
                if (this.speaking.get(speaker) === src) this.speaking.delete(speaker);
            };
            this.speaking.set(speaker, src);
            src.start();
        });
    }

    /** Whether `speaker` is saying a line now. */
    isSpeaking(speaker: string): boolean {
        return this.speaking.has(speaker);
    }

    /** Play a music loop (null for silence); it starts once audio is unlocked. */
    playMusic(track: MusicTrack | null): void {
        this.track = track;
        this.music?.play(track);
    }

    /** Ease each gain to its volume (or everything to silence when muted). */
    private applyVolume(): void {
        if (!this.master || !this.ctx) return;
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.02);
        // Squared, so the sliders feel even: half way sounds about half as loud.
        this.sfxBus?.gain.setTargetAtTime(this.volume ** 2 * 1.2, t, 0.02);
        this.musicBus?.gain.setTargetAtTime(this.musicVolume ** 2 * 1.6, t, 0.02);
        this.sfxRoom?.gain.setTargetAtTime(this.volume ** 2 * 1.2, t, 0.02);
        this.musicRoom?.gain.setTargetAtTime(this.musicVolume ** 2 * 1.6, t, 0.02);
        this.voiceBus?.gain.setTargetAtTime(this.voiceVolume ** 2 * 1.5, t, 0.02);
    }

    /** Mute and the volumes, to save with the player's settings. */
    prefs(): AudioPrefs {
        return { muted: this.muted, volume: this.volume, music: this.musicVolume, voice: this.voiceVolume };
    }

    /** Take on saved mute and volumes (from the player's account), and remember them here. */
    applyPrefs(p: Partial<AudioPrefs>): void {
        if (typeof p.muted === 'boolean') this.muted = p.muted;
        if (typeof p.volume === 'number') this.volume = Math.max(0, Math.min(1, p.volume));
        if (typeof p.music === 'number') this.musicVolume = Math.max(0, Math.min(1, p.music));
        if (typeof p.voice === 'number') this.voiceVolume = Math.max(0, Math.min(1, p.voice));
        this.applyVolume();
        this.save(false);
    }

    /** Remember mute and both volumes in localStorage for the next visit (and tell `onChange` unless `tell` is off). */
    private save(tell = true): void {
        if (tell) this.onChange?.();
        try {
            localStorage.setItem(
                STORE,
                JSON.stringify({
                    muted: this.muted,
                    volume: this.volume,
                    music: this.musicVolume,
                    voice: this.voiceVolume,
                }),
            );
        } catch {
            /* ignore */
        }
    }

    /** Skip a sound if the same one played less than `gap` seconds ago. */
    private throttle(key: string, gap: number): boolean {
        const now = this.ctx!.currentTime;
        if (now - (this.last.get(key) ?? -1) < gap) return true;
        this.last.set(key, now);
        return false;
    }

    // ---- building blocks -------------------------------------------------------

    /** A gain node for one sound, panned left/right, routed into the effects bus and `wet` of it into the room. */
    private out(pan: number, vol: number, wet = 0): GainNode {
        const ctx = this.ctx!;
        const g = ctx.createGain();
        g.gain.value = vol;
        let tail: AudioNode = g;
        if (pan && ctx.createStereoPanner) {
            const p = ctx.createStereoPanner();
            p.pan.value = pan;
            tail = g.connect(p);
        }
        tail.connect(this.sfxBus!);
        if (wet > 0 && this.sfxRoom) {
            const send = ctx.createGain();
            send.gain.value = wet;
            tail.connect(send).connect(this.sfxRoom);
        }
        return g;
    }

    /** An FM note on one of the synth's patches (see synth.ts), panned and ringing `wet` into the room. */
    private fm(
        patch: PatchName,
        freq: number,
        dur: number,
        opts: { vol?: number; to?: number; at?: number; pan?: number; wet?: number } = {},
    ): void {
        const ctx = this.ctx!;
        const dest = this.out(opts.pan ?? 0, 1, opts.wet ?? 0.25);
        fmNote(ctx, dest, PATCHES[patch], freq, ctx.currentTime + (opts.at ?? 0), dur, opts.vol ?? 0.2, opts.to);
    }

    /** A run of FM notes one after another, `step` seconds apart. */
    private fmArp(
        patch: PatchName,
        notes: number[],
        step: number,
        opts: { vol?: number; dur?: number; pan?: number; wet?: number } = {},
    ): void {
        notes.forEach((n, i) =>
            this.fm(patch, n, opts.dur ?? 0.2, { vol: opts.vol, at: i * step, pan: opts.pan, wet: opts.wet }),
        );
    }

    /** A pitched blip with a quick attack and exponential decay, optionally sliding. */
    private tone(
        freq: number,
        dur: number,
        opts: { type?: OscillatorType; vol?: number; to?: number; at?: number; pan?: number; hold?: boolean } = {},
    ): void {
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
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    /** Filtered noise: hisses, whooshes and booms. */
    private noise(
        dur: number,
        opts: {
            vol?: number;
            freq?: number;
            to?: number;
            q?: number;
            type?: BiquadFilterType;
            at?: number;
            pan?: number;
            hold?: boolean;
        } = {},
    ): void {
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
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur + 0.02);
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
                for (let i = 0; i < 5; i++)
                    this.tone(note(-12 + i * 2), 0.12, {
                        type: 'square',
                        vol: v(0.09),
                        at: i * 0.09,
                        pan: pan - 0.5 + i * 0.25,
                    });
                this.tone(note(24), 0.6, { type: 'sine', vol: v(0.3), to: note(36), at: 0.5, pan });
                this.noise(0.7, { vol: v(0.4), freq: 7000, q: 0.7, at: 0.5, pan });
                break;
            case 1: // Thornquake: boom, then a rumble that drags (the slowdown)
                this.noise(1.6, { vol: v(0.4), freq: 1800, to: 50, type: 'lowpass', pan });
                this.tone(90, 1.6, { type: 'sine', vol: v(0.32), to: 28, pan });
                this.tone(60, 1.8, { type: 'triangle', vol: v(0.15), to: 35, at: 0.1, hold: true, pan });
                break;
            case 2: // Frost gale: swirling wind panning around, with ice chimes
                for (let i = 0; i < 4; i++)
                    this.noise(0.5, {
                        vol: v(0.32),
                        freq: 2500 + i * 700,
                        to: 900,
                        q: 4,
                        at: i * 0.18,
                        hold: true,
                        pan: [-0.6, 0.6, -0.3, 0.3][i],
                    });
                for (let i = 0; i < 8; i++)
                    this.tone(note(28 + ((i * 5) % 12)), 0.35, {
                        type: 'sine',
                        vol: v(0.12),
                        at: 0.05 + i * 0.09,
                        pan: Math.sin(i) * 0.6,
                    });
                break;
            case 3: // Petal storm: a soft flurry fanning out
                for (let i = 0; i < 14; i++) {
                    this.tone(note(14 + ((i * 7) % 15)), 0.12, {
                        type: 'triangle',
                        vol: v(0.14),
                        to: note(10 + ((i * 7) % 15)),
                        at: i * 0.03,
                        pan: -0.7 + (i / 13) * 1.4,
                    });
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
                for (let i = 0; i < 6; i++)
                    this.noise(0.12, {
                        vol: v(0.3),
                        freq: 3500 + (i % 3) * 1500,
                        q: 0.5,
                        type: 'highpass',
                        at: 0.5 + i * 0.07,
                        pan: Math.sin(i * 2.3) * 0.7,
                    });
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
                // A soft, quick plink: it plays all the time, so it stays small and dry.
                if (this.throttle('shot' + pan, 0.06)) return;
                this.fm('glock', note(26), 0.05, { vol: v(0.035), to: note(21), pan, wet: 0 });
                break;
            case 'pop': {
                // Each pop is a sparkling bell a step up a major scale as the chain grows, over a little crackle;
                // long chains add the fifth above and ring out.
                if (this.throttle('pop' + pan, 0.03)) return;
                const scale = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
                const k = Math.min(scale.length - 1, Math.max(0, p - 1));
                const f = note(15 + scale[k]);
                this.fm('bell', f, 0.32, { vol: v(0.13), pan, wet: 0.35 });
                this.noise(0.07, { vol: v(0.09), freq: 3500, to: 9000, q: 1, type: 'highpass', pan });
                this.tone(f / 4, 0.07, { type: 'triangle', vol: v(0.08), to: f / 8, pan });
                if (p >= 6) this.fm('glock', f * 1.5, 0.25, { vol: v(0.05), at: 0.03, pan, wet: 0.45 });
                break;
            }
            case 'send':
                // A chain's attack takes off: an upward whoosh with a quick rising arpeggio, longer for bigger ones.
                this.noise(0.35, { vol: v(0.16), freq: 500, to: 4000, q: 1.2, pan, hold: true });
                this.fmArp(
                    'pluck',
                    [note(15), note(19), note(22), note(27), note(31)].slice(0, 2 + Math.min(3, Math.floor(p / 3))),
                    0.04,
                    {
                        vol: v(0.12),
                        dur: 0.18,
                        pan,
                        wet: 0.3,
                    },
                );
                break;
            case 'charge':
                // A shimmering chime rising with each charge level reached.
                this.fm('bell', note(7 + p * 5), 0.4, { vol: v(0.12), to: note(12 + p * 5), pan, wet: 0.4 });
                this.fm('glock', note(19 + p * 5), 0.3, { vol: v(0.05), at: 0.05, pan, wet: 0.4 });
                break;
            case 'release':
                // Letting a charge go: a bright brass blast and a rush of air.
                this.noise(0.3, { vol: v(0.2), freq: 600, to: 5000, q: 1.2, pan });
                this.fm('brass', note(-5 + p * 4), 0.22, { vol: v(0.1), to: note(5 + p * 4), pan, wet: 0.2 });
                break;
            case 'extra':
                // An Extra Attack is sent: a quick heroic brass call.
                this.fmArp('brass', [note(2), note(9), note(14)], 0.07, { vol: v(0.09), dur: 0.2, pan, wet: 0.3 });
                break;
            case 'boss':
                // A guardian is summoned: low brass rising in fourths over a swelling rumble.
                this.fmArp('brass', [note(-17), note(-12), note(-7), note(-2)], 0.11, {
                    vol: v(0.11),
                    dur: 0.35,
                    pan,
                    wet: 0.35,
                });
                this.noise(0.7, { vol: v(0.14), freq: 200, to: 2000, pan, hold: true });
                break;
            case 'reverse':
                // A fireball shot back: a bright upward zing.
                this.fm('glock', note(19), 0.14, { vol: v(0.08), to: note(26), pan, wet: 0.3 });
                this.noise(0.08, { vol: v(0.08), freq: 6000, q: 3, pan });
                break;
            case 'hurt':
                // A hit: a crunchy impact and a falling FM groan.
                this.noise(0.3, { vol: v(0.38), freq: 2500, to: 150, type: 'lowpass', pan });
                this.fm('bass', 260, 0.35, { vol: v(0.16), to: 70, pan, wet: 0.1 });
                break;
            case 'stun':
                // Seeing stars: little birds twittering round her head.
                for (let i = 0; i < 6; i++)
                    this.tone(note(31 + (i % 2) * 4), 0.06, {
                        type: 'sine',
                        vol: v(0.07),
                        to: note(35 + (i % 2) * 4),
                        at: i * 0.08,
                        pan: pan + Math.sin(i * 1.7) * 0.3,
                    });
                this.tone(330, 0.45, { type: 'triangle', vol: v(0.1), to: 160, pan });
                break;
            case 'heal':
                this.fmArp('bell', [note(12), note(16), note(19), note(24)], 0.06, {
                    vol: v(0.09),
                    dur: 0.3,
                    pan,
                    wet: 0.45,
                });
                break;
            case 'bomb':
                this.bomb(p, pan, vol);
                break;
            case 'fever':
                // Fever: a brass fanfare with a glittering run on top.
                this.fmArp('brass', [note(0), note(4), note(7), note(12)], 0.08, {
                    vol: v(0.1),
                    dur: 0.25,
                    pan,
                    wet: 0.3,
                });
                this.fmArp('glock', [note(24), note(28), note(31), note(36), note(40), note(43)], 0.045, {
                    vol: v(0.05),
                    dur: 0.2,
                    pan,
                    wet: 0.5,
                });
                break;
            case 'shatter':
                // Ice or glass breaking: a cluster of bells and a bright crash.
                for (let i = 0; i < 5; i++)
                    this.fm('glock', note(24 + i * 3), 0.3, { vol: v(0.05), at: i * 0.02, pan, wet: 0.5 });
                this.noise(0.3, { vol: v(0.16), freq: 6000, q: 3, pan });
                break;
            case 'bossIn':
                // A warning siren: two brass blasts.
                this.fm('brass', note(-17), 0.35, { vol: v(0.11), to: note(-12), pan, wet: 0.25 });
                this.fm('brass', note(-17), 0.35, { vol: v(0.11), to: note(-12), at: 0.45, pan, wet: 0.25 });
                break;
            case 'banish':
                // A guardian banished: a big boom and bells falling away.
                this.noise(0.8, { vol: v(0.38), freq: 1800, to: 60, type: 'lowpass', pan });
                this.tone(110, 0.6, { type: 'sine', vol: v(0.2), to: 35, pan });
                this.fmArp('bell', [note(24), note(19), note(16), note(12), note(7)], 0.06, {
                    vol: v(0.08),
                    dur: 0.35,
                    pan,
                    wet: 0.5,
                });
                break;
            case 'reel':
                this.fm('pluck', note(5), 0.16, { vol: v(0.08), to: note(-2), pan });
                break;
            case 'clash':
                this.noise(0.5, { vol: v(0.35), freq: 3000, to: 200, pan });
                this.fm('brass', 880, 0.4, { vol: v(0.08), to: 110, wet: 0.3 });
                break;
            case 'crow':
                this.tone(note(-7), 0.7, { type: 'sawtooth', vol: v(0.08), to: note(-19), pan });
                this.tone(note(-6), 0.7, { type: 'sawtooth', vol: v(0.06), to: note(-18), pan });
                break;
            case 'death':
                this.fm('brass', note(-10), 1.0, { vol: v(0.15), to: 30, pan, wet: 0.3 });
                this.noise(1.0, { vol: v(0.3), freq: 400, to: 40, type: 'lowpass', pan });
                break;
            case 'tick':
                this.fm('glock', note(27), 0.05, { vol: v(0.05), wet: 0 });
                break;
            case 'ok':
                this.fmArp('glock', [note(19), note(26)], 0.06, { vol: v(0.07), dur: 0.12, wet: 0.2 });
                break;
            case 'start':
                this.fmArp('brass', [note(0), note(7), note(12)], 0.1, { vol: v(0.12), dur: 0.22, wet: 0.3 });
                break;
            case 'win':
                this.fmArp('brass', [note(0), note(4), note(7), note(12)], 0.1, { vol: v(0.11), dur: 0.25, wet: 0.3 });
                this.fmArp('bell', [note(16), note(19), note(24), note(28)], 0.1, { vol: v(0.08), dur: 0.5, wet: 0.5 });
                break;
            case 'lose':
                this.fmArp('ep', [note(7), note(3), note(0), note(-5)], 0.18, { vol: v(0.14), dur: 0.4, wet: 0.35 });
                break;
        }
    }
}
