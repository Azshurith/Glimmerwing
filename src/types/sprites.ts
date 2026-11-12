/** The animations a sprite sheet has. */
export type AnimName = 'idle' | 'fly' | 'tiltL' | 'tiltR' | 'hit' | 'death' | 'remains' | 'revive';

/** Where an animation sits in its sheet: row, frame count and speed. */
export interface Anim {
    row: number;
    count: number;
    fps: number;
}

/** A sprite sheet and how to place and animate it. */
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

/** One animation frame to draw; several layers cross-fade between animations. */
export interface Layer {
    anim: AnimName;
    frame: number;
    alpha: number;
}
