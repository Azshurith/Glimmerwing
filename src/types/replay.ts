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

/** One side's numbers over a whole match, worked out by playing its replay through (see game/match-stats.ts). */
export interface SideStats {
    roundsWon: number;
    /** Critters popped, chains that sent attacks, and the longest of them. */
    pops: number;
    chains: number;
    bestChain: number;
    /** Normal fireballs sent, fireballs shot back (Reverses), Extra Attacks and guardians sent. */
    fireballs: number;
    reverses: number;
    extras: number;
    guardians: number;
    perfects: number;
    fevers: number;
    bombs: number;
    /** Attacks that struck her, and critters she ran into. */
    hits: number;
    stuns: number;
}

/** A moment on a match's graphs, by seconds into the match and whose meadow it happened in. */
export interface StatEvent {
    t: number;
    side: 0 | 1;
    kind: HighlightKind;
}

/** Each side's standing at a moment of the match: hearts (half-hearts) and, so far, pops and attacks sent. */
export interface StatSample {
    t: number;
    hull: [number, number];
    pops: [number, number];
    attacks: [number, number];
}

/** A match's numbers and its graphs' data, from playing its replay through. */
export interface MatchStats {
    /** How long it lasted (seconds of play), and each round: when it began, how long it lasted, who won it. */
    seconds: number;
    rounds: { start: number; seconds: number; winner: -1 | 0 | 1 }[];
    /** The fairy each side flew, by id. */
    fairies: [string, string];
    sides: [SideStats, SideStats];
    samples: StatSample[];
    events: StatEvent[];
    /** False when the replay is from another build of the game, or didn't play out as recorded. */
    exact: boolean;
}
