/** The modes a replay can be recorded in (online ones by the server, which runs online matches). */
export type ReplayMode = 'cpu' | 'versus' | 'endless' | 'online';

/** One round of a replay: its seed and both meadows' controls, step by step (see game/replay.ts for the tape). */
export interface ReplayRound {
    seed: number;
    /** How many playing steps the round ran. */
    steps: number;
    /** The meadow size it was played at (it can change between rounds as a window is resized). */
    field: { w: number; h: number; single: boolean };
    tapes: [number[], number[]];
}

/**
 * A recorded match or Endless run: everything needed to play it again exactly. The meadows are seeded, so given
 * each round's seed and every step's controls (the CPU's included) the simulation runs the same way again.
 */
export interface ReplayData {
    format: number;
    /** The simulation's build (a hash of its source): a different one may not play the recording the same way. */
    sim: string;
    mode: ReplayMode;
    /** The two fairies' ids, the player's first. */
    fairies: [string, string];
    map: string;
    rounds: ReplayRound[];
    /** Rounds won by each side (an Endless run has none). */
    wins: [number, number];
    /** How long it lasted, and for an Endless run the guardians sent. */
    seconds: number;
    guardians: number;
    /** When it was recorded (ms since 1970). */
    at: number;
}

/** A replay in a list: what it was and where to fetch it (a server code, or 'local' for this browser's last one). */
export interface ReplaySummary {
    code: string;
    mode: string;
    map: string;
    seconds: number;
    at: string;
    fairies: [string, string] | null;
    wins: [number, number] | null;
    /** When it was recorded, by the recording browser's clock (ReplayData.at). */
    recorded: number | null;
}

/** What a highlight on the replay's timeline marks. */
export type HighlightKind = 'chain' | 'fever' | 'extra' | 'guardian' | 'bomb' | 'ko';

/** A moment worth jumping to: a big chain, a Fever, an Extra Attack, a guardian, a bomb or a knockout. */
export interface ReplayHighlight {
    /** Where on the timeline, in playing steps. */
    at: number;
    kind: HighlightKind;
    /** Whose meadow it happened in. */
    side: 0 | 1;
}
