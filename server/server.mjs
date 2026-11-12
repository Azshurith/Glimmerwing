// Glimmerwing online relay. Zero dependencies: plain Node (18+).
//
//   node server/server.mjs            # listens on PORT or 8787
//
// It serves dist/index.html at "/" and runs a WebSocket relay at "/ws".
// The server never simulates anything: each player's browser runs its own
// meadow and the server only pairs players and forwards their messages.
//
// Client -> server            Server -> client
//   {t:'quick', v}              {t:'queued'}
//   {t:'host', v}               {t:'hosted', code}
//   {t:'join', v, code}         {t:'matched', host, code}
//   {t:'leave'}                 {t:'error', msg}
//   {t:'msg', d}  (relayed)     {t:'msg', d}
//                               {t:'peerLeft'}

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
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

function pair(a, b, code = '') {
    unlist(a);
    unlist(b);
    a.peer = b;
    b.peer = a;
    send(a, { t: 'matched', host: true, code });
    send(b, { t: 'matched', host: false, code });
}

function leave(c) {
    unlist(c);
    const p = c.peer;
    if (p) {
        p.peer = null;
        send(p, { t: 'peerLeft' });
    }
    c.peer = null;
}

function handle(c, m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
        case 'msg':
            if (c.peer) send(c.peer, { t: 'msg', d: m.d });
            return;
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
        case 'leave':
            leave(c);
            return;
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

server.listen(PORT, () => console.log(`Glimmerwing server on http://localhost:${PORT}  (WebSocket at /ws)`));
