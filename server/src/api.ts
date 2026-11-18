// The game's HTTP API, under /api. Players are guests: POST /api/guest hands a browser a random token, which it
// sends back as "Authorization: Bearer <token>"; the database keeps only the token's SHA-256.
//
//   GET  /api/health                                       -> {ok, db}
//   GET  /api/catalog                     -> {disabledCharacters, disabledMaps, disabledModes, art}
//   GET  /api/art/characters/<code>.png                    -> a fairy's spritesheet (?v= its art version)
//   GET  /api/art/monsters/<code>.png                      -> a map's monster sheet
//   POST /api/guest                {name?}                 -> {id, name, token}
//   GET  /api/leaderboard/endless?limit=                   -> [entry]
//   GET  /api/replays/<code>                               -> replay
//   GET  /api/chat/world?after=&limit=                     -> [message] (oldest first, newer than `after`)
//   GET  /api/me                -> {id, name, progress, settings, endless, look}  ({data, savedAt} | null; rank | null)
//   PUT  /api/me                   {name}                  -> {id, name}
//   PUT  /api/me/settings          {data, savedAt}         -> {data, savedAt}   (the newer of the two copies)
//   PUT  /api/me/look              {avatar, frame, bubble} -> look      (each must be open to the player)
//   POST /api/results              {replay}                -> {progress, trophyDelta, unlocked, …, code, rank}
//   POST /api/me/reset                                     -> {progress}
//   GET  /api/me/matches?limit=                            -> [match]
//   GET  /api/me/history?limit=                            -> [match or Endless run, with its replay's code]
//   GET  /api/me/replays?limit=                            -> [replay summary]
//   POST /api/chat/world           {body}                  -> message   (cleaned and masked; 429 if too fast)
//
// The server decides progress: a browser can't send its own. A finished game is sent as its replay, which the
// server plays through again (the verifier, the game's own simulation) to work out what it earned; only then does
// it count toward trophies, unlocks, the Endless best and the leaderboard. A game with a fairy or on a map that's
// switched off (the characters and maps tables) isn't counted.
import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import type { NextFunction, Request, Response, Router } from 'express';
import { CHAT_MAX, cleanChat } from './chat-filter';
import { HttpError } from './http-error';
import type { Catalog } from './catalog';
import type { ChannelRef, PlayerRef, Store } from './store';
import type { Turns } from './turns';
import type { Verifier } from './verifier';
import { BUBBLES, FRAMES } from '@/data/looks';
import { fairyOpen, freshProgress } from '@/game/rewards';
import type { PlayerLook, Progress, ResultResponse } from '@/types';

const MAX_BODY = '64kb';
const MAX_REPLAY = '4mb';
const MAX_SETTINGS = '16kb';
const GUESTS_PER_HOUR = 30;
/** Finished games a player can send in an hour (each is played through again). */
const RESULTS_PER_HOUR = 240;

/** What the API works with. */
export interface ApiDeps {
    store: Store | null;
    verifier: Verifier | null;
    catalog: Catalog;
    turns: Turns;
}

/** SHA-256 of a token, as stored. */
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

/** A finite number clamped to [lo, hi], or the fallback. */
function num(v: unknown, lo: number, hi: number, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/** A whole number clamped to [lo, hi]. */
const int = (v: unknown, lo: number, hi: number, fallback = 0) => Math.round(num(v, lo, hi, fallback));

/** A display name: printable, trimmed, 1 to 24 characters. */
function playerName(v: unknown): string {
    const s = String(v ?? '')
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>]/g, '')
        .trim()
        .slice(0, 24);
    if (!s) throw new HttpError(400, 'Bad name');
    return s;
}

/** A name for a new guest. */
const guestName = () => `Guest-${randomBytes(2).toString('hex').toUpperCase()}`;

/** A request's JSON body as an object (empty when there was none). */
const body = (req: Request) => (req.body ?? {}) as Record<string, unknown>;

/** The `limit` query parameter, 1 to `max`. */
const limitOf = (req: Request, def: number, max: number) => int(req.query.limit ?? def, 1, max, def);

/** Why a look can't be worn by a player with this progress (a fairy not unlocked, a style not reached), or null. */
function lookRefusal(p: Progress, look: PlayerLook): string | null {
    if (!fairyOpen(p, look.avatar)) return 'That fairy is locked';
    const frame = FRAMES.find(f => f.id === look.frame),
        bubble = BUBBLES.find(b => b.id === look.bubble);
    if (!frame || !bubble) return 'No such style';
    const best = p.bestTrophies ?? 0;
    if (best < frame.trophies || best < bubble.trophies) return 'Reach more trophies to wear that';
    return null;
}

/** The least time between one player's messages (ms), and the most they may post a minute. */
const CHAT_GAP = 1500;
const CHAT_PER_MINUTE = 12;

/** The chat channel a request names, or a 404 (unknown, switched off or deleted). */
async function chatChannel(s: Store, req: Request): Promise<ChannelRef> {
    const code = String(req.params.channel);
    const id = await s.channelId(code);
    if (id == null) throw new HttpError(404, 'No such chat channel');
    return { code, id };
}

/** The player a token belongs to (a WebSocket sends one to be known), or null. */
export async function playerForToken(store: Store, token: unknown): Promise<PlayerRef | null> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) return null;
    return store.playerByToken(hashToken(token));
}

/** The /api router. */
export function apiRouter({ store, verifier, catalog, turns }: ApiDeps): Router {
    const api = express.Router();
    /** Guests made per address in the current hour, and games sent per player. */
    const made = new Map<string, number>();
    const sent = new Map<string, number>();
    /** When each player last posted to chat (ms), over the last minute. */
    const chatSent = new Map<number, number[]>();
    let hour = 0;
    const small = express.json({ limit: MAX_BODY });

    /** The current hour; the counts start again with each. */
    const thisHour = () => {
        const h = Math.floor(Date.now() / 3.6e6);
        if (h !== hour) {
            hour = h;
            made.clear();
            sent.clear();
        }
        return h;
    };

    /** The store, or a 503 when there's no database. */
    const db = (): Store => {
        if (!store) throw new HttpError(503, 'No database');
        return store;
    };

    /** The signed-in player (set by the auth step before the routes that need one). */
    const me = (res: Response) => res.locals.player as PlayerRef;

    /** Check a finished game and count it: the progress it makes, the replay, and the history or leaderboard. */
    async function countResult(s: Store, p: PlayerRef, replay: unknown): Promise<ResultResponse> {
        const r = replay as { rounds?: unknown; at?: unknown; sim?: unknown } | null;
        if (!r || typeof r !== 'object' || !Array.isArray(r.rounds)) throw new HttpError(400, 'Bad replay');
        if (!verifier) throw new HttpError(503, 'The server cannot check games yet (build the game)');
        const key = `${thisHour()}:${p.id}`;
        const n = (sent.get(key) ?? 0) + 1;
        sent.set(key, n);
        if (n > RESULTS_PER_HOUR) throw new HttpError(429, 'Too many games sent; try later');
        const recorded = int(r.at, 0, 8.64e15);
        if (recorded && (await s.hasReplay(p.id, recorded))) throw new HttpError(409, 'Already counted');
        const saved = await s.getProgress(p.id);
        const v = await verifier.verify(replay, saved?.data ?? null, catalog.off());
        if (!v.ok) throw new HttpError(422, v.error, !!v.stale);
        await s.setProgress(p.id, v.progress);
        const kept = await s.addReplay(p.id, {
            mode: v.outcome.mode,
            map: v.map,
            version: String(r.sim ?? '').slice(0, 16),
            seconds: v.seconds,
            recorded: recorded || null,
            data: replay,
        });
        let rank = null;
        if (v.outcome.mode === 'endless') {
            rank = await s.addEndless(p.id, {
                seconds: v.outcome.endless?.seconds ?? 0,
                guardians: v.outcome.endless?.guardians ?? 0,
                fairy: v.fairies[0],
                map: v.map,
                bestChain: v.outcome.bestChain,
                replayId: kept.id,
            });
        } else {
            const [won, lost] = v.outcome.wins;
            await s.addMatch(p.id, {
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
                replayId: kept.id,
            });
        }
        return {
            progress: v.progress,
            outcome: v.outcome,
            trophyDelta: v.trophyDelta,
            unlocked: v.unlocked,
            newStages: v.newStages,
            endlessNew: v.endlessNew,
            code: kept.code,
            rank,
        };
    }

    // Answers are never cached, and CORS is open: the API takes a bearer token, never cookies.
    api.use((req, res, next) => {
        res.set({ 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
        if (req.method !== 'OPTIONS') return next();
        res.set({
            'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
            'access-control-allow-headers': 'authorization, content-type',
            'access-control-max-age': '86400',
        });
        res.status(204).end();
    });

    api.get('/health', (_req, res) => {
        res.json({ ok: true, db: store?.kind ?? null });
    });
    api.get('/catalog', (_req, res) => {
        res.json(catalog.response());
    });
    // The pictures: their URLs carry the art's version, so a browser keeps each for good.
    api.get('/art/:kind/:file', async (req, res) => {
        const m = /^([a-z0-9_-]{1,16})\.png$/.exec(String(req.params.file));
        const kind = String(req.params.kind);
        if (!m || (kind !== 'characters' && kind !== 'monsters')) throw new HttpError(404, 'No such picture');
        const s = db();
        const png = kind === 'characters' ? await s.characterSheet(m[1]) : await s.monsterSheet(m[1]);
        if (!png) throw new HttpError(404, 'No such picture');
        res.set({ 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' });
        res.send(png);
    });
    api.post('/guest', small, async (req, res) => {
        const s = db();
        thisHour();
        const ip = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '')
            .split(',')[0]
            .trim();
        const n = (made.get(ip) ?? 0) + 1;
        made.set(ip, n);
        if (n > GUESTS_PER_HOUR) throw new HttpError(429, 'Too many new players from here; try later');
        const name = body(req).name;
        const token = randomBytes(32).toString('base64url');
        const p = await s.createPlayer(hashToken(token), name ? playerName(name) : guestName());
        res.status(201).json({ ...p, token });
    });
    api.get('/leaderboard/endless', async (req, res) => {
        res.json(await db().leaderboard(limitOf(req, 10, 100)));
    });
    api.get('/replays/:code', async (req, res) => {
        const code = String(req.params.code);
        const r = /^[A-Z0-9]{10}$/.test(code) ? await db().getReplay(code) : null;
        if (!r) throw new HttpError(404, 'No such replay');
        res.json(r);
    });

    api.get('/chat/:channel', async (req, res) => {
        const channel = await chatChannel(db(), req);
        res.json(await db().chat(channel, int(req.query.after, 0, Number.MAX_SAFE_INTEGER), limitOf(req, 50, 100)));
    });

    // Everything below is a player's own: the bearer token says whose.
    api.use(async (req: Request, res: Response, next: NextFunction) => {
        const m = /^Bearer\s+([A-Za-z0-9_-]{20,128})$/.exec(req.headers.authorization ?? '');
        const p = m ? await db().playerByToken(hashToken(m[1])) : null;
        if (!p) throw new HttpError(401, 'Unknown player');
        res.locals.player = p;
        next();
    });

    api.get('/me', async (_req, res) => {
        const s = db(),
            p = me(res);
        const [progress, settings, endless, look] = await Promise.all([
            s.getProgress(p.id),
            s.getSettings(p.id),
            s.endlessRank(p.id),
            s.lookOf(p.id),
        ]);
        res.json({ ...p, progress, settings, endless, look });
    });
    api.put('/me', small, async (req, res) => {
        const p = me(res);
        const name = playerName(body(req).name);
        await db().rename(p.id, name);
        res.json({ id: p.id, name });
    });
    api.put('/me/look', small, async (req, res) => {
        const s = db(),
            p = me(res),
            b = body(req);
        const progress = (await s.getProgress(p.id))?.data ?? freshProgress();
        const look = { avatar: String(b.avatar ?? ''), frame: String(b.frame ?? ''), bubble: String(b.bubble ?? '') };
        const why = lookRefusal(progress, look);
        if (why) throw new HttpError(403, why);
        await s.setLook(p.id, look);
        res.json(look);
    });
    api.put('/me/settings', express.json({ limit: MAX_SETTINGS }), async (req, res) => {
        const b = body(req);
        if (!b.data || typeof b.data !== 'object') throw new HttpError(400, 'Bad settings');
        res.json(await db().putSettings(me(res).id, b.data, int(b.savedAt, 0, 8.64e15)));
    });
    api.post('/results', express.json({ limit: MAX_REPLAY }), async (req, res) => {
        const s = db(),
            p = me(res);
        res.status(201).json(await turns.run(p.id, () => countResult(s, p, body(req).replay)));
    });
    api.post('/me/reset', async (_req, res) => {
        const s = db(),
            p = me(res);
        const progress: Progress = freshProgress();
        await turns.run(p.id, () => s.setProgress(p.id, progress));
        res.json({ progress });
    });
    api.get('/me/matches', async (req, res) => {
        res.json(await db().recentMatches(me(res).id, limitOf(req, 20, 200)));
    });
    api.get('/me/history', async (req, res) => {
        res.json(await db().history(me(res).id, limitOf(req, 30, 200)));
    });
    api.post('/chat/:channel', small, async (req, res) => {
        const channel = await chatChannel(db(), req),
            p = me(res);
        // At most one message every CHAT_GAP ms, and CHAT_PER_MINUTE a minute.
        const now = Date.now();
        const sent = (chatSent.get(p.id) ?? []).filter(t => now - t < 60_000);
        if (sent.length && now - sent[sent.length - 1] < CHAT_GAP) throw new HttpError(429, 'Slow down a little');
        if (sent.length >= CHAT_PER_MINUTE) throw new HttpError(429, 'Too many messages; wait a moment');
        const text = cleanChat(body(req).body);
        if (!text) throw new HttpError(400, `Say something (up to ${CHAT_MAX} characters)`);
        sent.push(now);
        chatSent.set(p.id, sent);
        res.status(201).json(await db().addChat(p, channel, text));
    });
    api.get('/me/replays', async (req, res) => {
        res.json(await db().listReplays(me(res).id, limitOf(req, 20, 200)));
    });
    // The old ways of sending progress and results: the server works them out itself now.
    const gone = () => {
        throw new HttpError(410, 'Send finished games to /api/results; the server works out progress');
    };
    api.put('/me/progress', gone);
    api.post(['/matches', '/endless', '/replays'], gone);

    api.use(() => {
        throw new HttpError(404, 'Not found');
    });
    api.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
        const err = e as { status?: number; type?: string };
        if (e instanceof HttpError) {
            res.status(e.status).json({ error: e.message, ...(e.stale ? { stale: true } : {}) });
        } else if (err.type === 'entity.too.large') {
            res.status(413).json({ error: 'Too large' });
        } else if (err.type === 'entity.parse.failed') {
            res.status(400).json({ error: 'Bad JSON' });
        } else {
            console.error('API error:', e);
            res.status(500).json({ error: 'Server error' });
        }
    });
    return api;
}
