/* Bosses: a rival's guardian and the Hollow Crow. */
import type { WingShape } from '@/types';

import { traceWing } from './fairy';

/** A guardian: a giant spirit in the sending fairy's wing shape and colour, with a lantern core. */
export function drawGuardian(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    t: number,
    hp: number,
    color: string,
    wing: WingShape,
): void {
    ctx.save();
    ctx.translate(x, y);
    const glow = ctx.createRadialGradient(0, 2, 2, 0, 2, 38);
    glow.addColorStop(0, color + '88');
    glow.addColorStop(1, color + '00');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 2, 38, 0, Math.PI * 2);
    ctx.fill();
    const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 4));
    ctx.fillStyle = color + '55';
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.6;
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * flap * 2.6, 2.6);
        traceWing(ctx, wing);
        ctx.restore();
    }
    ctx.fillStyle = '#2a1d3f';
    ctx.beginPath();
    ctx.ellipse(0, 2, 4.5, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, -2, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(246,240,255,0.2)';
    ctx.fillRect(-25, -30, 50, 3);
    ctx.fillStyle = color;
    ctx.fillRect(-25, -30, 50 * Math.max(0, hp), 3);
    ctx.restore();
}
/** The hollow crow: a dark silhouette with ember eyes. */
export function drawCrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    t: number,
    hp: number,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const flap = Math.sin(t * 12) * 5;
    ctx.fillStyle = '#0b0718';
    ctx.strokeStyle = 'rgba(255,159,184,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.quadraticCurveTo(-10, -8 + flap, -20, -2 + flap);
    ctx.quadraticCurveTo(-10, 0, -5, 4);
    ctx.lineTo(0, 10);
    ctx.lineTo(5, 4);
    ctx.quadraticCurveTo(10, 0, 20, -2 + flap);
    ctx.quadraticCurveTo(10, -8 + flap, 0, -6);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -6, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff9fb8';
    ctx.beginPath();
    ctx.arc(-1.8, -6.5, 1, 0, Math.PI * 2);
    ctx.arc(1.8, -6.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (hp < 1) {
        ctx.fillStyle = 'rgba(246,240,255,0.2)';
        ctx.fillRect(x - 12, y - 18, 24, 2);
        ctx.fillStyle = '#ff9fb8';
        ctx.fillRect(x - 12, y - 18, 24 * Math.max(0, hp), 2);
    }
}
