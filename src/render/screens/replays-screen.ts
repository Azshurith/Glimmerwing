// The Replays screen: the player's recorded matches and Endless runs, newest first, to watch again or share.
import * as C from '@/core/config';
import type { Layout, ReplaysView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText, slanted } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';

/** Rows in view at once; the list scrolls with the cursor. */
export const REPLAY_ROWS = 7;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** The rows' boxes in a layout's design units: one line each in landscape, two on a phone. */
function designRows(layout: Layout, count: number, dy = 0): { x: number; y: number; w: number; h: number }[] {
    const tall = layout === 'tall';
    const W = tall ? C.TALL_W : C.VIEW_W;
    const w = tall ? W - 24 : 440,
        h = tall ? 46 : 28,
        gap = tall ? 7 : 5,
        y0 = (tall ? 58 : 40) + dy;
    return Array.from({ length: count }, (_, i) => ({ x: (W - w) / 2, y: y0 + i * (h + gap), w, h }));
}

/** The rows in view, in view units: also their tap targets. */
export function replayRowBoxes(layout: Layout, count: number, h: number = C.TALL_H) {
    if (layout !== 'tall') return designRows(layout, count);
    const f = tallMenuFit(h);
    return designRows(layout, count, tallShift(f.h)).map(b => ({
        x: f.x + b.x * f.s,
        y: b.y * f.s,
        w: b.w * f.s,
        h: b.h * f.s,
    }));
}

/** Where the share link line sits (its tap target copies it), in view units. */
export function replayLinkBox(layout: Layout, h: number = C.TALL_H) {
    const rows = replayRowBoxes(layout, REPLAY_ROWS, h);
    const last = rows[rows.length - 1];
    return { x: last.x, y: last.y + last.h + 4, w: last.w, h: layout === 'tall' ? 30 : 22 };
}

/** The Replays screen. */
export class ReplaysScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: ReplaysView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
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
        drawTopBar(ctx, 'REPLAYS', W, bleed, tall, 16);

        const boxes = designRows(layout, REPLAY_ROWS, dy);
        if (v.message) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 10px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.9)';
            const lines = v.message.split('\n');
            lines.forEach((l, i) => ctx.fillText(l, W / 2, boxes[1].y + 14 + i * 14, W - 30));
        }
        const shown = v.rows.slice(v.start, v.start + REPLAY_ROWS);
        shown.forEach((row, k) => {
            const b = boxes[k],
                on = v.start + k === v.index;
            ctx.save();
            if (on) {
                ctx.shadowColor = row.color;
                ctx.shadowBlur = 10 + 3 * Math.sin(t * 6);
            }
            ctx.fillStyle = on ? 'rgba(52,32,104,0.95)' : 'rgba(20,12,48,0.85)';
            ctx.fillRect(b.x, b.y, b.w, b.h);
            ctx.restore();
            ctx.strokeStyle = on ? row.color : 'rgba(201,162,74,0.5)';
            ctx.lineWidth = on ? 1.5 : 1;
            ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
            // The mode's tag.
            ctx.font = `6px ${ARCADE}`;
            const tw = 64;
            ctx.fillStyle = row.color;
            slanted(b.x + 6, b.y + 6, tw, 12, 3)(ctx);
            ctx.fill();
            ctx.fillStyle = '#140a26';
            ctx.textAlign = 'center';
            ctx.fillText(row.tag, b.x + 6 + tw / 2, b.y + 14.5, tw - 8);
            const tx = tall ? b.x + 8 : b.x + 80;
            const ty = tall ? b.y + 32 : b.y + 12;
            ctx.textAlign = 'left';
            ctx.font = `600 ${tall ? 10 : 9.5}px ${FONT}`;
            ctx.fillStyle = on ? '#fff7c2' : '#f2ecff';
            ctx.fillText(row.title, tall ? b.x + 76 : tx, tall ? b.y + 15 : ty, tall ? b.w - 84 : 150);
            ctx.font = `italic 600 8.5px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.85)';
            ctx.fillText(row.detail, tall ? tx : b.x + 80, tall ? ty + 8 : b.y + 23, tall ? b.w - 100 : 200);
            ctx.textAlign = 'right';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = row.local ? '#ffe27a' : 'rgba(203,188,245,0.8)';
            ctx.fillText(row.local ? 'THIS DEVICE' : row.when, b.x + b.w - 8, tall ? b.y + 40 : b.y + 17);
            // A play mark on the chosen row.
            if (on) {
                const px = b.x + b.w - (tall ? 16 : 90),
                    py = b.y + (tall ? 16 : b.h / 2);
                ctx.fillStyle = row.color;
                ctx.beginPath();
                ctx.moveTo(px - 3, py - 5);
                ctx.lineTo(px + 5, py);
                ctx.lineTo(px - 3, py + 5);
                ctx.closePath();
                ctx.fill();
            }
        });
        // More above or below.
        ctx.fillStyle = 'rgba(255,226,122,0.8)';
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        if (v.start > 0) ctx.fillText('▲', W / 2, boxes[0].y - 3);
        if (v.start + REPLAY_ROWS < v.rows.length) {
            const last = boxes[REPLAY_ROWS - 1];
            ctx.fillText('▼', W - 16, last.y + last.h - 2);
        }

        // The chosen replay's share link, which copies when picked.
        const last = boxes[REPLAY_ROWS - 1];
        const ly = last.y + last.h + 16;
        if (v.link || v.note) {
            ctx.textAlign = 'center';
            ctx.font = `600 8.5px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.9)';
            if (v.link) ctx.fillText(v.link, W / 2, ly, W - 30);
            if (v.note) arcadeText(ctx, v.note, W / 2, ly + 13, 8, ['#ffffff', '#ffe08a', '#ff9a2e'], 'center');
            else {
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.75)';
                ctx.fillText(v.touch ? 'TAP THE LINK TO COPY IT' : 'C COPIES THE LINK TO SHARE', W / 2, ly + 12);
            }
        }

        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP A REPLAY TO WATCH  ·  ◀ BACK' : 'ARROWS CHOOSE  ·  ENTER WATCHES  ·  ESC BACK';
        ctx.fillText(hint, W / 2, tall ? H - 14 : H - 8, W - 16);
        ctx.restore();
    }
}
