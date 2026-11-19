// Pieces of the painted select-screen mockups, traced in code: the winged heading banner, pointed plates in gold or
// lilac, gold rings and VS. They're drawn in a mockup's own pixels (big numbers: a heading is about 200 high), so
// line widths and sizes here are in those pixels too.
import { arcadeText, sparkle } from '@/render/draw';
import { shine } from './kit';
import { gloss, goldEdge, sweptWing } from './lobby-screen';
import { pointed } from './ornate';

/** An edge's colours from top to bottom: gold, or lilac for the rival's side. */
export type EdgeTone = 'gold' | 'lilac';

/** The lilac edge's colours, top to bottom. */
const LILAC: [string, string, string] = ['#fbeaff', '#c690ff', '#6a3aa8'];

/** The colours an edge of `tone` takes (undefined for goldEdge's own gold). */
export const edgeTones = (tone: EdgeTone): [string, string, string] | undefined =>
    tone === 'lilac' ? LILAC : undefined;

/**
 * A pointed plate over (x, y, w, h), its ends cut to points `tip` deep: deep violet glass with a gloss across its top,
 * in a gold (or lilac) edge `edge` wide, a band of light sweeping over it every few seconds (`t`, `phase`).
 */
export function tracedPlate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    tip: number,
    t: number,
    phase: number,
    tone: EdgeTone = 'gold',
    edge = 10,
): void {
    const trace = () => pointed(ctx, x, y, w, h, tip);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, tone === 'lilac' ? '#3e1c80' : '#3a1474');
    g.addColorStop(1, '#14062e');
    ctx.fillStyle = g;
    trace();
    ctx.fill();
    gloss(ctx, trace, x, y, w, h);
    goldEdge(ctx, trace, y, y + h, edgeTones(tone), edge);
    shine(ctx, trace, x, y, w, h, t, phase, 7);
}

/** A twinkling four-pointed star (x, y), `r` across, in gold. */
export function tracedStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    ctx.fillStyle = '#ffe7a0';
    sparkle(ctx, x, y, r * (0.8 + 0.2 * Math.abs(Math.sin(t * 2.4 + x))));
}

/**
 * A screen's heading in box `b` (x, y, w, h): a pointed violet plate in a heavy gold edge with a gold wing either
 * side, and `text` in gold on it.
 */
export function tracedTitle(ctx: CanvasRenderingContext2D, text: string, b: readonly number[], t: number): void {
    const [x, y, w, h] = b;
    const wing = h * 1.05,
        px = x + wing * 0.9,
        pw = w - wing * 1.8,
        py = y + h * 0.14,
        ph = h * 0.74;
    // The wings spread out from the plate's ends, their tips no higher than the heading's box.
    sweptWing(ctx, px + ph * 0.2, py + ph * 0.95, wing, -1);
    sweptWing(ctx, px + pw - ph * 0.2, py + ph * 0.95, wing, 1);
    tracedPlate(ctx, px, py, pw, ph, ph * 0.42, t, 0.3, 'gold', ph * 0.08);
    arcadeText(ctx, text, x + w / 2, py + ph * 0.72, ph * 0.62, ['#fffbe0', '#ffd45c', '#e88a1c'], 'center', pw - ph);
}

/** A gold ring of radius `r` round (x, y), `w` thick, catching the light now and then. */
export function tracedRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    w: number,
    t: number,
    phase: number,
): void {
    const ring = () => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
    };
    goldEdge(ctx, ring, y - r, y + r, undefined, w);
    shine(ctx, ring, x - r, y - r, r * 2, r * 2, t, phase, 5);
}

/** VS in box `b` (x, y, w, h): big leaning gold-to-pink letters. */
export function tracedVs(ctx: CanvasRenderingContext2D, b: readonly number[]): void {
    const [x, y, w, h] = b;
    const cx = x + w / 2,
        size = h * 0.82;
    ctx.save();
    ctx.translate(cx, y + h * 0.74);
    ctx.transform(1, 0, -0.16, 1, 0, 0);
    arcadeText(ctx, 'VS', 0, 0, size, ['#fff6c0', '#ffb040', '#ff4a8a'], 'center');
    ctx.restore();
}
