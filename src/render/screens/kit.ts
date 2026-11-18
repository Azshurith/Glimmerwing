import kitUrl from '@/../assets/ui/lobby-kit.png';
import { loadImage } from '@/core/images';
import { LOBBY_KIT } from '@/data/lobby-kit';

/** The lobby's painted UI kit (`assets/ui/lobby-kit.png`, cut by `tools/extract-ui-kit.py`). */
const KIT = loadImage(kitUrl);

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
        ctx.drawImage(KIT, p.x, p.y, p.w, p.h, x - p.bx * sx, top, p.w * sx, hh);
    } else {
        const left = x - p.bx * s;
        const headW = (p.s0 - p.bx) * s,
            tailW = (p.bx + p.bw - p.s1) * s;
        const mid = Math.max(1, w - headW - tailW);
        ctx.drawImage(KIT, p.x, p.y, p.s0, p.h, left, top, p.s0 * s, hh);
        ctx.drawImage(KIT, p.x + p.s0, p.y, p.s1 - p.s0, p.h, x + headW, top, mid, hh);
        ctx.drawImage(KIT, p.x + p.s1, p.y, p.w - p.s1, p.h, x + headW + mid, top, (p.w - p.s1) * s, hh);
    }
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
    // Slices in the cell: the glow margin plus the corner on each side.
    const cl = p.bx + corner,
        ct = p.by + corner,
        cr = p.w - (p.bx + p.bw) + corner,
        cb = p.h - (p.by + p.bh) + corner;
    const sx = [p.x, p.x + cl, p.x + p.w - cr, p.x + p.w];
    const sy = [p.y, p.y + ct, p.y + p.h - cb, p.y + p.h];
    const dx = [x - p.bx * scale, x + corner * scale, x + w - corner * scale, x + w + (p.w - p.bx - p.bw) * scale];
    const dy = [y - p.by * scale, y + corner * scale, y + h - corner * scale, y + h + (p.h - p.by - p.bh) * scale];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            const dw = dx[i + 1] - dx[i],
                dh = dy[j + 1] - dy[j];
            if (dw <= 0 || dh <= 0) continue;
            ctx.drawImage(KIT, sx[i], sy[j], sx[i + 1] - sx[i], sy[j + 1] - sy[j], dx[i], dy[j], dw, dh);
        }
}
