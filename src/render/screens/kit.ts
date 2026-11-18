import goldUrl from '@/../assets/ui/lobby-kit-gold.png';
import kitUrl from '@/../assets/ui/lobby-kit.png';
import { loadImage } from '@/core/images';
import { LOBBY_KIT } from '@/data/lobby-kit';
import { sparkle } from '@/render/draw';
import type { KitPiece } from '@/types';

/** The lobby's painted UI kit (`assets/ui/lobby-kit.png`, cut by `tools/extract-ui-kit.py`). */
const KIT = loadImage(kitUrl);

/** The same atlas holding only the kit's gold, in white: what a glint lights up. */
const GOLD = loadImage(goldUrl);

/** Where a glint is painted before it's laid over a piece: a piece's cell, its gold lit by the band. */
let scratch: HTMLCanvasElement | null = null;

/** A source to draw a piece's cell from: an image and where the cell's top-left corner is in it. */
interface Source {
    img: CanvasImageSource;
    x: number;
    y: number;
}

/** The names of the kit's pieces. */
export type KitName = keyof typeof LOBBY_KIT;

/** Whether the kit's picture has loaded, so its pieces can be drawn (until then the screens draw their own). */
export function kitReady(): boolean {
    return KIT.complete && KIT.naturalWidth > 0;
}

/**
 * Draws a kit piece so its body fills the box (x, y, w, h), its glow spilling round it. A piece with a stretchable
 * middle keeps its ends' shape at the box's height and stretches only the middle to the box's width; any other piece
 * is scaled to the box. `flip` mirrors it left to right.
 */
export function drawKit(
    ctx: CanvasRenderingContext2D,
    name: KitName,
    x: number,
    y: number,
    w: number,
    h: number,
    flip = false,
): void {
    const p = LOBBY_KIT[name];
    if (!p || !kitReady()) return;
    blit(ctx, { img: KIT, x: p.x, y: p.y }, p, x, y, w, h, flip);
}

/** Lays a piece's cell from `src` into the box as `drawKit` does. */
function blit(
    ctx: CanvasRenderingContext2D,
    src: Source,
    p: KitPiece,
    x: number,
    y: number,
    w: number,
    h: number,
    flip: boolean,
): void {
    const s = h / p.bh;
    ctx.save();
    if (flip) {
        ctx.translate(x * 2 + w, 0);
        ctx.scale(-1, 1);
    }
    const top = y - p.by * s,
        hh = p.h * s;
    if (p.s0 === undefined || p.s1 === undefined) {
        const sx = w / p.bw;
        ctx.drawImage(src.img, src.x, src.y, p.w, p.h, x - p.bx * sx, top, p.w * sx, hh);
    } else {
        const left = x - p.bx * s;
        const headW = (p.s0 - p.bx) * s,
            tailW = (p.bx + p.bw - p.s1) * s;
        const mid = Math.max(1, w - headW - tailW);
        ctx.drawImage(src.img, src.x, src.y, p.s0, p.h, left, top, p.s0 * s, hh);
        ctx.drawImage(src.img, src.x + p.s0, src.y, p.s1 - p.s0, p.h, x + headW, top, mid, hh);
        ctx.drawImage(src.img, src.x + p.s1, src.y, p.w - p.s1, p.h, x + headW + mid, top, (p.w - p.s1) * s, hh);
    }
    ctx.restore();
}

/**
 * Paints the glint of a piece into the scratch canvas: its gold, lit by a slanted bright band `at` (0 to 1) of the
 * way across it. Returns the scratch canvas as a source laid out like the piece's cell, or null if it can't.
 */
function glintCell(p: KitPiece, at: number): Source | null {
    if (!(GOLD.complete && GOLD.naturalWidth > 0)) return null;
    scratch ??= document.createElement('canvas');
    if (scratch.width < p.w) scratch.width = p.w;
    if (scratch.height < p.h) scratch.height = p.h;
    const c = scratch.getContext('2d');
    if (!c) return null;
    c.save();
    c.globalCompositeOperation = 'copy';
    c.drawImage(GOLD, p.x, p.y, p.w, p.h, 0, 0, p.w, p.h);
    c.globalCompositeOperation = 'source-in';
    const band = Math.max(26, p.w * 0.14);
    const cx = -band + (p.w + band * 2) * at;
    const g = c.createLinearGradient(cx - band, 0, cx + band, p.h * 0.6);
    g.addColorStop(0, 'rgba(255,250,225,0)');
    g.addColorStop(0.5, 'rgba(255,250,225,0.95)');
    g.addColorStop(1, 'rgba(255,250,225,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, p.w, p.h);
    c.restore();
    return { img: scratch, x: 0, y: 0 };
}

/** How far through its sweep a glint `period` seconds apart and `phase` seconds in is (0 to 1), or null between. */
function sweep(t: number, phase: number, period: number): number | null {
    const run = 1.2;
    const at = (t + phase) % period;
    return at < run ? at / run : null;
}

/**
 * The glint over a piece drawn with `drawKit` into the same box: every `period` seconds (`phase` seconds into the
 * cycle) a band of light sweeps across its gold, left to right.
 */
export function kitGlint(
    ctx: CanvasRenderingContext2D,
    name: KitName,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    phase: number,
    period = 6,
    flip = false,
): void {
    const p = LOBBY_KIT[name];
    const at = sweep(t, phase, period);
    if (!p || at === null || !kitReady()) return;
    const src = glintCell(p, flip ? 1 - at : at);
    if (!src) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit(ctx, src, p, x, y, w, h, flip);
    ctx.restore();
}

/**
 * Where a point of a piece's sheet (sheet pixels relative to the piece's body) lands when the piece is drawn with
 * `drawKit` into the box: in the stretched middle's ends it keeps to its end.
 */
export function kitPoint(
    name: KitName,
    bx: number,
    by: number,
    x: number,
    y: number,
    w: number,
    h: number,
): { x: number; y: number } {
    const p = LOBBY_KIT[name];
    const s = h / p.bh;
    const cx = bx + p.bx;
    let px: number;
    if (p.s0 === undefined || p.s1 === undefined) px = x + (bx * w) / p.bw;
    else if (cx >= p.s1) px = x + w - (p.bw - bx) * s;
    else px = x + bx * s;
    return { x: px, y: y + by * s };
}

/** A twinkling four-pointed star: it swells and fades on its own beat, `phase` apart from its neighbours. */
export function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, phase = 0): void {
    const k = 0.5 + 0.5 * Math.sin(t * 2.6 + phase * 2.1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(255,236,190,${0.25 + 0.6 * k})`;
    sparkle(ctx, x, y, r * (0.5 + 0.7 * k));
    ctx.fillStyle = `rgba(255,255,255,${0.6 * k})`;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** Draws a kit piece by nine slices into the box: the corners (`corner` sheet pixels) kept, the edges stretched. */
export function drawKit9(
    ctx: CanvasRenderingContext2D,
    name: KitName,
    x: number,
    y: number,
    w: number,
    h: number,
    corner: number,
    scale: number,
): void {
    const p = LOBBY_KIT[name];
    if (!p || !kitReady()) return;
    blit9(ctx, { img: KIT, x: p.x, y: p.y }, p, x, y, w, h, corner, scale);
}

/** The glint over a piece drawn with `drawKit9` into the same box, as `kitGlint` for `drawKit`. */
export function kitGlint9(
    ctx: CanvasRenderingContext2D,
    name: KitName,
    x: number,
    y: number,
    w: number,
    h: number,
    corner: number,
    scale: number,
    t: number,
    phase: number,
    period = 7,
): void {
    const p = LOBBY_KIT[name];
    const at = sweep(t, phase, period);
    if (!p || at === null || !kitReady()) return;
    const src = glintCell(p, at);
    if (!src) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    blit9(ctx, src, p, x, y, w, h, corner, scale);
    ctx.restore();
}

/** Lays a piece's cell from `src` into the box by nine slices, as `drawKit9` does. */
function blit9(
    ctx: CanvasRenderingContext2D,
    src: Source,
    p: KitPiece,
    x: number,
    y: number,
    w: number,
    h: number,
    corner: number,
    scale: number,
): void {
    // Slices in the cell: the glow margin plus the corner on each side.
    const cl = p.bx + corner,
        ct = p.by + corner,
        cr = p.w - (p.bx + p.bw) + corner,
        cb = p.h - (p.by + p.bh) + corner;
    const sx = [src.x, src.x + cl, src.x + p.w - cr, src.x + p.w];
    const sy = [src.y, src.y + ct, src.y + p.h - cb, src.y + p.h];
    const dx = [x - p.bx * scale, x + corner * scale, x + w - corner * scale, x + w + (p.w - p.bx - p.bw) * scale];
    const dy = [y - p.by * scale, y + corner * scale, y + h - corner * scale, y + h + (p.h - p.by - p.bh) * scale];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            const dw = dx[i + 1] - dx[i],
                dh = dy[j + 1] - dy[j];
            if (dw <= 0 || dh <= 0) continue;
            ctx.drawImage(src.img, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dw, dh);
        }
}
