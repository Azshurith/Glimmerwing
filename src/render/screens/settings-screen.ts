// The Settings screen's canvas side: the menu sky and the heading bar. The settings themselves are the page's own
// panel (#settings in index.template.html, see page/settings-panel.ts), laid over everything below the bar.
import * as C from '@/core/config';
import type { Layout } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawTopBar } from './top-bar';
import { tallMenuFit } from './menu-fit';

/** The Settings screen behind the page's panel. */
export class SettingsScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the sky and the heading bar; `bleed` is how far a widened landscape view reaches past each side. */
    draw(t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        ctx.save();
        if (layout === 'tall') {
            const f = tallMenuFit(h);
            this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            drawTopBar(ctx, 'SETTINGS', C.TALL_W, f.bleed, true, 16);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
            drawTopBar(ctx, 'SETTINGS', C.VIEW_W, bleed, false, 16);
        }
        ctx.restore();
    }
}
