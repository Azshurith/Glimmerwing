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
export function mapCards(layout: Layout, h: number = C.TALL_H): { x: number; y: number; w: number; h: number }[] {
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
