// Background music, synthesised like the effects: no audio files. Two original loops, a calm one for the menus
// and a driving one for rounds, played by a small step sequencer that schedules notes a little ahead of time.
import type { MusicTrack } from '@/types';

/** One voice of a loop: a note (semitones from A4) or rest on each step. */
interface Voice {
    /** The oscillator shape (or 'kick'/'snare'/'hat' for the drum voices). */
    kind: OscillatorType | 'kick' | 'snare' | 'hat';
    /** One entry per step: a semitone offset from A4, or null for a rest. Drums use 1 for a hit. */
    steps: (number | null)[];
    /** How loud it plays, before the music volume. */
    vol: number;
    /** How many steps each note lasts. */
    len: number;
}

/** A looping piece: its tempo, step length and voices. */
interface Loop {
    /** Steps per minute (a step is an eighth or a sixteenth, depending on the piece). */
    stepsPerMin: number;
    voices: Voice[];
}

/** Repeat `pattern` `n` times. */
const rep = <T>(pattern: T[], n: number): T[] => Array.from({ length: n }, () => pattern).flat();

/** A bar of `steps` steps with a note on each listed step. */
const bar = (steps: number, notes: Record<number, number>): (number | null)[] =>
    Array.from({ length: steps }, (_, i) => notes[i] ?? null);

// ---- the menu theme: a gentle waltz-like lilt in F major, in eighth notes -------------------------------

/** Chord roots (semitones from A4) for the menu theme's eight bars: F, Dm, Bb, C, F, Dm, Gm, C. */
const MENU_ROOTS = [-16, -19, -23, -21, -16, -19, -14, -21];
/** Each chord's tones above its root: major for F, Bb and C, minor for Dm and Gm. */
const MENU_TRIADS = [
    [0, 4, 7],
    [0, 3, 7],
    [0, 4, 7],
    [0, 4, 7],
    [0, 4, 7],
    [0, 3, 7],
    [0, 3, 7],
    [0, 4, 7],
];
/** The menu melody, eight bars of eight eighth notes (null holds or rests). */
const MENU_LEAD: (number | null)[] = [
    ...[3, null, 8, null, 7, 5, 3, null],
    ...[5, null, null, 0, 1, 3, 5, null],
    ...[1, null, 5, null, 3, 1, 0, null],
    ...[-2, null, 0, 1, 3, null, null, null],
    ...[3, null, 8, null, 10, 8, 7, null],
    ...[5, null, 3, 5, 8, null, 7, 5],
    ...[1, null, 3, 5, 3, 1, -2, null],
    ...[0, null, null, null, -2, null, -4, null],
];
const MENU: Loop = {
    stepsPerMin: 184,
    voices: [
        { kind: 'triangle', steps: MENU_LEAD.map(n => (n === null ? null : n + 12)), vol: 0.07, len: 1.6 },
        {
            kind: 'sine',
            steps: MENU_ROOTS.flatMap(r => bar(8, { 0: r - 12, 4: r - 5 })),
            vol: 0.11,
            len: 3.5,
        },
        {
            kind: 'triangle',
            steps: MENU_ROOTS.flatMap((r, b) => {
                const t = MENU_TRIADS[b];
                return [r, r + t[1], r + t[2], r + 12, r + t[2], r + t[1], r + t[2], r + 12].map(n => n + 12);
            }),
            vol: 0.035,
            len: 0.9,
        },
    ],
};

// ---- the battle theme: A minor, sixteenth notes, with drums ----------------------------------------------

/** Chord roots for the battle theme's four bars: Am, F, G, E. */
const BATTLE_ROOTS = [-24, -28, -26, -29];
/** The battle melody, four bars of sixteen sixteenth notes. */
const BATTLE_LEAD: (number | null)[] = [
    ...[12, null, null, 15, null, null, 19, null, 17, null, 15, null, 12, null, 10, null],
    ...[8, null, null, 12, null, null, 15, null, 13, null, 12, null, 8, null, null, null],
    ...[10, null, null, 14, null, null, 17, null, 15, null, 14, null, 10, null, 14, null],
    ...[11, null, null, null, 8, null, 11, null, 14, null, null, null, 13, null, 11, null],
];
const BATTLE: Loop = {
    stepsPerMin: 560,
    voices: [
        { kind: 'square', steps: BATTLE_LEAD, vol: 0.035, len: 1.8 },
        {
            kind: 'triangle',
            // Driving eighth-note bass, root and octave.
            steps: BATTLE_ROOTS.flatMap(r => rep([r, null, r + 12, null], 4)),
            vol: 0.13,
            len: 1.6,
        },
        {
            kind: 'square',
            // A quiet sixteenth-note shimmer on the chord's fifth and octave.
            steps: BATTLE_ROOTS.flatMap(r => rep([r + 31, r + 36, r + 31, r + 36], 4)),
            vol: 0.012,
            len: 0.7,
        },
        { kind: 'kick', steps: rep(bar(16, { 0: 1, 6: 1, 8: 1 }), 4), vol: 0.32, len: 1 },
        { kind: 'snare', steps: rep(bar(16, { 4: 1, 12: 1 }), 4), vol: 0.1, len: 1 },
        { kind: 'hat', steps: rep(bar(16, { 2: 1, 6: 1, 10: 1, 14: 1 }), 4), vol: 0.035, len: 1 },
    ],
};

const LOOPS: Record<MusicTrack, Loop> = { menu: MENU, battle: BATTLE };

/** How far ahead notes are scheduled, and how often the scheduler wakes, in seconds. */
const AHEAD = 0.15;
const TICK_MS = 40;

/** Plays one loop at a time into `out`, switching with a short fade. */
export class Music {
    private loop: Loop | null = null;
    private track: MusicTrack | null = null;
    private step = 0;
    private next = 0;
    private timer: number | null = null;
    /** The gain each loop plays through, so switching can fade the old one out. */
    private bus: GainNode | null = null;

    constructor(
        private ctx: AudioContext,
        private out: AudioNode,
        private noise: AudioBuffer,
    ) {}

    /** Play `track` (or nothing, for null); asking for the one already playing changes nothing. */
    play(track: MusicTrack | null): void {
        if (track === this.track) return;
        this.track = track;
        const ctx = this.ctx;
        // Fade the old loop out and let it go.
        if (this.bus) {
            const old = this.bus;
            old.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
            setTimeout(() => old.disconnect(), 1200);
            this.bus = null;
        }
        if (this.timer !== null) clearInterval(this.timer);
        this.timer = null;
        this.loop = track ? LOOPS[track] : null;
        if (!this.loop) return;
        this.bus = ctx.createGain();
        this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.6);
        this.bus.connect(this.out);
        this.step = 0;
        this.next = ctx.currentTime + 0.1;
        this.timer = window.setInterval(() => this.schedule(), TICK_MS);
        this.schedule();
    }

    /** Schedule every step that starts within the look-ahead window. */
    private schedule(): void {
        const loop = this.loop,
            bus = this.bus;
        if (!loop || !bus) return;
        const ctx = this.ctx;
        // After the tab sleeps the clock jumps ahead: pick up from now rather than playing the backlog.
        if (this.next < ctx.currentTime - 0.3) this.next = ctx.currentTime + 0.05;
        const dt = 60 / loop.stepsPerMin;
        while (this.next < ctx.currentTime + AHEAD) {
            for (const v of loop.voices) {
                const n = v.steps[this.step % v.steps.length];
                if (n !== null && n !== undefined) this.note(v, n, this.next, dt * v.len, bus);
            }
            this.step++;
            this.next += dt;
        }
    }

    /** One note (or drum hit) of voice `v` at time `t`, lasting `dur` seconds. */
    private note(v: Voice, n: number, t: number, dur: number, bus: GainNode): void {
        const ctx = this.ctx;
        const g = ctx.createGain();
        g.connect(bus);
        if (v.kind === 'snare' || v.kind === 'hat') {
            const src = ctx.createBufferSource();
            src.buffer = this.noise;
            const f = ctx.createBiquadFilter();
            f.type = v.kind === 'hat' ? 'highpass' : 'bandpass';
            f.frequency.value = v.kind === 'hat' ? 7000 : 1800;
            const d = v.kind === 'hat' ? 0.04 : 0.12;
            g.gain.setValueAtTime(v.vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            src.connect(f).connect(g);
            src.start(t, Math.random() * 0.5);
            src.stop(t + d + 0.02);
            return;
        }
        const o = ctx.createOscillator();
        if (v.kind === 'kick') {
            o.type = 'sine';
            o.frequency.setValueAtTime(140, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
            g.gain.setValueAtTime(v.vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.18);
            return;
        }
        o.type = v.kind;
        o.frequency.value = 440 * Math.pow(2, n / 12);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v.vol, t + 0.012);
        g.gain.setValueAtTime(v.vol, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.02);
    }
}
