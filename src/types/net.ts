import type { Outgoing } from './game';

/** Messages exchanged between the two players' games (relayed by the server). */
export type PeerMsg =
  | { k: 'sel'; i: number; done: boolean; id: string }
  | { k: 'round'; seed: number; wins: [number, number] }
  | { k: 'snap'; r: number; s: unknown }
  | { k: 'atk'; r: number; o: Outgoing }
  | { k: 'dead'; r: number }
  | { k: 'end'; hostDead: boolean; guestDead: boolean }
  | { k: 'ping'; t: number }
  | { k: 'pong'; t: number };

export type NetEvent =
  | { t: 'open' }
  | { t: 'queued' }
  | { t: 'hosted'; code: string }
  | { t: 'matched'; host: boolean; code: string }
  | { t: 'error'; msg: string }
  | { t: 'peerLeft' }
  | { t: 'closed' }
  | { t: 'msg'; d: PeerMsg };

export interface FieldSnapshot {
  t: number;
  ri: number;
  ns: number;
  cw: number;
  g: number;
  fv: number;
  sh: number;
  bl: number;
  ba: { x: number; y: number };
  bc: number;
  p: unknown;
  s: unknown[];
  pf: unknown[];
  bu: unknown[];
  at: unknown[];
  bt: unknown[];
  m: unknown;
  cr: unknown[];
  pu: unknown[];
}
