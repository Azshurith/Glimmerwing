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
import { demoFrame, drawDemoMeadow, paintedDemo } from './roster-screen';
import { PieceAtlas } from './kit';
import { kitReady, mockFit } from './kit-ui';
import type { MockFit } from './kit-ui';
import { MAPS_KIT } from '@/data/maps-kit';
import kitUrl from '@/../assets/ui/maps-kit.png';
import goldUrl from '@/../assets/ui/maps-kit-gold.png';
import { arcadeText } from '@/render/draw';
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
        const f = mapsFit(bleed);
        return MOCK.discs.x.map(x => ({ x: f.x + x * f.s, y: f.y + MOCK.discs.y * f.s, r: 110 * f.s }));
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
    sub: [657, 460],
    difficulty: [1110, 333, 712, 121],
    pips: [1424, 375, 46.6, 40],
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
    tray: [60, 1170, 2540, 300],
    discs: { x: [431, 729, 1028, 1330, 1629, 1927, 2230], y: 1300 },
} as const;

/** How the painted Maps screen sits in a widened landscape view `bleed` past each side. */
function mapsFit(bleed: number): MockFit {
    const [x0, y0, x1, y1] = MOCK.area;
    return mockFit(C.VIEW_W, C.VIEW_H, bleed, x0, y0, x1, y1);
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
            f = mapsFit(bleed),
            map = MAPS[v.index],
            locked = v.locked[v.index],
            stage = stageFor(map.id);
        enter(ctx, 'bg', () => ornateScreen(ctx, t, C.VIEW_W, C.VIEW_H, bleed, '', false));
        const d = paintedDemo(MOCK.demo);
        enter(ctx, 'panels', () => drawDemoMeadow(ctx, f, d, draw ?? null, v.caption), { dx: 22 });
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.s, f.s);
        /** Draws piece `name` into a box of the mockup, with its glint every so often. */
        const piece = (name: string, b: readonly number[], phase = 0) => {
            KIT.draw(ctx, name, b[0], b[1], b[2], b[3]);
            KIT.glint(ctx, name, b[0], b[1], b[2], b[3], t, phase, 7);
        };
        enter(ctx, 'bar', () => piece('title', MOCK.title, 0.2));
        enter(ctx, 'panels', () => demoFrame(ctx, d), { dx: 22 });
        enter(ctx, 'panels', () => this.paintedInfo(map, v.index, locked, stage, t, piece), { dx: -22 });
        enter(ctx, 'buttons', () => piece('tray', MOCK.tray, 1.2));
        MAPS.forEach((m, i) =>
            enter(ctx, 'buttons', () => this.paintedDisc(m, i, v.locked[i], i === v.index, t), { i }),
        );
        ctx.restore();
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

    /** The painted stage plate, difficulty, blurb and monster cards, with the game's own words and pictures on them. */
    private paintedInfo(
        map: MapTheme,
        index: number,
        locked: boolean,
        stage: { trophies: number; blurb: string },
        t: number,
        piece: (name: string, b: readonly number[], phase?: number) => void,
    ): void {
        const ctx = this.ctx;
        // The emblem: the stage's icon on its sky, inside the plate's ring.
        const [ex, ey, er] = MOCK.emblem;
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
        piece('plate', MOCK.plate, 0.6);
        const [nx, ny] = MOCK.name;
        ctx.textAlign = 'left';
        ctx.font = `italic 700 104px ${FONT}`;
        const ng = ctx.createLinearGradient(0, ny - 80, 0, ny + 10);
        ng.addColorStop(0, '#fff7d8');
        ng.addColorStop(0.6, '#ffd45c');
        ng.addColorStop(1, '#e08a1c');
        ctx.fillStyle = ng;
        ctx.fillText(map.name.toUpperCase(), nx, ny, 560);
        // Its place on the trophy road, and whether it's open.
        const [sx, sy] = MOCK.sub;
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
        // How hard: a pip per stage, lit up to this one.
        piece('difficulty', MOCK.difficulty, 1.1);
        const [px, py, pw, ph] = MOCK.pips;
        for (let i = 0; i < STAGES.length; i++) {
            ctx.fillStyle =
                i <= index ? (i >= 5 ? '#ff7a6a' : i >= 3 ? '#ffd45c' : '#6af07a') : 'rgba(255,255,255,0.12)';
            ctx.fillRect(px + i * pw, py, pw - 8, ph);
        }
        const [bx, by] = MOCK.blurb;
        ctx.textAlign = 'left';
        ctx.font = `italic 600 48px ${FONT}`;
        ctx.fillStyle = '#f0e8ff';
        ctx.fillText(`${stage.blurb}.`, bx, by, 1740);
        piece('monsters', MOCK.monsters, 1.7);
        const sheet = monstersFor(map.id);
        MOCK.cards.forEach(([x0, x1], i) => {
            piece(`card${i}`, [x0 - 8, 718, x1 - x0 + 16, 432], 2 + i * 0.35);
            if (!sheet) return;
            const kind = ROLES[i][1](sheet),
                cx = (x0 + x1) / 2;
            if (sheet.img.complete && sheet.img.naturalWidth) {
                const c = ((t + i * 0.7) * 0.5) % 4;
                const frame = c < 0.4 ? 6 : c > 3.6 ? 7 : 5;
                const s = 300,
                    bob = Math.sin((t + i * 0.7) * 3) * 6;
                ctx.drawImage(
                    sheet.img,
                    frame * sheet.cell,
                    (sheet.rows[kind] ?? 0) * sheet.cell,
                    sheet.cell,
                    sheet.cell,
                    cx - s / 2,
                    920 - s / 2 + bob,
                    s,
                    s,
                );
            }
            ctx.textAlign = 'center';
            ctx.font = `700 38px ${FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(sheet.names[kind] ?? kind, cx, 1100, x1 - x0 - 60);
        });
    }

    /** One stage's painted disc on the tray: its picture in a gold ring (glowing when it's in view), and its name. */
    private paintedDisc(map: MapTheme, i: number, locked: boolean, on: boolean, t: number): void {
        const ctx = this.ctx,
            cx = MOCK.discs.x[i],
            cy = MOCK.discs.y,
            k = on ? 1.1 : 1;
        if (locked) ctx.filter = 'grayscale(0.7) brightness(0.55)';
        KIT.draw(ctx, `disc${i}`, cx - 92 * k, cy - 92 * k, 184 * k, 184 * k);
        ctx.filter = 'none';
        if (locked) drawPadlock(ctx, cx, cy - 22, 70);
        if (on) {
            KIT.draw(ctx, 'medOn', cx - 211, cy - 135, 425, 283);
            KIT.glint(ctx, 'medOn', cx - 211, cy - 135, 425, 283, t, 0.4, 4);
        } else KIT.draw(ctx, 'medOff', cx - 139, cy - 120, 280, 260);
        arcadeText(
            ctx,
            map.name.toUpperCase(),
            cx,
            cy + 113,
            30,
            on ? ['#fff6d0', '#ffd45c', '#e88a1c'] : ['#ffffff', '#efe6ff', '#c9b8ff'],
            'center',
            on ? 250 : 170,
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
