// Recording and playing back matches. A round is seeded, so the meadows play out the same from the same seed and
// the same controls; a replay keeps each round's seed and both meadows' controls for every playing step.
import * as C from '@/core/config';
import type { Controls, ReplayData, ReplayMode, ReplayRound } from '@/types';

declare const __GW_SIM__: string;

/** The replay format; bump it when ReplayData changes shape. */
export const REPLAY_FORMAT = 1;
/** This build's simulation (a hash of its source, from build.mjs), stamped on every replay. */
export const SIM_VERSION = typeof __GW_SIM__ === 'string' && __GW_SIM__ ? __GW_SIM__ : 'dev';

/** Touch targets are kept to a sixteenth of a meadow unit, so the tape holds exactly what the meadow was given. */
const GRID = 16;
/** A control's bit in a step's mask. */
const BITS = { left: 1, right: 2, up: 4, down: 8, fire: 16, bloom: 32, auto: 64 } as const;
/** Set in a mask when a touch target follows. */
const TARGET = 128;

/** No buttons held: what a finished tape plays. */
const IDLE: Controls = { left: false, right: false, up: false, down: false, fire: false };

/**
 * Controls as they'll be recorded: a touch target snapped to the tape's grid. The game feeds the meadow this
 * same copy while recording, so playing the tape back gives the meadow exactly what it had.
 */
export function quantize(c: Controls): Controls {
    if (!c.target) return c;
    return {
        ...c,
        target: { x: Math.round(c.target.x * GRID) / GRID, y: Math.round(c.target.y * GRID) / GRID },
    };
}

/**
 * One meadow's controls, step by step, as a flat list of numbers: runs of `count, mask` (and the touch target's
 * x and y in sixteenths when the mask has TARGET), each run being that many steps with the same controls.
 */
class TapeWriter {
    private out: number[] = [];
    private key = '';
    private run: number[] = [];
    private count = 0;
    /** Steps written. */
    steps = 0;

    /** Add one step's controls. */
    push(c: Controls): void {
        let mask = 0;
        for (const k of Object.keys(BITS) as (keyof typeof BITS)[]) if (c[k]) mask |= BITS[k];
        const run = c.target ? [mask | TARGET, Math.round(c.target.x * GRID), Math.round(c.target.y * GRID)] : [mask];
        const key = run.join(',');
        if (key === this.key) this.count++;
        else {
            this.flush();
            this.key = key;
            this.run = run;
            this.count = 1;
        }
        this.steps++;
    }

    /** Write out the run in progress. */
    private flush(): void {
        if (this.count) this.out.push(this.count, ...this.run);
        this.count = 0;
    }

    /** The finished tape. */
    finish(): number[] {
        this.flush();
        this.key = '';
        return this.out;
    }
}

/** Plays a tape written by TapeWriter back one step at a time; idle once it runs out. */
export class TapeReader {
    private i = 0;
    private left = 0;
    private c: Controls = IDLE;

    constructor(private tape: number[]) {}

    /** The next step's controls. */
    next(): Controls {
        if (this.left <= 0) {
            if (this.i >= this.tape.length) return IDLE;
            const t = this.tape;
            this.left = t[this.i++];
            const mask = t[this.i++];
            const c: Controls = { left: false, right: false, up: false, down: false, fire: false };
            for (const k of Object.keys(BITS) as (keyof typeof BITS)[]) c[k] = (mask & BITS[k]) !== 0;
            if (mask & TARGET) c.target = { x: t[this.i++] / GRID, y: t[this.i++] / GRID };
            this.c = c;
        }
        this.left--;
        // A fresh copy each step, so nothing the meadow does to it carries over.
        return { ...this.c, target: this.c.target ? { ...this.c.target } : this.c.target };
    }
}

/** Records a match round by round while it's played. */
export class Recorder {
    private rounds: ReplayRound[] = [];
    private tapes: [TapeWriter, TapeWriter] | null = null;
    private seed = 0;
    private field: ReplayRound['field'] = { w: 0, h: 0, single: false };

    constructor(
        private mode: ReplayMode,
        private fairies: [string, string],
        private map: string,
    ) {}

    /** A round begins with this seed at this meadow size (closing the one before, if any). */
    startRound(seed: number, field: ReplayRound['field']): void {
        this.endRound();
        this.seed = seed;
        this.field = field;
        this.tapes = [new TapeWriter(), new TapeWriter()];
    }

    /** One playing step: both meadows' controls, as the meadows were given them. */
    step(c0: Controls, c1: Controls): void {
        if (!this.tapes) return;
        this.tapes[0].push(c0);
        this.tapes[1].push(c1);
    }

    /** Close the round in progress. */
    private endRound(): void {
        if (!this.tapes) return;
        const [a, b] = this.tapes;
        this.rounds.push({ seed: this.seed, steps: a.steps, field: this.field, tapes: [a.finish(), b.finish()] });
        this.tapes = null;
    }

    /** The finished replay, with the match's result and the map it was played on; its length is the play time. */
    finish(r: { wins: [number, number]; guardians: number; map: string }): ReplayData {
        this.endRound();
        const steps = this.rounds.reduce((n, x) => n + x.steps, 0);
        return {
            format: REPLAY_FORMAT,
            sim: SIM_VERSION,
            mode: this.mode,
            fairies: this.fairies,
            map: r.map || this.map,
            rounds: this.rounds,
            wins: r.wins,
            seconds: Math.round(steps * C.STEP * 10) / 10,
            guardians: r.guardians,
            at: Date.now(),
        };
    }
}

/** Plays a recorded match back: each round's seed, then both meadows' controls step by step. */
export class ReplayPlayer {
    private round = -1;
    private tapes: [TapeReader, TapeReader] | null = null;
    private stepsLeft = 0;
    /** Playing steps fed so far, over the whole recording: where the playback is on its timeline. */
    played = 0;
    /** The whole recording's length in playing steps, and the step each round after the first starts at. */
    readonly length: number;
    readonly roundStarts: number[];

    constructor(readonly data: ReplayData) {
        let n = 0;
        this.roundStarts = [];
        for (const r of data.rounds) {
            if (n > 0) this.roundStarts.push(n);
            n += r.steps;
        }
        this.length = n;
    }

    /** Whether this build's simulation is the one that recorded it (else it may play out differently). */
    get sameSim(): boolean {
        return this.data.sim === SIM_VERSION;
    }

    /** Move on to round `i`; returns its seed, or null when the recording has no such round. */
    startRound(i: number): number | null {
        const r = this.data.rounds[i];
        if (!r) return null;
        this.round = i;
        // The timeline jumps to the round's start even if the round before ended a step or two early.
        this.played = i === 0 ? 0 : this.roundStarts[i - 1];
        this.tapes = [new TapeReader(r.tapes[0]), new TapeReader(r.tapes[1])];
        this.stepsLeft = r.steps;
        return r.seed;
    }

    /** The next playing step's controls for both meadows. */
    next(): [Controls, Controls] {
        this.stepsLeft--;
        if (this.stepsLeft >= 0) this.played++;
        if (!this.tapes) return [IDLE, IDLE];
        return [this.tapes[0].next(), this.tapes[1].next()];
    }

    /** Whether the current round's recording has run out (the round should have ended by now). */
    get roundSpent(): boolean {
        return this.stepsLeft < 0;
    }

    /** Whether this is the recording's last round. */
    get lastRound(): boolean {
        return this.round >= this.data.rounds.length - 1;
    }
}

/** Whether a value looks like a replay this build can read. */
export function isReplay(v: unknown): v is ReplayData {
    const d = v as ReplayData | null;
    return (
        !!d &&
        d.format === REPLAY_FORMAT &&
        (d.mode === 'cpu' || d.mode === 'versus' || d.mode === 'endless') &&
        Array.isArray(d.rounds) &&
        Array.isArray(d.fairies)
    );
}

const LOCAL_KEY = 'glimmerwing-last-replay-v1';

/** Keep a replay in this browser as the last one played (skipped where storage is unavailable or full). */
export function saveLocalReplay(d: ReplayData): void {
    try {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(d));
    } catch {
        /* ignore */
    }
}

/** The last replay kept in this browser, if any. */
export function loadLocalReplay(): ReplayData | null {
    try {
        const v: unknown = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null');
        return isReplay(v) ? v : null;
    } catch {
        return null;
    }
}
