import { Progress } from './progress';
import { Guardian } from './types';

export type WingShape = 'round' | 'pointed' | 'moth' | 'leaf' | 'long' | 'crescent';

export interface Fairy {
  id: string;
  name: string;
  blurb: string;
  /** Glow and shot colour. */
  color: string;
  /** Hair/body accent. */
  accent: string;
  wing: WingShape;
  speed: number;      // movement multiplier
  burst: number;      // pollen burst radius multiplier
  charge: number;     // charge time multiplier (lower is faster)
  hitbox: number;     // hitbox multiplier (lower is harder to hit)
  feverTime: number;  // fever duration multiplier
  feverSpread: 3 | 5; // shots per volley during Fever
  counterBoost: number; // extra levels added when you bat a star back
  /** The guardian this fairy sends when her gauge fills. */
  guardian: Guardian;
  unlock: null | { hint: string; met: (p: Progress) => boolean };
}

export const FAIRIES: Fairy[] = [
  {
    id: 'pip', name: 'Pip', blurb: 'Even-tempered all-rounder',
    color: '#ffd86b', accent: '#f6a04d', wing: 'round',
    speed: 1, burst: 1, charge: 1, hitbox: 1, feverTime: 1, feverSpread: 3, counterBoost: 0, guardian: { name: 'Hearthbloom', color: '#ffc85c', pattern: 'aimed' },
    unlock: null,
  },
  {
    id: 'bramble', name: 'Bramblewick', blurb: 'Slow, but her bursts are huge',
    color: '#9be36b', accent: '#5a8f3a', wing: 'leaf',
    speed: 0.85, burst: 1.3, charge: 1.1, hitbox: 1.1, feverTime: 1, feverSpread: 3, counterBoost: 0, guardian: { name: 'Old Mossjaw', color: '#8fd16a', pattern: 'ring' },
    unlock: null,
  },
  {
    id: 'wisp', name: 'Wisp', blurb: 'Quick and tiny, small bursts',
    color: '#8fe9ff', accent: '#e8fbff', wing: 'pointed',
    speed: 1.2, burst: 0.85, charge: 1, hitbox: 0.7, feverTime: 1, feverSpread: 3, counterBoost: 0, guardian: { name: 'Glint', color: '#9be8ff', pattern: 'rapid' },
    unlock: null,
  },
  {
    id: 'clove', name: 'Clove', blurb: 'Charges her torpedo twice as fast',
    color: '#ff9db8', accent: '#c4527a', wing: 'long',
    speed: 1, burst: 1, charge: 0.5, hitbox: 1, feverTime: 1, feverSpread: 3, counterBoost: 0,
    guardian: { name: 'Petalfall', color: '#ff9db8', pattern: 'rain' },
    unlock: { hint: 'Win any match', met: p => p.wins >= 1 },
  },
  {
    id: 'sorrel', name: 'Sorrel', blurb: 'Stars she bats back hit far harder',
    color: '#ff8a5b', accent: '#ffd0a8', wing: 'crescent',
    speed: 1.05, burst: 0.95, charge: 1, hitbox: 1, feverTime: 1, feverSpread: 3, counterBoost: 1,
    guardian: { name: 'Emberwheel', color: '#ff8a5b', pattern: 'spiral' },
    unlock: { hint: 'Make a 10-chain', met: p => p.bestChain >= 10 },
  },
  {
    id: 'umbra', name: 'Umbra', blurb: 'Long Fevers with a five-way spread',
    color: '#c9a2ff', accent: '#5b3c8f', wing: 'moth',
    speed: 0.95, burst: 1, charge: 1, hitbox: 1, feverTime: 1.5, feverSpread: 5, counterBoost: 0,
    guardian: { name: 'Duskmother', color: '#b88cff', pattern: 'sweep' },
    unlock: { hint: 'Beat the CPU without dropping a round', met: p => p.flawless >= 1 },
  },
];

export const fairyById = (id: string): Fairy => FAIRIES.find(f => f.id === id) ?? FAIRIES[0];
