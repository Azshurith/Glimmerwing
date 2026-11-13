/* The fairy drawn in code (wings by shape, body, glow), her charge ring and her charge shots. */
import type { Fairy, WingShape } from '@/types';

import { drawSprite } from '@/render/sprites';

/** Draws an original fairy: glow, wings by shape, little body and head. */
export function drawFairy(
    ctx: CanvasRenderingContext2D,
    fy: Fairy,
    x: number,
    y: number,
    scale: number,
    t: number,
    charge = 0,
    silhouette = false,
): void {
    if (fy.sprite) {
        // Sprite characters hover in place on cards; locked ones show as a dark shape.
        const a = fy.sprite.anims.idle;
        ctx.save();
        if (silhouette) ctx.filter = 'brightness(0) opacity(0.85)';
        const drawn = drawSprite(
            ctx,
            fy.sprite,
            { anim: 'idle', frame: Math.floor(t * a.fps) % a.count, alpha: 1 },
            x,
            y + 8 * scale,
            scale * 0.75,
        );
        ctx.restore();
        if (drawn) {
            if (charge > 0) drawChargeRing(ctx, fy, x, y, scale, charge);
            return;
        }
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (!silhouette) {
        const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
        glow.addColorStop(0, fy.color + 'aa');
        glow.addColorStop(1, fy.color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();
    }
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 18));
    ctx.fillStyle = silhouette ? 'rgba(10,8,25,0.85)' : 'rgba(255,255,255,0.55)';
    ctx.strokeStyle = silhouette ? 'rgba(246,240,255,0.25)' : fy.color;
    ctx.lineWidth = 0.8;
    for (const side of [-1, 1]) {
        ctx.save();
        ctx.scale(side * flap, 1);
        traceWing(ctx, fy.wing);
        ctx.restore();
    }
    // Body and head.
    ctx.fillStyle = silhouette ? '#0a0819' : fy.accent;
    ctx.beginPath();
    ctx.ellipse(0, 3, 2.6, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = silhouette ? '#0a0819' : '#ffe9dc';
    ctx.beginPath();
    ctx.arc(0, -4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    if (!silhouette) {
        ctx.fillStyle = fy.color;
        ctx.beginPath();
        ctx.arc(0, -5.2, 3.4, Math.PI, 0);
        ctx.fill();
    }
    ctx.restore();
    if (charge > 0) drawChargeRing(ctx, fy, x, y, scale, charge);
}
/** Draw the charge ring around a fairy. */
export function drawChargeRing(
    ctx: CanvasRenderingContext2D,
    fy: Fairy,
    x: number,
    y: number,
    scale: number,
    charge: number,
): void {
    if (charge <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.strokeStyle = charge >= 1 ? '#ffffff' : fy.color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha *= 0.85;
    ctx.beginPath();
    ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
    ctx.stroke();
    ctx.restore();
}
/** Trace one wing of the given shape, in wing-local coordinates. */
export function traceWing(ctx: CanvasRenderingContext2D, shape: WingShape): void {
    ctx.beginPath();
    switch (shape) {
        case 'round':
            ctx.ellipse(6, -3, 6, 5, -0.4, 0, Math.PI * 2);
            ctx.moveTo(10, 4);
            ctx.ellipse(5, 4, 4, 3, 0.4, 0, Math.PI * 2);
            break;
        case 'pointed':
            ctx.moveTo(1, -1);
            ctx.lineTo(13, -9);
            ctx.lineTo(7, 1);
            ctx.lineTo(11, 7);
            ctx.closePath();
            break;
        case 'leaf':
            ctx.moveTo(1, 0);
            ctx.quadraticCurveTo(8, -12, 13, -4);
            ctx.quadraticCurveTo(8, 2, 1, 0);
            ctx.moveTo(1, 2);
            ctx.quadraticCurveTo(7, 2, 9, 8);
            ctx.quadraticCurveTo(3, 7, 1, 2);
            break;
        case 'long':
            ctx.ellipse(8, -1, 9, 2.6, -0.25, 0, Math.PI * 2);
            ctx.moveTo(14, 5);
            ctx.ellipse(7, 4, 7, 2, 0.25, 0, Math.PI * 2);
            break;
        case 'crescent':
            ctx.moveTo(1, -2);
            ctx.quadraticCurveTo(14, -12, 12, 4);
            ctx.quadraticCurveTo(9, -4, 1, 2);
            break;
        case 'moth':
            ctx.moveTo(1, -1);
            ctx.lineTo(12, -8);
            ctx.quadraticCurveTo(15, -2, 10, 2);
            ctx.quadraticCurveTo(12, 8, 6, 9);
            ctx.lineTo(1, 3);
            break;
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}
/** A fairy's charge shot, by style. */
export function drawChargeShot(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    vx: number,
    r: number,
    style: string,
    life: number | undefined,
    t: number,
): void {
    switch (style) {
        case 'needles': {
            const a = Math.atan2(-1, vx / 500);
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(a + Math.PI / 2);
            ctx.beginPath();
            ctx.moveTo(0, -9);
            ctx.lineTo(2.2, 3);
            ctx.lineTo(-2.2, 3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            break;
        }
        case 'thorn':
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const a = (Math.PI * 2 * i) / 16 + t * 3,
                    rr = i % 2 ? r * 0.45 : r * 0.75;
                ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
            break;
        case 'flare':
            ctx.globalAlpha = Math.max(0.2, Math.min(1, (life ?? 0.3) / 0.25));
            ctx.beginPath();
            ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            break;
        case 'crescent':
            ctx.lineWidth = 4;
            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.arc(x, y + r * 0.7, r, Math.PI * 1.15, Math.PI * 1.85);
            ctx.stroke();
            ctx.lineCap = 'butt';
            break;
        case 'twin':
            ctx.beginPath();
            ctx.ellipse(x, y, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
            ctx.fill();
            break;
        default:
            ctx.beginPath();
            ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
            ctx.fill();
    }
}
