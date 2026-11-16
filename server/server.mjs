// Glimmerwing server: plain Node (18+); the database driver (mysql2) is loaded only when a database is set.
//
//   node server/server.mjs            # listens on PORT or 8787
//
// It serves dist/index.html at "/", the game's API at "/api" (see api.mjs; saves go to the database set up in
// db.mjs) and online matches over a WebSocket at "/ws".
//
// The server runs every online match itself (src/server/online.ts, bundled as dist/online.mjs): it pairs two
// players, steps their rounds 60 times a second from the controls each browser sends, and sends both the
// controls it used, so their browsers play the very same rounds; it decides the knockouts and the result, and
// counts the match for both players.
//
// Client -> server                  Server -> client
//   {t:'quick', v, token?}            {t:'queued'}
//   {t:'host', v, token?}             {t:'hosted', code}
//   {t:'join', v, code, token?}       {t:'matched', seat, code}       seat 0 made the room / queued first
//   {t:'leave'}                       {t:'error', msg}
//   {t:'sel', i, done, id}            {t:'sel', i, done, id}          the rival's cursor on fairy select
//   {t:'in', c}  (packed controls)    {t:'round', n, seed, map, fairies, wins}
//   {t:'ping', at}                    {t:'f', n, k, fr}               steps k… of round n: [c0, c1] or null
//                                     {t:'end', n, steps, winner, wins}
//                                     {t:'result', wins, progress, trophyDelta, unlocked, newStages, code}
//                                     {t:'pong', at} {t:'peerLeft'}

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, playerForToken } from './api.mjs';
import { openStore } from './db.mjs';
import { createVerifier } from './verifier.mjs';

const PORT = Number(process.env.PORT) || 8787;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'dist', 'index.html');
const MAX_MSG = 64 * 1024;
const ROOM_TTL = 10 * 60 * 1000; // an unanswered friend room expires after 10 minutes

/** Every open connection. */
const clients = new Set();
/** Quick-match queue, one waiting player per protocol version. */
const queue = new Map();
/** Friend rooms waiting for a second player: code -> { host, v, at } */
const rooms = new Map();

// ---- HTTP ------------------------------------------------------------------

const store = await openStore();
const verifier = store ? createVerifier() : null;
const handleApi = createApi(store, verifier);
/** The online match engine (the game's own simulation), once the game has been built. */
const ONLINE = join(ROOT, 'dist', 'online.mjs');
const { OnlineMatch } = existsSync(ONLINE) ? await import(new URL(`file://${ONLINE}`).href) : { OnlineMatch: null };
if (!OnlineMatch) console.warn('No dist/online.mjs: build the game to play online.');
/** Matches being played. */
const matches = new Set();

const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        void handleApi(req, res, url);
        return;
    }
    if (url.pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, players: clients.size, waiting: queue.size, rooms: rooms.size }));
        return;
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
        if (!existsSync(INDEX)) {
            res.writeHead(404);
            res.end('Run "npm run build" first.');
            return;
        }
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
        res.end(readFileSync(INDEX));
        return;
    }
    // The installable-app files next to the page.
    const APP_FILES = {
        '/guide.html': ['text/html; charset=utf-8', 'no-cache'],
        '/manifest.webmanifest': ['application/manifest+json', 'no-cache'],
        '/sw.js': ['text/javascript; charset=utf-8', 'no-cache'],
        '/icon-192.png': ['image/png', 'public, max-age=86400'],
        '/icon-512.png': ['image/png', 'public, max-age=86400'],
    };
    const app = APP_FILES[url.pathname];
    if (app) {
        const file = join(ROOT, 'dist', url.pathname.slice(1));
        if (!existsSync(file)) {
            res.writeHead(404);
            res.end('Run "npm run build" first.');
            return;
        }
        res.writeHead(200, { 'content-type': app[0], 'cache-control': app[1] });
        res.end(readFileSync(file));
        return;
    }
    res.writeHead(404);
    res.end('Not found');
});

// ---- WebSocket (RFC 6455, just what browsers need) -------------------------

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!req.url?.startsWith('/ws') || !key) {
        socket.destroy();
        return;
    }
    const accept = createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    socket.setNoDelay(true);
    const c = { socket, peer: null, alive: true, buf: Buffer.alloc(0), frag: [], closed: false };
    clients.add(c);
    socket.on('data', d => onData(c, d));
    socket.on('close', () => drop(c));
    socket.on('error', () => drop(c));
});

function frame(opcode, payload) {
    const n = payload.length;
    const head =
        n < 126
            ? Buffer.from([0x80 | opcode, n])
            : n < 65536
              ? Buffer.from([0x80 | opcode, 126, n >> 8, n & 255])
              : (() => {
                    const b = Buffer.alloc(10);
                    b[0] = 0x80 | opcode;
                    b[1] = 127;
                    b.writeBigUInt64BE(BigInt(n), 2);
                    return b;
                })();
    return Buffer.concat([head, payload]);
}

function send(c, obj) {
    if (c.closed) return;
    c.socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
}

function onData(c, data) {
    c.buf = Buffer.concat([c.buf, data]);
    for (;;) {
        const b = c.buf;
        if (b.length < 2) return;
        const fin = b[0] & 0x80,
            op = b[0] & 0x0f,
            masked = b[1] & 0x80;
        let len = b[1] & 0x7f,
            off = 2;
        if (len === 126) {
            if (b.length < 4) return;
            len = b.readUInt16BE(2);
            off = 4;
        } else if (len === 127) {
            if (b.length < 10) return;
            len = Number(b.readBigUInt64BE(2));
            off = 10;
        }
        if (len > MAX_MSG) {
            drop(c);
            return;
        }
        const need = off + (masked ? 4 : 0) + len;
        if (b.length < need) return;
        let payload = b.subarray(off + (masked ? 4 : 0), need);
        if (masked) {
            const m = b.subarray(off, off + 4);
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++) payload[i] ^= m[i & 3];
        }
        c.buf = b.subarray(need);
        if (op === 8) {
            drop(c);
            return;
        } // close
        if (op === 9) {
            c.socket.write(frame(10, payload));
            continue;
        } // ping -> pong
        if (op === 10) {
            c.alive = true;
            continue;
        } // pong
        if (op === 1 || op === 0) {
            c.frag.push(payload);
            if (!fin) continue;
            const text = Buffer.concat(c.frag).toString('utf8');
            c.frag = [];
            let msg;
            try {
                msg = JSON.parse(text);
            } catch {
                continue;
            }
            handle(c, msg);
        }
    }
}

// ---- Matchmaking -----------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
function newCode() {
    for (;;) {
        let s = '';
        for (let i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        if (!rooms.has(s)) return s;
    }
}

function unlist(c) {
    for (const [v, w] of queue) if (w === c) queue.delete(v);
    for (const [code, r] of rooms) if (r.host === c) rooms.delete(code);
}

/** What an online match needs from the server: the players' records, and counting a finished match. */
const hooks = {
    async loadProgress(id) {
        return (await store?.getProgress(id))?.data ?? null;
    },
    async saveResult(id, r) {
        if (!store) return null;
        return handleApi.inTurn(id, async () => {
            await store.setProgress(id, r.progress);
            const [won, lost] = r.outcome.wins;
            await store.addMatch(id, {
                mode: 'online',
                map: r.map,
                fairy: r.fairies[0],
                rivalFairy: r.fairies[1],
                roundsWon: won,
                roundsLost: lost,
                won: won > lost,
                bestChain: r.outcome.bestChain,
                trophyDelta: r.trophyDelta,
                seconds: r.seconds,
            });
            return store.addReplay(id, {
                mode: 'online',
                map: r.map,
                version: r.replay.sim,
                seconds: r.seconds,
                recorded: r.replay.at,
                data: r.replay,
            });
        });
    },
};

/** Two players found each other: start a match the server runs. */
function pair(a, b, code = '') {
    unlist(a);
    unlist(b);
    if (!OnlineMatch) {
        for (const c of [a, b]) send(c, { t: 'error', msg: 'Online play is not ready on this server' });
        return;
    }
    a.peer = b;
    b.peer = a;
    const seat = c => ({ send: msg => send(c, msg), player: c.player });
    const match = new OnlineMatch([seat(a), seat(b)], hooks);
    matches.add(match);
    a.match = b.match = match;
    a.seat = 0;
    b.seat = 1;
    send(a, { t: 'matched', seat: 0, code, rival: b.player?.name ?? null });
    send(b, { t: 'matched', seat: 1, code, rival: a.player?.name ?? null });
}

/** Leave the queue, a room or a match (the rival is told; a match in play is forfeited). */
function leave(c) {
    unlist(c);
    const m = c.match;
    if (m) {
        m.leave(c.seat);
        matches.delete(m);
        if (c.peer) {
            c.peer.peer = null;
            c.peer.match = null;
        }
    }
    c.match = null;
    c.peer = null;
}

/** Who a connection belongs to, from the account token it sent (none for a guest the server doesn't know). */
async function identify(c, token) {
    if (!store || typeof token !== 'string' || c.player !== undefined) return;
    c.player = (await playerForToken(store, token)) ?? null;
}

function handle(c, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
        case 'in':
            c.match?.input(c.seat, m.c);
            return;
        case 'sel':
            c.match?.select(c.seat, Number(m.i) | 0, !!m.done, String(m.id ?? ''));
            return;
        case 'ping':
            send(c, { t: 'pong', at: m.at });
            return;
        case 'quick':
        case 'host':
        case 'join':
            // Know who's playing first, so the match can count for them.
            void identify(c, m.token).then(() => matchmake(c, m));
            return;
        case 'leave':
            leave(c);
            return;
    }
}

/** Queue, open a room or join one. */
function matchmake(c, m) {
    if (c.closed) return;
    switch (m.t) {
        case 'quick': {
            leave(c);
            const v = String(m.v ?? '');
            const w = queue.get(v);
            if (w && w !== c && !w.closed) pair(w, c);
            else {
                queue.set(v, c);
                send(c, { t: 'queued' });
            }
            return;
        }
        case 'host': {
            leave(c);
            const code = newCode();
            rooms.set(code, { host: c, v: String(m.v ?? ''), at: Date.now() });
            send(c, { t: 'hosted', code });
            return;
        }
        case 'join': {
            const code = String(m.code ?? '')
                .toUpperCase()
                .trim();
            const r = rooms.get(code);
            if (!r || r.host.closed) {
                send(c, { t: 'error', msg: `No room called ${code || '(blank)'}` });
                return;
            }
            if (r.host === c) {
                send(c, { t: 'error', msg: 'That is your own room' });
                return;
            }
            if (r.v !== String(m.v ?? '')) {
                send(c, { t: 'error', msg: 'Your rival is on a different version of the game' });
                return;
            }
            leave(c);
            rooms.delete(code);
            pair(r.host, c, code);
            return;
        }
    }
}

function drop(c) {
    if (c.closed) return;
    c.closed = true;
    leave(c);
    clients.delete(c);
    c.socket.destroy();
}

// Keep connections alive through proxies and reap dead ones and stale rooms.
setInterval(() => {
    for (const c of clients) {
        if (!c.alive) {
            drop(c);
            continue;
        }
        c.alive = false;
        c.socket.write(frame(9, Buffer.alloc(0)));
    }
    const now = Date.now();
    for (const [code, r] of rooms)
        if (now - r.at > ROOM_TTL) {
            send(r.host, { t: 'error', msg: 'Room expired' });
            rooms.delete(code);
        }
}, 20000);

// Step every match 60 times a second, on the clock: missed steps are caught up (a few at most).
const STEP_MS = 1000 / 60;
let last = performance.now(),
    behind = 0;
setInterval(() => {
    const now = performance.now();
    behind = Math.min(behind + (now - last), STEP_MS * 6);
    last = now;
    while (behind >= STEP_MS) {
        behind -= STEP_MS;
        for (const m of matches) {
            if (m.closed) matches.delete(m);
            else m.tick();
        }
    }
}, 4);

server.listen(PORT, () =>
    console.log(
        `Glimmerwing server on http://localhost:${PORT}  (WebSocket at /ws, API at /api, ` +
            `${store ? `saves in ${store.kind}` : 'no database: saves stay in the browser'})`,
    ),
);

// Close the database cleanly when docker stops the container.
for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => {
        server.close();
        Promise.resolve(store?.close()).finally(() => process.exit(0));
    });
