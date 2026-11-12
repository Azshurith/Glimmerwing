import type { Bomb, ChargeStyle, Extra, Guardian } from './game';
import type { Progress } from './progress';
import type { SpriteSet } from './sprites';

export type WingShape = 'round' | 'pointed' | 'moth' | 'leaf' | 'long' | 'crescent';

/** A select-screen illustration, with where to crop it, in image pixels. */
export interface Portrait {
  img: HTMLImageElement;
  /** The big side-panel window: x, y, w, h. */
  panel: [number, number, number, number];
  /** The round roster medallion: centre x, centre y, radius. */
  face: [number, number, number];
}

export interface Fairy {
  id: string;
  name: string;
  blurb: string;
  /** Glow and shot colour. */
  color: string;
  /** Hair/body accent. */
  accent: string;
  wing: WingShape;
  speed: number; // movement multiplier
  burst: number; // pollen burst radius multiplier
  charge: number; // charge time multiplier (lower is faster)
  hitbox: number; // hitbox multiplier (lower is harder to hit)
  feverTime: number; // fever duration multiplier
  counterBoost: number; // extra levels added when you bat a star back
  /** The guardian this fairy sends when her gauge fills. */
  guardian: Guardian;
  /** What a level 2 charge sends. */
  extra: Extra;
  /** Her charge shot, and what it's called. */
  chargeStyle: ChargeStyle;
  chargeName: string;
  bomb: Bomb;
  /** Sprite-sheet look; without one she's drawn in code from her colours and wing shape. */
  sprite?: SpriteSet;
  /** Character-select art. Without one the select screen shows her in-game look. */
  portrait?: Portrait;
  unlock: null | { hint: string; met: (p: Progress) => boolean };
}
