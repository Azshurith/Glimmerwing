// The path a Reverse fireball flies across the screen, from the meadow it was broken in to the rival who
// sent it: up and toward the rival's meadow, a smooth turn, then down onto where the rival's fairy was when
// it broke. It's one quadratic curve in the sender's meadow units, with the rival's meadow lying `side`
// meadows over (FIELD_W + GAP to the right, or to the left), as the two meadows sit side by side on screen.
// Every point of it stays inside the visible play area: below the top edge, between the outer walls.
import * as C from '@/core/config';
import type { Curve, NormalRoute, Point } from '@/types';

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

/**
 * The route a Normal fireball sent from (x, y) flies to the rival's fairy at (tx, ty) in the rival's meadow on
 * `side` (+1 right, -1 left). `points` is the part flown on this side, in the sender's meadow units, up to the
 * rival's near wall; `enter` is where it comes into the rival's meadow and which way it's heading there, in the
 * rival's units, with `turnX` where it turns straight down if it came in sliding.
 * - Close to the top (within FIREBALL_NEAR_TOP): straight across at its height (dipping first to FIREBALL_TOP_Y if it's
 *   above that), then down once over the fairy.
 * - Lower down: diagonally up to FIREBALL_TOP_Y, a bounce, and diagonally down at the fairy. The bounce is where
 *   a true reflection off the top border would send it at the fairy, kept inside the sender's meadow.
 */
export function normalRoute(x: number, y: number, side: number, tx: number, ty: number): NormalRoute {
    const y0 = y;
    const wall = side > 0 ? MEADOW_STEP : C.FIELD_W - MEADOW_STEP;
    const enterX = side > 0 ? 0 : C.FIELD_W;
    const aimX = Math.min(C.FIELD_W - 12, Math.max(12, tx));
    if (y <= C.FIREBALL_NEAR_TOP) {
        // Kept below the HUD bar along the top, so it's never hidden behind it.
        y = Math.max(y, C.FIREBALL_TOP_Y);
        return {
            points: [
                { x, y: y0 },
                { x, y },
                { x: wall, y },
            ],
            enter: { x: enterX, y, ux: side, uy: 0, turnX: aimX },
        };
    }
    const top = C.FIREBALL_TOP_Y;
    // The fairy in this meadow's units, and its mirror image above the top border.
    const fx = side * MEADOW_STEP + aimX,
        my = 2 * top - ty;
    const k = (y - top) / (y - my);
    let bx = x + (fx - x) * k;
    const inner = side > 0 ? C.FIELD_W - C.FIREBALL_BOUNCE_WALL : C.FIREBALL_BOUNCE_WALL;
    bx = side > 0 ? Math.max(x, Math.min(bx, inner)) : Math.min(x, Math.max(bx, inner));
    const dx = fx - bx,
        dy = ty - top;
    const len = Math.hypot(dx, dy) || 1;
    // Where the way down crosses the rival's near wall.
    const ey = top + (dy * (wall - bx)) / (dx || side);
    return {
        points: [
            { x, y },
            { x: bx, y: top },
            { x: wall, y: ey },
        ],
        enter: { x: enterX, y: ey, ux: dx / len, uy: dy / len },
    };
}

/** How long a polyline is. */
export function pathLength(points: Point[]): number {
    let d = 0;
    for (let i = 1; i < points.length; i++)
        d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    return d;
}

/** The point `d` units along a polyline (held at its end past there), and which way it's heading. */
export function pathAt(points: Point[], d: number): { x: number; y: number; dx: number; dy: number } {
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1],
            b = points[i];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        if (d <= seg || i === points.length - 1) {
            const k = seg ? Math.min(1, d / seg) : 1;
            return {
                x: a.x + (b.x - a.x) * k,
                y: a.y + (b.y - a.y) * k,
                dx: (b.x - a.x) / (seg || 1),
                dy: (b.y - a.y) / (seg || 1),
            };
        }
        d -= seg;
    }
    return { x: points[0].x, y: points[0].y, dx: 0, dy: -1 };
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

/**
 * Advance `k` along the curve by `dist` meadow units, up to `limit` (1 is the curve's end; past it the curve
 * carries on bending the same way, which is how a Reverse keeps arcing after its target).
 */
export function curveStep(c: Curve, k: number, dist: number, limit = 1): number {
    const d = curveDir(c, k);
    return Math.min(limit, k + dist / Math.max(1, Math.hypot(d.x, d.y)));
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
