export type AnimName = 'idle' | 'fly' | 'tiltL' | 'tiltR' | 'hit' | 'death' | 'remains' | 'revive';

export interface Anim {
  row: number;
  count: number;
  fps: number;
}

export interface SpriteSet {
  img: HTMLImageElement;
  /** Cell size in sheet pixels. */
  cw: number;
  ch: number;
  /** Cell point drawn at the player's position (the rider's body, where the hitbox is). */
  bodyX: number;
  bodyY: number;
  /** Sheet pixels to field units. */
  scale: number;
  anims: Record<AnimName, Anim>;
}

export interface Layer {
  anim: AnimName;
  frame: number;
  alpha: number;
}
