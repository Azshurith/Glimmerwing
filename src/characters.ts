import { Progress } from './progress';
import { Bomb, ChargeStyle, Extra, Guardian } from './types';

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
  counterBoost: number; // extra levels added when you bat a star back
  /** The guardian this fairy sends when her gauge fills. */
  guardian: Guardian;
  /** What a level 2 charge sends. */
  extra: Extra;
  /** Her charge shot, and what it's called. */
  chargeStyle: ChargeStyle;
  chargeName: string;
  bomb: Bomb;
  unlock: null | { hint: string; met: (p: Progress) => boolean };
}

export const FAIRIES: Fairy[] = [
  {
    id: 'pip', name: 'Pip', blurb: 'Even-tempered all-rounder',
    color: '#ffd86b', accent: '#f6a04d', wing: 'round',
    speed: 1, burst: 1, charge: 1, hitbox: 1, feverTime: 1, counterBoost: 0, guardian: { name: 'Hearthbloom', color: '#ffc85c', pattern: 'aimed' }, extra: { name: 'Hearthsparks', count: 3, flight: 'lateral', look: 'spark' },
    chargeStyle: 'orb', chargeName: 'Sunorb', bomb: { name: 'Sunflare', color: '#ffe08a', shape: 'petal', style: 'dash', time: 0.8, invuln: 2 },
    unlock: null,
  },
  {
    id: 'bramble', name: 'Bramblewick', blurb: 'Slow, but her bursts are huge',
    color: '#9be36b', accent: '#5a8f3a', wing: 'leaf',
    speed: 0.85, burst: 1.3, charge: 1.1, hitbox: 1.1, feverTime: 1, counterBoost: 0, guardian: { name: 'Old Mossjaw', color: '#8fd16a', pattern: 'ring' }, extra: { name: 'Burrs', count: 2, flight: 'bounce', look: 'burr' },
    chargeStyle: 'thorn', chargeName: 'Thornburst', bomb: { name: 'Thornquake', color: '#a8e77f', shape: 'leaf', style: 'blast', time: 0.5, invuln: 2.4 },
    unlock: null,
  },
  {
    id: 'wisp', name: 'Wisp', blurb: 'Quick and tiny, small bursts',
    color: '#8fe9ff', accent: '#e8fbff', wing: 'pointed',
    speed: 1.2, burst: 0.85, charge: 1, hitbox: 0.7, feverTime: 1, counterBoost: 0, guardian: { name: 'Glint', color: '#9be8ff', pattern: 'rapid' }, extra: { name: 'Glimmers', count: 4, flight: 'slant', look: 'glimmer' },
    chargeStyle: 'needles', chargeName: 'Frost needles', bomb: { name: 'Frost gale', color: '#c8f4ff', shape: 'shard', style: 'vortex', time: 0.9, invuln: 2 },
    unlock: null,
  },
  {
    id: 'clove', name: 'Clove', blurb: 'Charges her torpedo twice as fast',
    color: '#ff9db8', accent: '#c4527a', wing: 'long',
    speed: 1, burst: 1, charge: 0.5, hitbox: 1, feverTime: 1, counterBoost: 0,
    guardian: { name: 'Petalfall', color: '#ff9db8', pattern: 'rain' }, extra: { name: 'Petal darts', count: 3, flight: 'homing', look: 'dart' },
    chargeStyle: 'twin', chargeName: 'Twin darts', bomb: { name: 'Petal storm', color: '#ffd1e6', shape: 'heart', style: 'fan', time: 0.55, invuln: 2.8 },
    unlock: { hint: 'Win any match', met: p => p.wins >= 1 },
  },
  {
    id: 'sorrel', name: 'Sorrel', blurb: 'Stars she bats back hit far harder',
    color: '#ff8a5b', accent: '#ffd0a8', wing: 'crescent',
    speed: 1.05, burst: 0.95, charge: 1, hitbox: 1, feverTime: 1, counterBoost: 1,
    guardian: { name: 'Emberwheel', color: '#ff8a5b', pattern: 'spiral' }, extra: { name: 'Cinders', count: 3, flight: 'zig', look: 'cinder' },
    chargeStyle: 'flare', chargeName: 'Ember fan', bomb: { name: 'Ember lance', color: '#ffb38a', shape: 'ember', style: 'beam', time: 0.8, invuln: 2 },
    unlock: { hint: 'Make a 10-chain', met: p => p.bestChain >= 10 },
  },
  {
    id: 'umbra', name: 'Umbra', blurb: 'Her Fevers last half again as long',
    color: '#c9a2ff', accent: '#5b3c8f', wing: 'moth',
    speed: 0.95, burst: 1, charge: 1, hitbox: 1, feverTime: 1.5, counterBoost: 0,
    guardian: { name: 'Duskmother', color: '#b88cff', pattern: 'sweep' }, extra: { name: 'Dusk moths', count: 2, flight: 'bat', look: 'moth' },
    chargeStyle: 'crescent', chargeName: 'Dusk crescent', bomb: { name: 'Duskfall', color: '#d9c2ff', shape: 'moon', style: 'hole', time: 1, invuln: 2.2 },
    unlock: { hint: 'Beat the CPU without dropping a round', met: p => p.flawless >= 1 },
  },
];

export const fairyById = (id: string): Fairy => FAIRIES.find(f => f.id === id) ?? FAIRIES[0];
