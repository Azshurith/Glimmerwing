// Formations, after Twinkle Star Sprites: critters never just appear. Each wave flies in from outside
// the meadow, one member a beat behind the next, settles into a recognisable shape, floats there as a
// group (now and then re-forming into another shape), then leaves together, and the next takes its place.
//
// Everything here is in meadow units (FIELD_W x FIELD_H). The renderer scales the meadow to fit any
// screen, portrait or landscape, so formations keep their shape and spacing on every device.
import * as C from '@/core/config';
import type { Rng } from '@/core/rng';
import type {
    CritterKind,
    Formation,
    FormationEntry,
    FormationExit,
    FormationMove,
    FormationShape,
    FormationSpec,
    Vec,
} from '@/types';

const W = C.FIELD_W,
    H = C.FIELD_H;

/** Where formations may sit: below the HUD strip, and well above the fairy's usual ground. */
const TOP = 30,
    BOTTOM = H * 0.6,
    /** Off-screen distance members start from and leave to. */
    OFF = 26;
/** How fast members fly in (meadow units a second, on average), and the longest a flight in may take. */
const ENTRY_SPEED = 62,
    ENTRY_LONGEST = 1.7;

// ---- shapes -----------------------------------------------------------------------

/** Most members each shape takes (its width or height has to fit the meadow). */
const SHAPE_MAX: Record<FormationShape, number> = {
    line: 7,
    column: 6,
    diagonal: 6,
    v: 7,
    chevron: 7,
    arc: 8,
    ring: 10,
    grid: 10,
    wave: 7,
};

/** Slots for `n` members of a shape, centred on (0, 0), neighbours `s` apart. */
export function shapeSlots(shape: FormationShape, n: number, s: number): Vec[] {
    const c = (n - 1) / 2;
    const out: Vec[] = [];
    for (let i = 0; i < n; i++) {
        switch (shape) {
            case 'line':
                out.push({ x: (i - c) * s, y: 0 });
                break;
            case 'column':
                out.push({ x: 0, y: (i - c) * s * 0.92 });
                break;
            case 'diagonal':
                out.push({ x: (i - c) * s * 0.78, y: (i - c) * s * 0.62 });
                break;
            case 'v':
            case 'chevron': {
                // The point first, then the arms alternately: a V opens upward, a chevron downward.
                const k = Math.ceil(i / 2),
                    side = i % 2 ? -1 : 1;
                const y = k * s * 0.62 * (shape === 'v' ? -1 : 1);
                out.push({ x: side * k * s * 0.78, y });
                break;
            }
            case 'arc': {
                // A shallow bowl, ends raised.
                const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, n - 1));
                const r = (s * (n - 1)) / (Math.PI * 0.7);
                out.push({ x: -Math.cos(a) * r, y: Math.sin(a) * r * 0.42 - r * 0.25 });
                break;
            }
            case 'ring': {
                const r = Math.max(s * 0.9, (s * n) / (Math.PI * 2));
                const a = (Math.PI * 2 * i) / n - Math.PI / 2;
                out.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.8 });
                break;
            }
            case 'grid': {
                // Two staggered rows.
                const cols = Math.ceil(n / 2),
                    row = i % 2,
                    col = Math.floor(i / 2);
                out.push({ x: (col - (cols - 1) / 2) * s + (row ? s * 0.5 : 0) - s * 0.25, y: (row - 0.5) * s * 0.85 });
                break;
            }
            case 'wave':
                out.push({ x: (i - c) * s, y: Math.sin(i * 1.15) * s * 0.4 });
                break;
        }
    }
    return out;
}

/** Furthest a slot reaches from the centre, left/right/up/down, over one or two shapes. */
function extent(sets: Vec[][]): { l: number; r: number; u: number; d: number; rad: number } {
    let l = 0,
        r = 0,
        u = 0,
        d = 0,
        rad = 0;
    for (const set of sets)
        for (const p of set) {
            l = Math.min(l, p.x);
            r = Math.max(r, p.x);
            u = Math.min(u, p.y);
            d = Math.max(d, p.y);
            rad = Math.max(rad, Math.hypot(p.x, p.y));
        }
    return { l, r, u, d, rad };
}

// ---- rolling the sequence -----------------------------------------------------------

/** Pick from weighted options. */
function pick<T>(r: Rng, options: [T, number][]): T {
    let roll = r.next() * options.reduce((s, [, w]) => s + w, 0);
    for (const [v, w] of options) {
        roll -= w;
        if (roll <= 0) return v;
    }
    return options[options.length - 1][0];
}

/** Shots needed for a member, 1 to 5, getting tougher as the round goes on. */
function rollHp(r: Rng, pressure: number): number {
    const a = r.next(),
        b = r.next(),
        c = r.next(),
        d = r.next();
    return (
        1 +
        (a < 0.2 + pressure * 0.4 ? 1 : 0) +
        (b < pressure * 0.3 ? 1 : 0) +
        (c < pressure * 0.15 ? 1 : 0) +
        (d < pressure * 0.08 ? 1 : 0)
    );
}

/** Entries that suit each shape (a column looks best snaking in from a corner, a line dropping in). */
const ENTRIES: Record<FormationShape, FormationEntry[]> = {
    line: ['drop', 'split', 'sideLeft', 'sideRight', 'swoopLeft', 'swoopRight'],
    column: ['swoopLeft', 'swoopRight', 'drop', 'loop'],
    diagonal: ['swoopLeft', 'swoopRight', 'sideLeft', 'sideRight'],
    v: ['drop', 'split', 'swoopLeft', 'swoopRight'],
    chevron: ['drop', 'split', 'loop'],
    arc: ['split', 'drop', 'loop'],
    ring: ['loop', 'swoopLeft', 'swoopRight', 'split'],
    grid: ['drop', 'split', 'sideLeft', 'sideRight'],
    wave: ['sideLeft', 'sideRight', 'swoopLeft', 'swoopRight', 'drop'],
};

/**
 * Roll the next formation from the meadow's wave RNG. Every roll is drawn in the same order whatever
 * happens in play, so both meadows get the same sequence; `pressure` runs 0 to 1 over a round and
 * brings bigger, tougher, busier formations; `prev` keeps the same shape from coming twice running.
 */
export function rollFormation(r: Rng, pressure: number, prev: FormationShape | null): FormationSpec {
    const shapeRoll: [FormationShape, number][] = (
        [
            ['line', 3],
            ['v', 2.5],
            ['chevron', 1.5],
            ['arc', 2],
            ['column', 1.5],
            ['diagonal', 1.5],
            ['grid', 1 + pressure * 1.5],
            ['ring', 1 + pressure * 1.5],
            ['wave', 1.5],
        ] as [FormationShape, number][]
    ).map(([s, w]) => [s, s === prev ? w * 0.15 : w]);
    const shape = pick(r, shapeRoll);
    const kind: CritterKind = pick(r, [
        ['puff', 6],
        ['spinner', 1 + pressure * 2],
        ['beetle', 0.6 + pressure * 2],
    ]);
    const bigRoll = r.next(),
        bubbleRoll = r.next(),
        morphRoll = r.next(),
        overlapRoll = r.next();
    const big = kind === 'puff' && bigRoll < 0.08 + pressure * 0.1;
    let count = r.int(5, 7) + Math.floor(pressure * 3);
    if (big) count = Math.ceil(count * 0.6);
    if (kind === 'beetle') count = Math.max(4, count - 1);
    count = Math.min(SHAPE_MAX[shape], count);
    const hps = Array.from({ length: 12 }, () => rollHp(r, pressure));
    let hp = hps.slice(0, count);
    if (kind === 'spinner') hp = hp.map(() => 1);
    if (kind === 'beetle') hp = hp.map(h => Math.min(h, 2));
    if (big) hp = hp.map(h => Math.min(5, h + 1));

    const entryOpts = ENTRIES[shape];
    const entry = entryOpts[Math.floor(r.next() * entryOpts.length) % entryOpts.length];
    const exit: FormationExit = pick(r, [
        ['up', 3],
        ['sides', 2.5],
        ['left', 1],
        ['right', 1],
        ['scatter', 1 + pressure],
        ['dive', 0.4 + pressure * 2.2],
    ]);
    // Kinds move in their own way: beetles march, spinners wheel, puffs float.
    const move: FormationMove = pick(
        r,
        kind === 'beetle'
            ? [
                  ['march', 4],
                  ['sway', 1],
                  ['creep', 1],
              ]
            : kind === 'spinner'
              ? [
                    ['orbit', shape === 'ring' ? 5 : 1.5],
                    ['figure8', 2],
                    ['sway', 1],
                ]
              : [
                    ['sway', 3],
                    ['bob', 2],
                    ['figure8', 1.5],
                    ['creep', 1 + pressure],
                    ['orbit', shape === 'ring' ? 3 : 0.4],
                ],
    );
    const morphTo = pick<FormationShape>(r, [
        ['line', 1],
        ['v', 1],
        ['chevron', 1],
        ['arc', 1],
        ['ring', 1],
        ['grid', 1],
    ]);
    const morph =
        morphRoll < 0.15 + pressure * 0.3 && morphTo !== shape && count <= SHAPE_MAX[morphTo] ? morphTo : null;

    // Neighbours sit just inside burst range, so one pop can carry through the whole formation (TSS).
    const spacing = (big ? 40 : C.BURST_RADIUS + 1) * (kind === 'beetle' ? 1.05 : 1);
    const slots = shapeSlots(shape, count, spacing);
    const ext = extent(morph ? [slots, shapeSlots(morph, count, spacing)] : [slots]);
    const size = big ? 1.5 : 1;
    const m = C.PUFF_RADIUS * size + 6;
    // Keep the whole shape (and anything it morphs into, or turns through) inside the meadow.
    const spin = move === 'orbit';
    const left = m + (spin ? ext.rad : -ext.l),
        right = W - m - (spin ? ext.rad : ext.r),
        top = TOP + (spin ? ext.rad : -ext.u),
        bottom = BOTTOM - (spin ? ext.rad : ext.d);
    const cxRoll = r.next(),
        cyRoll = r.next();
    const cx = right > left ? left + (right - left) * (0.25 + cxRoll * 0.5) : W / 2;
    const cy = bottom > top ? top + (bottom - top) * (0.15 + cyRoll * 0.45) : (TOP + BOTTOM) / 2;
    const reachX = Math.max(0, Math.min(cx - left, right - cx, 46));
    const reachY = Math.max(0, Math.min(cy - top, bottom - cy, 26));

    const speedUp = 1 - pressure * 0.25;
    return {
        shape,
        morph,
        entry,
        exit,
        move,
        kind,
        count,
        hp,
        big,
        bubble: kind === 'puff' && bubbleRoll < 0.08 + pressure * 0.16,
        spacing,
        cx,
        cy,
        stagger: (big ? 0.32 : 0.25) * speedUp,
        exitStagger: exit === 'scatter' ? 0.03 : 0.1,
        // Unhurried flights in, so the formation can be watched forming up.
        enterTime: (big ? 2.8 : 2.4) * speedUp,
        exitTime: 1.6 * speedUp,
        hold: (big ? 6.5 : 5.5) - pressure * 2 + (morph ? 1.5 : 0),
        reachX,
        reachY,
        overlap: overlapRoll < 0.5 + pressure * 0.3,
    };
}

/** Lay out a rolled formation, ready to fly in. */
export function startFormation(id: number, spec: FormationSpec): Formation {
    const slots = shapeSlots(spec.shape, spec.count, spec.spacing);
    const slotsTo = spec.morph ? shapeSlots(spec.morph, spec.count, spec.spacing) : null;
    return { id, spec, t: 0, slots, slotsTo, exitAt: allInTime(spec) + spec.hold };
}

/** Seconds from a formation's first member setting off until its last can have arrived. */
function allInTime(spec: FormationSpec): number {
    return (spec.count - 1) * spec.stagger + spec.enterTime * ENTRY_LONGEST;
}

// ---- movement -------------------------------------------------------------------------

/** Ease in and out (0..1 to 0..1). */
const smooth = (k: number) => k * k * (3 - 2 * k);

/** A point along a curve from `a` through control `c` to `b`. */
function bezier(a: Vec, c: Vec, b: Vec, k: number): Vec {
    const u = 1 - k;
    return { x: u * u * a.x + 2 * u * k * c.x + k * k * b.x, y: u * u * a.y + 2 * u * k * c.y + k * k * b.y };
}

/** Where the group's centre is, and how far its shape has turned, at formation time `t`. */
function groupAt(g: Formation, t: number): { x: number; y: number; turn: number } {
    const s = g.spec,
        A = s.reachX,
        B = s.reachY;
    let x = 0,
        y = 0,
        turn = 0;
    switch (s.move) {
        case 'sway':
            x = A * Math.sin(t * 0.85);
            y = B * 0.3 * Math.sin(t * 1.7);
            break;
        case 'bob':
            x = A * 0.3 * Math.sin(t * 0.6);
            y = B * Math.sin(t * 1.5);
            break;
        case 'figure8':
            x = A * Math.sin(t * 0.75);
            y = B * Math.sin(t * 1.5);
            break;
        case 'orbit':
            turn = t * 0.55;
            y = B * 0.4 * Math.sin(t * 1.2);
            break;
        case 'march':
            // Side to side at an even pace with a little hop on each step.
            x = A * (2 / Math.PI) * Math.asin(Math.sin(t * 0.8));
            y = -B * 0.35 * Math.abs(Math.sin(t * 4));
            break;
        case 'creep':
            // Sink toward the fairy and draw back up again.
            x = A * 0.35 * Math.sin(t * 1.1);
            y = B * (0.5 - 0.5 * Math.cos(t * 0.55)) * 1.6 - B * 0.6;
            break;
    }
    return { x: s.cx + x, y: s.cy + y, turn };
}

/** Member `i`'s place in the formation at formation time `t` (slot, re-forming, group movement, idle). */
function slotAt(g: Formation, i: number, t: number, kind: CritterKind): Vec {
    const s = g.spec;
    let p = g.slots[i];
    if (g.slotsTo) {
        // Re-form a little before halfway through the hold, over 1.2 s.
        const k = smooth(Math.min(1, Math.max(0, (t - allInTime(s) - s.hold * 0.4) / 1.2)));
        const q = g.slotsTo[i];
        p = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
    }
    const grp = groupAt(g, t);
    if (grp.turn) {
        const c = Math.cos(grp.turn),
            sn = Math.sin(grp.turn);
        p = { x: p.x * c - p.y * sn, y: p.x * sn + p.y * c };
    }
    // Each critter also has its own little idle motion, by kind.
    const ph = t * 3 + i * 0.9;
    let ix = 0,
        iy = 0;
    if (kind === 'spinner') {
        ix = Math.cos(ph * 1.6) * 3.5;
        iy = Math.sin(ph * 1.6) * 3.5;
    } else if (kind === 'beetle') iy = -Math.abs(Math.sin(ph * 1.4)) * 2.5;
    else {
        ix = Math.sin(ph * 0.7) * 1.5;
        iy = Math.sin(ph) * 2.5;
    }
    return { x: grp.x + p.x + ix, y: grp.y + p.y + iy };
}

/** Where member `i` starts, off-screen, and the control point of its curve in. */
function entryCurve(g: Formation, i: number, to: Vec): { from: Vec; via: Vec } {
    let e = g.spec.entry;
    if (e === 'split') e = g.slots[i].x < 0 || (g.slots[i].x === 0 && i % 2 === 0) ? 'swoopLeft' : 'swoopRight';
    switch (e) {
        case 'drop':
            return { from: { x: to.x, y: -OFF }, via: { x: to.x, y: to.y * 0.35 } };
        case 'swoopLeft':
            // In from the top-left corner, dipping below its place and rising into it.
            return { from: { x: -OFF, y: H * 0.06 }, via: { x: W * 0.62, y: Math.min(BOTTOM + 30, to.y + H * 0.32) } };
        case 'swoopRight':
            return {
                from: { x: W + OFF, y: H * 0.06 },
                via: { x: W * 0.38, y: Math.min(BOTTOM + 30, to.y + H * 0.32) },
            };
        case 'sideLeft':
            return { from: { x: -OFF, y: to.y - 18 }, via: { x: to.x * 0.45, y: to.y - 44 } };
        case 'sideRight':
            return { from: { x: W + OFF, y: to.y - 18 }, via: { x: W - (W - to.x) * 0.45, y: to.y - 44 } };
        case 'loop':
        default: {
            // From the far top corner, round in a wide loop under the formation.
            const fromLeft = to.x > W / 2;
            return {
                from: { x: fromLeft ? -OFF : W + OFF, y: -OFF },
                via: { x: W - to.x, y: Math.min(BOTTOM + 40, to.y + H * 0.42) },
            };
        }
    }
}

/**
 * Seconds member `i` takes to fly in: its curve's length at a gentle ENTRY_SPEED, never quicker than the
 * formation's enterTime nor slower than ENTRY_LONGEST times it, so a long swoop is as calm as a short drop.
 */
function entryTime(g: Formation, i: number): number {
    const s = g.spec;
    const to = { x: s.cx + g.slots[i].x, y: s.cy + g.slots[i].y };
    const c = entryCurve(g, i, to);
    const len = Math.hypot(c.via.x - c.from.x, c.via.y - c.from.y) + Math.hypot(to.x - c.via.x, to.y - c.via.y);
    return Math.min(s.enterTime * ENTRY_LONGEST, Math.max(s.enterTime, (len * 0.8) / ENTRY_SPEED));
}

/** Where member `i` leaves to, off-screen, and the control point of its curve out, from `from`. */
function exitCurve(g: Formation, i: number, from: Vec): { to: Vec; via: Vec } {
    const s = g.spec;
    switch (s.exit) {
        case 'up':
            return { to: { x: from.x, y: -OFF - 10 }, via: { x: from.x, y: from.y + 26 } };
        case 'sides': {
            const left = g.slots[i].x < 0 || (g.slots[i].x === 0 && i % 2 === 0);
            return {
                to: { x: left ? -OFF - 10 : W + OFF + 10, y: from.y - 40 },
                via: { x: from.x + (left ? -24 : 24), y: from.y + 24 },
            };
        }
        case 'left':
            return { to: { x: -OFF - 10, y: from.y + 34 }, via: { x: from.x, y: from.y + 34 } };
        case 'right':
            return { to: { x: W + OFF + 10, y: from.y + 34 }, via: { x: from.x, y: from.y + 34 } };
        case 'dive':
            // A short rise, then down past the fairy and out the bottom.
            return {
                to: { x: from.x + (from.x < W / 2 ? 46 : -46), y: H + OFF + 10 },
                via: { x: from.x, y: from.y - 34 },
            };
        case 'scatter':
        default: {
            // Burst outward from the centre.
            const d = Math.hypot(g.slots[i].x, g.slots[i].y) || 1;
            const ux = d > 1 ? g.slots[i].x / d : i % 2 ? -1 : 1,
                uy = d > 1 ? g.slots[i].y / d : -1;
            return {
                to: { x: from.x + ux * (W + 80), y: from.y + uy * (H * 0.6) - 60 },
                via: { x: from.x - ux * 14, y: from.y - uy * 14 },
            };
        }
    }
}

/** Order members leave in: the far ends first for sideways exits, front to back otherwise. */
function exitOrder(g: Formation, i: number): number {
    return g.spec.exit === 'sides' ? Math.abs(g.slots.length - 1 - 2 * i) / 2 : i;
}

/**
 * Where member `i` (a critter of `kind`) of formation `g` is at formation time `g.t`: `wait` before it
 * sets off (it stays off-screen), `gone` once it has flown out of the meadow, otherwise its position.
 */
export function memberAt(g: Formation, i: number, kind: CritterKind): Vec | 'wait' | 'gone' {
    const s = g.spec,
        t = g.t;
    const start = i * s.stagger;
    if (t < start) return 'wait';
    const leave = g.exitAt + exitOrder(g, i) * s.exitStagger;
    if (t < leave) {
        const here = slotAt(g, i, t, kind);
        const k = (t - start) / entryTime(g, i);
        if (k >= 1) return here;
        const c = entryCurve(g, i, here);
        return bezier(c.from, c.via, here, smooth(k));
    }
    const k = (t - leave) / s.exitTime;
    if (k >= 1) return 'gone';
    const from = slotAt(g, i, leave, kind);
    const c = exitCurve(g, i, from);
    // Ease out of place, then speed away.
    return bezier(from, c.via, c.to, k * k * (1.6 - 0.6 * k));
}

/** Whether the formation has started leaving (its hold is over). */
export const leaving = (g: Formation): boolean => g.t >= g.exitAt;
