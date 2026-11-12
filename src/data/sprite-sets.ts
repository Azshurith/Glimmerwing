import witchSheet from '../../assets/witch.png';
import { loadImage } from '../core/images';
import type { SpriteSet } from '../types';

/**
 * Sprite-sheet characters. A sheet is an atlas of equal cells, one animation per row;
 * every frame is placed so the same in-cell point (`body`) sits on the player's position.
 *
 * The witch atlas is cut from a reference sheet by tools/extract-witch.py.
 */

/** Blonde witch on a broom, flying away from the camera. Cells 112x124, bow at (56, 26). */
export const WITCH: SpriteSet = {
    img: loadImage(witchSheet),
    cw: 112,
    ch: 124,
    bodyX: 56,
    bodyY: 64,
    scale: 0.42,
    anims: {
        fly: { row: 0, count: 4, fps: 8 },
        idle: { row: 1, count: 4, fps: 6 },
        tiltL: { row: 2, count: 4, fps: 8 },
        tiltR: { row: 3, count: 4, fps: 8 },
        hit: { row: 4, count: 6, fps: 12 },
        death: { row: 5, count: 8, fps: 12 },
        remains: { row: 6, count: 4, fps: 3 },
        revive: { row: 7, count: 4, fps: 10 },
    },
};
