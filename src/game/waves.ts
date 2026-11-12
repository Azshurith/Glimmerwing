import * as C from '../core/config';
import type { Rng } from '../core/rng';
import type { CritterKind, WavePath, WaveSpec } from '../types';

const PATH_WEIGHTS: [WavePath, number, number][] = [
  // path, weight at the start of a round, weight once the round heats up
  ['arc', 3, 1.5],
  ['string', 3, 1.5],
  ['ring', 2, 1.5],
  ['leader', 1, 2],
  ['swoop', 1.5, 2],
  ['sweep', 1.5, 2],
  ['column', 1, 1.5],
  ['rise', 0, 1],
];

const pickWeighted = (r: Rng, pressure: number): WavePath => {
  const weights = PATH_WEIGHTS.map(([, a, b]) => a + (b - a) * pressure);
  let roll = r.next() * weights.reduce((s, w) => s + w, 0);
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return PATH_WEIGHTS[i][0];
  }
  return 'arc';
};

/** Shots needed for a puff, 1 to 5, getting tougher as the round goes on. */
const rollHp = (r: Rng, pressure: number): number => {
  const a = r.next(),
    b = r.next(),
    c = r.next(),
    d = r.next();
  return (
    1 +
    (a < 0.2 + pressure * 0.4 ? 1 : 0) +
    (b < pressure * 0.3 ? 1 : 0) +
    (c < pressure * 0.15 ? 1 : 0) +
    (d < pressure * 0.08 ? 1 : 0)
  );
};

export function rollWave(r: Rng, pressure: number): WaveSpec {
  // Draw every roll in the same order every time so both meadows stay in step.
  const path = pickWeighted(r, pressure);
  const kindRoll = r.next(),
    bigRoll = r.next(),
    bubbleRoll = r.next(),
    sideRoll = r.next();
  const cx = r.range(50, C.FIELD_W - 50);
  const lane = r.range(36, 110);
  const speed = r.range(26, 38) + pressure * 14;
  let count = r.int(4, 6) + Math.floor(pressure * 4);
  const hps = Array.from({ length: 12 }, () => rollHp(r, pressure));

  const drifting = path === 'arc' || path === 'string' || path === 'ring';
  const kind: CritterKind = !drifting
    ? 'puff'
    : kindRoll < 0.18 + pressure * 0.17
      ? 'beetle'
      : kindRoll < 0.36 + pressure * 0.24
        ? 'spinner'
        : 'puff';
  const big = kind === 'puff' && path !== 'rise' && bigRoll < 0.08 + pressure * 0.12;
  const bubble = kind === 'puff' && path !== 'leader' && bubbleRoll < 0.1 + pressure * 0.2;
  if (kind === 'beetle') count = Math.max(3, count - 2);
  if (big) count = Math.max(3, Math.ceil(count / 2));
  if (path === 'rise') count = Math.min(count, 5);

  let hp = hps.slice(0, count);
  if (path === 'leader') hp = hp.map((_, i) => (i === 0 ? Math.max(3, hps[0] + 1) : 1));
  else if (!drifting) hp = hp.map(h => Math.min(h, 2));
  if (kind === 'spinner') hp = hp.map(() => 1);
  if (kind === 'beetle') hp = hp.map(h => Math.min(h, 2));
  if (big) hp = hp.map(h => Math.min(5, h + 1));

  return { path, kind, speed, side: sideRoll < 0.5 ? -1 : 1, big, count, hp, bubble, cx, lane };
}
