import * as C from '../core/config';
import { sparkle } from './draw';

/** The shared arcade night sky: turning light rays, a drifting sparkle lattice, twinkling stars, vignette. */
export class Backdrop {
    private stars: { x: number; y: number; s: number; p: number }[] = [];

    constructor(private ctx: CanvasRenderingContext2D) {
        for (let i = 0; i < 70; i++)
            this.stars.push({
                x: Math.random() * C.VIEW_W,
                y: Math.random() * C.VIEW_H,
                s: Math.random(),
                p: Math.random() * 6,
            });
    }

    /** (rx, ry): where the light rays turn from. */
    draw(t: number, rx = C.VIEW_W / 2, ry = 150): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, C.VIEW_H);
        g.addColorStop(0, '#1d0f45');
        g.addColorStop(0.55, '#140c34');
        g.addColorStop(1, '#08162c');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
        // Slow light rays turning behind the roster.
        ctx.save();
        ctx.translate(rx, ry);
        ctx.rotate(t * 0.06);
        for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI / 6);
            ctx.fillStyle = i % 2 ? 'rgba(255,214,140,0.035)' : 'rgba(170,140,255,0.04)';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-40, -420);
            ctx.lineTo(40, -420);
            ctx.fill();
        }
        ctx.restore();
        // A drifting lattice of four-point sparkles.
        const off = (t * 9) % 36;
        ctx.fillStyle = 'rgba(255,240,200,0.07)';
        for (let y = -36; y < C.VIEW_H + 36; y += 36) {
            for (let x = -36; x < C.VIEW_W + 36; x += 36) {
                const sx = x + off + ((y / 36) % 2 ? 18 : 0),
                    sy = y + off * 0.5;
                sparkle(ctx, sx, sy, 3.5);
            }
        }
        // Twinkling stars.
        for (const s of this.stars) {
            ctx.globalAlpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * (1.5 + s.s * 2) + s.p));
            ctx.fillStyle = s.s > 0.8 ? '#ffe7a0' : '#d9d0ff';
            ctx.fillRect(s.x, (s.y + t * (2 + s.s * 4)) % C.VIEW_H, s.s > 0.8 ? 1.5 : 1, s.s > 0.8 ? 1.5 : 1);
        }
        ctx.globalAlpha = 1;
        // Vignette.
        const vg = ctx.createRadialGradient(C.VIEW_W / 2, C.VIEW_H / 2, 120, C.VIEW_W / 2, C.VIEW_H / 2, 330);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
}
