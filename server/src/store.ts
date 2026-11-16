// What the API and the online matches keep in the database, through the TypeORM entities. Soft-deleted rows
// (deleted_at set) are left out of everything: the repositories do that themselves, and the few raw queries
// (rankings and summaries) say so in their WHERE.
import { randomBytes } from 'node:crypto';
import type { DataSource, Repository } from 'typeorm';
import { fromJson } from './database/entities/columns';
import { EndlessRun } from './database/entities/endless-run';
import { MatchRow } from './database/entities/match';
import { Player } from './database/entities/player';
import { ProgressRow } from './database/entities/progress';
import { ReplayRow } from './database/entities/replay';
import { SettingsRow } from './database/entities/settings';
import type { EndlessRank, LeaderEntry, Progress, ReplaySummary } from '@/types';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short random code to share a replay by. */
export function replayCode(): string {
    const b = randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
    return s;
}

/** A player as the API hands them out. */
export interface PlayerRef {
    id: number;
    name: string;
}

/** A saved document and when it was saved (ms). */
export interface SavedDoc<T> {
    data: T;
    savedAt: number;
}

/** A finished match to keep in the history. */
export interface MatchInput {
    mode: string;
    map: string;
    fairy: string;
    rivalFairy: string;
    roundsWon: number;
    roundsLost: number;
    won: boolean;
    bestChain: number;
    trophyDelta: number;
    seconds: number;
}

/** A finished Endless run. */
export interface EndlessInput {
    seconds: number;
    guardians: number;
    fairy: string;
    map: string;
    bestChain: number;
}

/** A replay to keep. */
export interface ReplayInput {
    mode: string;
    map: string;
    version: string;
    seconds: number;
    recorded: number | null;
    data: unknown;
}

/** A shared replay as GET /api/replays/<code> answers. */
export interface SharedReplay {
    code: string;
    mode: string;
    map: string;
    version: string;
    seconds: number;
    name: string;
    at: string;
    data: unknown;
}

/** Whether an error is a duplicate key on the index called `index`. */
function duplicateOn(e: unknown, index: string): boolean {
    const err = e as { code?: string; message?: string; driverError?: { code?: string } };
    const code = err.code ?? err.driverError?.code;
    return code === 'ER_DUP_ENTRY' && String(err.message ?? '').includes(index);
}

/** A date column as ISO text. */
const iso = (d: Date | string) => new Date(d).toISOString();

/** The players, their saves, their history and their replays, kept in MariaDB. */
export class Store {
    readonly kind = 'mariadb';
    private players: Repository<Player>;
    private progress: Repository<ProgressRow>;
    private settings: Repository<SettingsRow>;
    private matches: Repository<MatchRow>;
    private runs: Repository<EndlessRun>;
    private replays: Repository<ReplayRow>;

    constructor(private db: DataSource) {
        this.players = db.getRepository(Player);
        this.progress = db.getRepository(ProgressRow);
        this.settings = db.getRepository(SettingsRow);
        this.matches = db.getRepository(MatchRow);
        this.runs = db.getRepository(EndlessRun);
        this.replays = db.getRepository(ReplayRow);
    }

    /** Rows of a raw query. */
    private rows<T>(sql: string, args: unknown[] = []): Promise<T[]> {
        return this.db.query(sql, args) as Promise<T[]>;
    }

    /** A new guest. */
    async createPlayer(tokenHash: string, name: string): Promise<PlayerRef> {
        const r = await this.players.insert({ tokenHash, name });
        return { id: Number((r.identifiers[0] as { id: number }).id), name };
    }

    /** The player a token's hash belongs to (and note they were seen), or null. */
    async playerByToken(tokenHash: string): Promise<PlayerRef | null> {
        const p = await this.players.findOne({ where: { tokenHash } });
        if (!p) return null;
        await this.players.update({ id: p.id }, { seenAt: new Date() });
        return { id: p.id, name: p.name };
    }

    /** Give a player a new name. */
    async rename(id: number, name: string): Promise<void> {
        await this.players.update({ id }, { name });
    }

    /** A player's progress, or null if they have none yet. */
    async getProgress(id: number): Promise<SavedDoc<Progress> | null> {
        const r = await this.progress.findOne({ where: { playerId: id } });
        return r ? { data: r.data, savedAt: r.savedAt } : null;
    }

    /** Replace a player's progress (the server's own decision). A soft-deleted row comes back to life. */
    async setProgress(id: number, data: Progress): Promise<void> {
        await this.progress.upsert(
            {
                playerId: id,
                data,
                trophies: data.trophies,
                bestTrophies: data.bestTrophies,
                wins: data.wins,
                endlessBest: data.endlessBest,
                savedAt: Date.now(),
                deletedAt: null,
            },
            ['playerId'],
        );
    }

    /** Whether the player already has the replay recorded at `recorded` (deleted ones too: it was counted). */
    async hasReplay(id: number, recorded: number): Promise<boolean> {
        return (await this.replays.count({ where: { playerId: id, recorded }, withDeleted: true })) > 0;
    }

    /** A player's settings, or null. */
    async getSettings(id: number): Promise<SavedDoc<unknown> | null> {
        const r = await this.settings.findOne({ where: { playerId: id } });
        return r ? { data: r.data, savedAt: r.savedAt } : null;
    }

    /** Keep the newer of the stored settings and these; answers with whichever is kept. */
    async putSettings(id: number, data: unknown, savedAt: number): Promise<SavedDoc<unknown>> {
        const old = await this.settings.findOne({ where: { playerId: id }, withDeleted: true });
        if (old && !old.deletedAt && old.savedAt > savedAt) return { data: old.data, savedAt: old.savedAt };
        await this.settings.upsert({ playerId: id, data: data as object, savedAt, deletedAt: null }, ['playerId']);
        return { data, savedAt };
    }

    /** Add a finished match to the player's history. */
    async addMatch(id: number, m: MatchInput): Promise<void> {
        await this.matches.insert({ playerId: id, ...m });
    }

    /** The player's latest matches, newest first. */
    async recentMatches(id: number, limit: number) {
        const rows = await this.matches.find({ where: { playerId: id }, order: { id: 'DESC' }, take: limit });
        return rows.map(x => ({
            mode: x.mode,
            map: x.map,
            fairy: x.fairy,
            rivalFairy: x.rivalFairy,
            roundsWon: x.roundsWon,
            roundsLost: x.roundsLost,
            won: !!x.won,
            bestChain: x.bestChain,
            trophyDelta: x.trophyDelta,
            seconds: x.seconds,
            at: iso(x.createdAt),
        }));
    }

    /** Add an Endless run; answers with where the player's best now ranks. */
    async addEndless(id: number, r: EndlessInput): Promise<EndlessRank | null> {
        await this.runs.insert({ playerId: id, ...r });
        return this.endlessRank(id);
    }

    /** Where a player's best Endless run ranks among every player's best, or null without one. */
    async endlessRank(id: number): Promise<EndlessRank | null> {
        const [mine] = await this.rows<{ best: number | null }>(
            'SELECT MAX(seconds) AS best FROM endless_runs WHERE player_id = ? AND deleted_at IS NULL',
            [id],
        );
        if (mine?.best == null) return null;
        const best = Number(mine.best);
        // Every player's best: how many beat this one, and how many there are.
        const bests = `SELECT MAX(r.seconds) AS best FROM endless_runs r
            JOIN players p ON p.id = r.player_id AND p.deleted_at IS NULL
            WHERE r.deleted_at IS NULL GROUP BY r.player_id`;
        const [ahead] = await this.rows<{ n: number | string }>(
            `SELECT COUNT(*) AS n FROM (${bests}) b WHERE b.best > ?`,
            [best],
        );
        const [all] = await this.rows<{ n: number | string }>(`SELECT COUNT(*) AS n FROM (${bests}) b`);
        return { rank: Number(ahead.n) + 1, players: Number(all.n), best };
    }

    /** The Endless leaderboard: each player's best run, best first. */
    async leaderboard(limit: number): Promise<LeaderEntry[]> {
        const rows = await this.rows<{
            player_id: number;
            name: string;
            seconds: number;
            guardians: number;
            fairy: string;
            map: string;
            created_at: Date;
        }>(
            `SELECT t.player_id, t.name, t.seconds, t.guardians, t.fairy, t.map, t.created_at FROM (
                SELECT r.player_id, p.name, r.seconds, r.guardians, r.fairy, r.map, r.created_at,
                    ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.seconds DESC, r.id) AS rn
                FROM endless_runs r JOIN players p ON p.id = r.player_id AND p.deleted_at IS NULL
                WHERE r.deleted_at IS NULL
             ) t WHERE t.rn = 1 ORDER BY t.seconds DESC, t.created_at LIMIT ?`,
            [limit],
        );
        return rows.map(x => ({
            playerId: Number(x.player_id),
            name: x.name,
            seconds: Number(x.seconds),
            guardians: Number(x.guardians),
            fairy: x.fairy,
            map: x.map,
            at: iso(x.created_at),
        }));
    }

    /** Keep a replay; answers with its share code. */
    async addReplay(id: number, r: ReplayInput): Promise<string> {
        for (;;) {
            const code = replayCode();
            try {
                await this.replays.insert({
                    code,
                    playerId: id,
                    mode: r.mode,
                    map: r.map,
                    version: r.version,
                    seconds: r.seconds,
                    recorded: r.recorded || null,
                    data: r.data as object,
                });
                return code;
            } catch (e) {
                // Another replay drew the same code: draw again.
                if (!duplicateOn(e, 'replays_code')) throw e;
            }
        }
    }

    /** A replay by its share code, with who played it, or null. */
    async getReplay(code: string): Promise<SharedReplay | null> {
        const [r] = await this.rows<{
            code: string;
            mode: string;
            map: string;
            version: string;
            seconds: number;
            data: unknown;
            created_at: Date;
            name: string;
        }>(
            `SELECT r.code, r.mode, r.map, r.version, r.seconds, r.data, r.created_at, p.name
             FROM replays r JOIN players p ON p.id = r.player_id
             WHERE r.code = ? AND r.deleted_at IS NULL`,
            [code],
        );
        if (!r) return null;
        return {
            code: r.code,
            mode: r.mode,
            map: r.map,
            version: r.version,
            seconds: Number(r.seconds),
            name: r.name,
            at: iso(r.created_at),
            data: fromJson(r.data),
        };
    }

    /** The player's replays, newest first, without their recordings. */
    async listReplays(id: number, limit: number): Promise<ReplaySummary[]> {
        const rows = await this.rows<{
            code: string;
            mode: string;
            map: string;
            seconds: number;
            created_at: Date;
            recorded: string | number | null;
            fairies: unknown;
            wins: unknown;
        }>(
            `SELECT code, mode, map, seconds, created_at, recorded,
                JSON_EXTRACT(data, '$.fairies') AS fairies, JSON_EXTRACT(data, '$.wins') AS wins
             FROM replays WHERE player_id = ? AND deleted_at IS NULL ORDER BY id DESC LIMIT ?`,
            [id, limit],
        );
        /** A JSON array value, or null. */
        const pair = <T>(v: unknown): [T, T] | null => {
            try {
                const a = fromJson(v);
                return Array.isArray(a) && a.length === 2 ? (a as [T, T]) : null;
            } catch {
                return null;
            }
        };
        return rows.map(x => ({
            code: x.code,
            mode: x.mode,
            map: x.map,
            seconds: Number(x.seconds),
            at: iso(x.created_at),
            fairies: pair<string>(x.fairies),
            wins: pair<number>(x.wins),
            recorded: x.recorded == null ? null : Number(x.recorded),
        }));
    }

    /** Close the connection. */
    close(): Promise<void> {
        return this.db.destroy();
    }
}
