// Fitting the tall title and select screens to a portrait screen squatter than they were designed for.
import * as C from '@/core/config';

/** How a tall menu screen sits in a view: shrunk by `s` and moved right by `x`, drawn as if `h` tall. */
export interface MenuFit {
    x: number;
    s: number;
    h: number;
    /** How far past each side, in design units, a full-width bar reaches to meet the screen's edge. */
    bleed: number;
}

/**
 * The tall menus are designed TALL_W × TALL_H (taller views just centre them). On a shorter view they shrink
 * uniformly to its height and sit centred, with the backdrop filling the sides.
 */
export function tallMenuFit(h: number): MenuFit {
    const s = Math.min(1, h / C.TALL_H);
    const x = (C.TALL_W * (1 - s)) / 2;
    return { x, s, h: h / s, bleed: x / s };
}
