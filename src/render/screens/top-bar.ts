// The heading bar across the top of the menu screens (main menu, Play, Characters, Profile, select).
import * as C from '@/core/config';
import { arcadeText } from '@/render/draw';
import { tallMenuFit } from './menu-fit';
import { drawGem, GOLD_TEXT } from './menu-style';
import { ARCADE } from '@/render/theme';

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
    const x0 = -bleed,
        w = W + 2 * bleed;
    // A plum band like the lobby's, its gold line brightest under the heading and fading toward the ends.
    const g = ctx.createLinearGradient(0, 0, 0, h + 1);
    g.addColorStop(0, 'rgba(30,14,48,0.96)');
    g.addColorStop(1, 'rgba(48,24,64,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, h);
    const line = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    const m = (mid - x0) / w;
    line.addColorStop(0, 'rgba(233,185,73,0.35)');
    line.addColorStop(Math.max(0, m - 0.25), 'rgba(233,185,73,0.8)');
    line.addColorStop(m, '#fff0b8');
    line.addColorStop(Math.min(1, m + 0.25), 'rgba(233,185,73,0.8)');
    line.addColorStop(1, 'rgba(233,185,73,0.35)');
    ctx.fillStyle = line;
    ctx.fillRect(x0, h, w, 1.2);
    const shade = ctx.createLinearGradient(0, h + 1, 0, h + 8);
    shade.addColorStop(0, 'rgba(10,4,24,0.45)');
    shade.addColorStop(1, 'rgba(10,4,24,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(x0, h + 1.2, w, 7);
    // On a phone the corners hold the Back tab and the exit button, so the heading keeps to the middle.
    const room = tall ? W - 150 : W - 76;
    ctx.font = `${size}px ${ARCADE}`;
    const tw = Math.min(room - 30, ctx.measureText(text).width);
    arcadeText(ctx, text, mid, h / 2 + size * 0.38, size, GOLD_TEXT, 'center', room - 30);
    // A gold gem either side of the heading.
    const t = performance.now() / 1000;
    drawGem(ctx, mid - tw / 2 - 10, h / 2, 3, t);
    drawGem(ctx, mid + tw / 2 + 10, h / 2, 3, t + 1);
}
