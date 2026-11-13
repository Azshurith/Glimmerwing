// The path a Reverse fireball flies across the screen, from the meadow it was broken in to the rival who
// sent it: up and toward the rival's meadow, a smooth turn, then down onto where the rival's fairy was when
// it broke. It's one quadratic curve in the sender's meadow units, with the rival's meadow lying `side`
// meadows over (FIELD_W + GAP to the right, or to the left), as the two meadows sit side by side on screen.
// Every point of it stays inside the visible play area: below the top edge, between the outer walls.
import * as C from '@/core/config';
import type { Curve } from '@/types';

/** How far the rival's meadow is from this one, in meadow units, as they sit side by side. */
export const MEADOW_STEP = C.FIELD_W + C.GAP;
/** Lowest a Reverse's turn may sit (just inside the top of the play area), and how high above its ends. */
const TURN_TOP = 18,
    TURN_RISE = 110;

/**
 * The curve for a Reverse broken at (x, y) in this meadow, aimed at (tx, ty) in the rival's meadow on `side`
 * (+1 right, -1 left). The control point sits midway across and above both ends, but never above TURN_TOP.
 */
export function reverseCurve(x: number, y: number, tx: number, ty: number, side: number): Curve {
    const x1 = tx + side * MEADOW_STEP,
        y1 = ty;
    const cx = (x + x1) / 2,
        cy = Math.max(TURN_TOP, Math.min(y, y1) - TURN_RISE);
    return { x0: x, y0: y, cx, cy, x1, y1 };
}

/** The point at `k` (0 to 1) along a curve. */
export function curveAt(c: Curve, k: number): { x: number; y: number } {
    const u = 1 - k;
    return { x: u * u * c.x0 + 2 * u * k * c.cx + k * k * c.x1, y: u * u * c.y0 + 2 * u * k * c.cy + k * k * c.y1 };
}

/** The curve's direction (unnormalised) at `k`. */
export function curveDir(c: Curve, k: number): { x: number; y: number } {
    return {
        x: 2 * (1 - k) * (c.cx - c.x0) + 2 * k * (c.x1 - c.cx),
        y: 2 * (1 - k) * (c.cy - c.y0) + 2 * k * (c.y1 - c.cy),
    };
}

/** Advance `k` along the curve by `dist` meadow units. */
export function curveStep(c: Curve, k: number, dist: number): number {
    const d = curveDir(c, k);
    return Math.min(1, k + dist / Math.max(1, Math.hypot(d.x, d.y)));
}

/** The same curve as seen from the meadow `side` meadows over (shifted into that meadow's own units). */
export function shiftCurve(c: Curve, side: number): Curve {
    const dx = side * MEADOW_STEP;
    return { x0: c.x0 - dx, y0: c.y0, cx: c.cx - dx, cy: c.cy, x1: c.x1 - dx, y1: c.y1 };
}

/** The first `k` from `from` on where the curve is inside the meadow (between its walls), in its own units. */
export function enterAt(c: Curve, from: number): number {
    for (let k = from; k < 1; k += 0.005) {
        const p = curveAt(c, k);
        if (p.x >= 8 && p.x <= C.FIELD_W - 8) return k;
    }
    return 1;
}

/** Length of the curve between `k0` and `k1`, in meadow units. */
export function curveLength(c: Curve, k0: number, k1: number): number {
    let len = 0;
    let p = curveAt(c, k0);
    for (let i = 1; i <= 12; i++) {
        const q = curveAt(c, k0 + ((k1 - k0) * i) / 12);
        len += Math.hypot(q.x - p.x, q.y - p.y);
        p = q;
    }
    return len;
}
