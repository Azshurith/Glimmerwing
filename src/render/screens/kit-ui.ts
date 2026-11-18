// The menu screens' shared pieces, drawn from the painted UI kit (kit.ts): framed panels, pills for tabs and buttons,
// the winged heading with its divider, and the long capsule behind key hints. Each falls back to nothing when the kit
// hasn't loaded, so callers check `kitReady()` first and keep their code-drawn look for that moment.
import { arcadeText } from '@/render/draw';
import { ARCADE, SANS } from '@/render/theme';
import { drawKit, drawKit9, kitGlint, kitGlint9, kitReady } from './kit';
import type { KitName } from './kit';

/** A box, in design units. */
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The kinds of pill: gold (lit), violet, lilac, blue, and the long dark capsule (unlit). */
export type PillKind = 'gold' | 'violet' | 'lilac' | 'blue' | 'capsule';

/** Each pill kind's piece. */
const PILLS: Record<PillKind, KitName> = {
    gold: 'pillGold',
    violet: 'pillViolet',
    lilac: 'pillLilac',
    blue: 'pillBlue',
    capsule: 'capsule',
};

export { kitReady };

/**
 * A framed panel filling the box: the kit's dark violet card in its gold rim (`pink` for the one with the pink glow
 * along its rim), its corners kept their shape at any size; a glint runs round its gold now and then.
 */
export function kitPanel(ctx: CanvasRenderingContext2D, b: Box, t: number, phase = 0, pink = false): void {
    const name: KitName = pink ? 'panelPink' : 'panel';
    // Corners 34 sheet pixels deep, at a scale that keeps them in proportion to a small panel.
    const s = Math.min(0.2, b.h / 150, b.w / 150);
    drawKit9(ctx, name, b.x, b.y, b.w, b.h, 34, s);
    kitGlint9(ctx, name, b.x, b.y, b.w, b.h, 34, s, t, phase, 8);
}

/** A pill of `kind` filling the box, its ends kept their shape; it shines now and then if `t` is given. */
export function kitPill(ctx: CanvasRenderingContext2D, b: Box, kind: PillKind, t?: number, phase = 0): void {
    drawKit(ctx, PILLS[kind], b.x, b.y, b.w, b.h);
    if (t !== undefined) kitGlint(ctx, PILLS[kind], b.x, b.y, b.w, b.h, t, phase, 6);
}

/**
 * A tab: a gold pill with dark lettering when it's the one showing, else the dark capsule with white; `icon` draws a
 * little picture in the lettering's colour before the label, centred on the point it's given.
 */
export function kitTab(
    ctx: CanvasRenderingContext2D,
    b: Box,
    label: string,
    on: boolean,
    t: number,
    icon?: (x: number, y: number, ink: string) => void,
    lit: PillKind = 'gold',
): void {
    kitPill(ctx, b, on ? lit : 'capsule', on ? t : undefined);
    const ink = on ? (lit === 'gold' ? '#3a1408' : '#140a26') : '#ffffff';
    const size = Math.min(9, b.h * 0.52);
    ctx.font = `800 ${size}px ${SANS}`;
    const tw = ctx.measureText(label).width;
    const iw = icon ? size + 4 : 0;
    const x0 = b.x + b.w / 2 - (tw + iw) / 2,
        cy = b.y + b.h / 2;
    if (icon) icon(x0 + size / 2, cy, ink);
    ctx.textAlign = 'left';
    ctx.fillStyle = ink;
    ctx.fillText(label, x0 + iw, cy + size * 0.36, b.w - 12);
}

/** A button: a gold or violet pill with dark lettering, or dimmed when there's nothing to do. */
export function kitButton(
    ctx: CanvasRenderingContext2D,
    b: Box,
    label: string,
    kind: 'gold' | 'violet',
    on: boolean,
    t: number,
): void {
    ctx.save();
    if (!on) ctx.globalAlpha = 0.45;
    kitPill(ctx, b, kind === 'gold' ? 'gold' : 'lilac', on ? t : undefined, kind === 'gold' ? 0 : 1.5);
    const size = Math.min(10, b.h * 0.42);
    ctx.textAlign = 'center';
    ctx.font = `800 ${size}px ${SANS}`;
    ctx.fillStyle = kind === 'gold' ? '#2e1004' : '#1a0a36';
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + size * 0.36, b.w - 14);
    ctx.restore();
}

/**
 * A screen's heading, centred on (cx, y): its name in big gold letters between the kit's two gold wings, the kit's
 * starred divider under it.
 */
export function kitTitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    size: number,
    wings = 1,
): void {
    ctx.font = `${size}px ${ARCADE}`;
    arcadeText(ctx, text, cx, y + size * 0.38, size, ['#fff6d0', '#ffd45c', '#e88a1c'], 'center');
    const tw = ctx.measureText(text).width;
    // `wings` below 1 draws them smaller and closer, for a long heading on a narrow screen.
    const wh = size * 1.25 * Math.max(0.4, wings),
        ww = (wh * 204) / 84,
        gap = size * 0.7 * Math.max(0.4, wings);
    drawKit(ctx, 'wingLeft', cx - tw / 2 - ww - gap, y - wh * 0.55, ww, wh);
    drawKit(ctx, 'wingRight', cx + tw / 2 + gap, y - wh * 0.55, ww, wh);
    kitDivider(ctx, cx, y + size * 0.78, tw + ww * 1.6);
}

/** The kit's starred gold divider, `w` wide, centred on (cx, y). */
export function kitDivider(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number): void {
    const h = (w * 82) / 1266;
    drawKit(ctx, 'divider', cx - w / 2, y - h / 2, w, h);
}

/** The long dark capsule behind a screen's key hints, centred on (cx, y). */
export function kitHintBar(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number): void {
    drawKit(ctx, 'capsule', cx - w / 2, y - h / 2, w, h);
}

/** The kit's four gold corners round the box, each `s` across, standing just outside it. */
export function kitCorners(ctx: CanvasRenderingContext2D, b: Box, s: number): void {
    const o = s * 0.18;
    drawKit(ctx, 'cornerTL', b.x - o, b.y - o, s, s);
    drawKit(ctx, 'cornerTR', b.x + b.w - s + o, b.y - o, s, s);
    drawKit(ctx, 'cornerBL', b.x - o, b.y + b.h - s + o, s, s);
    drawKit(ctx, 'cornerBR', b.x + b.w - s + o, b.y + b.h - s + o, s, s);
}

/** How a screen's mockup (drawn at 2x, `MOCK` units) maps onto the view: its top-left corner and its scale. */
export interface MockFit {
    x: number;
    y: number;
    s: number;
}

/**
 * Fits the part of a mockup from (mx0, my0) to (mx1, my1), in its 2x pixels, into the landscape view (504 design units
 * wide plus `bleed` each side, `H` tall, `foot` kept free along the bottom for the key hints), centred.
 */
export function mockFit(
    W: number,
    H: number,
    bleed: number,
    mx0: number,
    my0: number,
    mx1: number,
    my1: number,
    foot = 18,
): MockFit {
    const vx0 = -bleed + 4,
        vw = W + 2 * bleed - 8,
        vh = H - foot - 2;
    const s = Math.min(vw / (mx1 - mx0), vh / (my1 - my0));
    return {
        s,
        x: vx0 + (vw - (mx1 - mx0) * s) / 2 - mx0 * s,
        y: 2 + (vh - (my1 - my0) * s) / 2 - my0 * s,
    };
}

/** A box in a mockup's 2x pixels, in view units under `fit`. */
export function mockBox(fit: MockFit, x: number, y: number, w: number, h: number): Box {
    return { x: fit.x + x * fit.s, y: fit.y + y * fit.s, w: w * fit.s, h: h * fit.s };
}
