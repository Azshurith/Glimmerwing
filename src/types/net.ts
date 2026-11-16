import type { Progress } from './progress';

/**
 * What the connection reports: the server's replies while finding a rival, and the match it runs. Steps arrive as
 * `[controls of seat 0, controls of seat 1]` (packed, see game/replay.ts packControls), or null for a step both
 * meadows were frozen.
 */
export type NetEvent =
    | { t: 'open' }
    | { t: 'queued' }
    | { t: 'hosted'; code: string }
    | { t: 'matched'; seat: 0 | 1; code: string; rival: string | null }
    | { t: 'error'; msg: string }
    | { t: 'peerLeft' }
    | { t: 'closed' }
    | { t: 'sel'; i: number; done: boolean; id: string }
    | { t: 'round'; n: number; seed: number; map: string; fairies: [string, string]; wins: [number, number] }
    | { t: 'f'; n: number; k: number; fr: (number[][] | null)[] }
    | { t: 'end'; n: number; steps: number; winner: number; wins: [number, number] }
    | {
          t: 'result';
          wins: [number, number];
          forfeit: boolean;
          progress: Progress | null;
          trophyDelta: number;
          unlocked: string[];
          newStages: string[];
          code: string | null;
      }
    | { t: 'pong'; at: number };
