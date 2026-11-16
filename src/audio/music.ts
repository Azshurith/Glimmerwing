// Background music, synthesised like the effects: no audio files. Two original loops in the bright FM style of
// TSS's arcade era (bells, electric piano, slap bass, brass): a gentle one for the menus and a bouncy one for
// rounds, played by a small step sequencer that schedules notes a little ahead of time.
import type { MusicTrack } from '@/types';
import { MAP_MUSIC, MENU_MUSIC, SELECT_MUSIC } from '@/data/music';
import { PATCHES, fmNote, hz, type PatchName } from './synth';

/** One voice of a loop: a note, a chord (several notes) or rest on each step. */
interface Voice {
    /** An FM patch from synth.ts, a plain oscillator shape, or a drum. */
    kind: PatchName | OscillatorType | 'kick' | 'snare' | 'hat' | 'openhat' | 'clap';
    /** One entry per step: semitones from A4 (or a chord of them), or null for a rest. Drums use 1 for a hit. */
    steps: (number | number[] | null)[];
    /** How loud it plays, before the music volume. */
    vol: number;
    /** How many steps each note lasts. */
    len: number;
    /** How much of it goes to the room reverb (0 to 1). */
    wet?: number;
}

/** A looping piece: its tempo, step length and voices. */
interface Loop {
    /** Steps per minute (a step is an eighth or a sixteenth, depending on the piece). */
    stepsPerMin: number;
    voices: Voice[];
}

/** Repeat `pattern` `n` times. */
const rep = <T>(pattern: T[], n: number): T[] => Array.from({ length: n }, () => pattern).flat();

/** A bar of `steps` steps with a note (or chord) on each listed step. */
const bar = <T>(steps: number, notes: Record<number, T>): (T | null)[] =>
    Array.from({ length: steps }, (_, i) => notes[i] ?? null);

// ---- the menu theme: a gentle lilt in F major, in eighth notes -------------------------------------------

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
    stepsPerMin: 200,
    voices: [
        // The tune on a glassy bell, an octave up, ringing in the room.
        { kind: 'bell', steps: MENU_LEAD.map(n => (n === null ? null : n + 12)), vol: 0.07, len: 2.2, wet: 0.45 },
        // Electric piano chords on the first and fourth beat.
        {
            kind: 'ep',
            steps: MENU_ROOTS.flatMap((r, b) =>
                bar(8, { 0: MENU_TRIADS[b].map(n => r + 12 + n), 5: MENU_TRIADS[b].map(n => r + 12 + n) }),
            ),
            vol: 0.05,
            len: 2.5,
            wet: 0.3,
        },
        // A soft round bass.
        {
            kind: 'bass',
            steps: MENU_ROOTS.flatMap(r => bar(8, { 0: r - 12, 3: r - 5, 4: r - 12, 6: r })),
            vol: 0.09,
            len: 1.4,
        },
        // Little plucked arpeggios underneath.
        {
            kind: 'pluck',
            steps: MENU_ROOTS.flatMap((r, b) => {
                const t = MENU_TRIADS[b];
                return [r, r + t[1], r + t[2], r + 12, r + t[2], r + t[1], r + t[2], r + 12].map(n => n + 12);
            }),
            vol: 0.022,
            len: 0.9,
            wet: 0.2,
        },
        { kind: 'hat', steps: rep(bar(8, { 1: 1, 3: 1, 5: 1, 7: 1 }), 8), vol: 0.012, len: 1 },
    ],
};

// ---- the battle theme: D major, sixteenth notes, with drums ----------------------------------------------

/** Chord roots (low, for the bass) for the battle theme's eight bars: D, Bm, G, A, D, F#m, G, A. */
const BATTLE_ROOTS = [-31, -34, -38, -36, -31, -39, -38, -36];
/** The chord for each bar, voiced around middle C for the piano stabs. */
const BATTLE_CHORDS = [
    [-7, -3, 0],
    [-10, -7, -3],
    [-14, -10, -7],
    [-12, -8, -5],
    [-7, -3, 0],
    [-15, -12, -8],
    [-14, -10, -7],
    [-12, -8, -5],
];
/** The battle melody: eight bars of sixteen sixteenth notes. */
const BATTLE_LEAD: (number | null)[] = [
    ...[5, null, 9, null, 12, null, 9, 12, 14, null, 12, null, 9, null, 7, null],
    ...[9, null, null, null, 7, null, 5, null, 2, null, 5, null, 7, null, null, null],
    ...[10, null, 14, null, 17, null, 14, null, 12, null, 10, null, 9, null, 10, null],
    ...[12, null, null, null, 16, null, null, null, 14, null, 12, null, 9, null, 7, null],
    ...[5, null, 9, null, 12, null, 17, null, 16, null, 14, null, 12, null, 9, null],
    ...[9, null, 12, null, 16, null, null, null, 14, 12, null, 9, null, 7, null, null],
    ...[10, null, 9, null, 7, null, 5, null, 7, null, 9, null, 10, null, 12, null],
    ...[14, null, null, null, 12, null, null, null, 16, null, null, null, 17, null, null, null],
];
const BATTLE: Loop = {
    stepsPerMin: 600,
    voices: [
        { kind: 'lead', steps: BATTLE_LEAD, vol: 0.05, len: 1.7, wet: 0.25 },
        // The same tune two octaves up on a glockenspiel, very quietly, for sparkle.
        { kind: 'glock', steps: BATTLE_LEAD.map(n => (n === null ? null : n + 24)), vol: 0.012, len: 1, wet: 0.4 },
        // A bouncing slap bass: root, octave and a pickup into the next beat.
        {
            kind: 'bass',
            steps: BATTLE_ROOTS.flatMap(r =>
                bar(16, { 0: r, 3: r, 4: r + 12, 6: r, 8: r, 10: r + 12, 11: r, 14: r + 7 }),
            ),
            vol: 0.1,
            len: 1.5,
        },
        // Off-beat piano stabs.
        {
            kind: 'ep',
            steps: BATTLE_CHORDS.flatMap(c => bar(16, { 2: c, 6: c, 10: c, 13: c })),
            vol: 0.035,
            len: 1.4,
            wet: 0.2,
        },
        // Brass swells on the first beat of each bar.
        {
            kind: 'brass',
            steps: BATTLE_CHORDS.flatMap(c => bar(16, { 0: c.map(n => n + 12) })),
            vol: 0.02,
            len: 5,
            wet: 0.3,
        },
        { kind: 'kick', steps: rep(bar(16, { 0: 1, 7: 1, 8: 1, 10: 1 }), 8), vol: 0.32, len: 1 },
        { kind: 'snare', steps: rep(bar(16, { 4: 1, 12: 1 }), 8), vol: 0.09, len: 1 },
        { kind: 'clap', steps: rep(bar(16, { 4: 1, 12: 1 }), 8), vol: 0.05, len: 1 },
        { kind: 'hat', steps: rep(bar(16, { 0: 1, 2: 1, 4: 1, 6: 1, 8: 1, 10: 1, 12: 1 }), 8), vol: 0.022, len: 1 },
        { kind: 'openhat', steps: rep(bar(16, { 14: 1 }), 8), vol: 0.025, len: 1 },
    ],
};

const LOOPS: Record<'menu' | 'battle', Loop> = { menu: MENU, battle: BATTLE };

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
    /** Recorded tracks once decoded, by url, so a map's music only decodes the first time. */
    private decoded = new Map<string, Promise<AudioBuffer>>();

    constructor(
        private ctx: AudioContext,
        private out: AudioNode,
        private noise: AudioBuffer,
        /** The room reverb's input: voices with `wet` send some of themselves here. */
        private room: AudioNode,
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
        this.loop = null;
        if (!track) return;
        this.bus = ctx.createGain();
        this.bus.gain.setValueAtTime(0.0001, ctx.currentTime);
        this.bus.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.6);
        this.bus.connect(this.out);
        // A recorded track where there is one: the menus' own, or a map's.
        const url =
            track === 'menu'
                ? MENU_MUSIC
                : track === 'select'
                  ? (SELECT_MUSIC ?? MENU_MUSIC)
                  : track.startsWith('map:')
                    ? MAP_MUSIC[track.slice(4)]
                    : undefined;
        if (url || track.startsWith('map:')) {
            if (url) this.playFile(url, track, this.bus);
            // From the menus the next stop is picking fairies: have its track ready so it starts on time.
            if (track === 'menu' && SELECT_MUSIC) void this.decode(SELECT_MUSIC);
            return;
        }
        this.loop = LOOPS[track === 'battle' ? 'battle' : 'menu'];
        this.step = 0;
        this.next = ctx.currentTime + 0.1;
        this.timer = window.setInterval(() => this.schedule(), TICK_MS);
        this.schedule();
    }

    /**
     * A recorded track's decoded audio, decoding it the first time. Decoded tracks are big (tens of MB each), so
     * only the last few are kept.
     */
    private decode(url: string): Promise<AudioBuffer> {
        let buf = this.decoded.get(url);
        if (buf) {
            // Most recently used goes to the back.
            this.decoded.delete(url);
        } else {
            buf = fetch(url)
                .then(r => r.arrayBuffer())
                .then(data => this.ctx.decodeAudioData(data));
        }
        this.decoded.set(url, buf);
        while (this.decoded.size > 3) this.decoded.delete(this.decoded.keys().next().value!);
        return buf;
    }

    /** Decode a recorded track (once) and loop it into `bus`, unless the music has moved on meanwhile. */
    private playFile(url: string, track: MusicTrack, bus: GainNode): void {
        const ctx = this.ctx;
        this.decode(url).then(
            b => {
                if (this.track !== track || this.bus !== bus) return;
                const src = ctx.createBufferSource();
                src.buffer = b;
                src.loop = true;
                // Recorded tracks are mastered loud: bring them down to sit with the effects like the synth loops.
                const level = ctx.createGain();
                level.gain.value = 0.35;
                src.connect(level).connect(bus);
                src.start();
                // Stop it once the bus is faded out and let go.
                const stop = () => {
                    if (this.bus !== bus) {
                        src.stop();
                        clearInterval(watch);
                    }
                };
                const watch = window.setInterval(stop, 500);
            },
            (e: unknown) => console.warn('music: could not decode', url, e),
        );
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
                if (n === null || n === undefined) continue;
                for (const one of typeof n === 'number' ? [n] : n) this.note(v, one, this.next, dt * v.len, bus);
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
        if (v.wet) {
            const send = ctx.createGain();
            send.gain.value = v.wet;
            g.connect(send).connect(this.room);
        }
        if (v.kind === 'snare' || v.kind === 'hat' || v.kind === 'openhat' || v.kind === 'clap') {
            const src = ctx.createBufferSource();
            src.buffer = this.noise;
            const f = ctx.createBiquadFilter();
            f.type = v.kind === 'snare' || v.kind === 'clap' ? 'bandpass' : 'highpass';
            f.frequency.value = { snare: 1900, clap: 1200, hat: 8000, openhat: 7000 }[v.kind];
            f.Q.value = v.kind === 'clap' ? 2 : 0.8;
            const d = { snare: 0.14, clap: 0.1, hat: 0.035, openhat: 0.18 }[v.kind];
            g.gain.setValueAtTime(v.vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            src.connect(f).connect(g);
            src.start(t, Math.random() * 0.5);
            src.stop(t + d + 0.02);
            if (v.kind === 'snare') {
                // The drum's body under the rattle.
                const o = ctx.createOscillator();
                const og = ctx.createGain();
                o.frequency.setValueAtTime(220, t);
                o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
                og.gain.setValueAtTime(v.vol * 0.8, t);
                og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
                o.connect(og).connect(bus);
                o.start(t);
                o.stop(t + 0.1);
            }
            return;
        }
        if (v.kind === 'kick') {
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(160, t);
            o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
            g.gain.setValueAtTime(v.vol, t);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
            o.connect(g);
            o.start(t);
            o.stop(t + 0.2);
            return;
        }
        if (v.kind in PATCHES) {
            fmNote(ctx, g, PATCHES[v.kind as PatchName], hz(n), t, dur, v.vol);
            return;
        }
        const o = ctx.createOscillator();
        o.type = v.kind as OscillatorType;
        o.frequency.value = hz(n);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v.vol, t + 0.012);
        g.gain.setValueAtTime(v.vol, t + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        o.start(t);
        o.stop(t + dur + 0.02);
    }
}
