import * as C from '@/core/config';
import { fairyAvailable } from '@/data/availability';
import { FAIRIES } from '@/data/characters';
import type { Layout, SelectSide, SelectView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted, sparkle } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { enter } from '@/render/transition';
import { mockFit } from './kit-ui';
import type { MockFit } from './kit-ui';
import { goldEdge } from './lobby-screen';
import { edgeTones, tracedPlate, tracedRing, tracedStar, tracedTitle, tracedVs } from './traced';

/**
 * The painted landscape fairy select's layout, in its mockup's 2x pixels: each piece's box (the piece fills it), each
 * card's portrait window and where the game writes on it, and the roster's medallions.
 */
const MOCK = {
    area: [45, 0, 3505, 1755],
    title: [680, 0, 2180, 205],
    cards: [
        {
            piece: 'cardL',
            box: [45, 220, 1075, 1535],
            // The rival's window mirrored, so both portraits are the same shape.
            window: [
                [98, 295],
                [1064, 295],
                [980, 1108],
                [98, 1108],
            ],
            tag: [265, 300],
            mid: 576,
            labels: 190,
            bars: [470, 1000],
        },
        {
            piece: 'cardR',
            box: [2420, 215, 1085, 1535],
            window: [
                [2476, 290],
                [3442, 290],
                [3442, 1103],
                [2560, 1103],
            ],
            tag: [3268, 305],
            mid: 2966,
            labels: 2580,
            bars: [2860, 3360],
        },
    ],
    // Name, blurb, the four stat rows and the skills line, down a card.
    rows: { name: 1196, blurb: 1312, stats: [1388, 1458, 1528, 1598], skills: 1678 },
    time: [1450, 225, 655, 285],
    digits: [1776, 462],
    meds: { mid: 1772, dx: 272, y0: 700, dy: 275, r: 104 },
    ring: [-140, -140, 280, 280],
    vs: [1290, 1150, 970, 350],
    prompt: [1140, 1510, 1265, 130],
    sub: [1295, 1640, 940, 100],
} as const;

/** How the painted fairy select sits in a widened landscape view `bleed` past each side. */
function selectFit(bleed: number): MockFit {
    const [x0, y0, x1, y1] = MOCK.area;
    return mockFit(C.VIEW_W, C.VIEW_H, bleed, x0, y0, x1, y1, 4);
}

/** Whether landscape fairy select is drawn to its mockup's layout (always: its pieces are traced in code). */
const painted = () => true;

/** Where roster medallion `i` sits in the painted layout, in its mockup's pixels. */
function paintedMedallion(i: number): { x: number; y: number; r: number } {
    const row = Math.floor(i / MED_COLS),
        inRow = Math.min(MED_COLS, FAIRIES.length - row * MED_COLS),
        col = i % MED_COLS,
        m = MOCK.meds;
    return { x: m.mid + (col - (inRow - 1) / 2) * m.dx, y: m.y0 + row * m.dy, r: m.r };
}

// Layout, in view units (504 x 320).
const PANEL_W = 160;
const PANEL_X = [8, C.VIEW_W - 8 - PANEL_W] as const;
const ART_Y = 34,
    ART_H = 168,
    SLANT = 10;
const MED_R = 18;
const MID_X = C.VIEW_W / 2;
const MED_COLS = 4;
const MED_DX = 40,
    MED_Y0 = 112,
    MED_DY = 44;

/** A side panel's size and place: the wide layout's, or the tall layout's narrower, compact one. */
interface PanelGeom {
    w: number;
    artY: number;
    artH: number;
    compact: boolean;
}
const WIDE_PANEL: PanelGeom = { w: PANEL_W, artY: ART_Y, artH: ART_H, compact: false };
const TALL_PANEL: PanelGeom = { w: 122, artY: 48, artH: 140, compact: true };
const TALL_PANEL_X = [6, C.TALL_W - 6 - 122] as const;

/** Where the centre column's pieces go in each layout. */
const CENTRE = {
    wide: {
        mid: MID_X,
        timeY: 42,
        vsX: MID_X,
        vsY: 236,
        vsSize: 34,
        hintY: 282,
        hintW: 230,
        W: C.VIEW_W,
    },
    tall: {
        mid: C.TALL_W / 2,
        timeY: 290,
        vsX: C.TALL_W / 2,
        vsY: 112,
        vsSize: 22,
        hintY: 494,
        hintW: 250,
        W: C.TALL_W,
    },
} as const;
/** The tall layout's roster: under the panels, a little bigger for fingers. */
const TALL_MED = { y0: 372, dx: 58, dy: 58, r: 23 } as const;

/** How far the tall select's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each roster medallion sits (centre), in roster order, for a layout and view height: the tap targets. */
export function medallionAt(
    i: number,
    layout: Layout = 'wide',
    h: number = C.TALL_H,
    bleed = 0,
): { x: number; y: number; r: number } {
    if (layout !== 'tall' && painted()) {
        const f = selectFit(bleed),
            m = paintedMedallion(i);
        return { x: f.x + m.x * f.s, y: f.y + m.y * f.s, r: m.r * f.s };
    }
    if (layout !== 'tall') return designMedallion(i, layout, h);
    const f = tallMenuFit(h);
    const m = designMedallion(i, layout, f.h);
    return { x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s };
}
/** Where a medallion sits in the screen's own design units, for a design height `h` (see menu-fit.ts). */
function designMedallion(
    i: number,
    layout: Layout = 'wide',
    h: number = C.TALL_H,
): { x: number; y: number; r: number } {
    const row = Math.floor(i / MED_COLS);
    const inRow = Math.min(MED_COLS, FAIRIES.length - row * MED_COLS);
    const col = i % MED_COLS;
    if (layout === 'tall')
        return {
            x: C.TALL_W / 2 + (col - (inRow - 1) / 2) * TALL_MED.dx,
            y: TALL_MED.y0 + tallShift(h) + row * TALL_MED.dy,
            r: TALL_MED.r,
        };
    return { x: MID_X + (col - (inRow - 1) / 2) * MED_DX, y: MED_Y0 + row * MED_DY, r: MED_R };
}
export const SELECT_COLS = MED_COLS;

/** The character select screen: both players' panels and the roster between them. */
export class SelectScreen {
    private backdrop: Backdrop;
    /** The layout of the frame being drawn, its height, and how far tall content is shifted down. */
    private layout: Layout = 'wide';
    private h: number = C.TALL_H;
    private dy = 0;
    /** How far past each side edge full-width bars reach this frame (see menu-fit.ts). */
    private bleed = 0;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the whole screen, wide or (for a portrait screen) tall; `bleed` is how far a widened view reaches past each side. */
    draw(v: SelectView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        this.layout = layout;
        const ctx = this.ctx;
        ctx.save();
        if (layout === 'tall') {
            // Designed TALL_H tall; a shorter view shrinks it to fit (see menu-fit.ts).
            const f = tallMenuFit(h);
            this.h = f.h;
            this.dy = tallShift(f.h);
            this.bleed = f.bleed;
            enter(ctx, 'bg', () => this.backdrop.draw(t, C.TALL_W / 2, (150 + this.dy) * f.s, C.TALL_W, h));
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            const g = { ...TALL_PANEL, artY: TALL_PANEL.artY + this.dy };
            v.sides.forEach((s, i) => {
                if (i === 0 || !v.solo)
                    enter(ctx, 'panels', () => this.panel(s, TALL_PANEL_X[i], i === 1, t, g), { dx: i ? 22 : -22 });
            });
        } else if (painted()) {
            this.drawPainted(v, t, bleed);
            ctx.restore();
            return;
        } else {
            this.h = h;
            this.dy = 0;
            // A widened landscape view: the sky and the heading bar reach `bleed` past each side.
            this.bleed = bleed;
            ctx.save();
            ctx.translate(-bleed, 0);
            enter(ctx, 'bg', () => this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H));
            ctx.restore();
            // On a widened view the two fairies' panels move out to the screen's edges.
            // A solo run has no rival, so no second panel.
            v.sides.forEach((s, i) => {
                if (i === 0 || !v.solo)
                    enter(ctx, 'panels', () => this.panel(s, PANEL_X[i] + (i === 0 ? -bleed : bleed), i === 1, t), {
                        dx: i ? 22 : -22,
                    });
            });
        }
        enter(ctx, 'bar', () => this.header(v.heading));
        enter(ctx, 'buttons', () => this.centre(v, t), { dy: 10 });
        ctx.restore();
    }

    // ---- painted (landscape) ------------------------------------------------------

    /**
     * Landscape fairy select drawn from its painted mockup: the heading banner, each side's card (her portrait in its
     * window, her tag, name, blurb, stats and skills), the timer, the roster's medallions with the players' cursors,
     * VS (or a solo run's name), and the two hint bars.
     */
    private drawPainted(v: SelectView, t: number, bleed: number): void {
        const ctx = this.ctx,
            f = selectFit(bleed);
        this.bleed = bleed;
        ctx.save();
        ctx.translate(-bleed, 0);
        enter(ctx, 'bg', () => this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H));
        ctx.restore();
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.s, f.s);
        v.sides.forEach((side, i) => {
            if (i === 0 || !v.solo) enter(ctx, 'panels', () => this.paintedCard(side, i, t), { dx: i ? 22 : -22 });
        });
        enter(ctx, 'bar', () => tracedTitle(ctx, v.heading, MOCK.title, t));
        enter(ctx, 'buttons', () => this.paintedCentre(v, t), { dy: 10 });
        ctx.restore();
    }

    /** One side's painted card, in the mockup's pixels. */
    private paintedCard(s: SelectSide, i: number, t: number): void {
        const ctx = this.ctx,
            c = MOCK.cards[i],
            R = MOCK.rows;
        const fy = s.cpu ? FAIRIES[Math.floor(t * 9) % FAIRIES.length] : s.fairy;
        const hidden = s.cpu === true || s.locked;
        /** Traces the card's portrait window. */
        const win = () => {
            ctx.beginPath();
            c.window.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
        };
        const [wx0, wy0] = c.window[0],
            wx1 = c.window[1][0],
            wy1 = c.window[2][1],
            ww = wx1 - wx0,
            wh = wy1 - wy0;
        ctx.save();
        win();
        ctx.clip();
        const bg = ctx.createRadialGradient(wx0 + ww / 2, wy0 + wh * 0.45, 40, wx0 + ww / 2, wy0 + wh * 0.45, 800);
        bg.addColorStop(0, hidden ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, hidden ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(wx0, wy0, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let k = 0; k < 9; k++)
            sparkle(ctx, wx0 + ((k * 330 + t * 80) % ww), wy0 + ((k * 230) % wh), 12 + (k % 3) * 6);
        if (hidden) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            const k = Math.max(ww / sw, wh / sh);
            ctx.drawImage(p.img, sx, sy, sw, sh, wx0 + ww / 2 - (sw * k) / 2, wy0, sw * k, sh * k);
        } else drawFairy(ctx, fy, wx0 + ww / 2, wy0 + wh * 0.5 + Math.sin(t * 2.2) * 18, 24, t, 0, false);
        ctx.filter = 'none';
        if (hidden)
            arcadeText(ctx, '?', wx0 + ww / 2, wy0 + wh * 0.64, 400, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        ctx.restore();
        // Once chosen, the window glows in the player's colour.
        if (s.done) {
            ctx.save();
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 14;
            ctx.globalAlpha = 0.55 + 0.35 * Math.sin(t * 8);
            win();
            ctx.stroke();
            ctx.restore();
        }
        this.cardFrame(i, win, t);
        arcadeText(ctx, s.tag, c.tag[0], c.tag[1] + 26, 72, ['#ffffff', '#fff6fa', '#f2e4ff'], 'center', 200);
        const off = !fairyAvailable(fy.id);
        const name = s.cpu ? '? ? ?' : s.locked ? (off ? 'UNAVAILABLE' : 'LOCKED') : fy.name.toUpperCase();
        // Centred in its plate (which runs from 92 above R.name to 38 below): capitals rise about 0.72 of their size.
        const nameSize = name.length > 9 ? 78 : 96;
        arcadeText(
            ctx,
            name,
            c.mid,
            R.name - 27 + nameSize * 0.36,
            nameSize,
            ['#fff6d0', '#ffd45c', '#e88a1c'],
            'center',
            820,
        );
        ctx.textAlign = 'center';
        ctx.font = `italic 600 54px ${FONT}`;
        ctx.fillStyle = s.locked ? '#ffe27a' : '#f6f0ff';
        const hint = off ? 'Not available right now' : (s.fairy.unlock?.hint ?? '');
        ctx.fillText(s.cpu ? 'Chooses at random' : s.locked ? hint : fy.blurb, c.mid, R.blurb, 820);
        const stats: [string, number][] = [
            ['SPEED', rate(fy.speed, 1.2)],
            ['BURST', rate(fy.burst, 1.3)],
            ['CHARGE', rate(1 / fy.charge, 2)],
            ['DODGE', rate(1 / fy.hitbox, 1 / 0.7)],
        ];
        const [b0, b1] = c.bars,
            bw = (b1 - b0) / 5;
        stats.forEach(([label, n], r) => {
            const y = R.stats[r];
            arcadeText(ctx, label, c.labels, y + 20, 50, ['#ffffff', '#f0e6ff', '#cbbcf5'], 'left');
            for (let k = 0; k < 5; k++) {
                const on = !hidden && k < n;
                ctx.fillStyle = on ? (k >= 4 ? '#ff8a5b' : k >= 3 ? '#ffd45c' : '#5cf07a') : 'rgba(255,255,255,0.1)';
                slanted(b0 + k * bw, y - 20, bw - 14, 40, 14)(ctx);
                ctx.fill();
            }
        });
        ctx.font = `italic 600 50px ${FONT}`;
        ctx.fillStyle = 'rgba(246,240,255,0.85)';
        ctx.fillText(hidden ? 'Bomb ???' : `Bomb ${fy.bomb.name}  ·  Shot ${fy.chargeName}`, c.mid, R.skills, 860);
        // READY! stamp once chosen.
        if (s.done && !s.cpu) {
            ctx.save();
            ctx.translate(wx0 + ww / 2, wy0 + wh * 0.74);
            ctx.rotate(i ? 0.18 : -0.18);
            const k = 6.2 * (1 + 0.04 * Math.sin(t * 9));
            ctx.scale(k, k);
            ctx.fillStyle = 'rgba(10,6,28,0.55)';
            ctx.fillRect(-62, -17, 124, 30);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-62, -17, 124, 30);
            arcadeText(ctx, 'READY!', 0, 7, 20, ['#ffffff', '#fff3a0', s.color], 'center');
            ctx.restore();
        }
    }

    /**
     * Side `i`'s card frame round its portrait window (traced by `win`), in the mockup's pixels: the window's heavy
     * edge, the player's tag on a slanted plate at its top corner, the name plate across the card under the window,
     * the stats sitting on the screen's own backdrop below; gold on the left, lilac for the rival on the right.
     */
    private cardFrame(i: number, win: () => void, t: number): void {
        const ctx = this.ctx,
            c = MOCK.cards[i],
            R = MOCK.rows;
        const tone = i === 0 ? 'gold' : 'lilac';
        const [bx, , bw] = c.box;
        // The window's edge, the same on both sides but for its colour: a soft halo, the heavy edge, and a bright line
        // down its middle.
        const glow = i === 0 ? 'rgba(255,190,70,' : 'rgba(200,140,255,';
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.strokeStyle = glow + '0.35)';
        ctx.lineWidth = 46;
        win();
        ctx.stroke();
        ctx.shadowColor = glow + '0.7)';
        ctx.shadowBlur = 40;
        goldEdge(ctx, win, c.window[0][1], c.window[2][1], edgeTones(tone), 18);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = i === 0 ? 'rgba(255,248,220,0.9)' : 'rgba(250,240,255,0.9)';
        ctx.lineWidth = 4;
        win();
        ctx.stroke();
        ctx.restore();
        // The name plate across the card.
        tracedPlate(ctx, bx + 6, R.name - 92, bw - 12, 130, 70, t, i * 0.9 + 0.5, tone, 12);
        // The tag on a slanted plate.
        const [tx, ty] = c.tag;
        const tw = 300,
            th = 112,
            x = tx - tw / 2,
            y = ty - th / 2 - 4;
        const tag = () => {
            ctx.beginPath();
            ctx.moveTo(x + 26, y);
            ctx.lineTo(x + tw, y);
            ctx.lineTo(x + tw - 26, y + th);
            ctx.lineTo(x, y + th);
            ctx.closePath();
        };
        const tg = ctx.createLinearGradient(0, y, 0, y + th);
        tg.addColorStop(0, i === 0 ? '#ff7aa8' : '#d8b8ff');
        tg.addColorStop(1, i === 0 ? '#d02a68' : '#8a5ad8');
        ctx.fillStyle = tg;
        tag();
        ctx.fill();
        goldEdge(ctx, tag, y, y + th, edgeTones(tone), 8);
    }

    /** The painted centre column: the timer, the roster with the cursors, VS, and the hints. */
    private paintedCentre(v: SelectView, t: number): void {
        const ctx = this.ctx;
        if (v.timer !== null) {
            // The timer: TIME over the seconds, straight on the backdrop.
            const [x, y, w] = MOCK.time;
            arcadeText(ctx, 'TIME', x + w / 2, y + 112, 58, ['#ffffff', '#f6eaff', '#d8c8ff'], 'center');
            const low = v.timer <= 5,
                pulse = low ? 1 + 0.12 * Math.max(0, Math.sin(t * 12)) : 1;
            ctx.save();
            ctx.translate(MOCK.digits[0], MOCK.digits[1]);
            ctx.scale(pulse, pulse);
            arcadeText(
                ctx,
                String(Math.max(0, v.timer)).padStart(2, '0'),
                0,
                0,
                150,
                low ? ['#ffffff', '#ff9a9a', '#ff3d5e'] : ['#ffffff', '#bfe8ff', '#4fb8ff'],
                'center',
            );
            ctx.restore();
        }
        v.cards.forEach((c, i) => {
            const m = paintedMedallion(i);
            const hovered = v.cursors.some(cu => cu.index === i);
            const y = m.y + (hovered ? -10 : 0);
            ctx.save();
            ctx.beginPath();
            ctx.arc(m.x, y, m.r, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(m.x, y - 30, 10, m.x, y, m.r);
            g.addColorStop(0, c.locked ? '#3a3360' : c.fairy.color);
            g.addColorStop(1, c.locked ? '#120e2c' : shade(c.fairy.color, 0.3));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.clip();
            const p = c.fairy.portrait;
            if (c.locked) drawFairy(ctx, c.fairy, m.x, y + 10, 6.6, t, 0, true);
            else if (p && p.img.complete && p.img.naturalWidth) {
                const [fx, fy, fr] = p.face;
                ctx.drawImage(p.img, fx - fr, fy - fr, fr * 2, fr * 2, m.x - m.r, y - m.r, m.r * 2, m.r * 2);
            } else drawFairy(ctx, c.fairy, m.x, y + 10, 6.6, t + i);
            if (!hovered) {
                ctx.fillStyle = 'rgba(10,6,28,0.3)';
                ctx.fillRect(m.x - m.r, y - m.r, m.r * 2, m.r * 2);
            }
            ctx.restore();
            tracedRing(ctx, m.x, y, m.r + 8, 18, t, i * 0.4);
            if (c.locked) arcadeText(ctx, '?', m.x, y + 30, 90, ['#fff6d0', '#ffd45c', '#e88a1c'], 'center');
        });
        // The players' cursors: a spinning dashed ring each (solid once chosen), with a tag.
        v.cursors.forEach((cu, k) => {
            const m = paintedMedallion(cu.index);
            const shared = v.cursors.length > 1 && v.cursors[0].index === v.cursors[1].index;
            const r = m.r + 34 + (shared && k === 1 ? 22 : 0),
                y = m.y - 10;
            ctx.save();
            ctx.strokeStyle = cu.color;
            ctx.lineWidth = 14;
            ctx.shadowColor = cu.color;
            ctx.shadowBlur = 30;
            if (!cu.done) {
                ctx.setLineDash([40, 22]);
                ctx.lineDashOffset = (k ? 1 : -1) * t * 170;
            }
            ctx.beginPath();
            ctx.arc(m.x, y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            ctx.font = `52px ${ARCADE}`;
            const w = ctx.measureText(cu.tag).width + 50;
            const ty = k === 0 ? y - r - 74 + Math.sin(t * 6) * 8 : y + r + 4 - Math.sin(t * 6) * 8;
            ctx.fillStyle = cu.color;
            slanted(m.x - w / 2, ty, w, 66, 16)(ctx);
            ctx.fill();
            ctx.fillStyle = '#140a26';
            ctx.textAlign = 'center';
            ctx.fillText(cu.tag, m.x, ty + 52);
        });
        if (v.solo) {
            // The mode's name in place of VS, with a line (the best run) under it.
            const [x, y, w, h] = MOCK.vs;
            arcadeText(ctx, v.solo.title, x + w / 2, y + h * 0.55, 120, ['#ffffff', '#ffd2a8', '#ff8a5c'], 'center', w);
            ctx.font = `46px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.textAlign = 'center';
            ctx.fillText(v.solo.line, x + w / 2, y + h * 0.55 + 80, w);
        } else {
            const [x, y, w, h] = MOCK.vs,
                k = 1 + 0.04 * Math.sin(t * 3);
            tracedVs(ctx, [x + (w * (1 - k)) / 2, y + (h * (1 - k)) / 2, w * k, h * k]);
        }
        if (v.hints[0]) {
            const [x, y, w, h] = MOCK.prompt;
            tracedPlate(ctx, x, y + 10, w, h - 20, 50, t, 3, 'gold', 9);
            tracedStar(ctx, x + 90, y + h / 2, 26, t);
            tracedStar(ctx, x + w - 90, y + h / 2, 26, t);
            ctx.globalAlpha = 0.7 + 0.3 * Math.abs(Math.sin(t * 3));
            arcadeText(
                ctx,
                v.hints[0],
                x + w / 2,
                y + h / 2 + 20,
                56,
                ['#ffffff', '#fff3c9', '#ffd45c'],
                'center',
                w - 240,
            );
            ctx.globalAlpha = 1;
        }
        if (v.hints[1]) {
            const [x, y, w, h] = MOCK.sub;
            tracedPlate(ctx, x, y + 8, w, h - 16, 40, t, 3.4, 'lilac', 6);
            ctx.textAlign = 'center';
            ctx.font = `44px ${ARCADE}`;
            ctx.fillStyle = '#d8c8ff';
            ctx.fillText(v.hints[1], x + w / 2, y + h / 2 + 16, w - 160);
        }
    }

    // ---- header ----------------------------------------------------------------

    /** Draw the heading bar across the top. */
    private header(text: string): void {
        const cg = CENTRE[this.layout];
        const tall = this.layout === 'tall';
        drawTopBar(this.ctx, text, cg.W, this.bleed, tall, tall ? 14 : 16, cg.mid);
    }

    // ---- side panels ------------------------------------------------------------

    /** Draw one player's side panel (portrait, name, stats), mirrored on the right. */
    private panel(s: SelectSide, x: number, mirror: boolean, t: number, g: PanelGeom = WIDE_PANEL): void {
        const ctx = this.ctx;
        const pw = g.w,
            ay = g.artY,
            ah = g.artH,
            cz = g.compact ? 0.8 : 1;
        // The CPU's panel spins through the roster until the match starts.
        const fy = s.cpu ? FAIRIES[Math.floor(t * 9) % FAIRIES.length] : s.fairy;
        const hidden = s.cpu === true || s.locked;
        const art = slanted(x, ay, pw, ah, mirror ? -SLANT : SLANT);

        // Art window: the fairy's colour glow, sparkles, then her portrait (or her in-game look, large).
        ctx.save();
        art(ctx);
        ctx.clip();
        const bg = ctx.createRadialGradient(x + pw / 2, ay + ah * 0.45, 8, x + pw / 2, ay + ah * 0.45, 130);
        bg.addColorStop(0, hidden ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, hidden ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(x - SLANT, ay, pw + SLANT * 2, ah);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++)
            sparkle(ctx, x + ((i * 53 + t * 14) % (pw + 20)) - 10, ay + ((i * 37) % ah), 2 + (i % 3));
        if (hidden) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            // Cover the window, keeping the crop's aspect.
            const k = Math.max((pw + SLANT * 2) / sw, ah / sh);
            const dw = sw * k,
                dh = sh * k;
            ctx.drawImage(p.img, sx, sy, sw, sh, x + pw / 2 - dw / 2, ay, dw, dh);
        } else {
            drawFairy(this.ctx, fy, x + pw / 2, ay + ah * 0.48 + Math.sin(t * 2.2) * 3, 4.2, t, 0, false);
        }
        ctx.filter = 'none';
        if (hidden) {
            arcadeText(ctx, '?', x + pw / 2, ay + ah * 0.62, 64 * cz, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        }
        // Floor shading so the nameplate sits on something.
        const fl = ctx.createLinearGradient(0, ay + ah - 50, 0, ay + ah);
        fl.addColorStop(0, 'rgba(8,5,24,0)');
        fl.addColorStop(1, 'rgba(8,5,24,0.85)');
        ctx.fillStyle = fl;
        ctx.fillRect(x - SLANT, ay + ah - 50, pw + SLANT * 2, 50);
        ctx.restore();

        // Frame: gold edge, inner dark line, a glow in the player's colour once chosen.
        ctx.save();
        if (s.done) {
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 10 + 4 * Math.sin(t * 8);
        }
        ctx.strokeStyle = s.done ? s.color : '#d9b45a';
        ctx.lineWidth = 2;
        art(ctx);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        slanted(x + 2, ay + 2, pw - 4, ah - 4, mirror ? -SLANT : SLANT)(ctx);
        ctx.stroke();

        // Player badge in the top corner.
        const bx = mirror ? x + pw - 6 : x + 6;
        ctx.font = `${13 * cz}px ${ARCADE}`;
        const bw = ctx.measureText(s.tag).width + 14;
        ctx.fillStyle = s.color;
        slanted(mirror ? bx - bw : bx, ay - 6, bw, 16, mirror ? -5 : 5)(ctx);
        ctx.fill();
        ctx.fillStyle = '#140a26';
        ctx.textAlign = 'center';
        ctx.fillText(s.tag, (mirror ? bx - bw : bx) + bw / 2, ay + 6);

        // Nameplate.
        const ny = ay + ah - 12;
        const plate = slanted(x - 2, ny, pw + 4, 24, mirror ? -8 : 8);
        const pg = ctx.createLinearGradient(x, 0, x + pw, 0);
        const c0 = hidden ? '#4a3f7a' : fy.color,
            c1 = hidden ? '#1d1840' : shade(fy.color, 0.3);
        pg.addColorStop(0, mirror ? c1 : c0);
        pg.addColorStop(1, mirror ? c0 : c1);
        ctx.fillStyle = pg;
        plate(ctx);
        ctx.fill();
        ctx.strokeStyle = '#fff3c9';
        ctx.lineWidth = 1.2;
        plate(ctx);
        ctx.stroke();
        const off = !fairyAvailable(fy.id);
        const name = s.cpu ? '? ? ?' : s.locked ? (off ? 'UNAVAILABLE' : 'LOCKED') : fy.name.toUpperCase();
        arcadeText(
            ctx,
            name,
            mirror ? x + pw - 12 : x + 12,
            ny + 18,
            (name.length > 9 ? 13 : 16) * cz,
            ['#ffffff', '#fff0c8', '#ffd27a'],
            mirror ? 'right' : 'left',
        );

        // Blurb and stats.
        let y = ny + 36 * cz;
        ctx.textAlign = mirror ? 'right' : 'left';
        const tx = mirror ? x + pw - 4 : x + 4;
        ctx.font = `italic 600 ${9 * cz}px ${FONT}`;
        ctx.fillStyle = s.locked ? '#ffe27a' : 'rgba(246,240,255,0.8)';
        const hint = off ? 'Not available right now' : (s.fairy.unlock?.hint ?? '');
        ctx.fillText(s.cpu ? 'Chooses at random' : s.locked ? hint : fy.blurb, tx, y, pw - 8);
        y += 8;
        const stats: [string, number][] = [
            ['SPEED', rate(fy.speed, 1.2)],
            ['BURST', rate(fy.burst, 1.3)],
            ['CHARGE', rate(1 / fy.charge, 2)],
            ['DODGE', rate(1 / fy.hitbox, 1 / 0.7)],
        ];
        for (const [label, n] of stats) {
            y += 11 * cz;
            ctx.font = `${8 * cz}px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.textAlign = 'left';
            ctx.fillText(label, x + 4, y);
            for (let k = 0; k < 5; k++) {
                const px = x + (g.compact ? 46 : 62) + k * (g.compact ? 14 : 18);
                const on = !hidden && k < n;
                ctx.fillStyle = on ? (k >= 4 ? '#ff8a5b' : k >= 3 ? '#ffd45c' : '#8ff0a0') : 'rgba(255,255,255,0.1)';
                slanted(px, y - 7 * cz, g.compact ? 11 : 15, 7 * cz, 3)(ctx);
                ctx.fill();
            }
        }
        y += 13 * cz;
        ctx.font = `italic 600 ${9 * cz}px ${FONT}`;
        ctx.fillStyle = 'rgba(246,240,255,0.65)';
        ctx.textAlign = 'left';
        ctx.fillText(hidden ? 'Bomb  ???' : `Bomb  ${fy.bomb.name}  ·  Shot  ${fy.chargeName}`, x + 4, y, pw - 8);

        // READY! stamp once chosen.
        if (s.done && !s.cpu) {
            ctx.save();
            ctx.translate(x + pw / 2, ay + ah * 0.74);
            ctx.rotate(mirror ? 0.18 : -0.18);
            const k = 1 + 0.04 * Math.sin(t * 9);
            ctx.scale(k * cz, k * cz);
            ctx.fillStyle = 'rgba(10,6,28,0.55)';
            ctx.fillRect(-62, -17, 124, 30);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-62, -17, 124, 30);
            arcadeText(ctx, 'READY!', 0, 7, 20, ['#ffffff', '#fff3a0', s.color], 'center');
            ctx.restore();
        }
    }

    // ---- centre column ----------------------------------------------------------

    /** Draw the centre column: timer, roster medallions and cursors. */
    private centre(v: SelectView, t: number): void {
        const ctx = this.ctx;
        const base = CENTRE[this.layout],
            dy = this.dy;
        const cg = { ...base, timeY: base.timeY + dy, vsY: base.vsY + dy, hintY: base.hintY + dy };
        // Timer.
        if (v.timer !== null) {
            ctx.textAlign = 'center';
            ctx.font = `8px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText('TIME', cg.mid, cg.timeY);
            const low = v.timer <= 5;
            const pulse = low ? 1 + 0.12 * Math.max(0, Math.sin(t * 12)) : 1;
            ctx.save();
            ctx.translate(cg.mid, cg.timeY + 24);
            ctx.scale(pulse, pulse);
            arcadeText(
                ctx,
                String(Math.max(0, v.timer)).padStart(2, '0'),
                0,
                0,
                24,
                low ? ['#ffffff', '#ff9a9a', '#ff3d5e'] : ['#ffffff', '#bfe8ff', '#4fb8ff'],
                'center',
            );
            ctx.restore();
        }

        // Roster medallions.
        v.cards.forEach((c, i) => {
            const m = designMedallion(i, this.layout, this.h);
            const hovered = v.cursors.some(cu => cu.index === i);
            const lift = hovered ? -2 : 0;
            ctx.save();
            ctx.beginPath();
            ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(m.x, m.y + lift - 6, 2, m.x, m.y + lift, m.r);
            g.addColorStop(0, c.locked ? '#3a3360' : c.fairy.color);
            g.addColorStop(1, c.locked ? '#120e2c' : shade(c.fairy.color, 0.3));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.clip();
            const p = c.fairy.portrait;
            if (c.locked) {
                drawFairy(this.ctx, c.fairy, m.x, m.y + lift + 2, 1.15, t, 0, true);
            } else if (p && p.img.complete && p.img.naturalWidth) {
                const [fx, fy, fr] = p.face;
                ctx.drawImage(p.img, fx - fr, fy - fr, fr * 2, fr * 2, m.x - m.r, m.y + lift - m.r, m.r * 2, m.r * 2);
            } else {
                drawFairy(this.ctx, c.fairy, m.x, m.y + lift + 2, 1.15, t + i);
            }
            if (!hovered) {
                ctx.fillStyle = 'rgba(10,6,28,0.35)';
                ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
            }
            ctx.restore();
            ctx.strokeStyle = hovered ? '#fff3c9' : '#a8894a';
            ctx.lineWidth = hovered ? 2 : 1.5;
            ctx.beginPath();
            ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
            ctx.stroke();
            if (c.locked) {
                ctx.font = `14px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.textAlign = 'center';
                ctx.fillText('?', m.x, m.y + 5);
            }
        });

        // Cursors: a spinning dashed ring per player (solid once chosen), with a tag.
        v.cursors.forEach((cu, k) => {
            const m = designMedallion(cu.index, this.layout, this.h);
            const shared = v.cursors.length > 1 && v.cursors[0].index === v.cursors[1].index;
            const r = m.r + 4 + (shared && k === 1 ? 4 : 0);
            ctx.save();
            ctx.strokeStyle = cu.color;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = cu.color;
            ctx.shadowBlur = 8;
            if (!cu.done) {
                ctx.setLineDash([7, 4]);
                ctx.lineDashOffset = (k ? 1 : -1) * t * 30;
            }
            ctx.beginPath();
            ctx.arc(m.x, m.y - 2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            // Tag above (P1) or below (P2) the medallion.
            ctx.font = `9px ${ARCADE}`;
            const w = ctx.measureText(cu.tag).width + 8;
            const ty = k === 0 ? m.y - r - 12 + Math.sin(t * 6) * 1.5 : m.y + r - 2 - Math.sin(t * 6) * 1.5;
            ctx.fillStyle = cu.color;
            slanted(m.x - w / 2, ty, w, 11, 3)(ctx);
            ctx.fill();
            ctx.fillStyle = '#140a26';
            ctx.textAlign = 'center';
            ctx.fillText(cu.tag, m.x, ty + 9);
        });

        // VS emblem.
        const vy = cg.vsY;
        ctx.save();
        ctx.translate(cg.vsX, vy);
        const vk = 1 + 0.05 * Math.sin(t * 3);
        ctx.scale(vk, vk);
        ctx.shadowColor = '#ff6b8a';
        ctx.shadowBlur = 16;
        if (v.solo) {
            // The mode's name in place of VS, with a line (the best run) under it; on a phone it takes the
            // rival's empty half beside your panel.
            if (this.layout === 'tall') ctx.translate(TALL_PANEL_X[1] + TALL_PANEL.w / 2 - cg.vsX, 60);
            ctx.shadowColor = '#ff8a5c';
            arcadeText(
                ctx,
                v.solo.title,
                0,
                cg.vsSize * 0.2,
                cg.vsSize * 0.55,
                ['#ffffff', '#ffd2a8', '#ff8a5c'],
                'center',
            );
            ctx.shadowBlur = 0;
            ctx.font = `8px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.textAlign = 'center';
            ctx.fillText(v.solo.line, 0, cg.vsSize * 0.2 + 16);
        } else arcadeText(ctx, 'VS', 0, cg.vsSize * 0.35, cg.vsSize, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
        ctx.restore();

        // Control hints.
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        v.hints.forEach((h, i) => {
            ctx.fillStyle =
                i === 0 ? `rgba(255,243,201,${0.55 + 0.45 * Math.abs(Math.sin(t * 3))})` : 'rgba(203,188,245,0.75)';
            ctx.fillText(h, cg.mid, cg.hintY + i * 11, cg.hintW);
        });
    }
}

// ---- helpers ------------------------------------------------------------------

/** Stat pips, 1 to 5, from a multiplier where `top` earns five. */
function rate(v: number, top: number): number {
    return Math.max(1, Math.min(5, Math.round(3 + ((v - 1) / (top - 1)) * 2)));
}
