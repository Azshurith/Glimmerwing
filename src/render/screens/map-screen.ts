// The map select screen, after the fairies are picked: a card for each map with its scenery scrolling live inside,
// and a Random card that flicks through them all. The game keeps which card is chosen (Game.mapIndex).
import * as C from '@/core/config';
import { MAPS } from '@/data/maps';
import type { Layout, MapSelectView, MapTheme } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText } from '@/render/draw';
import { ARCADE } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { drawTopBar } from './top-bar';

/** Draws map `map`'s live scenery into the box (x, y, w, h), in the screen's design units. */
export type MapPreviewDraw = (map: MapTheme, x: number, y: number, w: number, h: number) => void;

/** How many cards there are: Random, then every map. */
export const MAP_CARDS = MAPS.length + 1;

/** Extra room at the top of a tall view that's taller than the design, split above and below. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** The cards, in design units: a row across a wide screen, two columns on a tall one. */
function designCards(layout: Layout, dy = 0): { x: number; y: number; w: number; h: number }[] {
    if (layout === 'wide') {
        const w = 86,
            gap = 8,
            x0 = (C.VIEW_W - (MAP_CARDS * w + (MAP_CARDS - 1) * gap)) / 2;
        return Array.from({ length: MAP_CARDS }, (_, i) => ({ x: x0 + i * (w + gap), y: 46, w, h: 228 }));
    }
    // Tall: Random across the top, then the maps two by two.
    const w = 116,
        gap = 8,
        x0 = (C.TALL_W - (2 * w + gap)) / 2;
    const cards = [{ x: x0, y: 50 + dy, w: 2 * w + gap, h: 92 }];
    for (let i = 0; i < MAPS.length; i++)
        cards.push({ x: x0 + (i % 2) * (w + gap), y: 150 + dy + Math.floor(i / 2) * 160, w, h: 152 });
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
            this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
            dy = tallShift(f.h);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
        }
        drawTopBar(ctx, 'CHOOSE A MAP', W, bleed, layout === 'tall', 16);
        designCards(layout, dy).forEach((c, i) => this.card(c, i, i === v.index, t, preview));
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP A MAP  ·  ◀ BACK' : 'ARROWS CHOOSE  ·  ENTER OR Z PLAY  ·  ESC BACK';
        ctx.fillText(hint, W / 2, layout === 'tall' ? H - 14 : H - 10, W - 16);
        ctx.restore();
    }

    /** One card: the map's scenery scrolling inside, its name on a plate, gold-edged when chosen. */
    private card(
        c: { x: number; y: number; w: number; h: number },
        i: number,
        on: boolean,
        t: number,
        preview: MapPreviewDraw,
    ): void {
        const ctx = this.ctx;
        const random = i === 0;
        // Random flicks through every map, a second on each.
        const map = random ? MAPS[Math.floor(t / 1.1) % MAPS.length] : MAPS[i - 1];
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
            random ? 'RANDOM' : map.name.toUpperCase(),
            x + c.w / 2,
            y + c.h - 8,
            on ? 12 : 11,
            on ? ['#fff7c2', '#ffd45c', '#ff9a2e'] : ['#ffffff', '#e4dcff', '#b9a8e8'],
            'center',
            c.w - 8,
        );
        ctx.restore();
        ctx.strokeStyle = on ? '#ffd86b' : 'rgba(201,162,74,0.6)';
        ctx.lineWidth = on ? 2 : 1;
        ctx.strokeRect(x, y, c.w, c.h);
    }
}
