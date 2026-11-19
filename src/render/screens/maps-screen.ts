// The Maps screen (main menu): each stage's map with its trophy requirement, how its formations fly, its five
// monsters by role, and a live demo meadow on the map running its real formations (see game/map-preview.ts).
import * as C from '@/core/config';
import { MAPS } from '@/data/maps';
import { monstersFor } from '@/data/monsters';
import { STAGES, stageFor } from '@/data/stages';
import type { Layout, MapTheme, MapsView, MonsterKind, MonsterSheet } from '@/types';
import { drawTrophy } from '@/render/icons';
import { ARCADE, FONT } from '@/render/theme';
import { drawPadlock } from './map-screen';
import { tallMenuFit } from './menu-fit';
import type { DemoDraw } from './roster-screen';
import { demoFrame, drawDemoMeadow, paintedDemo, trayBar } from './roster-screen';
import { PieceAtlas } from './kit';
import { kitReady } from './kit-ui';
import type { MockFit } from './kit-ui';
import { MAPS_KIT } from '@/data/maps-kit';
import kitUrl from '@/../assets/ui/maps-kit.png';
import goldUrl from '@/../assets/ui/maps-kit-gold.png';
import { arcadeText, sparkle } from '@/render/draw';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import { gem, goldFrame, goldGradient, keyHints, ornatePanel, ornateScreen, ornateTitle, pointed } from './ornate';

/** Where things go in each layout, in its design units. */
const LAYOUT = {
    wide: {
        W: C.VIEW_W,
        info: { x: 14, y: 44, w: 306 },
        demo: { x: 340, y: 40, w: 148 },
        rowY: 268,
        r: 14,
        tile: 58,
    },
    tall: {
        W: C.TALL_W,
        info: { x: 12, y: 50, w: 240 },
        demo: { x: 57, y: 238, w: 150 },
        rowY: 480,
        r: 13,
        tile: 46,
    },
} as const;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each map's medallion sits along the bottom, in a layout's design units. */
function designMedallions(layout: Layout, dy = 0, bleed = 0): { x: number; y: number; r: number }[] {
    const L = LAYOUT[layout],
        gap = L.r * 2 + (layout === 'tall' ? 5 : 10 + Math.min(14, bleed / 6));
    const x0 = L.W / 2 - ((MAPS.length - 1) * gap) / 2;
    return MAPS.map((_, i) => ({ x: x0 + i * gap, y: L.rowY + dy, r: L.r }));
}

/** The medallions in view units, for a layout, view height and widened-view bleed: the tap targets. */
export function mapsMedallions(layout: Layout, h: number = C.TALL_H, bleed = 0): { x: number; y: number; r: number }[] {
    if (layout !== 'tall' && painted()) {
        const f = mapsFits(bleed);
        return discXs(f.trayW).map(x => ({
            x: f.tray.x + x * f.tray.s,
            y: f.tray.y + TRAY.discY * f.tray.s,
            r: (TRAY.discR + 20) * f.tray.s,
        }));
    }
    if (layout !== 'tall') return designMedallions('wide', 0, bleed);
    const f = tallMenuFit(h);
    return designMedallions('tall', tallShift(f.h)).map(m => ({ x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s }));
}

/** The painted Maps screen's pieces (cut from its mockup by tools/extract-screen-kit.py). */
const KIT = new PieceAtlas(kitUrl, goldUrl, MAPS_KIT);

/**
 * The painted landscape Maps screen's layout, in its mockup's 2x pixels: each piece's box (the piece fills it), the
 * emblem's circle, where the game writes the name, the place on the road, the blurb and the monsters' names, the
 * difficulty's pips, the five cards, the demo's room, and the stage discs' centres.
 */
const MOCK = {
    area: [30, 20, 2625, 1470],
    title: [436, 20, 1647, 220],
    plate: [30, 232, 1070, 268],
    emblem: [244, 365, 90],
    name: [400, 372],
    difficulty: [1110, 333, 712, 121],
    blurb: [70, 552],
    monsters: [78, 588, 1709, 109],
    cards: [
        [53, 396],
        [416, 753],
        [777, 1110],
        [1136, 1469],
        [1493, 1812],
    ],
    demo: [2227, 240, 920, 36, 36, 36],
} as const;

/** Where each part of the painted Maps screen sits in the view, all at one scale. */
interface MapsFits {
    /** The heading, along the top. */
    title: MockFit;
    /** The stage's plate, blurb and monsters, against the left edge. */
    left: MockFit;
    /** The preview, against the right edge. */
    right: MockFit;
    /** The stages' tray, across the bottom, its middle at the mockup's x 0. */
    tray: MockFit;
    /** How wide the tray is, in the mockup's pixels. */
    trayW: number;
    /** Where the left part's right edge is (the room before the preview), in the mockup's pixels. */
    infoR: number;
}

/** The stages' tray: its middle's height, its height, and the discs' size, in the mockup's pixels. */
const TRAY = { y: 1300, h: 290, discY: 1278, discR: 88, nameY: 1392 };

/**
 * How the painted Maps screen fills a widened landscape view `bleed` past each side: one scale, as big as the screen
 * allows, with the heading against the top, the plate, blurb and monsters against the left edge, the preview against
 * the right, and the tray of stages across the whole width along the bottom.
 */
function mapsFits(bleed: number): MapsFits {
    const x0 = -bleed + 4,
        x1 = C.VIEW_W + bleed - 4,
        y0 = 2,
        y1 = C.VIEW_H - 18;
    const d = paintedDemo(MOCK.demo).frame;
    const infoX0 = 30,
        infoX1 = 1830,
        gap = 60;
    const s = Math.min((y1 - y0) / 1460, (x1 - x0) / (infoX1 - infoX0 + d.w + gap));
    /** A fit drawing the mockup's point (mx, my) at the view's (vx, vy). */
    const at = (mx: number, my: number, vx: number, vy: number): MockFit => ({ s, x: vx - mx * s, y: vy - my * s });
    const title = at(MOCK.title[0] + MOCK.title[2] / 2, 20, (x0 + x1) / 2, y0);
    const tray = at(0, TRAY.y + TRAY.h / 2, (x0 + x1) / 2, y1);
    const top = title.y + 220 * s,
        bottom = tray.y + (TRAY.y - TRAY.h / 2) * s;
    const band = (top + bottom) / 2;
    const left = at(infoX0, (232 + 1150) / 2, x0, band),
        right = at(d.x + d.w, d.y + d.h / 2, x1, band);
    const infoR = infoX0 + (right.x + d.x * s - x0) / s - gap;
    return { title, left, right, tray, trayW: (x1 - x0) / s - 30, infoR };
}

/** The stages' discs across the tray, in the tray's mockup pixels (its middle at x 0). */
function discXs(trayW: number): number[] {
    const inner = trayW - 2 * TRAY.h * 0.86 - 40,
        step = inner / MAPS.length;
    return MAPS.map((_, i) => -inner / 2 + step * (i + 0.5));
}

/** Whether landscape Maps is drawn from its painted pieces (once they've loaded). */
const painted = () => KIT.ready() && kitReady();

/** Space between the monster tiles on a wide screen. */
const TILE_GAP = 6;

/** Each monster's part in a map's formations, in the order the screen shows them. */
const ROLES: [string, (s: MonsterSheet) => MonsterKind][] = [
    ['PLAIN', s => s.roster[0]],
    ['PLAIN', s => s.roster[1] ?? s.roster[0]],
    ['SHELLED', s => s.shelled],
    ['SPINNER', s => s.spinner],
    ['BIG', s => s.big],
];

/** The Maps screen. */
export class MapsScreen {
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: MapsView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0, demo?: DemoDraw): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            H = f.h;
            dy = tallShift(f.h);
        }
        const L = LAYOUT[layout];
        if (!tall && painted()) {
            this.drawPainted(v, t, bleed, demo);
            ctx.restore();
            return;
        }
        enter(ctx, 'bg', () => ornateScreen(ctx, t, L.W, H, bleed, '', tall));
        enter(ctx, 'bar', () => ornateTitle(ctx, 'MAPS', L.W, t, tall));
        const map = MAPS[v.index],
            locked = v.locked[v.index];
        ctx.save();
        ctx.translate(0, dy);
        // On a widened screen the demo keeps to the right edge and the details sit centred in the room left.
        const win = tall ? L.demo : { ...L.demo, x: L.demo.x + bleed };
        let info: { x: number; y: number; w: number } = L.info;
        let tile: number = L.tile;
        if (!tall) {
            // The details take all the room from the left edge to the demo; the monster tiles grow to fill it.
            const x = L.info.x - bleed,
                room = win.x - 16 - x;
            info = { ...L.info, x, w: room };
            tile = Math.max(L.tile, Math.min(96, (room - 4 * TILE_GAP) / ROLES.length));
        }
        enter(ctx, 'panels', () => this.info(map, v.index, locked, info, tile, tall, t), { dx: -22 });
        enter(ctx, 'panels', () => this.demo(map, win, v.caption, demo), { dx: 22 });
        ctx.restore();
        const meds = designMedallions(layout, dy, bleed);
        enter(ctx, 'buttons', () => this.tray(meds, t));
        meds.forEach((m, i) =>
            enter(
                ctx,
                'buttons',
                () => {
                    this.medallion(MAPS[i], v.locked[i], m, i === v.index, t);
                    this.nameTag(MAPS[i], m, i === v.index, tall);
                },
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
                L.W / 2,
                tall ? H - 12 : H - 9,
                v.touch ? 'TAP A MAP  ·  ◀ BACK' : null,
            ),
        );
        ctx.restore();
    }

    /**
     * Landscape Maps drawn from its painted mockup: the heading; the stage plate with its icon, name and place on the
     * trophy road; how hard it is; the blurb; the five monsters on their cards; the live demo in its frame (fitted to
     * the meadow's shape); and the stages' discs along the tray, the one in view in a glowing ring.
     */
    private drawPainted(v: MapsView, t: number, bleed: number, draw?: DemoDraw): void {
        const ctx = this.ctx,
            f = mapsFits(bleed),
            map = MAPS[v.index],
            locked = v.locked[v.index],
            stage = stageFor(map.id);
        enter(ctx, 'bg', () => ornateScreen(ctx, t, C.VIEW_W, C.VIEW_H, bleed, '', false));
        const d = paintedDemo(MOCK.demo);
        enter(ctx, 'panels', () => drawDemoMeadow(ctx, f.right, d, draw ?? null, v.caption), { dx: 22 });
        /** Runs `draw` in the mockup's pixels under one part's fit. */
        const inFit = (fit: MockFit, draw: () => void) => {
            ctx.save();
            ctx.translate(fit.x, fit.y);
            ctx.scale(fit.s, fit.s);
            draw();
            ctx.restore();
        };
        enter(ctx, 'bar', () =>
            inFit(f.title, () => {
                const b = MOCK.title;
                KIT.draw(ctx, 'title', b[0], b[1], b[2], b[3]);
                KIT.glint(ctx, 'title', b[0], b[1], b[2], b[3], t, 0.2, 7);
            }),
        );
        enter(ctx, 'panels', () => inFit(f.right, () => demoFrame(ctx, d)), { dx: 22 });
        enter(ctx, 'panels', () => inFit(f.left, () => this.paintedInfo(map, v.index, locked, stage, t, f.infoR)), {
            dx: -22,
        });
        const xs = discXs(f.trayW);
        enter(ctx, 'buttons', () =>
            inFit(f.tray, () => trayBar(ctx, -f.trayW / 2, TRAY.y - TRAY.h / 2, f.trayW, TRAY.h)),
        );
        MAPS.forEach((m, i) =>
            enter(
                ctx,
                'buttons',
                () => inFit(f.tray, () => this.paintedDisc(m, i, xs[i], v.locked[i], i === v.index, t)),
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
                v.touch ? 'TAP A MAP  ·  ◀ BACK' : null,
            ),
        );
    }

    /** A gold edge along `path`, drawn in code: a dark outline, then the gold. */
    private goldEdge(path: () => void, y0: number, y1: number, width = 6): void {
        const ctx = this.ctx;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#2a1006';
        ctx.lineWidth = width + 6;
        path();
        ctx.stroke();
        ctx.strokeStyle = goldGradient(ctx, y0, y1);
        ctx.lineWidth = width;
        path();
        ctx.stroke();
    }

    /** A dark violet fill along `path`, shaded from top to bottom. */
    private violet(path: () => void, y0: number, y1: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, '#4a2286');
        g.addColorStop(0.5, '#22103f');
        g.addColorStop(1, '#341660');
        ctx.fillStyle = g;
        path();
        ctx.fill();
    }

    /**
     * The stage plate, difficulty, blurb, monsters heading and monster cards, all drawn in code with the game's own
     * words and pictures on them.
     */
    private paintedInfo(
        map: MapTheme,
        index: number,
        locked: boolean,
        stage: { trophies: number; blurb: string },
        t: number,
        R: number,
    ): void {
        const ctx = this.ctx;
        // The plate: a pointed violet banner round the emblem and the name, edged in gold twice over.
        const bx0 = 92,
            by0 = 256,
            bh = 196;
        // The emblem sits in the banner's left end, centred on its height, its ring wholly inside.
        const ex = MOCK.emblem[0],
            ey = by0 + bh / 2,
            er = 74;
        const banner = () => pointed(ctx, bx0, by0, 1090 - bx0, bh, 56);
        ctx.save();
        ctx.shadowColor = 'rgba(150,80,255,0.45)';
        ctx.shadowBlur = 34;
        this.violet(banner, by0, by0 + bh);
        ctx.restore();
        this.goldEdge(banner, by0, by0 + bh, 7);
        ctx.strokeStyle = 'rgba(255,214,120,0.75)';
        ctx.lineWidth = 3;
        pointed(ctx, bx0 + 16, by0 + 12, 1090 - bx0 - 32, bh - 24, 48);
        ctx.stroke();
        ctx.save();
        ctx.beginPath();
        ctx.arc(ex, ey, er + 2, 0, Math.PI * 2);
        const sky = ctx.createLinearGradient(0, ey - er, 0, ey + er);
        sky.addColorStop(0, map.sky[1]);
        sky.addColorStop(1, map.sky[0]);
        ctx.fillStyle = sky;
        ctx.fill();
        ctx.clip();
        const icon = MAPS_KIT[`icon${index}`];
        if (icon) {
            const k = (er * 1.55) / Math.max(icon.w, icon.h);
            const w = icon.w * k,
                h = icon.h * k;
            KIT.draw(ctx, `icon${index}`, ex - w / 2, ey - h / 2 + Math.sin(t * 2) * 3, w, h);
        }
        ctx.restore();
        ctx.save();
        ctx.shadowColor = 'rgba(255,200,80,0.8)';
        ctx.shadowBlur = 24;
        ctx.strokeStyle = '#2a1006';
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.arc(ex, ey, er + 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, ey - er, ey + er);
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.arc(ex, ey, er + 10, 0, Math.PI * 2);
        ctx.stroke();
        // The plaque with its place on the trophy road, pointed at both ends, over the banner's foot.
        const plaque = () => pointed(ctx, 392, 418, 560, 82, 30);
        ctx.fillStyle = '#1a0a30';
        plaque();
        ctx.fill();
        this.goldEdge(plaque, 418, 500, 5);
        const [nx, ny] = MOCK.name;
        ctx.textAlign = 'left';
        ctx.font = `italic 700 104px ${FONT}`;
        const ng = ctx.createLinearGradient(0, ny - 80, 0, ny + 10);
        ng.addColorStop(0, '#fff7d8');
        ng.addColorStop(0.6, '#ffd45c');
        ng.addColorStop(1, '#e08a1c');
        ctx.fillStyle = ng;
        ctx.fillText(map.name.toUpperCase(), nx, ny - 6, 620);
        // Its place on the trophy road, and whether it's open.
        // Centred in the plaque, both across and up and down.
        const sx = 392 + 560 / 2,
            sy = 418 + 82 / 2 + 13;
        ctx.font = `36px ${ARCADE}`;
        const st = `STAGE ${index + 1} OF ${STAGES.length}  ·  `,
            tail = locked ? `${stage.trophies}` : 'OPEN',
            tw = ctx.measureText(st).width + ctx.measureText(tail).width + (locked ? 40 : 0);
        ctx.textAlign = 'left';
        ctx.fillStyle = '#fff3c9';
        ctx.fillText(st, sx - tw / 2, sy);
        const tx = sx - tw / 2 + ctx.measureText(st).width;
        ctx.fillStyle = locked ? '#ffb0b0' : '#8ff0a0';
        if (locked) {
            drawTrophy(ctx, tx + 14, sy - 12, 22);
            ctx.fillText(tail, tx + 40, sy);
        } else ctx.fillText(tail, tx, sy);
        // How hard: a pointed plate with a pip per stage, lit up to this one.
        // At the right of the room, however wide it is.
        // At the right of the room, however wide it is, as wide as the room between it and the banner allows.
        const [, dy, , dh] = MOCK.difficulty,
            dw = Math.min(980, R - 1150),
            dx = R - dw;
        const diff = () => pointed(ctx, dx + 10, dy + 14, dw - 20, dh - 28, 34);
        this.violet(diff, dy, dy + dh);
        this.goldEdge(diff, dy, dy + dh, 5);
        arcadeText(ctx, 'DIFFICULTY', dx + 64, dy + dh / 2 + 14, 38, ['#ffffff', '#f6efff', '#d8c8ff'], 'left', 280);
        ctx.font = `38px ${ARCADE}`;
        const p0 = dx + 64 + Math.min(280, ctx.measureText('DIFFICULTY').width) + 36,
            p1 = dx + dw - 76,
            pw = (p1 - p0) / STAGES.length,
            ph = 40,
            py = dy + (dh - ph) / 2;
        for (let i = 0; i < STAGES.length; i++) {
            ctx.fillStyle =
                i <= index ? (i >= 5 ? '#ff7a6a' : i >= 3 ? '#ffd45c' : '#6af07a') : 'rgba(255,255,255,0.12)';
            ctx.fillRect(p0 + i * pw, py, pw - 10, ph);
        }
        const [bx, by] = MOCK.blurb;
        ctx.textAlign = 'left';
        ctx.font = `italic 600 48px ${FONT}`;
        ctx.fillStyle = '#f0e8ff';
        ctx.fillText(`${stage.blurb}.`, bx, by, 1740);
        // The monsters heading: a pointed tag with a sparkle, then a gold rule out to a gem.
        const [hx, hy, , hh] = MOCK.monsters,
            hw = R - hx;
        const tag = () => pointed(ctx, hx + 6, hy + 10, 420, hh - 20, 30);
        this.violet(tag, hy, hy + hh);
        this.goldEdge(tag, hy, hy + hh, 5);
        ctx.fillStyle = '#ffd45c';
        sparkle(ctx, hx + 76, hy + hh / 2, 24);
        arcadeText(ctx, 'MONSTERS', hx + 120, hy + hh / 2 + 16, 46, ['#fff6d0', '#ffd45c', '#e88a1c'], 'left', 280);
        ctx.strokeStyle = goldGradient(ctx, hy, hy + hh);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(hx + 440, hy + hh / 2);
        ctx.lineTo(hx + hw - 30, hy + hh / 2);
        ctx.stroke();
        gem(ctx, hx + hw - 20, hy + hh / 2, 12);
        // The cards.
        const sheet = monstersFor(map.id);
        // The five cards share the room's width.
        const cardGap = 24,
            cw = (R - 53 - 4 * cardGap) / 5;
        MOCK.cards.forEach((_, i) => {
            const x0 = 53 + i * (cw + cardGap),
                x1 = x0 + cw;
            const cx = (x0 + x1) / 2,
                card = () => roundRect(ctx, x0, 726, x1 - x0, 416, 40);
            ctx.save();
            ctx.shadowColor = 'rgba(150,80,255,0.4)';
            ctx.shadowBlur = 24;
            this.violet(card, 726, 1142);
            ctx.restore();
            this.goldEdge(card, 726, 1142, 6);
            arcadeText(ctx, ROLES[i][0], cx, 790, 38, ['#fff6d0', '#ffd45c', '#e88a1c'], 'center', x1 - x0 - 40);
            const pill = () => roundRect(ctx, x0 + 22, 1062, x1 - x0 - 44, 60, 30);
            ctx.fillStyle = 'rgba(10,4,24,0.75)';
            pill();
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,214,120,0.6)';
            ctx.lineWidth = 3;
            pill();
            ctx.stroke();
            if (!sheet) return;
            const kind = ROLES[i][1](sheet);
            if (sheet.img.complete && sheet.img.naturalWidth) {
                const c = ((t + i * 0.7) * 0.5) % 4;
                const frame = c < 0.4 ? 6 : c > 3.6 ? 7 : 5;
                const sz = 280,
                    bob = Math.sin((t + i * 0.7) * 3) * 6;
                ctx.drawImage(
                    sheet.img,
                    frame * sheet.cell,
                    (sheet.rows[kind] ?? 0) * sheet.cell,
                    sheet.cell,
                    sheet.cell,
                    cx - sz / 2,
                    925 - sz / 2 + bob,
                    sz,
                    sz,
                );
            }
            ctx.textAlign = 'center';
            ctx.font = `700 38px ${FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(sheet.names[kind] ?? kind, cx, 1105, x1 - x0 - 70);
        });
    }

    /**
     * One stage on the tray, at `x` across it: its picture, a gold ring round it drawn in code (thick and glowing when
     * it's in view), and its name on a pill.
     */
    private paintedDisc(map: MapTheme, i: number, x: number, locked: boolean, on: boolean, t: number): void {
        const ctx = this.ctx,
            cy = TRAY.discY,
            r = TRAY.discR * (on ? 1.08 : 1);
        if (locked) ctx.filter = 'grayscale(0.7) brightness(0.55)';
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, cy, r, 0, Math.PI * 2);
        ctx.clip();
        KIT.draw(ctx, `disc${i}`, x - r * 1.05, cy - r * 1.05, r * 2.1, r * 2.1);
        ctx.restore();
        ctx.filter = 'none';
        if (locked) drawPadlock(ctx, x, cy - 22, 70);
        ctx.save();
        if (on) {
            ctx.shadowColor = 'rgba(255,200,80,0.95)';
            ctx.shadowBlur = 36 + 6 * Math.sin(t * 3);
        }
        ctx.strokeStyle = '#2a1006';
        ctx.lineWidth = on ? 18 : 10;
        ctx.beginPath();
        ctx.arc(x, cy, r + (on ? 6 : 3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, cy - r, cy + r);
        ctx.lineWidth = on ? 10 : 5;
        ctx.beginPath();
        ctx.arc(x, cy, r + (on ? 6 : 3), 0, Math.PI * 2);
        ctx.stroke();
        const pw = on ? 230 : 190,
            pill = () => roundRect(ctx, x - pw / 2, TRAY.nameY - 30, pw, 56, 28);
        ctx.fillStyle = on ? '#3a1a10' : 'rgba(20,8,40,0.95)';
        pill();
        ctx.fill();
        ctx.strokeStyle = on ? goldGradient(ctx, TRAY.nameY - 30, TRAY.nameY + 26) : 'rgba(255,214,120,0.55)';
        ctx.lineWidth = on ? 5 : 3;
        pill();
        ctx.stroke();
        arcadeText(
            ctx,
            map.name.toUpperCase(),
            x,
            TRAY.nameY + 11,
            30,
            on ? ['#fff6d0', '#ffd45c', '#e88a1c'] : ['#ffffff', '#efe6ff', '#c9b8ff'],
            'center',
            pw - 30,
        );
    }

    /**
     * The map's header (its medallion as an emblem, its name large in gold, a plaque with its place on the trophy road
     * and whether it's open), how hard it is on a gold-edged plate, what its formations do, and its monsters by role,
     * each on a gold-framed card.
     */
    private info(
        map: MapTheme,
        index: number,
        locked: boolean,
        b: { x: number; y: number; w: number },
        tile: number,
        tall: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const stage = stageFor(map.id);
        const er = tall ? 17 : 20;
        const ex = b.x + er + 2,
            ey = b.y + er + 2;
        // The emblem, then the name plaque behind the name.
        const px = ex + er - 4,
            pw = tall ? b.w - (px - b.x) : Math.min(170, b.w * 0.55);
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, px, ey - er + 2, pw, er * 2 - 4, 10);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, ey - er, ey + er);
        ctx.lineWidth = 1.4;
        pointed(ctx, px, ey - er + 2, pw, er * 2 - 4, 10);
        ctx.stroke();
        this.medallion(map, locked, { x: ex, y: ey, r: er }, true, t);
        ctx.font = `italic 700 ${tall ? 18 : 22}px ${FONT}`;
        const name = map.name.toUpperCase();
        const ng = ctx.createLinearGradient(0, ey - 14, 0, ey + 4);
        ng.addColorStop(0, '#fff7d8');
        ng.addColorStop(1, '#e0a040');
        ctx.fillStyle = ng;
        ctx.textAlign = 'left';
        ctx.fillText(name, ex + er + 10, ey + (tall ? 1 : 2), pw - er - 10);
        ctx.font = `${tall ? 5.5 : 6}px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        const st = `STAGE ${index + 1} OF ${STAGES.length}  ·  `;
        ctx.fillText(st, ex + er + 10, ey + er - 6);
        ctx.fillStyle = locked ? '#ffb0b0' : '#8ff0a0';
        const sw = ctx.measureText(st).width;
        if (locked) {
            ctx.fillText(String(stage.trophies), ex + er + 10 + sw + 10, ey + er - 6);
            drawTrophy(ctx, ex + er + 10 + sw + 4, ey + er - 8, 4.5);
        } else ctx.fillText('OPEN', ex + er + 10 + sw, ey + er - 6);
        // How hard, on its own plate: beside the header in landscape, under it on a phone.
        const dw = tall ? b.w : Math.min(130, b.w - pw - er * 2 - 14);
        const dx = tall ? b.x : b.x + b.w - dw,
            dyy = tall ? ey + er + 22 : ey - 8;
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, dx, dyy, dw, 16, 7);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, dyy, dyy + 16);
        ctx.lineWidth = 1.1;
        pointed(ctx, dx, dyy, dw, 16, 7);
        ctx.stroke();
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText('DIFFICULTY', dx + 11, dyy + 10.5);
        const pips = STAGES.length,
            pip = Math.min(8, (dw - 64) / pips);
        for (let i = 0; i < pips; i++) {
            ctx.fillStyle =
                i <= index ? (i >= 5 ? '#ff7a6a' : i >= 3 ? '#ffd45c' : '#6af07a') : 'rgba(255,255,255,0.12)';
            ctx.fillRect(dx + 56 + i * pip, dyy + 4.5, pip - 2, 7);
        }
        // The blurb, then the monsters' heading on a small plaque with a gold line running on from it.
        const by = tall ? dyy - 8 : ey + er + 14;
        ctx.textAlign = tall ? 'center' : 'left';
        ctx.font = `italic 600 ${tall ? 9 : 10}px ${FONT}`;
        ctx.fillStyle = '#f0e8ff';
        ctx.fillText(`${stage.blurb}.`, tall ? b.x + b.w / 2 : b.x + 4, by, b.w);
        ctx.textAlign = 'left';
        // The monsters, each with its part in the formations.
        const sheet = monstersFor(map.id);
        if (!sheet) return;
        const ty = tall ? dyy + 24 : by + 9;
        ctx.fillStyle = 'rgba(22,10,50,0.9)';
        pointed(ctx, b.x, ty, 64, 13, 6);
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, ty, ty + 13);
        ctx.lineWidth = 1;
        pointed(ctx, b.x, ty, 64, 13, 6);
        ctx.stroke();
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#ffd45c';
        ctx.fillText('MONSTERS', b.x + 12, ty + 9);
        ctx.fillStyle = goldGradient(ctx, ty, ty + 13);
        ctx.fillRect(b.x + 66, ty + 6, b.w - 70, 0.8);
        gem(ctx, b.x + b.w - 2, ty + 6.4, 2.2);
        const top = ty + 18;
        const gap = tall ? 2 : TILE_GAP;
        const x0 = tall ? b.x + (b.w - ROLES.length * tile - (ROLES.length - 1) * gap) / 2 : b.x;
        ROLES.forEach(([role, kindOf], i) => {
            const kind = kindOf(sheet);
            this.monsterTile(sheet, kind, role, x0 + i * (tile + gap), top, tile, t + i * 0.7);
        });
    }

    /** One monster in a tile: its idle frame (talking now and then), its part, and its name. */
    private monsterTile(
        s: MonsterSheet,
        kind: MonsterKind,
        role: string,
        x: number,
        y: number,
        w: number,
        t: number,
    ): void {
        const ctx = this.ctx;
        const h = w + 20;
        ornatePanel(ctx, { x, y, w, h }, 8);
        if (s.img.complete && s.img.naturalWidth) {
            const c = (t * 0.5) % 4;
            const frame = c < 0.4 ? 6 : c > 3.6 ? 7 : 5;
            const d = w * 1.05,
                bob = Math.sin(t * 3) * 1;
            ctx.drawImage(
                s.img,
                frame * s.cell,
                (s.rows[kind] ?? 0) * s.cell,
                s.cell,
                s.cell,
                x + (w - d) / 2,
                y + (w - d) / 2 + 4 + bob,
                d,
                d,
            );
        }
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(role, x + w / 2, y + 9, w - 4);
        // The name on a dark strip along the card's foot.
        ctx.fillStyle = 'rgba(12,6,30,0.85)';
        roundRect(ctx, x + 3, y + h - 15, w - 6, 12, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,185,73,0.5)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.font = `600 ${w > 50 ? 7.5 : 6}px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(s.names[kind] ?? kind, x + w / 2, y + h - 6, w - 8);
    }

    /** The live demo window: the map's meadow running its formations in a glowing gold frame, captioned. */
    private demo(map: MapTheme, d: { x: number; y: number; w: number }, caption: string, draw?: DemoDraw): void {
        const ctx = this.ctx;
        const s = d.w / C.FIELD_W_BASE,
            h = C.FIELD_H_BASE * s;
        ornatePanel(ctx, { x: d.x - 6, y: d.y - 6, w: d.w + 12, h: h + 12 }, 12, true);
        ctx.save();
        roundRect(ctx, d.x, d.y, d.w, h, 7);
        ctx.clip();
        if (draw) draw(d.x, d.y, s);
        else {
            ctx.fillStyle = map.sky[0];
            ctx.fillRect(d.x, d.y, d.w, h);
        }
        if (caption) {
            const g = ctx.createLinearGradient(0, d.y + h - 30, 0, d.y + h);
            g.addColorStop(0, 'rgba(8,5,24,0)');
            g.addColorStop(1, 'rgba(8,5,24,0.9)');
            ctx.fillStyle = g;
            ctx.fillRect(d.x, d.y + h - 30, d.w, 30);
            ctx.textAlign = 'right';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(caption.toUpperCase(), d.x + d.w - 7, d.y + h - 8, d.w - 14);
        }
        ctx.restore();
        goldFrame(ctx, () => roundRect(ctx, d.x - 6, d.y - 6, d.w + 12, h + 12, 12), d.y, d.y + h);
    }

    /** The tray the stage medallions sit in: a long gold-framed capsule with gold arrows at its ends. */
    private tray(meds: { x: number; y: number; r: number }[], t: number): void {
        const ctx = this.ctx;
        const first = meds[0],
            last = meds[meds.length - 1];
        const x = first.x - first.r - 14,
            w = last.x + last.r + 14 - x,
            h = first.r * 2 + 22,
            y = first.y - first.r - 6;
        ornatePanel(ctx, { x, y, w, h }, h / 2);
        for (const dir of [-1, 1]) {
            const ax = dir < 0 ? x - 4 : x + w + 4,
                ay = first.y + 4,
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

    /** A map's medallion: its colours and its slime, padlocked while the stage is locked, gold-ringed when chosen. */
    private medallion(
        map: MapTheme,
        locked: boolean,
        m: { x: number; y: number; r: number },
        on: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const r = on ? m.r + 2 : m.r;
        ctx.save();
        const g = ctx.createLinearGradient(0, m.y - r, 0, m.y + r);
        g.addColorStop(0, map.sky[1]);
        g.addColorStop(1, map.top[2]);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        const s = monstersFor(map.id);
        if (s && s.img.complete && s.img.naturalWidth) {
            const d = r * 2.3;
            const kind = s.roster[0];
            ctx.drawImage(
                s.img,
                5 * s.cell,
                (s.rows[kind] ?? 0) * s.cell,
                s.cell,
                s.cell,
                m.x - d / 2,
                m.y - d / 2 + 1,
                d,
                d,
            );
        }
        if (locked) {
            ctx.fillStyle = 'rgba(8,5,22,0.6)';
            ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
        }
        ctx.restore();
        if (locked) drawPadlock(ctx, m.x, m.y - r * 0.3, r * 0.9);
        ctx.strokeStyle = on ? '#ffe9a0' : goldGradient(ctx, m.y - r, m.y + r);
        ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.4 : 1.2;
        ctx.beginPath();
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    /** A map's name on a small plate under its medallion, gold-edged and lit when it's the one in view. */
    private nameTag(map: MapTheme, m: { x: number; y: number; r: number }, on: boolean, tall: boolean): void {
        const ctx = this.ctx;
        const w = m.r * 2 + (tall ? 4 : 10),
            h = tall ? 9 : 10,
            x = m.x - w / 2,
            y = m.y + m.r - 3;
        ctx.fillStyle = on ? 'rgba(80,40,10,0.95)' : 'rgba(22,10,50,0.95)';
        pointed(ctx, x, y, w, h, 4);
        ctx.fill();
        ctx.strokeStyle = on ? '#ffe9a0' : goldGradient(ctx, y, y + h);
        ctx.lineWidth = on ? 1.2 : 0.8;
        pointed(ctx, x, y, w, h, 4);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${tall ? 4 : 4.8}px ${ARCADE}`;
        ctx.fillStyle = on ? '#ffe08a' : '#f0e6ff';
        ctx.fillText(map.name.toUpperCase(), m.x, y + h / 2 + 2, w - 6);
    }
}
