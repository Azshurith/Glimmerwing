import type { HighlightKind } from './replay';

/** The player badge on a meadow's HUD: 1P, 2P, YOU, CPU or RIVAL, in that player's colour. */
export interface HudTag {
    label: string;
    color: string;
}

/** The console between the meadows. */
/** What Endless mode's panels show: the run so far, the best run, and the guardians. */
export interface EndlessView {
    /** Seconds survived this run, and the best run ever. */
    time: number;
    best: number;
    /** Guardians sent so far, and seconds until the next. */
    bosses: number;
    nextBoss: number;
    /** The tempo multiplier (1 at the start, up to TEMPO_MAX). */
    tempo: number;
}

export interface ConsoleView {
    /** Round being played, from 1. */
    round: number;
    /** The shared tempo multiplier (1 at the start of a round, up to TEMPO_MAX). */
    tempo: number;
    /** Online round-trip time in milliseconds, when playing online. */
    ping?: number;
}

/** A full-width banner across both meadows. */
export interface BannerView {
    title: string;
    sub?: string;
    /** A highlighted plate under the subtitle, e.g. a newly unlocked fairy. */
    extra?: string;
    /** Seconds since the banner appeared, for its entrance animation (omit for no animation). */
    age?: number;
    /** How much to darken the meadows behind it (0 to 1). */
    dim?: number;
    /** Title colour family. */
    tone?: 'gold' | 'pink' | 'blue';
    /** Title size in view units (default 30). */
    size?: number;
    /** Blink the subtitle, for "press to continue" prompts. */
    blinkSub?: boolean;
}

/** The controls along the bottom while a replay plays: its speed, timeline, rounds and highlights. */
export interface ReplayPanelView {
    speed: number;
    paused: boolean;
    /** Where the playback is, and the whole length, in seconds. */
    pos: number;
    len: number;
    /** Where each round starts on the timeline (0 to 1), the first included, and which round is playing. */
    rounds: number[];
    round: number;
    /** The highlights, each where it falls on the timeline (0 to 1). */
    highlights: { x: number; kind: HighlightKind; side: 0 | 1 }[];
    /** While the knob is being dragged: where it is (0 to 1), and a label for the highlight it's on, if any. */
    scrub: number | null;
    label: string;
    hint: string;
    /** Minimised: only a small tab and a thin progress line show. */
    mini: boolean;
}
