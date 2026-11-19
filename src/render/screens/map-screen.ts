// The map select screen, after the fairies are picked: a card for each map with its scenery scrolling live inside,
// and a Random card that flicks through them all. The game keeps which card is chosen (Game.mapIndex).
import * as C from '@/core/config';
import { mapAvailable } from '@/data/availability';
import { MAPS } from '@/data/maps';
import type { Layout, MapSelectView, MapTheme } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText } from '@/render/draw';
import { ARCADE } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { drawTopBar, TOP_BAR_H } from './top-bar';
import { stageFor } from '@/data/stages';
import { drawTrophy } from '@/render/icons';
import { enter } from '@/render/transition';
import { mockFit } from './kit-ui';
import type { MockFit } from './kit-ui';
import { roundRect } from './emblems';
import { goldEdge } from './lobby-screen';
import { shine } from './kit';
import { tracedPlate, tracedStar, tracedTitle } from './traced';

/**
 * The painted landscape map select's layout, in its mockup's 2x pixels: the heading, the trophies plate, the cards'
 * middles and pitch, a card's frame and window (from its middle), and the hint bar.
 */
const MOCK = {
    // Centred on the cards (the trophies plate stands out to the right, as Back does to the left).
    area: [60, 20, 3524, 1722],
    title: [920, 20, 1760, 190],
    trophies: [3040, 56, 484, 140],
    cards: { x0: 738, dx: 704, y0: 566, dy: 644 },
    // A card's frame (on, off) and window, from the card's middle.
    on: [-358, -326, 715, 653],
    off: [-352, -326, 705, 653],
    window: [-308, -276, 624, 410],
    name: 236,
    hint: [550, 1566, 2490, 156],
} as const;

/** How the painted map select sits in a widened landscape view `bleed` past each side. */
function mapSelectFit(bleed: number): MockFit {
    const [x0, y0, x1, y1] = MOCK.area;
    return mockFit(C.VIEW_W, C.VIEW_H, bleed, x0, y0, x1, y1, 2);
}

/** Whether landscape map select is drawn to its mockup's layout (always: its pieces are traced in code). */
const painted = () => true;

/** Card `i`'s middle in the painted layout, in its mockup's pixels. */
function paintedCard(i: number): { x: number; y: number } {
    const c = MOCK.cards;
    return { x: c.x0 + (i % MAP_COLS.wide) * c.dx, y: c.y0 + Math.floor(i / MAP_COLS.wide) * c.dy };
}

/** Draws map `map`'s live scenery into the box (x, y, w, h), in the screen's design units. */
export type MapPreviewDraw = (map: MapTheme, x: number, y: number, w: number, h: number) => void;

/** How many cards there are: Random, then every map. */
export const MAP_CARDS = MAPS.length + 1;

/** Extra room at the top of a tall view that's taller than the design, split above and below. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Cards per row on a wide screen (Random first), and per row of maps on a tall one (under Random). */
export const MAP_COLS = { wide: 4, tall: 2 } as const;

/** The cards, in design units: rows of four on a wide screen; on a tall one Random on top, then two columns. */
function designCards(layout: Layout, dy = 0): { x: number; y: number; w: number; h: number }[] {
    if (layout === 'wide') {
        const cols = MAP_COLS.wide,
            rows = Math.ceil(MAP_CARDS / cols);
        const gap = 8,
            w = 112,
            h = Math.min(130, (C.VIEW_H - 46 - 24 - (rows - 1) * gap) / rows),
            x0 = (C.VIEW_W - (cols * w + (cols - 1) * gap)) / 2;
        return Array.from({ length: MAP_CARDS }, (_, i) => ({
            x: x0 + (i % cols) * (w + gap),
            y: 40 + Math.floor(i / cols) * (h + gap),
            w,
            h,
        }));
    }
    // Tall: Random across the top, then the maps two by two.
    const w = 116,
        gap = 8,
        x0 = (C.TALL_W - (2 * w + gap)) / 2;
    const rows = Math.ceil(MAPS.length / 2);
    const top = 50 + dy,
        rh = 60,
        mapTop = top + rh + gap,
        mh = Math.min(152, (C.TALL_H - 30 - (mapTop - dy) - (rows - 1) * gap) / rows);
    const cards = [{ x: x0, y: top, w: 2 * w + gap, h: rh }];
    for (let i = 0; i < MAPS.length; i++)
        cards.push({ x: x0 + (i % 2) * (w + gap), y: mapTop + Math.floor(i / 2) * (mh + gap), w, h: mh });
    return cards;
}

/** The cards in view units, for a view `h` tall: the tap targets. */
export function mapCards(
    layout: Layout,
    h: number = C.TALL_H,
    bleed = 0,
): { x: number; y: number; w: number; h: number }[] {
    if (layout !== 'tall' && painted()) {
        const f = mapSelectFit(bleed),
            [ox, oy, ow, oh] = MOCK.off;
        return Array.from({ length: MAP_CARDS }, (_, i) => {
            const c = paintedCard(i);
            return { x: f.x + (c.x + ox) * f.s, y: f.y + (c.y + oy) * f.s, w: ow * f.s, h: oh * f.s };
        });
    }
    if (layout !== 'tall') return designCards('wide');
    const f = tallMenuFit(h);
    return designCards('tall', tallShift(f.h)).map(c => ({
        x: f.x + c.x * f.s,
        y: c.y * f.s,
        w: c.w * f.s,
        h: c.h * f.s,
    }));
}

/** The map select screen. */
export class MapScreen {
    private backdrop: Backdrop;
    /** The maps whose stages are open, which Random flicks through. */
    private open: MapTheme[] = MAPS;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `preview` paints a map's live scenery into a card. */
    draw(v: MapSelectView, t: number, layout: Layout, h: number, bleed: number, preview: MapPreviewDraw): void {
        const ctx = this.ctx;
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H,
            dy = 0;
        if (layout === 'tall') {
            const f = tallMenuFit(h);
            enter(ctx, 'bg', () => this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h));
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
            dy = tallShift(f.h);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            enter(ctx, 'bg', () => this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H));
            ctx.restore();
            if (painted()) {
                this.open = MAPS.filter((_, i) => !v.locked[i]);
                this.drawPainted(v, t, bleed, preview);
                ctx.restore();
                return;
            }
        }
        const tall = layout === 'tall';
        this.open = MAPS.filter((_, i) => !v.locked[i]);
        enter(ctx, 'bar', () => drawTopBar(ctx, 'CHOOSE A STAGE', W, bleed, tall, 16));
        // Your trophies, at the bar's right end.
        const barH = tall ? TOP_BAR_H.tall : TOP_BAR_H.wide;
        ctx.textAlign = 'right';
        ctx.font = `${tall ? 10 : 9}px ${ARCADE}`;
        ctx.fillStyle = '#ffe08a';
        const tx = W + bleed - 10;
        ctx.fillText(String(v.trophies), tx, barH / 2 + 4);
        drawTrophy(ctx, tx - ctx.measureText(String(v.trophies)).width - 9, barH / 2, tall ? 12 : 10);
        designCards(layout, dy).forEach((c, i) =>
            enter(ctx, 'buttons', () => this.card(c, i, i === v.index, i > 0 && v.locked[i - 1], t, preview), {
                box: c,
                i,
            }),
        );
        enter(ctx, 'hint', () => {
            ctx.textAlign = 'center';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            const hint = v.touch
                ? 'TAP A STAGE  ·  WIN VS CPU OR ONLINE FOR TROPHIES'
                : 'ARROWS CHOOSE  ·  ENTER OR Z PLAY  ·  WIN VS CPU OR ONLINE FOR TROPHIES';
            ctx.fillText(hint, W / 2, layout === 'tall' ? H - 14 : H - 10, W - 16);
        });
        ctx.restore();
    }

    /**
     * Landscape map select drawn from its painted mockup: the heading banner, your trophies on their plate, the cards
     * (each map's scenery scrolling live in the window, the chosen one in the glowing frame) and the hint bar.
     */
    private drawPainted(v: MapSelectView, t: number, bleed: number, preview: MapPreviewDraw): void {
        const ctx = this.ctx,
            f = mapSelectFit(bleed);
        /** Runs `draw` in the mockup's pixels. */
        const inMock = (draw: () => void) => {
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.scale(f.s, f.s);
            draw();
            ctx.restore();
        };
        enter(ctx, 'bar', () =>
            inMock(() => {
                tracedTitle(ctx, 'CHOOSE A STAGE', MOCK.title, t);
                const [x, y, w, h] = MOCK.trophies;
                tracedPlate(ctx, x, y, w, h, 46, t, 1, 'gold', 9);
                drawTrophy(ctx, x + 110, y + h / 2, 52);
                arcadeText(ctx, String(v.trophies), 3330, 158, 78, ['#fff6d0', '#ffd45c', '#e88a1c'], 'center', 220);
            }),
        );
        for (let i = 0; i < MAP_CARDS; i++) {
            const c = paintedCard(i),
                on = i === v.index,
                locked = i > 0 && v.locked[i - 1];
            enter(ctx, 'buttons', () => this.paintedCard(c, i, on, locked, t, f, preview, inMock), { i });
        }
        enter(ctx, 'hint', () =>
            inMock(() => {
                const [x, y, w, h] = MOCK.hint;
                tracedPlate(ctx, x, y + 14, w, h - 28, 60, t, 2, 'gold', 10);
                tracedStar(ctx, x + 110, y + h / 2, 34, t);
                tracedStar(ctx, x + w - 110, y + h / 2, 34, t);
                const hint = v.touch
                    ? 'TAP A STAGE  ·  WIN VS CPU OR ONLINE FOR TROPHIES'
                    : 'ARROWS CHOOSE  ·  ENTER OR Z PLAY  ·  WIN VS CPU OR ONLINE FOR TROPHIES';
                ctx.textAlign = 'center';
                ctx.font = `44px ${ARCADE}`;
                ctx.fillStyle = '#f0e6ff';
                ctx.fillText(hint, x + w / 2, y + h / 2 + 15, w - 320);
            }),
        );
    }

    /** One painted card: its map's live scenery in the window (in view units), then its frame and name. */
    private paintedCard(
        c: { x: number; y: number },
        i: number,
        on: boolean,
        locked: boolean,
        t: number,
        f: MockFit,
        preview: MapPreviewDraw,
        inMock: (draw: () => void) => void,
    ): void {
        const ctx = this.ctx;
        const random = i === 0;
        const map = random ? this.open[Math.floor(t / 1.1) % this.open.length] : MAPS[i - 1];
        const lift = on ? -10 : 0,
            [wx, wy, ww, wh] = MOCK.window;
        // The window reaches down behind the name pill.
        const x = f.x + (c.x + wx) * f.s,
            y = f.y + (c.y + lift + wy) * f.s,
            w = ww * f.s,
            h = (wh + 150) * f.s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, w, h);
        ctx.clip();
        preview(map, x, y, w, h);
        if (random) {
            ctx.fillStyle = 'rgba(12,8,32,0.5)';
            ctx.fillRect(x, y, w, h);
        } else if (locked) {
            ctx.fillStyle = 'rgba(8,5,22,0.72)';
            ctx.fillRect(x, y, w, h);
        } else if (!on) {
            ctx.fillStyle = 'rgba(12,8,32,0.3)';
            ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
        inMock(() => {
            const cy = c.y + lift;
            const b = on ? MOCK.on : MOCK.off;
            this.cardFrame(c.x, cy, b, on, t, on ? 0.5 : 1.5 + i * 0.3);
            if (random) arcadeText(ctx, '?', c.x, cy - 10, 300, ['#ffffff', '#ffe08a', '#ff9a2e'], 'center');
            else if (locked) {
                drawPadlock(ctx, c.x, cy - 110, 170);
                if (mapAvailable(map.id)) {
                    const need = String(stageFor(map.id).trophies);
                    ctx.font = `60px ${ARCADE}`;
                    const nw = ctx.measureText(need).width;
                    ctx.textAlign = 'center';
                    ctx.fillStyle = '#ffe08a';
                    ctx.fillText(need, c.x + 30, cy + 110);
                    drawTrophy(ctx, c.x - nw / 2 - 12, cy + 88, 56);
                }
            }
            const name = random
                ? 'RANDOM'
                : locked
                  ? mapAvailable(map.id)
                      ? 'LOCKED'
                      : 'UNAVAILABLE'
                  : map.name.toUpperCase();
            arcadeText(
                ctx,
                name,
                c.x,
                cy + MOCK.name + 22,
                on ? 72 : 66,
                locked
                    ? ['#b8b0d8', '#8f86b0', '#6f6790']
                    : on
                      ? ['#fff7c2', '#ffd45c', '#ff9a2e']
                      : ['#ffffff', '#efe6ff', '#cbbcf5'],
                'center',
                500,
            );
        });
    }

    /**
     * A painted card's frame round its window, centred on (cx, cy) in the mockup's pixels, its outer box `b` from the
     * middle: dark violet round the window (the scenery shows through it, and on under the name pill), a heavy gold
     * edge (glowing pink and gold when chosen), a thin gold line round the window, and the name pill.
     */
    private cardFrame(cx: number, cy: number, b: readonly number[], on: boolean, t: number, phase: number): void {
        const ctx = this.ctx;
        const [ox, oy, ow, oh] = b,
            [wx, wy, ww, wh] = MOCK.window;
        // Inset inside its box, so neighbouring cards keep a gap between them, across and down alike.
        const x = cx + ox + 22,
            y = cy + oy + 30,
            w = ow - 44,
            h = oh - 60;
        const outer = () => roundRect(ctx, x, y, w, h, 44);
        // The frame: the card less its window (which reaches down behind the pill).
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, 44);
        ctx.rect(cx + wx + ww, cy + wy, -ww, wh + 150);
        const fg = ctx.createLinearGradient(0, y, 0, y + h);
        fg.addColorStop(0, '#3a1474');
        fg.addColorStop(1, '#14062e');
        ctx.fillStyle = fg;
        ctx.fill('evenodd');
        ctx.restore();
        ctx.save();
        if (on) {
            ctx.shadowColor = 'rgba(255,160,230,0.8)';
            ctx.shadowBlur = 60;
        }
        goldEdge(ctx, outer, y, y + h, undefined, on ? 20 : 14);
        ctx.restore();
        if (on) shine(ctx, outer, x, y, w, h, t, phase, 4);
        const win = () => roundRect(ctx, cx + wx, cy + wy, ww, wh + 150, 24);
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, x, y, w, h, 44);
        ctx.clip();
        goldEdge(ctx, win, cy + wy, cy + wy + wh, undefined, 5);
        ctx.restore();
        // The name pill.
        const px = cx + wx + 18,
            pw = ww - 36,
            ph = 112,
            py = cy + MOCK.name - 62;
        const pill = () => roundRect(ctx, px, py, pw, ph, ph / 2);
        const pg = ctx.createLinearGradient(0, py, 0, py + ph);
        pg.addColorStop(0, on ? '#7a34c8' : '#5a2aa8');
        pg.addColorStop(1, '#22104e');
        ctx.fillStyle = pg;
        pill();
        ctx.fill();
        goldEdge(ctx, pill, py, py + ph, on ? undefined : ['#f6e0ff', '#c690ff', '#6a3aa8'], 7);
    }

    /**
     * One card: the map's scenery scrolling inside, its name on a plate, gold-edged when chosen; a locked stage
     * is shaded over with a padlock and the trophies that open it.
     */
    private card(
        c: { x: number; y: number; w: number; h: number },
        i: number,
        on: boolean,
        locked: boolean,
        t: number,
        preview: MapPreviewDraw,
    ): void {
        const ctx = this.ctx;
        const random = i === 0;
        // Random flicks through every open map, a second on each.
        const map = random ? this.open[Math.floor(t / 1.1) % this.open.length] : MAPS[i - 1];
        const lift = on ? -3 : 0;
        const x = c.x,
            y = c.y + lift;
        ctx.save();
        if (on) {
            ctx.shadowColor = 'rgba(255,214,107,0.8)';
            ctx.shadowBlur = 14;
        }
        ctx.fillStyle = '#0c0820';
        ctx.fillRect(x - 2, y - 2, c.w + 4, c.h + 4);
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, c.w, c.h);
        ctx.clip();
        preview(map, x, y, c.w, c.h);
        if (random) {
            // Dimmed, with a big question mark over the flicking maps.
            ctx.fillStyle = 'rgba(12,8,32,0.55)';
            ctx.fillRect(x, y, c.w, c.h);
            arcadeText(
                ctx,
                '?',
                x + c.w / 2,
                y + c.h * 0.58,
                Math.min(54, c.h * 0.5),
                ['#ffffff', '#ffe08a', '#ff9a2e'],
                'center',
            );
        } else if (locked) {
            ctx.fillStyle = 'rgba(8,5,22,0.72)';
            ctx.fillRect(x, y, c.w, c.h);
            const cy = y + c.h * 0.42;
            drawPadlock(ctx, x + c.w / 2, cy, Math.min(30, c.w * 0.3));
            ctx.textAlign = 'center';
            ctx.font = `9px ${ARCADE}`;
            // The trophies the stage needs (none to show for one the server has switched off).
            if (mapAvailable(map.id)) {
                const need = String(stageFor(map.id).trophies);
                const nw = ctx.measureText(need).width;
                ctx.fillStyle = '#ffe08a';
                ctx.fillText(need, x + c.w / 2 + 6, cy + 30);
                drawTrophy(ctx, x + c.w / 2 - nw / 2 - 2, cy + 26, 10);
            }
        } else if (!on) {
            ctx.fillStyle = 'rgba(12,8,32,0.35)';
            ctx.fillRect(x, y, c.w, c.h);
        }
        // The name plate along the bottom.
        const g = ctx.createLinearGradient(0, y + c.h - 26, 0, y + c.h);
        g.addColorStop(0, 'rgba(10,6,28,0)');
        g.addColorStop(1, 'rgba(10,6,28,0.92)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y + c.h - 26, c.w, 26);
        arcadeText(
            ctx,
            random ? 'RANDOM' : locked ? (mapAvailable(map.id) ? 'LOCKED' : 'UNAVAILABLE') : map.name.toUpperCase(),
            x + c.w / 2,
            y + c.h - 8,
            on ? 12 : 11,
            locked
                ? ['#8f86b0', '#6f6790', '#59517a']
                : on
                  ? ['#fff7c2', '#ffd45c', '#ff9a2e']
                  : ['#ffffff', '#e4dcff', '#b9a8e8'],
            'center',
            c.w - 8,
        );
        ctx.restore();
        ctx.strokeStyle = on ? '#ffd86b' : 'rgba(201,162,74,0.6)';
        ctx.lineWidth = on ? 2 : 1;
        ctx.strokeRect(x, y, c.w, c.h);
    }
}

/** A padlock `s` units tall centred on (x, y), for a locked stage. */
export function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
    const w = s * 0.78,
        bh = s * 0.55;
    ctx.save();
    ctx.strokeStyle = '#c9c1e6';
    ctx.lineWidth = s * 0.11;
    ctx.beginPath();
    ctx.arc(x, y - bh * 0.15, w * 0.32, Math.PI, 0);
    ctx.lineTo(x + w * 0.32, y + bh * 0.1);
    ctx.moveTo(x - w * 0.32, y - bh * 0.15);
    ctx.lineTo(x - w * 0.32, y + bh * 0.1);
    ctx.stroke();
    const g = ctx.createLinearGradient(0, y, 0, y + bh);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(1, '#c98a2e');
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, y, w, bh);
    ctx.strokeStyle = '#6a3f10';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - w / 2 + 0.5, y + 0.5, w - 1, bh - 1);
    ctx.fillStyle = '#5a3410';
    ctx.beginPath();
    ctx.arc(x, y + bh * 0.42, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - s * 0.025, y + bh * 0.42, s * 0.05, bh * 0.3);
    ctx.restore();
}
