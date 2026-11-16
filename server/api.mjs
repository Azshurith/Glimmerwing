// The game's HTTP API, under /api. Players are guests: POST /api/guest hands a browser a random token, which it
// sends back as "Authorization: Bearer <token>"; the database keeps only the token's SHA-256.
//
//   POST /api/guest                {name?}                 -> {id, name, token}
//   GET  /api/me                          -> {id, name, progress, settings, endless}  ({data, savedAt} | null; rank | null)
//   PUT  /api/me                   {name}                  -> {id, name}
//   PUT  /api/me/settings          {data, savedAt}         -> {data, savedAt}   (the newer of the two copies)
//   POST /api/results              {replay}                -> {progress, trophyDelta, unlocked, …, code, rank}
//   POST /api/me/reset                                     -> {progress}
//   GET  /api/me/matches?limit=                            -> [match]
//   GET  /api/leaderboard/endless?limit=                   -> [entry]
//   GET  /api/replays/<code>                               -> replay
//
// The server decides progress: a browser can't send its own. A finished game is sent as its replay, which the
// server plays through again (verifier.mjs, the game's own simulation) to work out what it earned; only then
// does it count toward trophies, unlocks, the Endless best and the leaderboard.
//   GET  /api/me/replays?limit=                            -> [replay summary]
//   GET  /api/health                                       -> {ok, db}

import { createHash, randomBytes } from 'node:crypto';

const MAX_BODY = 64 * 1024;
const MAX_REPLAY = 4 * 1024 * 1024;
const MAX_SETTINGS = 16 * 1024;
const GUESTS_PER_HOUR = 30;
/** Finished games a player can send in an hour (each is played through again). */
const RESULTS_PER_HOUR = 240;
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

/** Progress for a player who has never played (as game/rewards.ts freshProgress). */
function freshProgress() {
    const out = {};
    for (const k of PROGRESS_NUMBERS) out[k] = 0;
    out.unlocked = [];
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

/** The player a token belongs to (a WebSocket sends it to be known), or null. */
export async function playerForToken(store, token) {
    if (!/^[A-Za-z0-9_-]{20,128}$/.test(String(token ?? ''))) return null;
    return store.playerByToken(hashToken(token));
}

/** Build the /api handler around a store (or null when there is no database). */
export function createApi(store, verifier = null) {
    /** Guests made per address in the current hour. */
    const made = new Map();
    let hour = 0;
    /** Games sent per player in the current hour. */
    const sent = new Map();
    /** Each player's results are counted one at a time, so two at once can't both add to the same progress. */
    const queues = new Map();

    /** Run `job` after any other result of this player's still being counted. */
    function inTurn(id, job) {
        const before = queues.get(id) ?? Promise.resolve();
        const run = before.then(job, job);
        const tail = run.catch(() => {});
        queues.set(id, tail);
        void tail.then(() => {
            if (queues.get(id) === tail) queues.delete(id);
        });
        return run;
    }

    /** Check a finished game and count it: the progress it makes, the replay, and the history or leaderboard. */
    async function countResult(p, replay) {
        if (!replay || typeof replay !== 'object' || !Array.isArray(replay.rounds))
            throw new HttpError(400, 'Bad replay');
        if (!verifier) throw new HttpError(503, 'The server cannot check games yet (build the game)');
        const h = Math.floor(Date.now() / 3.6e6);
        const key = `${h}:${p.id}`;
        const n = (sent.get(key) ?? 0) + 1;
        sent.set(key, n);
        if (sent.size > 10000) sent.clear();
        if (n > RESULTS_PER_HOUR) throw new HttpError(429, 'Too many games sent; try later');
        const recorded = int(replay.at, 0, 8.64e15);
        if (recorded && (await store.hasReplay(p.id, recorded))) throw new HttpError(409, 'Already counted');
        const saved = await store.getProgress(p.id);
        const v = await verifier.verify(replay, saved?.data ?? null);
        if (!v.ok) {
            const e = new HttpError(422, v.error);
            e.stale = !!v.stale;
            throw e;
        }
        await store.setProgress(p.id, v.progress);
        const code = await store.addReplay(p.id, {
            mode: v.outcome.mode,
            map: v.map,
            version: String(replay.sim ?? '').slice(0, 16),
            seconds: v.seconds,
            recorded,
            data: replay,
        });
        let rank = null;
        if (v.outcome.mode === 'endless') {
            rank = await store.addEndless(p.id, {
                seconds: v.outcome.endless.seconds,
                guardians: v.outcome.endless.guardians,
                fairy: v.fairies[0],
                map: v.map,
                bestChain: v.outcome.bestChain,
            });
        } else {
            const [won, lost] = v.outcome.wins;
            await store.addMatch(p.id, {
                mode: v.outcome.mode,
                map: v.map,
                fairy: v.fairies[0],
                rivalFairy: v.fairies[1],
                roundsWon: won,
                roundsLost: lost,
                won: won > lost,
                bestChain: v.outcome.bestChain,
                trophyDelta: v.trophyDelta,
                seconds: v.seconds,
            });
        }
        return {
            progress: v.progress,
            outcome: v.outcome,
            trophyDelta: v.trophyDelta,
            unlocked: v.unlocked,
            newStages: v.newStages,
            endlessNew: v.endlessNew,
            code,
            rank,
        };
    }

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
        if (M === 'POST' && path === '/api/results') {
            const b = await readJson(req, MAX_REPLAY);
            return [201, await inTurn(p.id, () => countResult(p, b.replay))];
        }
        if (M === 'POST' && path === '/api/me/reset') {
            const progress = freshProgress();
            await inTurn(p.id, () => store.setProgress(p.id, progress));
            return [200, { progress }];
        }
        // The old ways of sending progress and results: the server works them out itself now.
        if (
            (M === 'PUT' && path === '/api/me/progress') ||
            (M === 'POST' && ['/api/matches', '/api/endless', '/api/replays'].includes(path))
        )
            throw new HttpError(410, 'Send finished games to /api/results; the server works out progress');
        if (M === 'PUT' && path === '/api/me/settings') {
            const b = await readJson(req, MAX_SETTINGS);
            if (!b.data || typeof b.data !== 'object') throw new HttpError(400, 'Bad settings');
            return [200, await store.putSettings(p.id, b.data, savedAt(b.savedAt))];
        }
        if (M === 'GET' && path === '/api/me/matches') {
            return [200, await store.recentMatches(p.id, limitOf(url, 20, 200))];
        }
        if (M === 'GET' && path === '/api/me/replays') {
            return [200, await store.listReplays(p.id, limitOf(url, 20, 200))];
        }
        throw new HttpError(404, 'Not found');
    }

    /** Answer a request under /api. */
    async function handleApi(req, res, url) {
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
            if (e instanceof HttpError) reply(res, e.status, { error: e.message, ...(e.stale ? { stale: true } : {}) });
            else {
                console.error('API error:', e);
                reply(res, 500, { error: 'Server error' });
            }
        }
    }
    // Online matches count their results through the same one-at-a-time line as everything else.
    handleApi.inTurn = inTurn;
    return handleApi;
}
