/* A fairy's bomb sweeping the meadow, drawn by its style. */
import * as C from '@/core/config';
import type { Field } from '@/game/field';

/** A fairy's bomb, drawn by style while it sweeps. */
export function drawBomb(ctx: CanvasRenderingContext2D, f: Field, time: number): void {
    const bomb = f.fairy.bomb;
    const k = 1 - f.bloom / bomb.time;
    const { x: ox, y: oy } = f.bloomAt;
    const W = C.FIELD_W,
        H = C.FIELD_H;
    ctx.save();
    ctx.fillStyle = bomb.color;
    ctx.strokeStyle = bomb.color;
    const ring = (cx: number, cy: number, R: number, n: number, spin: number) => {
        for (let i = 0; i < n; i++) {
            const a = (Math.PI * 2 * i) / n + spin;
            ctx.save();
            ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
            ctx.rotate(a);
            bombPiece(ctx, bomb.shape, k);
            ctx.restore();
        }
    };
    switch (bomb.style) {
        case 'dash': {
            if (k < 0.65) {
                const head = (k / 0.65) * (W + 40) - 20;
                ctx.globalAlpha = 0.16;
                ctx.fillRect(0, oy - 70, Math.max(0, head), 140);
                ctx.globalAlpha = 0.9;
                for (let wx = head - 10; wx > -10; wx -= 26) {
                    const r = 6 + 6 * Math.abs(Math.sin(wx * 0.3 + time * 20));
                    ctx.beginPath();
                    ctx.arc(wx, oy + Math.sin(wx * 0.17) * 30, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 18;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(head, oy, 9, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.globalAlpha = 1 - (k - 0.65) / 0.35;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
            }
            break;
        }
        case 'blast': {
            const R = 30 + 400 * k;
            ctx.globalAlpha = (1 - k) * 0.25;
            ctx.beginPath();
            ctx.arc(ox, oy, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1 - k;
            ctx.lineWidth = 6 * (1 - k) + 1;
            ctx.stroke();
            ring(ox, oy, R, 28, k * 2);
            ctx.globalAlpha = (1 - k) * 0.8;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ox, oy, 40 * (1 - k), 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'vortex': {
            const cx = W / 2,
                cy = H / 2,
                R = 30 + 260 * k,
                turned = Math.min((Math.PI * 2) / 3, k * Math.PI * 2.4);
            ctx.globalAlpha = 0.12 * (1 - k) + 0.05;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 0.85 * (1 - k * 0.6);
            for (let arm = 0; arm < 3; arm++) {
                const base = (Math.PI * 2 * arm) / 3 - Math.PI;
                for (let t = 0; t <= 1; t += 0.06) {
                    const a = base + turned * t + time * 2,
                        rr = R * t;
                    ctx.save();
                    ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
                    ctx.rotate(a);
                    bombPiece(ctx, bomb.shape, k);
                    ctx.restore();
                }
            }
            break;
        }
        case 'fan': {
            const R = 40 + 360 * k;
            ctx.globalAlpha = 0.14 * (1 - k) + 0.04;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.arc(ox, oy, R, -Math.PI / 2 - 1.13, -Math.PI / 2 + 1.13);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1 - k * 0.5;
            for (let i = 0; i < 13; i++) {
                const a = -Math.PI / 2 - 1.13 + (2.26 * i) / 12;
                for (const rr of [R, R * 0.66, R * 0.33]) {
                    ctx.save();
                    ctx.translate(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
                    ctx.rotate(a + time * 6);
                    bombPiece(ctx, bomb.shape, k);
                    ctx.restore();
                }
            }
            break;
        }
        case 'beam': {
            const beam = -Math.PI + k * Math.PI;
            ctx.globalAlpha = 0.12;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.arc(ox, oy, 420, -Math.PI, beam);
            ctx.closePath();
            ctx.fill();
            const ex = ox + Math.cos(beam) * 420,
                ey = oy + Math.sin(beam) * 420;
            ctx.globalAlpha = 1;
            ctx.lineCap = 'round';
            ctx.shadowColor = bomb.color;
            ctx.shadowBlur = 16;
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(ox, oy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.lineCap = 'butt';
            break;
        }
        case 'hole': {
            const cx = W / 2,
                cy = C.HOLE_Y;
            if (k < 0.5) {
                const r = 16 + 10 * k + Math.sin(time * 20) * 2;
                ctx.globalAlpha = 0.35;
                ring(cx, cy, 40 - 50 * k, 12, -time * 6);
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#0a0518';
                ctx.shadowColor = bomb.color;
                ctx.shadowBlur = 20;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.stroke();
            } else {
                const q = (k - 0.5) / 0.5,
                    R = 26 + q * 380;
                ctx.globalAlpha = (1 - q) * 0.35;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
                ctx.globalAlpha = 1 - q;
                ctx.lineWidth = 2;
                ctx.strokeStyle = bomb.color;
                ctx.shadowColor = '#ffffff';
                ctx.shadowBlur = 10;
                for (let i = 0; i < 10; i++) {
                    let a = (Math.PI * 2 * i) / 10 + i * 0.7,
                        px = cx,
                        py = cy;
                    ctx.beginPath();
                    ctx.moveTo(px, py);
                    for (let s = 1; s <= 6; s++) {
                        a += Math.sin(i * 13.1 + s * 7.7 + Math.floor(time * 30)) * 0.5;
                        px = cx + Math.cos(a) * ((R * s) / 6);
                        py = cy + Math.sin(a) * ((R * s) / 6);
                        ctx.lineTo(px, py);
                    }
                    ctx.stroke();
                }
            }
            break;
        }
    }
    ctx.restore();
}
/** One piece of a bomb's ring, drawn at the origin, pointing outward. */
function bombPiece(ctx: CanvasRenderingContext2D, shape: string, k: number): void {
    ctx.beginPath();
    switch (shape) {
        case 'leaf':
            ctx.moveTo(-7, 0);
            ctx.quadraticCurveTo(0, -5, 7, 0);
            ctx.quadraticCurveTo(0, 5, -7, 0);
            break;
        case 'shard':
            ctx.moveTo(-6, 0);
            ctx.lineTo(0, -2.5);
            ctx.lineTo(8, 0);
            ctx.lineTo(0, 2.5);
            ctx.closePath();
            break;
        case 'heart':
            ctx.arc(-1.5, -1.6, 2.2, 0, Math.PI * 2);
            ctx.arc(-1.5, 1.6, 2.2, 0, Math.PI * 2);
            ctx.moveTo(-1, -3.5);
            ctx.lineTo(5, 0);
            ctx.lineTo(-1, 3.5);
            break;
        case 'ember':
            ctx.arc(0, 0, 2.5 + 2 * (1 - k), 0, Math.PI * 2);
            break;
        case 'moon':
            ctx.arc(0, 0, 5, -Math.PI / 2, Math.PI / 2);
            ctx.arc(-2, 0, 4, Math.PI / 2, -Math.PI / 2, true);
            break;
        default:
            ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
    }
    ctx.fill();
}
