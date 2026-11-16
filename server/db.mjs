// Where the server keeps players and their saves.
//
//   DB_HOST set     MariaDB (or MySQL) through the mysql2 package; server/schema.sql is run at start-up.
//   DB=memory       an in-memory store, for trying the API without a database (lost on restart).
//   neither         no store: the API answers 503 and the game keeps its saves in the browser only.
//
// Every store has the same methods; api.mjs only ever talks to one through them.

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), 'schema.sql');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short random code to share a replay by. */
export function replayCode() {
    const b = randomBytes(10);
    let s = '';
    for (let i = 0; i < 10; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
    return s;
}

/** Open the store the environment asks for, or null when there is none. */
export async function openStore(env = process.env) {
    if (env.DB_HOST) return mariaStore(env);
    if (env.DB === 'memory') return memoryStore();
    return null;
}

/**
 * A JSON column's value. MariaDB marks a `CHECK (JSON_VALID(…))` column as JSON, and mysql2 then hands it back
 * already parsed; a server or driver that doesn't sends the text (or bytes), which is parsed here.
 */
export function fromJson(v) {
    if (v == null) return null;
    if (typeof v === 'string') return JSON.parse(v);
    if (Buffer.isBuffer(v)) return JSON.parse(v.toString('utf8'));
    return v;
}

/** Wait for `ms` milliseconds. */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * The MariaDB store. The database may still be starting when the server does (docker compose starts both), so
 * connecting is retried for a while before giving up.
 */
async function mariaStore(env) {
    const mysql = await import('mysql2/promise');
    const pool = mysql.createPool({
        host: env.DB_HOST,
        port: Number(env.DB_PORT) || 3306,
        user: env.DB_USERNAME,
        password: env.DB_PASSWORD,
        database: env.DB_DATABASE,
        connectionLimit: Number(env.DB_POOL) || 8,
        multipleStatements: false,
        charset: 'utf8mb4',
    });
    for (let tries = 1; ; tries++) {
        try {
            await pool.query('SELECT 1');
            break;
        } catch (e) {
            if (tries >= 30) throw e;
            console.warn(`Database not ready (${e.code ?? e.message}), retrying…`);
            await sleep(2000);
        }
    }
    // The schema, one statement at a time (comments stripped).
    const sql = readFileSync(SCHEMA, 'utf8')
        .split('\n')
        .filter(l => !l.trim().startsWith('--'))
        .join('\n');
    for (const stmt of sql.split(';').map(s => s.trim())) if (stmt) await pool.query(stmt);

    /** Rows of a query. */
    const rows = async (q, args = []) => (await pool.query(q, args))[0];

    return {
        kind: 'mariadb',
        async createPlayer(tokenHash, name) {
            const [r] = await pool.query('INSERT INTO players (token_hash, name) VALUES (?, ?)', [tokenHash, name]);
            return { id: r.insertId, name };
        },
        async playerByToken(tokenHash) {
            const [p] = await rows('SELECT id, name FROM players WHERE token_hash = ?', [tokenHash]);
            if (!p) return null;
            await pool.query('UPDATE players SET seen_at = CURRENT_TIMESTAMP WHERE id = ?', [p.id]);
            return { id: p.id, name: p.name };
        },
        async rename(id, name) {
            await pool.query('UPDATE players SET name = ? WHERE id = ?', [name, id]);
        },
        async getProgress(id) {
            const [r] = await rows('SELECT data, saved_at FROM progress WHERE player_id = ?', [id]);
            return r ? { data: fromJson(r.data), savedAt: Number(r.saved_at) } : null;
        },
        async setProgress(id, data) {
            // The server's own decision, so it simply replaces what was there.
            await pool.query(
                `INSERT INTO progress (player_id, data, trophies, best_trophies, wins, endless_best, saved_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE data = VALUES(data), trophies = VALUES(trophies),
                    best_trophies = VALUES(best_trophies), wins = VALUES(wins),
                    endless_best = VALUES(endless_best), saved_at = VALUES(saved_at)`,
                [id, JSON.stringify(data), data.trophies, data.bestTrophies, data.wins, data.endlessBest, Date.now()],
            );
        },
        async hasReplay(id, recorded) {
            const [r] = await rows('SELECT 1 AS x FROM replays WHERE player_id = ? AND recorded = ?', [id, recorded]);
            return !!r;
        },
        async getSettings(id) {
            const [r] = await rows('SELECT data, saved_at FROM settings WHERE player_id = ?', [id]);
            return r ? { data: fromJson(r.data), savedAt: Number(r.saved_at) } : null;
        },
        async putSettings(id, data, savedAt) {
            await pool.query(
                `INSERT INTO settings (player_id, data, saved_at) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    data = IF(VALUES(saved_at) >= saved_at, VALUES(data), data),
                    saved_at = GREATEST(saved_at, VALUES(saved_at))`,
                [id, JSON.stringify(data), savedAt],
            );
            return this.getSettings(id);
        },
        async addMatch(id, m) {
            await pool.query(
                `INSERT INTO matches (player_id, mode, map, fairy, rival_fairy, rounds_won, rounds_lost, won,
                    best_chain, trophy_delta, seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id,
                    m.mode,
                    m.map,
                    m.fairy,
                    m.rivalFairy,
                    m.roundsWon,
                    m.roundsLost,
                    m.won ? 1 : 0,
                    m.bestChain,
                    m.trophyDelta,
                    m.seconds,
                ],
            );
        },
        async recentMatches(id, limit) {
            const r = await rows(
                `SELECT mode, map, fairy, rival_fairy, rounds_won, rounds_lost, won, best_chain, trophy_delta,
                    seconds, played_at FROM matches WHERE player_id = ? ORDER BY id DESC LIMIT ?`,
                [id, limit],
            );
            return r.map(x => ({
                mode: x.mode,
                map: x.map,
                fairy: x.fairy,
                rivalFairy: x.rival_fairy,
                roundsWon: x.rounds_won,
                roundsLost: x.rounds_lost,
                won: !!x.won,
                bestChain: x.best_chain,
                trophyDelta: x.trophy_delta,
                seconds: x.seconds,
                at: new Date(x.played_at).toISOString(),
            }));
        },
        async addEndless(id, r) {
            await pool.query(
                `INSERT INTO endless_runs (player_id, seconds, guardians, fairy, map, best_chain)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [id, r.seconds, r.guardians, r.fairy, r.map, r.bestChain],
            );
            return this.endlessRank(id);
        },
        async endlessRank(id) {
            // Rank among every player's best run: how many players have a better best, plus one.
            const [best] = await rows('SELECT MAX(seconds) AS best FROM endless_runs WHERE player_id = ?', [id]);
            if (best.best == null) return null;
            const [ahead] = await rows(
                `SELECT COUNT(*) AS n FROM (SELECT MAX(seconds) AS best FROM endless_runs GROUP BY player_id) b
                 WHERE b.best > ?`,
                [best.best],
            );
            const [all] = await rows('SELECT COUNT(DISTINCT player_id) AS n FROM endless_runs');
            return { rank: Number(ahead.n) + 1, players: Number(all.n), best: Number(best.best) };
        },
        async leaderboard(limit) {
            const r = await rows(
                `SELECT t.player_id, t.name, t.seconds, t.guardians, t.fairy, t.map, t.played_at FROM (
                    SELECT r.player_id, p.name, r.seconds, r.guardians, r.fairy, r.map, r.played_at,
                        ROW_NUMBER() OVER (PARTITION BY r.player_id ORDER BY r.seconds DESC, r.id) AS rn
                    FROM endless_runs r JOIN players p ON p.id = r.player_id
                 ) t WHERE t.rn = 1 ORDER BY t.seconds DESC, t.played_at LIMIT ?`,
                [limit],
            );
            return r.map(x => ({
                playerId: x.player_id,
                name: x.name,
                seconds: x.seconds,
                guardians: x.guardians,
                fairy: x.fairy,
                map: x.map,
                at: new Date(x.played_at).toISOString(),
            }));
        },
        async addReplay(id, r) {
            for (;;) {
                const code = replayCode();
                try {
                    await pool.query(
                        `INSERT INTO replays (code, player_id, mode, map, version, seconds, recorded, data)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [code, id, r.mode, r.map, r.version, r.seconds, r.recorded || null, JSON.stringify(r.data)],
                    );
                    return code;
                } catch (e) {
                    if (e.code !== 'ER_DUP_ENTRY') throw e;
                }
            }
        },
        async getReplay(code) {
            const [r] = await rows(
                `SELECT r.code, r.mode, r.map, r.version, r.seconds, r.data, r.created_at, p.name
                 FROM replays r JOIN players p ON p.id = r.player_id WHERE r.code = ?`,
                [code],
            );
            if (!r) return null;
            return {
                code: r.code,
                mode: r.mode,
                map: r.map,
                version: r.version,
                seconds: r.seconds,
                name: r.name,
                at: new Date(r.created_at).toISOString(),
                data: fromJson(r.data),
            };
        },
        async listReplays(id, limit) {
            const r = await rows(
                `SELECT code, mode, map, version, seconds, created_at,
                    JSON_EXTRACT(data, '$.fairies') AS fairies, JSON_EXTRACT(data, '$.wins') AS wins,
                    JSON_EXTRACT(data, '$.at') AS recorded
                 FROM replays WHERE player_id = ? ORDER BY id DESC LIMIT ?`,
                [id, limit],
            );
            /** A JSON array column, or null. */
            const arr = v => {
                try {
                    const a = fromJson(v);
                    return Array.isArray(a) ? a : null;
                } catch {
                    return null;
                }
            };
            return r.map(x => ({
                code: x.code,
                mode: x.mode,
                map: x.map,
                version: x.version,
                seconds: x.seconds,
                at: new Date(x.created_at).toISOString(),
                fairies: arr(x.fairies),
                wins: arr(x.wins),
                recorded: x.recorded == null ? null : Number(x.recorded),
            }));
        },
        close: () => pool.end(),
    };
}

/** The in-memory store: the same methods over plain arrays, for trying the API without a database. */
function memoryStore() {
    const players = [],
        progress = new Map(),
        settings = new Map(),
        matches = [],
        runs = [],
        replays = [];
    /** Keep the newer of the stored copy and an incoming one. */
    const keepNewer = (map, id, data, savedAt) => {
        const old = map.get(id);
        if (!old || savedAt >= old.savedAt) map.set(id, { data: structuredClone(data), savedAt });
        return structuredClone(map.get(id));
    };
    /** Each player's best run, best first. */
    const bests = () => {
        const best = new Map();
        for (const r of runs)
            if (!best.has(r.playerId) || r.seconds > best.get(r.playerId).seconds) best.set(r.playerId, r);
        return [...best.values()].sort((a, b) => b.seconds - a.seconds || a.at.localeCompare(b.at));
    };
    const now = () => new Date().toISOString();
    return {
        kind: 'memory',
        async createPlayer(tokenHash, name) {
            const p = { id: players.length + 1, tokenHash, name };
            players.push(p);
            return { id: p.id, name };
        },
        async playerByToken(tokenHash) {
            const p = players.find(x => x.tokenHash === tokenHash);
            return p ? { id: p.id, name: p.name } : null;
        },
        async rename(id, name) {
            players[id - 1].name = name;
        },
        getProgress: async id => structuredClone(progress.get(id) ?? null),
        async setProgress(id, data) {
            progress.set(id, { data: structuredClone(data), savedAt: Date.now() });
        },
        hasReplay: async (id, recorded) => replays.some(r => r.playerId === id && r.recorded === recorded),
        getSettings: async id => structuredClone(settings.get(id) ?? null),
        putSettings: async (id, data, savedAt) => keepNewer(settings, id, data, savedAt),
        async addMatch(id, m) {
            matches.push({ ...m, playerId: id, at: now() });
        },
        async recentMatches(id, limit) {
            return matches
                .filter(m => m.playerId === id)
                .reverse()
                .slice(0, limit)
                .map(({ playerId: _p, ...m }) => m);
        },
        async addEndless(id, r) {
            runs.push({ ...r, playerId: id, at: now() });
            return this.endlessRank(id);
        },
        async endlessRank(id) {
            const b = bests();
            const mine = b.find(x => x.playerId === id);
            if (!mine) return null;
            return { rank: b.filter(x => x.seconds > mine.seconds).length + 1, players: b.length, best: mine.seconds };
        },
        async leaderboard(limit) {
            return bests()
                .slice(0, limit)
                .map(r => ({
                    playerId: r.playerId,
                    name: players[r.playerId - 1].name,
                    seconds: r.seconds,
                    guardians: r.guardians,
                    fairy: r.fairy,
                    map: r.map,
                    at: r.at,
                }));
        },
        async addReplay(id, r) {
            const code = replayCode();
            replays.push({ ...structuredClone(r), code, playerId: id, at: now() });
            return code;
        },
        async getReplay(code) {
            const r = replays.find(x => x.code === code);
            if (!r) return null;
            const { playerId, ...rest } = structuredClone(r);
            return { ...rest, name: players[playerId - 1].name };
        },
        async listReplays(id, limit) {
            return replays
                .filter(r => r.playerId === id)
                .reverse()
                .slice(0, limit)
                .map(({ code, mode, map, version, seconds, at, data }) => ({
                    code,
                    mode,
                    map,
                    version,
                    seconds,
                    at,
                    fairies: Array.isArray(data.fairies) ? data.fairies : null,
                    wins: Array.isArray(data.wins) ? data.wins : null,
                    recorded: typeof data.at === 'number' ? data.at : null,
                }));
        },
        close: async () => {},
    };
}
