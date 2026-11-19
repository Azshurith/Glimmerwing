// The Characters screen: browse the fairies, with each one's portrait, stats, skills and how to unlock her.
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Fairy, Layout, RosterView } from '@/types';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted, sparkle } from '@/render/draw';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { PieceAtlas } from './kit';
import { kitReady } from './kit-ui';
import type { MockFit } from './kit-ui';
import { ROSTER_KIT } from '@/data/roster-kit';
import kitUrl from '@/../assets/ui/roster-kit.png';
import goldUrl from '@/../assets/ui/roster-kit-gold.png';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import {
    crest,
    goldFrame,
    goldGradient,
    iconOrb,
    keyHints,
    ornatePanel,
    ornateScreen,
    ornateTitle,
    pointed,
} from './ornate';

/** What each charge-shot style does. */
const SHOT_TEXT: Record<string, string> = {
    orb: 'A big glowing orb that bursts wide',
    thorn: 'A heavy thorn that bursts huge',
    needles: 'A fan of frost needles',
    twin: 'Two darts at once',
    flare: 'A fan of embers',
    crescent: 'A sweeping crescent',
};
/** What each bomb style does. */
const BOMB_TEXT: Record<string, string> = {
    dash: 'Streaks across her row, then a full-field flash',
    blast: 'A huge blast that also slows her meadow',
    vortex: 'Spirals out from the centre',
    fan: 'Covers a cone ahead; keeps her safe longest',
    beam: 'Sweeps a beam over everything above her',
    hole: 'A black hole drags hazards in, then bursts',
};
/** How each Extra Attack critter flies. */
const EXTRA_TEXT: Record<string, string> = {
    lateral: 'streak across, then burst into sparks',
    bounce: 'hop slowly down the meadow',
    slant: 'ricochet off the walls',
    homing: 'home in on the rival',
    zig: 'zig-zag down',
    bat: 'weave down, then dive',
};
/** How each guardian attacks. */
const GUARDIAN_TEXT: Record<string, string> = {
    aimed: 'fires straight at the rival',
    ring: 'spins out rings of shots',
    rain: 'rains shots down',
    rapid: 'fires in rapid bursts',
    spiral: 'spins out spirals',
    sweep: 'sweeps fans of shots',
};

/** A 1-5 rating for a stat, from its multiplier and the value that earns five. */
const rate = (v: number, max: number) => Math.max(1, Math.min(5, Math.round(1 + (4 * (v - 0.7)) / (max - 0.7))));

/** Her four stats as (name, 1-5 rating, icon). */
function statsOf(fy: Fairy): [string, number, string][] {
    return [
        ['SPEED', rate(fy.speed, 1.2), 'speed'],
        ['CHARGE', rate(1 / fy.charge, 2), 'charge'],
        ['BURST', rate(fy.burst, 1.3), 'burst'],
        ['DODGE', rate(1 / fy.hitbox, 1 / 0.7), 'dodge'],
    ];
}

/** Her four skills as (kind, name, what it does, colour); a locked fairy's are hidden. */
function skillsOf(fy: Fairy, locked: boolean): [string, string, string, string][] {
    if (locked)
        return [
            ['SHOT', '???', '', '#9a7aff'],
            ['BOMB', '???', '', '#ffb43c'],
            ['EXTRA ATTACK', '???', '', '#ff7ad0'],
            ['GUARDIAN', '???', '', '#c07af0'],
        ];
    return [
        ['SHOT', fy.chargeName, fy.skillText?.shot ?? SHOT_TEXT[fy.chargeStyle] ?? '', '#9a7aff'],
        ['BOMB', fy.bomb.name, fy.skillText?.bomb ?? BOMB_TEXT[fy.bomb.style] ?? '', '#ffb43c'],
        [
            'EXTRA ATTACK',
            fy.extra.name,
            `${fy.extra.count} that ${EXTRA_TEXT[fy.extra.flight] ?? 'fly at the rival'}`,
            '#ff7ad0',
        ],
        ['GUARDIAN', fy.guardian.name, GUARDIAN_TEXT[fy.guardian.pattern] ?? '', '#c07af0'],
    ];
}

/** The painted Characters screen's pieces (cut from its mockup by tools/extract-screen-kit.py). */
const KIT = new PieceAtlas(kitUrl, goldUrl, ROSTER_KIT);

/**
 * The painted landscape Characters screen's layout, in its mockup's 2x pixels: each piece's box (the piece fills it),
 * the portrait's window, where the stat bars and the skills' text go, the demo's room, and the medallions' centres.
 */
const MOCK = {
    area: [150, 0, 3523, 1350],
    title: [846, 0, 1852, 232],
    portrait: [150, 110, 812, 1108],
    window: [192, 222, 724, 818],
    name: [556, 1138],
    blurb: [1004, 290],
    statsL: [980, 326, 748, 182],
    statsR: [1753, 326, 754, 182],
    // Each panel's bars: where the five start, how wide they all are, and the two rows' middles.
    bars: [
        [1275, 392],
        [2054, 392],
    ],
    barRows: [379, 457],
    skills: [519, 655, 795, 935],
    // The stat icons' boxes (as cut), and where each panel's labels start.
    statIcons: [
        [1022, 348, 70, 64],
        [1022, 426, 66, 66],
        [1798, 346, 68, 66],
        [1798, 424, 68, 66],
    ],
    statLabels: [1105, 1883],
    // The demo frame: its middle across, its top, its height, and how far in its window starts (sides, top, foot).
    demo: [3021, 218, 912, 36, 23, 37],
    tray: [900, 1095, 1800, 255],
    meds: { x0: 1200, gap: 195.7, y: 1218 },
} as const;

/** Where each part of the painted Characters screen sits in the view, all at one scale. */
interface RosterFits {
    /** The heading, along the top. */
    title: MockFit;
    /** The portrait, against the left edge. */
    left: MockFit;
    /** The demo, against the right edge. */
    right: MockFit;
    /** The blurb, stats and skills, centred between the two. */
    mid: MockFit;
    /** The fairies' tray, along the bottom. */
    tray: MockFit;
}

/**
 * How the painted Characters screen fills a widened landscape view `bleed` past each side: one scale, as big as the
 * screen allows, with the heading against the top, the portrait and the demo against the left and right edges, the
 * tray along the bottom, and the blurb, stats and skills centred in the room between them.
 */
function rosterFits(bleed: number): RosterFits {
    const x0 = -bleed + 4,
        x1 = C.VIEW_W + bleed - 4,
        y0 = 2,
        y1 = C.VIEW_H - 18;
    const d = paintedDemo(MOCK.demo).frame;
    const [px0, , pw] = MOCK.portrait,
        mid0 = 980,
        mid1 = 2507,
        gap = 40;
    const s = Math.min((y1 - y0) / 1350, (x1 - x0) / (pw + (mid1 - mid0) + d.w + 2 * gap));
    /** A fit drawing the mockup's point (mx, my) at the view's (vx, vy). */
    const at = (mx: number, my: number, vx: number, vy: number): MockFit => ({ s, x: vx - mx * s, y: vy - my * s });
    const band = (y0 + y1) / 2;
    const left = at(px0, 110 + 1108 / 2, x0, band),
        right = at(d.x + d.w, d.y + d.h / 2, x1, band);
    const midL = left.x + (px0 + pw) * s,
        midR = right.x + d.x * s,
        midX = (midL + midR) / 2;
    const title = at(MOCK.title[0] + MOCK.title[2] / 2, 0, (x0 + x1) / 2, y0);
    const tray = at(MOCK.tray[0] + MOCK.tray[2] / 2, 1350, midX, y1);
    const top = title.y + 232 * s,
        bottom = tray.y + MOCK.tray[1] * s;
    const mid = at((mid0 + mid1) / 2, (250 + 1085) / 2, midX, (top + bottom) / 2);
    return { title, left, right, mid, tray };
}

/** Whether landscape Characters is drawn from its painted pieces (once they've loaded). */
const painted = () => KIT.ready() && kitReady();

/** A painted demo frame and its window, in a mockup's pixels. */
export interface PaintedDemo {
    /** The frame's box. */
    frame: { x: number; y: number; w: number; h: number };
    /** The window inside it, in the meadow's shape. */
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * A painted demo frame `height` tall from `top`, centred on `cx`, narrowed to the meadow's shape: its window starts
 * `side` in from each side, `head` from the top and `foot` from the bottom.
 */
export function paintedDemo(spec: readonly number[]): PaintedDemo {
    const [cx, top, height, side, head, foot] = spec;
    const h = height - head - foot,
        w = (h * C.FIELD_W_BASE) / C.FIELD_H_BASE;
    return { frame: { x: cx - w / 2 - side, y: top, w: w + side * 2, h: height }, x: cx - w / 2, y: top + head, w, h };
}

/**
 * A dark violet glass panel drawn in code, rounded `r`: a soft violet glow behind, a deep gradient fill, an edge that
 * runs from gold at the left to violet at the right, and a faint light along its top.
 */
export function glassPanel(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.save();
    ctx.shadowColor = 'rgba(150,80,255,0.35)';
    ctx.shadowBlur = 30;
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, '#2e1658');
    fill.addColorStop(0.5, '#1a0b36');
    fill.addColorStop(1, '#241048');
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    const edge = ctx.createLinearGradient(x, 0, x + w, 0);
    edge.addColorStop(0, 'rgba(255,205,110,0.95)');
    edge.addColorStop(0.35, 'rgba(214,140,255,0.8)');
    edge.addColorStop(1, 'rgba(160,100,240,0.7)');
    ctx.strokeStyle = edge;
    ctx.lineWidth = 4;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    const hl = ctx.createLinearGradient(0, y, 0, y + h * 0.45);
    hl.addColorStop(0, 'rgba(220,180,255,0.18)');
    hl.addColorStop(1, 'rgba(220,180,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x, y, w, h * 0.45);
    ctx.restore();
}

/** How thick the code-drawn gold frames are, and the rounding of their inside, in a mockup's pixels. */
export const FRAME_BORDER = 20;
/** The rounding of a code-drawn frame's inside. */
export const FRAME_INNER_R = 30;

/**
 * A gold rounded frame drawn in code round the box (x, y, w, h) (the frame's outer edge), `b` thick and rounded `r`:
 * a soft glow behind, a dark outline, a gold band shaded from light to dark, and a bright line along both its edges.
 * Its inside is left alone, so whatever is drawn there first shows through.
 */
export function goldRoundFrame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    b: number = FRAME_BORDER,
): void {
    /** Adds a rounded rectangle to `path` (without starting a new one, so two make a ring). */
    const rr = (path: Path2D, rx: number, ry: number, rw: number, rh: number, rad: number) => {
        path.moveTo(rx + rad, ry);
        path.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
        path.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
        path.arcTo(rx, ry + rh, rx, ry, rad);
        path.arcTo(rx, ry, rx + rw, ry, rad);
        path.closePath();
    };
    // The glow and the outline, as one ring round the outside: the inside stays clear.
    const ring = new Path2D();
    rr(ring, x - 8, y - 8, w + 16, h + 16, r + 8);
    rr(ring, x + b, y + b, w - 2 * b, h - 2 * b, r - b);
    ctx.save();
    ctx.shadowColor = 'rgba(255,190,70,0.55)';
    ctx.shadowBlur = 50;
    ctx.fillStyle = '#2a1006';
    ctx.fill(ring, 'evenodd');
    ctx.restore();
    const gold = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
    gold.addColorStop(0, '#fff4c0');
    gold.addColorStop(0.25, '#f6c652');
    gold.addColorStop(0.5, '#c27a16');
    gold.addColorStop(0.75, '#f2be4a');
    gold.addColorStop(1, '#a8600e');
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = gold;
    ctx.lineWidth = b;
    roundRect(ctx, x + b / 2, y + b / 2, w - b, h - b, r - b / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,248,214,0.9)';
    ctx.lineWidth = 3;
    roundRect(ctx, x + 4, y + 4, w - 8, h - 8, r - 4);
    ctx.stroke();
    roundRect(ctx, x + b - 1, y + b - 1, w - 2 * b + 2, h - 2 * b + 2, r - b + 1);
    ctx.stroke();
    ctx.restore();
}

/**
 * A live meadow's window in a code-drawn frame, in a mockup's pixels: the frame goes round the window `d`, so the
 * meadow drawn under it (by `drawDemoMeadow`) sits exactly inside.
 */
export function demoFrame(ctx: CanvasRenderingContext2D, d: PaintedDemo): void {
    const b = FRAME_BORDER;
    goldRoundFrame(ctx, d.x - b, d.y - b, d.w + 2 * b, d.h + 2 * b, FRAME_INNER_R + b, b);
}

/**
 * Draws a painted demo's live meadow into its window, in view units under `fit` (before its frame goes over it), with
 * `caption` across its foot; with no meadow to show the window stays dark, with a question mark.
 */
export function drawDemoMeadow(
    ctx: CanvasRenderingContext2D,
    fit: MockFit,
    d: PaintedDemo,
    draw: DemoDraw | null,
    caption: string,
): void {
    const x = fit.x + d.x * fit.s,
        y = fit.y + d.y * fit.s,
        w = d.w * fit.s,
        h = d.h * fit.s;
    ctx.save();
    roundRect(ctx, x, y, w, h, FRAME_INNER_R * fit.s);
    ctx.clip();
    if (draw) draw(x, y, w / C.FIELD_W_BASE);
    else {
        ctx.fillStyle = '#120d2c';
        ctx.fillRect(x, y, w, h);
        arcadeText(ctx, '?', x + w / 2, y + h * 0.55, 40, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
    }
    if (draw && caption) {
        const g = ctx.createLinearGradient(0, y + h - 30, 0, y + h);
        g.addColorStop(0, 'rgba(8,5,24,0)');
        g.addColorStop(1, 'rgba(8,5,24,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + h - 30, w, 30);
        ctx.textAlign = 'right';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText(caption.toUpperCase(), x + w - 7, y + h - 8, w - 14);
    }
    ctx.restore();
}

/** Where things go in each layout, in its design units. */
const LAYOUT = {
    wide: {
        W: C.VIEW_W,
        art: { x: 14, y: 40, w: 116, h: 192 },
        demo: { x: 340, y: 40, w: 148 },
        info: { x: 146, y: 46, w: 180 },
        rowY: 270,
        r: 13,
    },
    tall: {
        W: C.TALL_W,
        art: { x: 14, y: 46, w: 236, h: 164 },
        // On a phone the demo opens full size in a pop-up from the PREVIEW button (see `popup`).
        demo: { x: 24, y: 0, w: 216 },
        info: { x: 14, y: 250, w: 236 },
        rowY: 506,
        r: 15,
    },
} as const;

/**
 * The wide layout spread over a widened view: the portrait against the left edge (a little wider as the
 * view grows), the demo against the right edge, and her stats and skills in the space between (centred in it once it's wider than they need).
 */
function spread(bleed: number): { art: Box; demo: { x: number; y: number; w: number }; info: Box1 } {
    const L = LAYOUT.wide;
    const art = { ...L.art, x: L.art.x - bleed, w: L.art.w + Math.min(44, bleed * 0.3) };
    const demo = { ...L.demo, x: L.demo.x + bleed };
    const x = art.x + art.w + 16,
        room = demo.x - 14 - x,
        w = Math.min(360, room);
    return { art, demo, info: { x: x + (room - w) / 2, y: L.info.y, w } };
}

/** A box in design units. */
type Box = { x: number; y: number; w: number; h: number };
/** A column in design units: where it starts and how wide it is. */
type Box1 = { x: number; y: number; w: number };

/** Draws the live demo meadow at (`x`, `y`) and `scale`, in the screen's design units (see game/preview.ts). */
export type DemoDraw = (x: number, y: number, scale: number) => void;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** The PREVIEW button on a phone's portrait, in the tall layout's design units (before `tallShift`). */
const PREVIEW_BTN = { x: 172, y: 54, w: 70, h: 18 };

/** The PREVIEW button in view units, for a view `h` tall: the tap target that opens the demo on a phone. */
export function rosterPreviewButton(h: number = C.TALL_H): { x: number; y: number; w: number; h: number } {
    const f = tallMenuFit(h),
        b = PREVIEW_BTN;
    return { x: f.x + b.x * f.s, y: (b.y + tallShift(f.h)) * f.s, w: b.w * f.s, h: b.h * f.s };
}

/** Where each fairy's medallion sits along the bottom, in a layout's design units. */
function designMedallions(layout: Layout, dy = 0): { x: number; y: number; r: number }[] {
    const L = LAYOUT[layout],
        n = FAIRIES.length;
    // As many as fit across: on a phone the medallions shrink and close up once the roster gets long.
    const gap = Math.min(L.r * 2 + 10, (L.W - 12) / n),
        r = Math.min(L.r, gap / 2 - 2);
    const x0 = L.W / 2 - ((n - 1) * gap) / 2;
    return FAIRIES.map((_, i) => ({ x: x0 + i * gap, y: L.rowY + dy, r }));
}

/** The medallions in view units, for a layout and view height: the tap targets. */
export function rosterMedallions(
    layout: Layout,
    h: number = C.TALL_H,
    bleed = 0,
): { x: number; y: number; r: number }[] {
    if (layout !== 'tall' && painted()) {
        const f = rosterFits(bleed).tray,
            m = MOCK.meds;
        return FAIRIES.map((_, i) => ({ x: f.x + (m.x0 + i * m.gap) * f.s, y: f.y + m.y * f.s, r: 80 * f.s }));
    }
    if (layout !== 'tall') return designMedallions('wide');
    const f = tallMenuFit(h);
    return designMedallions('tall', tallShift(f.h)).map(m => ({ x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s }));
}

/** A small gold icon for a stat: wings for speed, a bolt for charge, a star for burst, a diamond for dodge. */
function statIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number): void {
    ctx.fillStyle = goldGradient(ctx, y - 4, y + 4);
    ctx.beginPath();
    if (kind === 'speed') {
        ctx.moveTo(x - 4, y + 2);
        ctx.quadraticCurveTo(x, y - 4, x + 4, y - 3);
        ctx.quadraticCurveTo(x + 1, y, x - 4, y + 2);
    } else if (kind === 'charge') {
        ctx.moveTo(x + 1, y - 4);
        ctx.lineTo(x - 3, y + 1);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x - 1, y + 4);
        ctx.lineTo(x + 3, y - 1);
        ctx.lineTo(x, y - 1);
    } else if (kind === 'burst') {
        sparkle(ctx, x, y, 4);
        return;
    } else {
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x - 4, y);
    }
    ctx.closePath();
    ctx.fill();
}

/** The Characters screen. */
export class RosterScreen {
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: RosterView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0, demo?: DemoDraw): void {
        const ctx = this.ctx;
        ctx.save();
        let H: number = C.VIEW_H,
            dy = 0;
        if (layout === 'tall') {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            H = f.h;
            dy = tallShift(f.h);
        }
        const L = LAYOUT[layout];
        const tall = layout === 'tall';
        if (!tall && painted()) {
            this.drawPainted(v, t, bleed, demo);
            ctx.restore();
            return;
        }
        enter(ctx, 'bg', () => ornateScreen(ctx, t, L.W, H, bleed, '', tall));
        enter(ctx, 'bar', () => ornateTitle(ctx, 'CHARACTERS', L.W, t, tall));
        const fy = FAIRIES[v.index],
            locked = v.locked[v.index];
        ctx.save();
        ctx.translate(0, dy);
        const { art, demo: win, info } = layout === 'wide' ? spread(bleed) : L;
        enter(ctx, 'panels', () => this.art(fy, locked, art, t), { dx: -22 });
        if (layout === 'wide') enter(ctx, 'panels', () => this.demo(fy, locked, win, v.caption, demo), { dx: 22 });
        else if (!locked) enter(ctx, 'buttons', () => this.previewButton(fy, t), { i: 4 });
        enter(ctx, 'panels', () => this.info(fy, locked, info, layout === 'tall', t), { dx: 0, dy: 10 });
        ctx.restore();
        const meds = designMedallions(layout, dy);
        enter(ctx, 'buttons', () => this.tray(meds, t));
        meds.forEach((m, i) =>
            enter(ctx, 'buttons', () => this.medallion(FAIRIES[i], v.locked[i], m, i === v.index, t), { i }),
        );
        enter(ctx, 'hint', () =>
            keyHints(
                ctx,
                [
                    [['◀', '▶'], 'BROWSE'],
                    [['ESC'], 'BACK'],
                ],
                L.W / 2,
                tall ? H - 12 : H - 9,
                v.touch ? 'TAP A FAIRY  ·  ◀ BACK' : null,
            ),
        );
        if (layout === 'tall' && v.demoOpen && !locked) this.popup(fy, v, H, demo);
        ctx.restore();
    }

    /**
     * Landscape Characters drawn from its painted mockup: the heading, her portrait in its crested frame with her name
     * on the plaque, her blurb, the two stat panels with her bars, her four skills, the live demo in its frame (fitted
     * to the meadow's shape), and the fairies' medallions along the tray, the one in view ringed and glowing.
     */
    private drawPainted(v: RosterView, t: number, bleed: number, draw?: DemoDraw): void {
        const ctx = this.ctx,
            f = rosterFits(bleed),
            fy = FAIRIES[v.index],
            locked = v.locked[v.index];
        enter(ctx, 'bg', () => ornateScreen(ctx, t, C.VIEW_W, C.VIEW_H, bleed, '', false));
        // The live meadow first, in view units, so the frame drawn over it covers its edges.
        const d = paintedDemo(MOCK.demo);
        enter(ctx, 'panels', () => drawDemoMeadow(ctx, f.right, d, locked ? null : (draw ?? null), v.caption), {
            dx: 22,
        });
        /** Runs `draw` in the mockup's pixels under one part's fit. */
        const inFit = (fit: MockFit, draw: () => void) => {
            ctx.save();
            ctx.translate(fit.x, fit.y);
            ctx.scale(fit.s, fit.s);
            draw();
            ctx.restore();
        };
        /** Draws piece `name` into a box of the mockup, with its glint every so often. */
        const piece = (name: string, b: readonly number[], phase = 0) => {
            KIT.draw(ctx, name, b[0], b[1], b[2], b[3]);
            KIT.glint(ctx, name, b[0], b[1], b[2], b[3], t, phase, 7);
        };
        enter(ctx, 'bar', () => inFit(f.title, () => piece('title', MOCK.title, 0.2)));
        enter(ctx, 'panels', () => inFit(f.left, () => this.paintedPortrait(fy, locked, t)), { dx: -22 });
        enter(ctx, 'panels', () => inFit(f.right, () => demoFrame(ctx, d)), { dx: 22 });
        enter(ctx, 'panels', () => inFit(f.mid, () => this.paintedInfo(fy, locked, t)), { dx: 0, dy: 10 });
        enter(ctx, 'buttons', () => inFit(f.tray, () => piece('tray', MOCK.tray, 1.2)));
        const m = MOCK.meds;
        FAIRIES.forEach((other, i) =>
            enter(
                ctx,
                'buttons',
                () =>
                    inFit(f.tray, () =>
                        this.paintedMedallion(other, v.locked[i], m.x0 + i * m.gap, m.y, i === v.index, t),
                    ),
                { i },
            ),
        );
        enter(ctx, 'hint', () =>
            keyHints(
                ctx,
                [
                    [['◀', '▶'], 'BROWSE'],
                    [['ESC'], 'BACK'],
                ],
                C.VIEW_W / 2,
                C.VIEW_H - 9,
                v.touch ? 'TAP A FAIRY  ·  ◀ BACK' : null,
            ),
        );
    }

    /**
     * Her portrait in a frame drawn in code (so it stays smooth at any size and the picture sits exactly inside it): a
     * glowing gold rounded frame with a dark outline and a bright inner edge, a star crest on top, and a violet plaque
     * across its foot with her name.
     */
    private paintedPortrait(fy: Fairy, locked: boolean, t: number): void {
        const ctx = this.ctx;
        // The frame's box and its border, in the mockup's pixels.
        const x = 172,
            y = 190,
            w = 768,
            h = 900,
            r = 72,
            b = 20;
        const ix = x + b,
            iy = y + b,
            iw = w - 2 * b,
            ih = h - 2 * b,
            ir = r - b;
        // Her picture, clipped to the frame's inside.
        ctx.save();
        roundRect(ctx, ix, iy, iw, ih, ir);
        ctx.clip();
        const bg = ctx.createRadialGradient(ix + iw / 2, iy + ih * 0.45, 40, ix + iw / 2, iy + ih * 0.45, 900);
        bg.addColorStop(0, locked ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, locked ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++)
            sparkle(ctx, ix + ((i * 330 + t * 80) % iw), iy + ((i * 230) % ih), 12 + (i % 3) * 6);
        if (locked) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            const k = Math.max(iw / sw, ih / sh);
            ctx.drawImage(p.img, sx, sy, sw, sh, ix + iw / 2 - (sw * k) / 2, iy, sw * k, sh * k);
        } else drawFairy(ctx, fy, ix + iw / 2, iy + ih * 0.46 + Math.sin(t * 2.2) * 18, 26, t, 0, false);
        ctx.filter = 'none';
        if (locked) arcadeText(ctx, '?', ix + iw / 2, iy + ih * 0.58, 360, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        // A little shade along the inside edge, so the picture sits under the frame.
        ctx.strokeStyle = 'rgba(20,6,30,0.45)';
        ctx.lineWidth = 14;
        roundRect(ctx, ix, iy, iw, ih, ir);
        ctx.stroke();
        ctx.restore();
        goldRoundFrame(ctx, x, y, w, h, r, b);
        // The crest on top: a four-pointed gold star round a violet gem, twinkling now and then.
        const cx = x + w / 2,
            cy = y + 4,
            pulse = 1 + 0.06 * Math.max(0, Math.sin(t * 2.4));
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = 'rgba(255,220,140,0.8)';
        ctx.shadowBlur = 30;
        /** Traces a four-pointed star `R` long and `q` thick at its waist. */
        const star = (R: number, q: number) => {
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (i * Math.PI) / 4 - Math.PI / 2,
                    rr = i % 2 ? q : R * (i % 4 === 0 ? 1 : 0.7);
                ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
            }
            ctx.closePath();
        };
        ctx.fillStyle = '#2a1006';
        star(96, 30);
        ctx.fill();
        ctx.shadowBlur = 0;
        const sg = ctx.createLinearGradient(0, -86, 0, 86);
        sg.addColorStop(0, '#fff6d0');
        sg.addColorStop(0.5, '#f2b53a');
        sg.addColorStop(1, '#b8640c');
        ctx.fillStyle = sg;
        star(84, 24);
        ctx.fill();
        const gem = ctx.createRadialGradient(-6, -8, 2, 0, 0, 26);
        gem.addColorStop(0, '#ffffff');
        gem.addColorStop(0.4, '#e2c8ff');
        gem.addColorStop(1, '#8a5ad8');
        ctx.fillStyle = gem;
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(20, 0);
        ctx.lineTo(0, 26);
        ctx.lineTo(-20, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        // The name plaque across the frame's foot.
        const px = x + 40,
            pw = w - 80,
            py = y + h - 70,
            ph = 140;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 24;
        ctx.fillStyle = '#2a1006';
        roundRect(ctx, px - 10, py - 10, pw + 20, ph + 20, (ph + 20) / 2);
        ctx.fill();
        ctx.restore();
        const gold = ctx.createLinearGradient(px, py, px + pw * 0.4, py + ph);
        gold.addColorStop(0, '#fff4c0');
        gold.addColorStop(0.5, '#e0a030');
        gold.addColorStop(1, '#a8600e');
        ctx.fillStyle = gold;
        roundRect(ctx, px, py, pw, ph, ph / 2);
        ctx.fill();
        const plate = ctx.createLinearGradient(0, py, 0, py + ph);
        plate.addColorStop(0, '#4a2286');
        plate.addColorStop(0.5, '#22103f');
        plate.addColorStop(1, '#341660');
        ctx.fillStyle = plate;
        roundRect(ctx, px + 12, py + 12, pw - 24, ph - 24, (ph - 24) / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,190,255,0.4)';
        ctx.lineWidth = 3;
        roundRect(ctx, px + 18, py + 18, pw - 36, ph - 36, (ph - 36) / 2);
        ctx.stroke();
        ctx.fillStyle = '#ffe9a8';
        sparkle(ctx, px + 70, py + ph / 2, 22);
        sparkle(ctx, px + pw - 70, py + ph / 2, 22);
        const name = locked ? 'LOCKED' : fy.name.toUpperCase();
        arcadeText(ctx, name, cx, py + ph / 2 + 28, 80, ['#fff7d8', '#ffd98a', '#e0a040'], 'center', pw - 220);
    }

    /** Her blurb, the stat panels with her bars, and her four skills, on panels drawn in code with their painted icons. */
    private paintedInfo(fy: Fairy, locked: boolean, t: number): void {
        const ctx = this.ctx;
        ctx.textAlign = 'left';
        ctx.font = `italic 600 50px ${FONT}`;
        ctx.fillStyle = locked ? '#ffe27a' : '#f6f0ff';
        const [bx, by] = MOCK.blurb;
        ctx.fillText(locked ? `To unlock: ${fy.unlock?.hint ?? ''}` : `${fy.blurb}.`, bx, by, 1500);
        glassPanel(ctx, MOCK.statsL[0], MOCK.statsL[1], MOCK.statsL[2], MOCK.statsL[3], 56);
        glassPanel(ctx, MOCK.statsR[0], MOCK.statsR[1], MOCK.statsR[2], MOCK.statsR[3], 56);
        const stats = statsOf(fy);
        stats.forEach(([label, n], i) => {
            const [x0, w] = MOCK.bars[i >> 1],
                y = MOCK.barRows[i & 1],
                bw = w / 5;
            const ib = MOCK.statIcons[i];
            KIT.draw(ctx, `statIcon${i}`, ib[0], ib[1], ib[2], ib[3]);
            arcadeText(ctx, label, MOCK.statLabels[i >> 1], y + 15, 40, ['#ffffff', '#f6efff', '#d8c8ff'], 'left', 150);
            for (let k = 0; k < 5; k++) {
                const on = !locked && k < n;
                ctx.fillStyle = on ? '#6af07a' : 'rgba(255,255,255,0.1)';
                slanted(x0 + k * bw, y - 17, bw - 12, 34, 12)(ctx);
                ctx.fill();
                if (on) {
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    slanted(x0 + k * bw + 4, y - 15, bw - 20, 9, 4)(ctx);
                    ctx.fill();
                }
            }
        });
        skillsOf(fy, locked).forEach(([kind, name, text], i) => {
            const y = MOCK.skills[i],
                cy = y + 71;
            glassPanel(ctx, 1046, cy - 61, 1460, 122, 61);
            KIT.draw(ctx, `skillIcon${i}`, 1040, y + 2, 146, 138);
            arcadeText(ctx, kind, 1224, y + 50, 34, ['#ffffff', '#f6efff', '#d8c8ff'], 'left', 480);
            arcadeText(ctx, name.toUpperCase(), 1224, y + 104, 48, ['#fff3c0', '#ffd45c', '#e08a1c'], 'left', 480);
            if (text) {
                ctx.textAlign = 'left';
                ctx.font = `italic 600 38px ${FONT}`;
                ctx.fillStyle = 'rgba(239,230,255,0.9)';
                ctx.fillText(`${text}.`, 1735, y + 76, 720);
            }
        });
        void t;
    }

    /** One fairy's medallion on the painted tray: her colour and her look in a gold ring, glowing when she's in view. */
    private paintedMedallion(fy: Fairy, locked: boolean, x: number, y: number, on: boolean, t: number): void {
        const ctx = this.ctx,
            r = on ? 80 : 66;
        ctx.save();
        const g = ctx.createRadialGradient(x, y - 20, 8, x, y, r);
        g.addColorStop(0, locked ? '#3a3360' : fy.color);
        g.addColorStop(1, locked ? '#141030' : shade(fy.color, 0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        if (locked) arcadeText(ctx, '?', x, y + 22, 64, ['#fff6d0', '#ffd45c', '#e88a1c'], 'center');
        else drawFairy(ctx, fy, x, y + 10, on ? 4.6 : 3.8, t);
        ctx.restore();
        if (on) {
            // Its ring holds still: no shine sweeping round it.
            KIT.draw(ctx, 'medOn', x - 120, y - 122, 240, 240);
        } else KIT.draw(ctx, 'medOff', x - 90, y - 90, 180, 180);
    }

    /** The PREVIEW button in the corner of her portrait (phones only), glowing gently. */
    private previewButton(fy: Fairy, t: number): void {
        const ctx = this.ctx,
            b = PREVIEW_BTN;
        const shape = slanted(b.x, b.y, b.w, b.h, 5);
        ctx.save();
        ctx.shadowColor = fy.color;
        ctx.shadowBlur = 6 + 4 * Math.sin(t * 3);
        ctx.fillStyle = 'rgba(12,8,32,0.85)';
        shape(ctx);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#fff3c9';
        ctx.lineWidth = 1.2;
        shape(ctx);
        ctx.stroke();
        // A play triangle, then the label.
        ctx.fillStyle = fy.color;
        ctx.beginPath();
        ctx.moveTo(b.x + 10, b.y + 5);
        ctx.lineTo(b.x + 16, b.y + b.h / 2);
        ctx.lineTo(b.x + 10, b.y + b.h - 5);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText('PREVIEW', b.x + 20, b.y + 12.5, b.w - 24);
    }

    /** On a phone: the demo, full size, over the dimmed screen, until a tap closes it. */
    private popup(fy: Fairy, v: RosterView, H: number, draw?: DemoDraw): void {
        const ctx = this.ctx,
            L = LAYOUT.tall;
        ctx.fillStyle = 'rgba(6,4,18,0.82)';
        ctx.fillRect(-200, 0, L.W + 400, H);
        const h = (C.FIELD_H_BASE * L.demo.w) / C.FIELD_W_BASE;
        const y = Math.max(34, (H - h) / 2 - 8);
        arcadeText(ctx, fy.name.toUpperCase(), L.W / 2, y - 8, 14, ['#ffffff', '#fff0c8', '#ffd27a'], 'center');
        this.demo(fy, false, { ...L.demo, y }, v.caption, draw);
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        ctx.fillText(v.touch ? 'TAP TO CLOSE' : 'ESC TO CLOSE', L.W / 2, y + h + 16);
    }

    /**
     * The fairy's portrait (or her in-game look, large) in a gold frame with a crest on top, her name on a plaque
     * across its foot between two stars.
     */
    private art(fy: Fairy, locked: boolean, a: { x: number; y: number; w: number; h: number }, t: number): void {
        const ctx = this.ctx;
        /** Trace the frame: rounded, with its top corners cut a little deeper. */
        const win = () => roundRect(ctx, a.x, a.y, a.w, a.h, 14);
        ctx.save();
        win();
        ctx.clip();
        const bg = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h * 0.45, 8, a.x + a.w / 2, a.y + a.h * 0.45, 150);
        bg.addColorStop(0, locked ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, locked ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(a.x, a.y, a.w, a.h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++) sparkle(ctx, a.x + ((i * 53 + t * 14) % a.w), a.y + ((i * 37) % a.h), 2 + (i % 3));
        if (locked) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            const k = Math.max(a.w / sw, a.h / sh);
            ctx.drawImage(p.img, sx, sy, sw, sh, a.x + a.w / 2 - (sw * k) / 2, a.y, sw * k, sh * k);
        } else drawFairy(ctx, fy, a.x + a.w / 2, a.y + a.h * 0.46 + Math.sin(t * 2.2) * 3, 4.2, t, 0, false);
        ctx.filter = 'none';
        if (locked)
            arcadeText(ctx, '?', a.x + a.w / 2, a.y + a.h * 0.58, 60, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        const fl = ctx.createLinearGradient(0, a.y + a.h - 50, 0, a.y + a.h);
        fl.addColorStop(0, 'rgba(8,5,24,0)');
        fl.addColorStop(1, 'rgba(8,5,24,0.85)');
        ctx.fillStyle = fl;
        ctx.fillRect(a.x, a.y + a.h - 50, a.w, 50);
        ctx.restore();
        goldFrame(ctx, win, a.y, a.y + a.h);
        ctx.strokeStyle = 'rgba(255,230,160,0.3)';
        ctx.lineWidth = 0.7;
        roundRect(ctx, a.x + 4, a.y + 4, a.w - 8, a.h - 8, 11);
        ctx.stroke();
        crest(ctx, a.x + a.w / 2, a.y + 2, 9, t);
        // The name plaque, across the foot of the frame.
        const pw = a.w + 6,
            ph = 22,
            px = a.x - 3,
            py = a.y + a.h - 12;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 6;
        const pg = ctx.createLinearGradient(0, py, 0, py + ph);
        pg.addColorStop(0, '#3a1e70');
        pg.addColorStop(1, '#180a3a');
        ctx.fillStyle = pg;
        pointed(ctx, px, py, pw, ph, 10);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, py, py + ph);
        ctx.lineWidth = 1.6;
        pointed(ctx, px, py, pw, ph, 10);
        ctx.stroke();
        const name = locked ? 'LOCKED' : fy.name.toUpperCase();
        arcadeText(
            ctx,
            name,
            a.x + a.w / 2,
            py + ph / 2 + 5.5,
            name.length > 9 ? 11 : 14,
            ['#fff7d8', '#ffd98a', '#e0a040'],
            'center',
            pw - 40,
        );
        ctx.fillStyle = '#ffe9a0';
        sparkle(ctx, px + 16, py + ph / 2, 3);
        sparkle(ctx, px + pw - 16, py + ph / 2, 3);
    }

    /**
     * The live demo window: her meadow, run by the real game code, in a glowing gold frame, with a caption saying
     * which move she's showing. A locked fairy's window stays dark.
     */
    private demo(
        fy: Fairy,
        locked: boolean,
        d: { x: number; y: number; w: number },
        caption: string,
        draw?: DemoDraw,
    ): void {
        const ctx = this.ctx;
        const s = d.w / C.FIELD_W_BASE,
            h = C.FIELD_H_BASE * s;
        ornatePanel(ctx, { x: d.x - 6, y: d.y - 6, w: d.w + 12, h: h + 12 }, 12, true);
        ctx.save();
        roundRect(ctx, d.x, d.y, d.w, h, 7);
        ctx.clip();
        if (!locked && draw) draw(d.x, d.y, s);
        else {
            ctx.fillStyle = '#120d2c';
            ctx.fillRect(d.x, d.y, d.w, h);
            arcadeText(ctx, '?', d.x + d.w / 2, d.y + h * 0.55, 40, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        }
        if (!locked && caption) {
            const g = ctx.createLinearGradient(0, d.y + h - 30, 0, d.y + h);
            g.addColorStop(0, 'rgba(8,5,24,0)');
            g.addColorStop(1, 'rgba(8,5,24,0.9)');
            ctx.fillStyle = g;
            ctx.fillRect(d.x, d.y + h - 30, d.w, 30);
            ctx.textAlign = 'right';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(caption.toUpperCase(), d.x + d.w - 7, d.y + h - 8, d.w - 14);
        }
        ctx.restore();
        goldFrame(ctx, () => roundRect(ctx, d.x - 6, d.y - 6, d.w + 12, h + 12, 12), d.y, d.y + h);
        void fy;
    }

    /**
     * Her blurb, her stats in two gold-framed panels (an icon, a name and five slanted bars each), and her four skills
     * as gold-framed rows: a glowing orb for an icon, the kind small, the name in gold, what it does in italics.
     */
    private info(
        fy: Fairy,
        locked: boolean,
        b: { x: number; y: number; w: number },
        compact: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        ctx.textAlign = 'left';
        ctx.font = `italic 600 ${compact ? 9.5 : 11}px ${FONT}`;
        ctx.fillStyle = locked ? '#ffe27a' : '#f6f0ff';
        ctx.fillText(locked ? `To unlock: ${fy.unlock?.hint ?? ''}` : `${fy.blurb}.`, b.x + 2, b.y + 4, b.w);
        // Stats: two panels side by side, two stats each.
        const stats = statsOf(fy);
        const pw = (b.w - 6) / 2,
            ph = 30,
            py = b.y + 12;
        for (let p = 0; p < 2; p++) {
            const px = b.x + p * (pw + 6);
            ornatePanel(ctx, { x: px, y: py, w: pw, h: ph }, 10);
            for (let r = 0; r < 2; r++) {
                const [label, n, icon] = stats[p * 2 + r];
                const sy = py + 11 + r * 11;
                statIcon(ctx, icon, px + 10, sy - 2.5);
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = '#f0e6ff';
                ctx.fillText(label, px + 17, sy);
                const bx = px + pw * 0.48,
                    bw = (pw * 0.48) / 5;
                for (let k = 0; k < 5; k++) {
                    const on = !locked && k < n;
                    ctx.fillStyle = on ? '#6af07a' : 'rgba(255,255,255,0.1)';
                    slanted(bx + k * bw, sy - 5.5, bw - 2, 6, 2.5)(ctx);
                    ctx.fill();
                }
            }
        }
        // Skills.
        const skills = skillsOf(fy, locked);
        const rh = compact ? 34 : 29,
            gap = compact ? 5 : 4;
        skills.forEach(([kind, name, text, color], i) => {
            const ry = py + ph + 7 + i * (rh + gap);
            ornatePanel(ctx, { x: b.x, y: ry, w: b.w, h: rh }, rh / 2);
            const or = rh / 2 - 3;
            iconOrb(ctx, b.x + or + 4, ry + rh / 2, or, color);
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 3 + i);
            sparkle(ctx, b.x + or + 4, ry + rh / 2, or * 0.55);
            ctx.globalAlpha = 1;
            const tx = b.x + or * 2 + 11;
            ctx.textAlign = 'left';
            ctx.font = `5px ${ARCADE}`;
            ctx.fillStyle = '#f0e6ff';
            ctx.fillText(kind, tx, ry + (compact ? 10 : 10));
            ctx.font = `${compact ? 9 : 9.5}px ${ARCADE}`;
            ctx.fillStyle = '#ffd45c';
            const nameW = compact ? b.w - (tx - b.x) - 8 : b.w * 0.38;
            ctx.fillText(name.toUpperCase(), tx, ry + (compact ? 20 : 21), nameW);
            if (text) {
                ctx.font = `italic 600 ${compact ? 8 : 8}px ${FONT}`;
                ctx.fillStyle = 'rgba(239,230,255,0.88)';
                if (compact) ctx.fillText(`${text}.`, tx, ry + 30, b.w - (tx - b.x) - 8);
                else ctx.fillText(`${text}.`, b.x + b.w * 0.5, ry + rh / 2 + 3, b.w * 0.48);
            }
        });
        if (!locked && fy.sprite === undefined)
            drawFairy(ctx, fy, b.x + b.w - 14, b.y - 2 + Math.sin(t * 2.4) * 2, 1.2, t);
    }

    /** The tray the medallions sit in: a long gold-framed capsule with gold arrows at its ends. */
    private tray(meds: { x: number; y: number; r: number }[], t: number): void {
        const ctx = this.ctx;
        const first = meds[0],
            last = meds[meds.length - 1];
        const x = first.x - first.r - 14,
            w = last.x + last.r + 14 - x,
            h = first.r * 2 + 12,
            y = first.y - h / 2;
        ornatePanel(ctx, { x, y, w, h }, h / 2);
        for (const dir of [-1, 1]) {
            const ax = dir < 0 ? x - 4 : x + w + 4,
                ay = first.y,
                k = Math.max(0, Math.sin(t * 4)) * 1.2 * dir;
            ctx.fillStyle = goldGradient(ctx, ay - 9, ay + 9);
            ctx.beginPath();
            ctx.moveTo(ax + dir * 10 + k, ay);
            ctx.lineTo(ax + k, ay - 9);
            ctx.lineTo(ax + k, ay + 9);
            ctx.closePath();
            ctx.fill();
        }
    }

    /** One medallion in the row along the bottom, ringed when it's the fairy in view. */
    private medallion(
        fy: Fairy,
        locked: boolean,
        m: { x: number; y: number; r: number },
        on: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const lift = on ? -2 + Math.sin(t * 4) : 0;
        ctx.save();
        const g = ctx.createRadialGradient(m.x, m.y + lift - 4, 2, m.x, m.y + lift, m.r);
        g.addColorStop(0, locked ? '#3a3360' : fy.color);
        g.addColorStop(1, locked ? '#141030' : shade(fy.color, 0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        if (locked) {
            ctx.font = `12px ${ARCADE}`;
            ctx.fillStyle = 'rgba(255,226,122,0.85)';
            ctx.textAlign = 'center';
            ctx.fillText('?', m.x, m.y + lift + 4);
        } else drawFairy(ctx, fy, m.x, m.y + lift + 2, 0.75, t);
        ctx.restore();
        ctx.strokeStyle = on ? '#ffe9a0' : goldGradient(ctx, m.y - m.r, m.y + m.r);
        ctx.lineWidth = on ? 2.6 : 1.4;
        if (on) {
            ctx.save();
            ctx.shadowColor = fy.color;
            ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.arc(m.x, m.y + lift, m.r + (on ? 2 : 0), 0, Math.PI * 2);
        ctx.stroke();
        if (on) ctx.restore();
    }
}
