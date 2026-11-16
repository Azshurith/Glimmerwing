import type { Progress, Settings } from './progress';

/** A copy of something saved for a player, stamped with the browser's clock (ms) when it was saved. */
export interface Saved<T> {
    data: T;
    savedAt: number;
}

/** Mute and both volumes, as the sound saves them. */
export interface AudioPrefs {
    muted: boolean;
    volume: number;
    music: number;
}

/** Everything a player sets in Settings that follows their account: the game's settings and the sound's. */
export interface SyncedSettings {
    settings: Settings;
    audio: AudioPrefs;
}

/** What the server knows of the signed-in player. */
export interface MeResponse {
    id: number;
    name: string;
    progress: Saved<Progress> | null;
    settings: Saved<SyncedSettings> | null;
    /** Where the player's best Endless run ranks, if they have one. */
    endless: EndlessRank | null;
}

/** A finished match, as sent to the server for the player's history. */
export interface MatchRecord {
    mode: 'cpu' | 'online' | 'versus';
    map: string;
    fairy: string;
    rivalFairy: string;
    roundsWon: number;
    roundsLost: number;
    bestChain: number;
    trophyDelta: number;
    seconds: number;
}

/** A finished Endless run, as sent to the server. */
export interface EndlessRecord {
    seconds: number;
    guardians: number;
    fairy: string;
    map: string;
    bestChain: number;
}

/** Where a player's best Endless run stands among everyone's. */
export interface EndlessRank {
    rank: number;
    players: number;
    best: number;
}

/** One line of the Endless leaderboard: a player's best run. */
export interface LeaderEntry {
    playerId: number;
    name: string;
    seconds: number;
    guardians: number;
    fairy: string;
    map: string;
    at: string;
}
