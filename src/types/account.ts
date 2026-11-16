import type { MatchOutcome, Progress, Settings } from './progress';

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
    /** The fairies' voices (missing in settings saved before they spoke). */
    voice?: number;
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

/** What the server has switched off (GET /api/catalog): fairies, maps and game modes that can't be picked. */
export interface CatalogResponse {
    disabledCharacters: string[];
    disabledMaps: string[];
    /** Mode codes ('cpu', 'versus', 'endless', 'online'); a server from before modes could be switched off has none. */
    disabledModes?: string[];
    /** The art the database holds, by fairy and map code (a server from before art was kept has none). */
    art?: CatalogArt;
}

/**
 * The art kept in the database: each fairy's spritesheet and each map's monster sheet. The pictures themselves
 * are at /api/art/characters/<code>.png and /api/art/monsters/<code>.png, `?v=` the version given here.
 */
export interface CatalogArt {
    characters: Record<string, CharacterArt>;
    maps: Record<string, MapArt>;
}

/** A fairy's spritesheet: its version (when its row last changed, ms) and how its cells are laid out. */
export interface CharacterArt {
    v: number;
    atlas: SpriteAtlas;
}

/** A spritesheet's layout: everything of a SpriteSet but the picture. */
export interface SpriteAtlas {
    cw: number;
    ch: number;
    bodyX: number;
    bodyY: number;
    scale: number;
    anims: Record<string, { row: number; count: number; fps: number }>;
}

/** A map's monster sheet: its version, its cell size and overlay row, and the monsters on it. */
export interface MapArt {
    v: number;
    cell: number;
    overlay: number;
    monsters: MonsterArt[];
}

/** What a monster plays in a formation: a plain critter, the big one, the shelled one or the corkscrewing one. */
export type MonsterRole = 'plain' | 'big' | 'shelled' | 'spinner';

/** One monster on a map's sheet: its kind (code), name, role and row. */
export interface MonsterArt {
    code: string;
    name: string;
    role: MonsterRole;
    row: number;
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

/** What the server made of a finished game it checked: the progress that counts now, and what the game earned. */
export interface ResultResponse {
    progress: Progress;
    outcome: MatchOutcome;
    trophyDelta: number;
    /** Fairies unlocked (ids) and stages opened (map names). */
    unlocked: string[];
    newStages: string[];
    endlessNew: boolean;
    /** The replay's share code, and an Endless run's rank. */
    code: string;
    rank: EndlessRank | null;
}
