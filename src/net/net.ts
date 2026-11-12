import * as C from '../core/config';
import type { NetEvent, PeerMsg } from '../types';

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

export class Net {
  private ws: WebSocket | null = null;
  private queue: NetEvent[] = [];
  /** Round-trip time in seconds, smoothed. */
  rtt = 0.1;
  isHost = false;
  connected = false;
  private pingT = 0;

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
        if (m.t === 'matched') this.isHost = m.host;
        if (m.t === 'msg') {
          // Answer pings straight away so the reading isn't held up by the frame loop.
          if (m.d.k === 'ping') {
            this.peer({ k: 'pong', t: m.d.t });
            return;
          }
          if (m.d.k === 'pong') {
            const sample = (performance.now() - m.d.t) / 1000;
            this.rtt = this.rtt * 0.7 + sample * 0.3;
            return;
          }
        }
        this.queue.push(m);
      };
    });
  }

  private raw(obj: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  quick(): void {
    this.raw({ t: 'quick', v: C.NET_VERSION });
  }
  host(): void {
    this.raw({ t: 'host', v: C.NET_VERSION });
  }
  join(code: string): void {
    this.raw({ t: 'join', v: C.NET_VERSION, code });
  }
  leave(): void {
    this.raw({ t: 'leave' });
  }
  peer(d: PeerMsg): void {
    this.raw({ t: 'msg', d });
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
      this.peer({ k: 'ping', t: performance.now() });
    }
    const q = this.queue;
    this.queue = [];
    return q;
  }

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
