// Online matches over a WebSocket at /ws. The server runs every online match itself (src/server/online.ts): it
// pairs two players, steps their rounds 60 times a second from the controls each browser sends, and sends both
// the controls it used, so their browsers play the very same rounds; it decides the knockouts and the result, and
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
import { createHash } from 'node:crypto';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { playerForToken } from './api';
import type { Catalog } from './catalog';
import type { PlayerRef, Store } from './store';
import type { Turns } from './turns';
import { OnlineMatch } from '@/server/online';
import type { OnlineHooks, Seat } from '@/server/online';

const MAX_MSG = 64 * 1024;
/** An unanswered friend room expires after 10 minutes. */
const ROOM_TTL = 10 * 60 * 1000;
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O
const STEP_MS = 1000 / 60;

/** One open connection. */
interface Conn {
    socket: Duplex;
    peer: Conn | null;
    alive: boolean;
    buf: Buffer;
    frag: Buffer[];
    closed: boolean;
    /** Who's playing (undefined until they've said; null for a guest the server doesn't know). */
    player?: PlayerRef | null;
    match: OnlineMatch | null;
    seat: 0 | 1;
}

/** A message from a browser (anything: it's checked as it's used). */
type Msg = Record<string, unknown>;

/** What the relay needs from the rest of the server. */
export interface RelayDeps {
    store: Store | null;
    turns: Turns;
    catalog: Catalog;
}

/** A WebSocket frame. */
function frame(opcode: number, payload: Buffer): Buffer {
    const n = payload.length;
    let head: Buffer;
    if (n < 126) head = Buffer.from([0x80 | opcode, n]);
    else if (n < 65536) head = Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]);
    else {
        head = Buffer.alloc(10);
        head[0] = 0x80 | opcode;
        head[1] = 127;
        head.writeBigUInt64BE(BigInt(n), 2);
    }
    return Buffer.concat([head, payload]);
}

/** The WebSocket relay (RFC 6455, just what browsers need), matchmaking, and the matches being played. */
export class Relay {
    private clients = new Set<Conn>();
    /** The quick-match queue: one waiting player per game version. */
    private queue = new Map<string, Conn>();
    /** Friend rooms waiting for a second player. */
    private rooms = new Map<string, { host: Conn; v: string; at: number }>();
    private matches = new Set<OnlineMatch>();
    private timers: NodeJS.Timeout[] = [];
    private hooks: OnlineHooks;

    constructor(
        server: Server,
        private deps: RelayDeps,
    ) {
        const { store, turns, catalog } = deps;
        this.hooks = {
            loadProgress: async id => (await store?.getProgress(id))?.data ?? null,
            saveResult: async (id, r) => {
                if (!store) return null;
                return turns.run(id, async () => {
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
            fairyOn: id => catalog.fairyOn(id),
            mapOn: id => catalog.mapOn(id),
        };
        server.on('upgrade', (req: IncomingMessage, socket: Duplex) => this.upgrade(req, socket));
        this.timers.push(setInterval(() => this.reap(), 20000));
        this.timers.push(this.ticker());
    }

    /** How many are connected, waiting and hosting (for /health). */
    get counts() {
        return { players: this.clients.size, waiting: this.queue.size, rooms: this.rooms.size };
    }

    /** Stop the clocks. */
    stop(): void {
        for (const t of this.timers) clearInterval(t);
    }

    /** A browser asking for a WebSocket. */
    private upgrade(req: IncomingMessage, socket: Duplex): void {
        const key = req.headers['sec-websocket-key'];
        if (!req.url?.startsWith('/ws') || typeof key !== 'string') {
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
        (socket as Duplex & { setNoDelay?: (b: boolean) => void }).setNoDelay?.(true);
        const c: Conn = {
            socket,
            peer: null,
            alive: true,
            buf: Buffer.alloc(0),
            frag: [],
            closed: false,
            match: null,
            seat: 0,
        };
        this.clients.add(c);
        socket.on('data', (d: Buffer) => this.onData(c, d));
        socket.on('close', () => this.drop(c));
        socket.on('error', () => this.drop(c));
    }

    /** Send a message. */
    private send(c: Conn, obj: object): void {
        if (!c.closed) c.socket.write(frame(1, Buffer.from(JSON.stringify(obj))));
    }

    /** Frames arriving from a browser. */
    private onData(c: Conn, data: Buffer): void {
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
                this.drop(c);
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
                this.drop(c); // close
                return;
            }
            if (op === 9) {
                c.socket.write(frame(10, payload)); // ping -> pong
                continue;
            }
            if (op === 10) {
                c.alive = true; // pong
                continue;
            }
            if (op === 1 || op === 0) {
                c.frag.push(payload);
                if (!fin) continue;
                const text = Buffer.concat(c.frag).toString('utf8');
                c.frag = [];
                let msg: unknown;
                try {
                    msg = JSON.parse(text);
                } catch {
                    continue;
                }
                if (msg && typeof msg === 'object') this.handle(c, msg as Msg);
            }
        }
    }

    /** A message from a browser. */
    private handle(c: Conn, m: Msg): void {
        switch (m.t) {
            case 'in':
                c.match?.input(c.seat, m.c);
                return;
            case 'sel':
                c.match?.select(c.seat, Number(m.i) | 0, !!m.done, String(m.id ?? ''));
                return;
            case 'ping':
                this.send(c, { t: 'pong', at: m.at });
                return;
            case 'quick':
            case 'host':
            case 'join':
                if (!this.deps.catalog.modeOn('online')) {
                    this.send(c, { t: 'error', msg: 'Online play is switched off right now' });
                    return;
                }
                // Know who's playing first, so the match can count for them.
                void this.identify(c, m.token).then(() => this.matchmake(c, m));
                return;
            case 'leave':
                this.leave(c);
                return;
        }
    }

    /** Who a connection belongs to, from the account token it sent. */
    private async identify(c: Conn, token: unknown): Promise<void> {
        if (!this.deps.store || c.player !== undefined) return;
        c.player = await playerForToken(this.deps.store, token);
    }

    /** A new friend-room code. */
    private newCode(): string {
        for (;;) {
            let s = '';
            for (let i = 0; i < 4; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
            if (!this.rooms.has(s)) return s;
        }
    }

    /** Take a connection off the queue and out of any room it hosts. */
    private unlist(c: Conn): void {
        for (const [v, w] of this.queue) if (w === c) this.queue.delete(v);
        for (const [code, r] of this.rooms) if (r.host === c) this.rooms.delete(code);
    }

    /** Two players found each other: start a match the server runs. */
    private pair(a: Conn, b: Conn, code = ''): void {
        this.unlist(a);
        this.unlist(b);
        a.peer = b;
        b.peer = a;
        const seat = (c: Conn): Seat => ({ send: msg => this.send(c, msg), player: c.player ?? null });
        const match = new OnlineMatch([seat(a), seat(b)], this.hooks);
        this.matches.add(match);
        a.match = b.match = match;
        a.seat = 0;
        b.seat = 1;
        this.send(a, { t: 'matched', seat: 0, code, rival: b.player?.name ?? null });
        this.send(b, { t: 'matched', seat: 1, code, rival: a.player?.name ?? null });
    }

    /** Leave the queue, a room or a match (the rival is told; a match in play is forfeited). */
    private leave(c: Conn): void {
        this.unlist(c);
        const m = c.match;
        if (m) {
            m.leave(c.seat);
            this.matches.delete(m);
            if (c.peer) {
                c.peer.peer = null;
                c.peer.match = null;
            }
        }
        c.match = null;
        c.peer = null;
    }

    /** Queue, open a room or join one. */
    private matchmake(c: Conn, m: Msg): void {
        if (c.closed) return;
        const v = String(m.v ?? '');
        if (m.t === 'quick') {
            this.leave(c);
            const w = this.queue.get(v);
            if (w && w !== c && !w.closed) this.pair(w, c);
            else {
                this.queue.set(v, c);
                this.send(c, { t: 'queued' });
            }
        } else if (m.t === 'host') {
            this.leave(c);
            const code = this.newCode();
            this.rooms.set(code, { host: c, v, at: Date.now() });
            this.send(c, { t: 'hosted', code });
        } else if (m.t === 'join') {
            const code = String(m.code ?? '')
                .toUpperCase()
                .trim();
            const r = this.rooms.get(code);
            if (!r || r.host.closed) this.send(c, { t: 'error', msg: `No room called ${code || '(blank)'}` });
            else if (r.host === c) this.send(c, { t: 'error', msg: 'That is your own room' });
            else if (r.v !== v) this.send(c, { t: 'error', msg: 'Your rival is on a different version of the game' });
            else {
                this.leave(c);
                this.rooms.delete(code);
                this.pair(r.host, c, code);
            }
        }
    }

    /** A connection closed. */
    private drop(c: Conn): void {
        if (c.closed) return;
        c.closed = true;
        this.leave(c);
        this.clients.delete(c);
        c.socket.destroy();
    }

    /** Keep connections alive through proxies, and reap dead ones and stale rooms. */
    private reap(): void {
        for (const c of this.clients) {
            if (!c.alive) {
                this.drop(c);
                continue;
            }
            c.alive = false;
            c.socket.write(frame(9, Buffer.alloc(0)));
        }
        const now = Date.now();
        for (const [code, r] of this.rooms)
            if (now - r.at > ROOM_TTL) {
                this.send(r.host, { t: 'error', msg: 'Room expired' });
                this.rooms.delete(code);
            }
    }

    /** Step every match 60 times a second, on the clock: missed steps are caught up (a few at most). */
    private ticker(): NodeJS.Timeout {
        let last = performance.now(),
            behind = 0;
        return setInterval(() => {
            const now = performance.now();
            behind = Math.min(behind + (now - last), STEP_MS * 6);
            last = now;
            while (behind >= STEP_MS) {
                behind -= STEP_MS;
                for (const m of this.matches) {
                    if (m.closed) this.matches.delete(m);
                    else m.tick();
                }
            }
        }, 4);
    }
}
