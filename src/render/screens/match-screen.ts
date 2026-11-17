// The match details screen: one game from Profile's match history in full (result, both fairies, the score and its
// numbers), with buttons to watch its replay and copy its share link.
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import type { Fairy, Layout, MatchInfoView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText, slanted } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { drawMedal } from './profile-screen';

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A box, in design or view units. */
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The buttons in design units: side by side in landscape, stacked on a phone. */
function designButtons(layout: Layout, dy: number): { watch: Box; copy: Box } {
    if (layout === 'tall') {
        const w = C.TALL_W - 44,
            x = 22;
        return { watch: { x, y: 382 + dy, w, h: 30 }, copy: { x, y: 420 + dy, w, h: 24 } };
    }
    const W = C.VIEW_W;
    return { watch: { x: W / 2 - 150, y: 256, w: 170, h: 26 }, copy: { x: W / 2 + 30, y: 256, w: 120, h: 26 } };
}

/** The Watch Replay and Copy Link buttons in view units (their tap targets), for a view `h` tall. */
export function matchButtons(layout: Layout, h: number = C.TALL_H): { watch: Box; copy: Box } {
    if (layout !== 'tall') return designButtons(layout, 0);
    const f = tallMenuFit(h);
    const d = designButtons(layout, tallShift(f.h));
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    return { watch: view(d.watch), copy: view(d.copy) };
}

/** The match details screen. */
export class MatchScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: MatchInfoView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
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
        drawTopBar(ctx, 'MATCH DETAILS', W, bleed, tall, 16);
        ctx.translate(0, dy);
        const mid = W / 2;

        // The mode's tag, the result and when.
        const tagW = 84,
            tagY = tall ? 48 : 36;
        ctx.fillStyle = v.color;
        slanted(mid - tagW / 2, tagY, tagW, 13, 3)(ctx);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = '#140a26';
        ctx.fillText(v.tag, mid, tagY + 9.5, tagW - 8);
        const gold: [string, string, string] = ['#ffffff', '#ffe08a', '#ff9a2e'];
        const blue: [string, string, string] = ['#ffffff', '#c9d8ff', '#7d8cff'];
        arcadeText(ctx, v.banner, mid, tagY + (tall ? 40 : 38), tall ? 22 : 24, v.won ? gold : blue, 'center');
        ctx.font = `italic 600 9px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        ctx.fillText(v.when, mid, tagY + (tall ? 54 : 52));

        // The two fairies, the score between them (an Endless run: the one fairy beside her time).
        const fy = fairyById(v.fairy),
            rival = v.rival ? fairyById(v.rival) : null;
        const my = tall ? 166 : 136,
            r = tall ? 30 : 32,
            apart = tall ? 78 : 140;
        const meX = rival || tall ? mid - apart : mid - 90,
            scoreX = rival || tall ? mid : mid + 50;
        if (tall && !rival) {
            // On a phone the lone fairy sits in the middle with her time under her.
            this.fairy(fy, mid, my - 12, r, t, 'YOU');
            arcadeText(ctx, v.score, mid, my + 62, 22, gold, 'center');
            this.label(v.scoreLabel, mid, my + 76);
        } else {
            this.fairy(fy, meX, my, r, t, 'YOU');
            if (rival) this.fairy(rival, mid + apart, my, r, t, 'RIVAL');
            arcadeText(ctx, v.score, scoreX, my + 8, tall ? 24 : 28, gold, 'center');
            this.label(v.scoreLabel, scoreX, my + 24);
        }

        // The numbers, as tiles.
        const cols = tall ? 2 : Math.min(5, v.stats.length);
        const tw = tall ? 106 : 88,
            th = 34,
            gap = 8,
            rowsW = cols * tw + (cols - 1) * gap,
            y0 = tall ? 268 : 196;
        v.stats.forEach(([label, value], i) => {
            const x = mid - rowsW / 2 + (i % cols) * (tw + gap),
                y = y0 + Math.floor(i / cols) * (th + 6);
            ctx.fillStyle = 'rgba(20,12,48,0.85)';
            ctx.fillRect(x, y, tw, th);
            ctx.strokeStyle = 'rgba(201,162,74,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
            ctx.textAlign = 'left';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(label, x + 7, y + 11, tw - 12);
            arcadeText(ctx, value, x + 7, y + 28, 11, gold, 'left', tw - 12);
        });

        // Watch the replay, copy its link.
        const b = designButtons(layout, 0);
        this.button(b.watch, '▶ WATCH REPLAY', v.hasReplay, v.color, t);
        this.button(b.copy, 'COPY LINK', !!v.link, '#c9b8ff', t);
        const noteY = b.copy.y + b.copy.h + (tall ? 18 : 16);
        if (v.note) arcadeText(ctx, v.note, mid, noteY, 8, gold, 'center');
        else if (!v.hasReplay) {
            ctx.font = `italic 600 9px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.8)';
            ctx.fillText('No replay was saved for this game', mid, noteY);
        }
        ctx.translate(0, -dy);

        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? '◀ BACK TO THE HISTORY' : 'ENTER WATCHES  ·  C COPIES THE LINK  ·  ESC BACK';
        ctx.fillText(hint, W / 2, tall ? H - 14 : H - 8, W - 16);
        ctx.restore();
    }

    /** A fairy's medal with her name under it, and a small YOU or RIVAL over it. */
    private fairy(fy: Fairy, x: number, y: number, r: number, t: number, who: string): void {
        const ctx = this.ctx;
        drawMedal(ctx, fy, x, y, r, t);
        this.label(who, x, y - r - 6);
        ctx.textAlign = 'center';
        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = '#fff7c2';
        ctx.fillText(fy.name, x, y + r + 15);
    }

    /** A small arcade-lettered caption. */
    private label(text: string, x: number, y: number): void {
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText(text, x, y);
    }

    /** A button: lit in its colour, or dim when there's nothing to do. */
    private button(b: Box, text: string, on: boolean, color: string, t: number): void {
        const ctx = this.ctx;
        ctx.save();
        if (on) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 8 + 3 * Math.sin(t * 5);
        }
        ctx.fillStyle = on ? color : 'rgba(40,30,70,0.85)';
        slanted(b.x, b.y, b.w, b.h, 5)(ctx);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = on ? '#ffffff' : 'rgba(120,100,160,0.7)';
        ctx.lineWidth = 1;
        slanted(b.x, b.y, b.w, b.h, 5)(ctx);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `8px ${ARCADE}`;
        ctx.fillStyle = on ? '#140a26' : 'rgba(203,188,245,0.5)';
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 4, b.w - 10);
    }
}
