// The Settings screen's canvas side: the menus' painted night and the winged heading. The settings themselves are the
// page's own panel (#settings in index.template.html, see page/settings-panel.ts), laid over everything below it.
import * as C from '@/core/config';
import type { Layout } from '@/types';
import { tallMenuFit } from './menu-fit';
import { ornateScreen, ornateTitle } from './ornate';
import { enter } from '@/render/transition';

/** The Settings screen behind the page's panel. */
export class SettingsScreen {
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Draw the night and the heading; `bleed` is how far a widened landscape view reaches past each side. */
    draw(t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H;
        if (tall) {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
        }
        enter(ctx, 'bg', () => ornateScreen(ctx, t, W, H, bleed, '', tall));
        enter(ctx, 'bar', () => ornateTitle(ctx, 'SETTINGS', W, t, tall));
        ctx.restore();
    }
}
