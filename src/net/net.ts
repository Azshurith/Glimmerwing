import * as C from '@/core/config';
import type { NetEvent } from '@/types';

declare const __GW_SERVER__: string;

/**
 * Where the relay lives. In order: a `?server=` URL parameter, the server
 * baked in at build time (GW_SERVER), the page's own host when it was served
 * over http(s), and finally a local server for testing from a file.
 */
export function serverUrl(): string {
    const q = new URLSearchParams(location.search).get('server');
    if (q) return q;
    const baked = typeof __GW_SERVER__ === 'string' ? __GW_SERVER__ : '';
    if (baked) return baked;
    if (location.protocol === 'http:' || location.protocol === 'https:') {
        return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    }
    return C.LOCAL_SERVER;
}

/**
 * WebSocket client for online play: queueing and rooms, then the match the server runs (this player's picks and
 * controls go up; the rival's cursor, the rounds, their steps and the result come down). Events are queued and
 * read with `poll()`.
 */
export class Net {
    private ws: WebSocket | null = null;
    private queue: NetEvent[] = [];
    /** Round-trip time in seconds, smoothed. */
    rtt = 0.1;
    /** This player's seat in the match: 0 made the room or queued first (their meadow is on the left). */
    seat: 0 | 1 = 0;
    connected = false;
    /** The account token sent with a request to play, so the server counts the match for this player. */
    token: string | null = null;
    private pingT = 0;

    /** Open a connection to the relay; resolves once it is open. */
    connect(url = serverUrl()): Promise<void> {
        this.close();
        return new Promise((resolve, reject) => {
            let ws: WebSocket;
            try {
                ws = new WebSocket(url);
            } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
                return;
            }
            this.ws = ws;
            ws.onopen = () => {
                this.connected = true;
                this.queue.push({ t: 'open' });
                resolve();
            };
            ws.onerror = () => {
                if (!this.connected) reject(new Error(`Couldn't reach the server at ${url}`));
            };
            ws.onclose = () => {
                if (this.ws !== ws) return;
                const was = this.connected;
                this.connected = false;
                this.ws = null;
                if (was) this.queue.push({ t: 'closed' });
            };
            ws.onmessage = e => {
                let m: NetEvent;
                try {
                    m = JSON.parse(String(e.data)) as NetEvent;
                } catch {
                    return;
                }
                if (m.t === 'matched') this.seat = m.seat;
                // The ping's answer, read straight away so the frame loop doesn't hold it up.
                if (m.t === 'pong') {
                    const sample = (performance.now() - m.at) / 1000;
                    this.rtt = this.rtt * 0.7 + sample * 0.3;
                    return;
                }
                this.queue.push(m);
            };
        });
    }

    /** Send a message to the server if connected. */
    private raw(obj: object): void {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }

    /** Join the queue to be paired with the next player who does the same. */
    quick(): void {
        this.raw({ t: 'quick', v: C.NET_VERSION, token: this.token });
    }
    /** Create a friend room; the server answers with its code. */
    host(): void {
        this.raw({ t: 'host', v: C.NET_VERSION, token: this.token });
    }
    /** Join a friend's room by its code. */
    join(code: string): void {
        this.raw({ t: 'join', v: C.NET_VERSION, code, token: this.token });
    }
    /** Leave the queue or room. */
    leave(): void {
        this.raw({ t: 'leave' });
    }
    /** This player's cursor on fairy select, and their pick once made (the server passes it to the rival). */
    select(i: number, done: boolean, id: string): void {
        this.raw({ t: 'sel', i, done, id });
    }
    /** This player's controls now, packed (they hold on the server until the next ones). */
    input(c: number[]): void {
        this.raw({ t: 'in', c });
    }

    /** Put events back at the front of the queue (the lobby hands leftovers to the game). */
    requeue(events: NetEvent[]): void {
        this.queue = events.concat(this.queue);
    }

    /** Call once a frame: keeps the ping going and hands back what arrived. */
    poll(dt: number): NetEvent[] {
        this.pingT -= dt;
        if (this.pingT <= 0) {
            this.pingT = 1.5;
            this.raw({ t: 'ping', at: performance.now() });
        }
        const q = this.queue;
        this.queue = [];
        return q;
    }

    /** Close the connection and drop queued events. */
    close(): void {
        const ws = this.ws;
        this.ws = null;
        this.connected = false;
        this.queue = [];
        if (ws) {
            ws.onclose = null;
            ws.close();
        }
    }
}
