import type { CritterKind } from './game';

/**
 * Every wave is described by one of these, so new formations can be added as
 * data. `rollWave` picks one from the shared seed, so both meadows match.
 */
export type WavePath = 'arc' | 'string' | 'ring' | 'leader' | 'swoop' | 'sweep' | 'column' | 'rise';

/** One wave of critters: path, kind, speed, entry side, size and count. */
export interface WaveSpec {
    path: WavePath;
    kind: CritterKind;
    /** Downward speed for drifting waves; travel speed scale for path waves. */
    speed: number;
    /** -1 enters from the left, 1 from the right (for paths that care). */
    side: -1 | 1;
    /** Big critters are larger, tougher, and leave wider bursts. */
    big: boolean;
    count: number;
    /** Shots needed for each member, front to back. */
    hp: number[];
    /** Wrapped in dew bubbles that must pop first. */
    bubble: boolean;
    cx: number;
    /** Height of a sweeping line. */
    lane: number;
}
