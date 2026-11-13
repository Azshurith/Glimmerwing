// The path a Reverse fireball flies across the screen, from the meadow it was broken in to the rival who
// sent it: diagonally up to the top line under the HUD bar, a bounce off it, and diagonally down onto where
// the rival's fairy was when it broke, carrying on past there the same way. It's two straight legs meeting at
// the bounce, in the sender's meadow units, with the rival's meadow lying `side` meadows over (FIELD_W + GAP to
// the right, or to the left), as the two meadows sit side by side on screen.
import * as C from '@/core/config';
import type { Curve, NormalRoute, Point } from '@/types';

/** How far the rival's meadow is from this one, in meadow units, as they sit side by side. */
export const meadowStep = () => C.FIELD_W + C.GAP;
/** Where a Reverse bounces: the top line, just under the HUD bar. */
const TURN_TOP = C.FIREBALL_TOP_Y;

/**
 * Where on the top line a fireball climbing from (x, y) bounces on its way to (fx, fy), all in the sender's
 * units with the rival's meadow on `side`: near the middle of the screen, over the gap between the meadows. It
 * starts from where a true reflection off the top line would send it at the target and pulls that most of the
 * way to the middle (keeping FIREBALL_BOUNCE_SPREAD of the distance), never back behind where it set off.
 */
function bounceX(x: number, y: number, fx: number, fy: number, side: number): number {
    // The target's mirror image above the top line; a true bounce is where the line to it crosses that line.
    const k = (y - TURN_TOP) / (y - (2 * TURN_TOP - fy));
    const reflect = x + (fx - x) * k;
    const middle = side > 0 ? C.FIELD_W + C.GAP / 2 : -C.GAP / 2;
    const bx = middle + (reflect - middle) * C.FIREBALL_BOUNCE_SPREAD;
    return side > 0 ? Math.max(x, bx) : Math.min(x, bx);
}

/**
 * The path for a Reverse broken at (x, y) in this meadow, aimed at (tx, ty) in the rival's meadow on `side`
 * (+1 right, -1 left), ending at (x1, y1) and carrying on past it:
 * - normally diagonally up to TURN_TOP, bouncing off it at (cx, cy) near the middle of the screen (bounceX), then
 *   diagonally down;
 * - `straight`, straight up to TURN_TOP at (cx, cy), straight across it to over the target at (tx, ty), then
 *   straight down.
 * One broken at or above the top line starts along it at once.
 */
export function reverseCurve(x: number, y: number, tx: number, ty: number, side: number, straight = false): Curve {
    const x1 = tx + side * meadowStep(),
        y1 = ty;
    const top = Math.min(y, TURN_TOP);
    if (straight) return { x0: x, y0: y, cx: x, cy: top, tx: x1, ty: top, x1, y1 };
    if (y <= TURN_TOP) return { x0: x, y0: y, cx: x, cy: y, x1, y1 };
    return { x0: x, y0: y, cx: bounceX(x, y, x1, y1, side), cy: TURN_TOP, x1, y1 };
}

/**
 * The route a Normal fireball sent from (x, y) flies to the rival's fairy at (tx, ty) in the rival's meadow on
 * `side` (+1 right, -1 left). `points` is the part flown on this side, in the sender's meadow units, up to the
 * rival's near wall; `enter` is where it comes into the rival's meadow and which way it's heading there, in the
 * rival's units, with `turnX` where it turns straight down if it came in sliding.
 * - `straight`: straight up to FIREBALL_TOP_Y (or, within FIREBALL_NEAR_TOP of the top, at its own height, never
 *   above FIREBALL_TOP_Y), straight across, then straight down once over the fairy.
 * - Otherwise: diagonally up to FIREBALL_TOP_Y, a bounce near the middle of the screen (bounceX), and diagonally
 *   down at the fairy.
 */
export function normalRoute(x: number, y: number, side: number, tx: number, ty: number, straight = false): NormalRoute {
    const y0 = y;
    const wall = side > 0 ? meadowStep() : C.FIELD_W - meadowStep();
    const enterX = side > 0 ? 0 : C.FIELD_W;
    const aimX = Math.min(C.FIELD_W - 12, Math.max(12, tx));
    if (straight) {
        // Along the top line, or at its own height if it's already that close to the top; kept below the HUD
        // bar either way, so it's never hidden behind it.
        y = y <= C.FIREBALL_NEAR_TOP ? Math.max(y, C.FIREBALL_TOP_Y) : C.FIREBALL_TOP_Y;
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
    // The fairy in this meadow's units, and where it bounces near the middle of the screen.
    const fx = side * meadowStep() + aimX;
    const bx = bounceX(x, y, fx, ty, side);
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

/** A Reverse's path as its corners: from where it broke, the bounce (and the second corner, if any), the target. */
function corners(c: Curve): Point[] {
    return c.tx === undefined || c.ty === undefined
        ? [
              { x: c.x0, y: c.y0 },
              { x: c.cx, y: c.cy },
              { x: c.x1, y: c.y1 },
          ]
        : [
              { x: c.x0, y: c.y0 },
              { x: c.cx, y: c.cy },
              { x: c.tx, y: c.ty },
              { x: c.x1, y: c.y1 },
          ];
}

/**
 * The point at `k` along a Reverse's path: its straight legs share 0 to 1 equally (the target is at 1), and past 1
 * it carries on along the last leg.
 */
export function curveAt(c: Curve, k: number): { x: number; y: number } {
    const p = corners(c),
        n = p.length - 1;
    const i = Math.max(0, Math.min(n - 1, Math.floor(k * n))),
        u = k * n - i;
    return { x: p[i].x + (p[i + 1].x - p[i].x) * u, y: p[i].y + (p[i + 1].y - p[i].y) * u };
}

/** The path's direction at `k` (unnormalised: how far it moves per unit of `k`). */
export function curveDir(c: Curve, k: number): { x: number; y: number } {
    const p = corners(c),
        n = p.length - 1;
    const i = Math.max(0, Math.min(n - 1, Math.floor(k * n)));
    return { x: (p[i + 1].x - p[i].x) * n, y: (p[i + 1].y - p[i].y) * n };
}

/**
 * Advance `k` along the path by `dist` meadow units, up to `limit` (1 is the target; past it the path carries
 * on along its last leg). A step that would cross a corner stops there, so it never cuts the corner.
 */
export function curveStep(c: Curve, k: number, dist: number, limit = 1): number {
    const n = corners(c).length - 1;
    const d = curveDir(c, k);
    const next = k + dist / Math.max(1, Math.hypot(d.x, d.y));
    const i = Math.floor(k * n);
    const corner = (i + 1) / n;
    return Math.min(limit, i < n - 1 && next > corner ? corner + 1e-6 : next);
}

/** The same path as seen from the meadow `side` meadows over (shifted into that meadow's own units). */
export function shiftCurve(c: Curve, side: number): Curve {
    const dx = side * meadowStep();
    return {
        ...c,
        x0: c.x0 - dx,
        cx: c.cx - dx,
        x1: c.x1 - dx,
        ...(c.tx === undefined ? {} : { tx: c.tx - dx }),
    };
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
