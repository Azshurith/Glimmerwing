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

/** The kinds of monster a map's sheet holds, one row each. */
export type MonsterKind = 'slime' | 'mushroom' | 'bee' | 'leaf' | 'tree';

/**
 * A map's monster sheet: one row of eight "appear" frames per monster (sparkle, flash,
 * glowing outline, filled outline, arriving, idle, talking, happy), then a row of a
 * sparkle overlay that plays over any monster as it appears.
 */
export interface MonsterSheet {
    img: HTMLImageElement;
    /** Cell size in sheet pixels; every frame is centred in its cell. */
    cell: number;
    /** Each monster's row. */
    rows: Record<MonsterKind, number>;
    /** The overlay's row. */
    overlay: number;
    /** Which monster a plain critter may be, picked per formation; big critters are always `big`. */
    roster: MonsterKind[];
    big: MonsterKind;
    /** The shelled critter (its shell drawn as a bubble) and the corkscrewing one. */
    shelled: MonsterKind;
    spinner: MonsterKind;
}
