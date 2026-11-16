// The game's HTTP API, under /api. Players are guests: POST /api/guest hands a browser a random token, which it
// sends back as "Authorization: Bearer <token>"; the database keeps only the token's SHA-256.
//
//   POST /api/guest                {name?}                 -> {id, name, token}
//   GET  /api/me                          -> {id, name, progress, settings, endless}  ({data, savedAt} | null; rank | null)
//   PUT  /api/me                   {name}                  -> {id, name}
//   PUT  /api/me/progress          {data, savedAt}         -> {data, savedAt}   (the newer of the two copies)
//   PUT  /api/me/settings          {data, savedAt}         -> {data, savedAt}
//   POST /api/matches              {mode, map, fairy, …}   -> {ok}
//   GET  /api/me/matches?limit=                            -> [match]
//   POST /api/endless              {seconds, guardians, …} -> {rank, players, best}
//   GET  /api/leaderboard/endless?limit=                   -> [entry]
//   POST /api/replays              {mode, map, version, seconds, data} -> {code}
//   GET  /api/replays/<code>                               -> replay
//   GET  /api/me/replays?limit=                            -> [replay summary]
//   GET  /api/health                                       -> {ok, db}

import { createHash, randomBytes } from 'node:crypto';

const MAX_BODY = 64 * 1024;
const MAX_REPLAY = 4 * 1024 * 1024;
const MAX_SETTINGS = 16 * 1024;
const GUESTS_PER_HOUR = 30;
const MODES = new Set(['cpu', 'online', 'versus', 'endless']);
const PROGRESS_NUMBERS = [
    'wins',
    'bestChain',
    'fevers',
    'flawless',
    'trophies',
    'bestTrophies',
    'endlessBest',
    'endlessBosses',
];

/** An error that becomes an HTTP answer with this status. */
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

/** SHA-256 of a token, as stored. */
const hashToken = t => createHash('sha256').update(t).digest('hex');

/** A finite number clamped to [lo, hi], or the fallback. */
function num(v, lo, hi, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** A whole number clamped to [lo, hi]. */
const int = (v, lo, hi, fallback = 0) => Math.round(num(v, lo, hi, fallback));

/** A game id (fairy, map): lower-case letters, digits and dashes, or a 400. */
function gameId(v, what) {
    const s = String(v ?? '');
    if (!/^[a-z0-9-]{1,16}$/.test(s)) throw new HttpError(400, `Bad ${what}`);
    return s;
}

/** A display name: printable, trimmed, 1 to 24 characters. */
function playerName(v) {
    const s = String(v ?? '')
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, 24);
    if (!s) throw new HttpError(400, 'Bad name');
    return s;
}

/** A name for a new guest. */
const guestName = () => `Guest-${randomBytes(2).toString('hex').toUpperCase()}`;

/** Progress as the game saves it, with only the fields it has, each made sane. */
function progressData(v) {
    if (!v || typeof v !== 'object') throw new HttpError(400, 'Bad progress');
    const out = {};
    for (const k of PROGRESS_NUMBERS) out[k] = num(v[k], 0, 1e9);
    out.unlocked = Array.isArray(v.unlocked)
        ? [...new Set(v.unlocked.filter(x => typeof x === 'string' && /^[a-z0-9-]{1,16}$/.test(x)))].slice(0, 64)
        : [];
    return out;
}

/** The browser's save time, in ms. */
const savedAt = v => int(v, 0, 8.64e15);

/** Read a request body as JSON, refusing anything over `limit` bytes. */
function readJson(req, limit = MAX_BODY) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const parts = [];
        req.on('data', d => {
            size += d.length;
            if (size > limit) {
                reject(new HttpError(413, 'Too large'));
                req.destroy();
                return;
            }
            parts.push(d);
        });
        req.on('end', () => {
            if (!size) return resolve({});
            try {
                resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));
            } catch {
                reject(new HttpError(400, 'Bad JSON'));
            }
        });
        req.on('error', reject);
    });
}

/** Write a JSON answer. CORS is open: the API takes a bearer token, never cookies. */
function reply(res, status, body) {
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
    });
    res.end(JSON.stringify(body));
}

/** Build the /api handler around a store (or null when there is no database). */
export function createApi(store) {
    /** Guests made per address in the current hour. */
    const made = new Map();
    let hour = 0;

    /** The player the request's token belongs to, or a 401. */
    async function me(req) {
        const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(req.headers.authorization ?? '');
        const p = m && (await store.playerByToken(hashToken(m[1])));
        if (!p) throw new HttpError(401, 'Unknown player');
        return p;
    }

    /** Refuse too many new guests from one address within an hour. */
    function rateLimit(req) {
        const h = Math.floor(Date.now() / 3.6e6);
        if (h !== hour) {
            hour = h;
            made.clear();
        }
        const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
            .split(',')[0]
            .trim();
        const n = (made.get(ip) ?? 0) + 1;
        made.set(ip, n);
        if (n > GUESTS_PER_HOUR) throw new HttpError(429, 'Too many new players from here; try later');
    }

    /** The limit query parameter, 1 to `max`. */
    const limitOf = (url, def, max) => int(url.searchParams.get('limit') ?? def, 1, max, def);

    /** Route one request; returns the answer's [status, body]. */
    async function route(req, url) {
        const path = url.pathname.replace(/\/+$/, '');
        const M = req.method;
        if (path === '/api/health') return [200, { ok: true, db: store?.kind ?? null }];
        if (!store) throw new HttpError(503, 'No database');

        if (M === 'POST' && path === '/api/guest') {
            rateLimit(req);
            const body = await readJson(req);
            const token = randomBytes(32).toString('base64url');
            const p = await store.createPlayer(hashToken(token), body.name ? playerName(body.name) : guestName());
            return [201, { ...p, token }];
        }
        if (M === 'GET' && path === '/api/leaderboard/endless') {
            return [200, await store.leaderboard(limitOf(url, 10, 100))];
        }
        const rp = /^\/api\/replays\/([A-Z0-9]{10})$/.exec(path);
        if (M === 'GET' && rp) {
            const r = await store.getReplay(rp[1]);
            if (!r) throw new HttpError(404, 'No such replay');
            return [200, r];
        }

        // Everything else is a player's own.
        const p = await me(req);
        if (path === '/api/me') {
            if (M === 'GET') {
                const [progress, settings, endless] = await Promise.all([
                    store.getProgress(p.id),
                    store.getSettings(p.id),
                    store.endlessRank(p.id),
                ]);
                return [200, { ...p, progress, settings, endless }];
            }
            if (M === 'PUT') {
                const name = playerName((await readJson(req)).name);
                await store.rename(p.id, name);
                return [200, { id: p.id, name }];
            }
        }
        if (M === 'PUT' && path === '/api/me/progress') {
            const b = await readJson(req);
            return [200, await store.putProgress(p.id, progressData(b.data), savedAt(b.savedAt))];
        }
        if (M === 'PUT' && path === '/api/me/settings') {
            const b = await readJson(req, MAX_SETTINGS);
            if (!b.data || typeof b.data !== 'object') throw new HttpError(400, 'Bad settings');
            return [200, await store.putSettings(p.id, b.data, savedAt(b.savedAt))];
        }
        if (M === 'POST' && path === '/api/matches') {
            const b = await readJson(req);
            const mode = String(b.mode);
            if (!MODES.has(mode) || mode === 'endless') throw new HttpError(400, 'Bad mode');
            const roundsWon = int(b.roundsWon, 0, 99),
                roundsLost = int(b.roundsLost, 0, 99);
            await store.addMatch(p.id, {
                mode,
                map: gameId(b.map, 'map'),
                fairy: gameId(b.fairy, 'fairy'),
                rivalFairy: gameId(b.rivalFairy, 'rival fairy'),
                roundsWon,
                roundsLost,
                won: roundsWon > roundsLost,
                bestChain: int(b.bestChain, 0, 1e6),
                trophyDelta: int(b.trophyDelta, -1e4, 1e4),
                seconds: num(b.seconds, 0, 1e6),
            });
            return [201, { ok: true }];
        }
        if (M === 'GET' && path === '/api/me/matches') {
            return [200, await store.recentMatches(p.id, limitOf(url, 20, 200))];
        }
        if (M === 'POST' && path === '/api/endless') {
            const b = await readJson(req);
            const run = {
                seconds: num(b.seconds, 0, 1e6),
                guardians: int(b.guardians, 0, 1e4),
                fairy: gameId(b.fairy, 'fairy'),
                map: gameId(b.map, 'map'),
                bestChain: int(b.bestChain, 0, 1e6),
            };
            return [201, await store.addEndless(p.id, run)];
        }
        if (M === 'POST' && path === '/api/replays') {
            const b = await readJson(req, MAX_REPLAY);
            if (!MODES.has(String(b.mode))) throw new HttpError(400, 'Bad mode');
            if (!b.data || typeof b.data !== 'object') throw new HttpError(400, 'Bad replay');
            const code = await store.addReplay(p.id, {
                mode: String(b.mode),
                map: gameId(b.map, 'map'),
                version: String(b.version ?? '').slice(0, 16),
                seconds: num(b.seconds, 0, 1e6),
                data: b.data,
            });
            return [201, { code }];
        }
        if (M === 'GET' && path === '/api/me/replays') {
            return [200, await store.listReplays(p.id, limitOf(url, 20, 200))];
        }
        throw new HttpError(404, 'Not found');
    }

    /** Answer a request under /api. */
    return async function handleApi(req, res, url) {
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
                'access-control-allow-headers': 'authorization, content-type',
                'access-control-max-age': '86400',
            });
            res.end();
            return;
        }
        try {
            const [status, body] = await route(req, url);
            reply(res, status, body);
        } catch (e) {
            if (e instanceof HttpError) reply(res, e.status, { error: e.message });
            else {
                console.error('API error:', e);
                reply(res, 500, { error: 'Server error' });
            }
        }
    };
}
