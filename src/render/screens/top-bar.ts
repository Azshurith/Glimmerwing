// The heading bar across the top of the menu screens (main menu, Play, Characters, Profile, select).
import * as C from '@/core/config';
import { arcadeText } from '@/render/draw';
import { tallMenuFit } from './menu-fit';

/** How tall the bar is, in design units: taller on a phone held upright, where it holds the Back tab. */
export const TOP_BAR_H = { wide: 27, tall: 36 } as const;

/**
 * Where the bar ends (its gold line included), in view units down from the top, for a view `h` tall: the page's
 * Settings panel starts there, so it sits under the same bar as the other screens.
 */
export function topBarBottom(tall: boolean, h: number = C.TALL_H): number {
    return tall ? (TOP_BAR_H.tall + 2) * tallMenuFit(h).s : TOP_BAR_H.wide + 2;
}

/**
 * Draw the heading bar, `W` wide and reaching `bleed` past each side, with `text` centred on `mid` at `size`.
 * The heading keeps clear of the corners, where the page's Back button sits.
 */
export function drawTopBar(
    ctx: CanvasRenderingContext2D,
    text: string,
    W: number,
    bleed: number,
    tall: boolean,
    size: number,
    mid = W / 2,
): void {
    const h = tall ? TOP_BAR_H.tall : TOP_BAR_H.wide;
    const g = ctx.createLinearGradient(0, 0, 0, h + 1);
    g.addColorStop(0, 'rgba(10,6,28,0.95)');
    g.addColorStop(1, 'rgba(10,6,28,0.6)');
    ctx.fillStyle = g;
    ctx.fillRect(-bleed, 0, W + 2 * bleed, h);
    ctx.fillStyle = '#c9a24a';
    ctx.fillRect(-bleed, h, W + 2 * bleed, 1);
    ctx.fillStyle = 'rgba(255,230,160,0.25)';
    ctx.fillRect(-bleed, h + 1, W + 2 * bleed, 1);
    // On a phone the corners hold the Back tab and the exit button, so the heading keeps to the middle.
    arcadeText(
        ctx,
        text,
        mid,
        h / 2 + size * 0.38,
        size,
        ['#fff7c2', '#ffd45c', '#ff9a2e'],
        'center',
        tall ? W - 150 : W - 76,
    );
}
