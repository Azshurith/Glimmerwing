// The emblems of the menu's choices (the modes, Characters, Maps, Profile, Settings…): simple line pictures in cream
// on round badges in each choice's colour, so they read as one set wherever they're shown.
import type { TitleAction } from '@/types';
import { arcadeText, sparkle } from '@/render/draw';

/** The round badge an emblem sits on: a disc in its colour with a gold ring, brighter when chosen. */
export function drawBadge(
    ctx: CanvasRenderingContext2D,
    color: string,
    x: number,
    y: number,
    r: number,
    on: boolean,
    t: number,
): void {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
    g.addColorStop(0, hexA(color, on ? 0.75 : 0.5));
    g.addColorStop(0.7, hexA(color, on ? 0.35 : 0.22));
    g.addColorStop(1, 'rgba(20,12,48,0.9)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = on ? '#ffd86b' : 'rgba(201,162,74,0.8)';
    ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.3 : 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r - 4, Math.PI * 1.1, Math.PI * 1.65);
    ctx.stroke();
}

/** The picture at the top of a card, centred on (x, y), at scale `k`. */
export function drawEmblem(
    ctx: CanvasRenderingContext2D,
    action: TitleAction,
    x: number,
    y: number,
    k: number,
    t: number,
    on: boolean,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Every emblem is a simple line picture in cream, so the badges read as one set.
    const ink = '#fff6dc';
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    const bob = on ? Math.sin(t * 3) * 1.5 : 0;
    switch (action) {
        case 'story': {
            // An open book.
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.quadraticCurveTo(-14, -18, -28, -14);
            ctx.lineTo(-28, 16);
            ctx.quadraticCurveTo(-14, 12, 0, 18);
            ctx.quadraticCurveTo(14, 12, 28, 16);
            ctx.lineTo(28, -14);
            ctx.quadraticCurveTo(14, -18, 0, -12);
            ctx.closePath();
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -12);
            ctx.lineTo(0, 18);
            ctx.stroke();
            break;
        }
        case 'cpu': {
            // A little robot face with an antenna.
            ctx.beginPath();
            roundRect(ctx, -15, -10 + bob, 30, 24, 6);
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -10 + bob);
            ctx.lineTo(0, -17 + bob);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, -19 + bob, 2.5, 0, Math.PI * 2);
            ctx.fill();
            const blink = Math.sin(t * 2.3) > 0.95 ? 0.6 : 4;
            ctx.fillRect(-9, -2 + bob, 5, blink);
            ctx.fillRect(4, -2 + bob, 5, blink);
            ctx.fillRect(-6, 7 + bob, 12, 2);
            ctx.fillRect(-19, -2 + bob, 4, 8);
            ctx.fillRect(15, -2 + bob, 4, 8);
            break;
        }
        case 'endless': {
            // An infinity loop with a star running round it.
            ctx.beginPath();
            for (let i = 0; i <= 48; i++) {
                const a = (i / 48) * Math.PI * 2;
                const d = 1 + Math.sin(a) ** 2;
                const x = (17 * Math.cos(a)) / d,
                    y = (17 * Math.sin(a) * Math.cos(a)) / d + bob;
                if (i) ctx.lineTo(x, y);
                else ctx.moveTo(x, y);
            }
            ctx.stroke();
            const a = t * 1.6;
            const d = 1 + Math.sin(a) ** 2;
            star(ctx, (17 * Math.cos(a)) / d, (17 * Math.sin(a) * Math.cos(a)) / d + bob, 5, 2.2);
            ctx.fill();
            break;
        }
        case 'versus': {
            // Two crossed wands with star tips.
            for (const sgn of [-1, 1]) {
                ctx.save();
                ctx.rotate(sgn * 0.75 + (on ? sgn * Math.sin(t * 4) * 0.06 : 0));
                ctx.beginPath();
                ctx.moveTo(0, 18);
                ctx.lineTo(0, -8);
                ctx.stroke();
                star(ctx, 0, -13, 7, 3.2);
                ctx.fill();
                ctx.restore();
            }
            break;
        }
        case 'play': {
            // A play triangle with stars circling it.
            ctx.beginPath();
            ctx.moveTo(-8, -14);
            ctx.lineTo(14, 0);
            ctx.lineTo(-8, 14);
            ctx.closePath();
            ctx.globalAlpha = 0.3;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            for (let i = 0; i < 3; i++) {
                const a = t * 1.4 + (i * Math.PI * 2) / 3;
                sparkle(ctx, Math.cos(a) * 21, Math.sin(a) * 21, 2 + Math.sin(t * 4 + i) * 0.8);
            }
            break;
        }
        case 'characters': {
            // A fairy: head, body and two pairs of wings.
            ctx.save();
            ctx.translate(0, bob);
            for (const sgn of [-1, 1]) {
                ctx.beginPath();
                ctx.ellipse(sgn * 11, -4, 9, 6, sgn * -0.5, 0, Math.PI * 2);
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(sgn * 8, 8, 6, 4, sgn * 0.5, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.beginPath();
            ctx.arc(0, -12, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(0, -6);
            ctx.lineTo(-4, 14);
            ctx.lineTo(4, 14);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
            break;
        }
        case 'profile': {
            // A badge with a star.
            ctx.beginPath();
            ctx.arc(0, -2, 16, 0, Math.PI * 2);
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-10, 12);
            ctx.lineTo(-14, 26);
            ctx.lineTo(-4, 20);
            ctx.moveTo(10, 12);
            ctx.lineTo(14, 26);
            ctx.lineTo(4, 20);
            ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
                const a = -Math.PI / 2 + (i * Math.PI) / 5,
                    r = i % 2 ? 4 : 9;
                ctx.lineTo(Math.cos(a) * r, -2 + Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'online': {
            // A globe, slowly turning.
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.globalAlpha = 0.2;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.lineWidth = 1.2;
            for (let i = 0; i < 3; i++) {
                const w = Math.abs(Math.cos(t * 0.8 + (i * Math.PI) / 3)) * 18;
                ctx.beginPath();
                ctx.ellipse(0, 0, w, 18, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            for (const ly of [-9, 0, 9]) {
                const r = Math.sqrt(18 * 18 - ly * ly);
                ctx.beginPath();
                ctx.moveTo(-r, ly);
                ctx.lineTo(r, ly);
                ctx.stroke();
            }
            break;
        }
        case 'maps': {
            // A folded map with a dotted route to a pin, bobbing.
            ctx.beginPath();
            ctx.moveTo(-18, -12);
            ctx.lineTo(-6, -16);
            ctx.lineTo(6, -12);
            ctx.lineTo(18, -16);
            ctx.lineTo(18, 12);
            ctx.lineTo(6, 16);
            ctx.lineTo(-6, 12);
            ctx.lineTo(-18, 16);
            ctx.closePath();
            ctx.globalAlpha = 0.22;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-6, -16);
            ctx.lineTo(-6, 12);
            ctx.moveTo(6, -12);
            ctx.lineTo(6, 16);
            ctx.stroke();
            ctx.setLineDash([2, 2]);
            ctx.beginPath();
            ctx.moveTo(-13, 9);
            ctx.quadraticCurveTo(-2, 8, 0, -1);
            ctx.quadraticCurveTo(3, -7, 10, -5);
            ctx.stroke();
            ctx.setLineDash([]);
            const py = -9 + Math.sin(t * 3) * (on ? 2 : 0.6);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(10, py - 4, 4, Math.PI * 0.85, Math.PI * 0.15);
            ctx.lineTo(10, py + 4);
            ctx.closePath();
            ctx.stroke();
            break;
        }
        case 'settings': {
            // A gear, turning.
            ctx.rotate(t * (on ? 0.8 : 0.25));
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2,
                    r = i % 2 ? 13 : 18;
                ctx.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
                ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
            }
            ctx.closePath();
            ctx.globalAlpha = 0.25;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 6, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }
        case 'guide':
        default: {
            // A question mark in a bubble.
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.globalAlpha = 0.2;
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.stroke();
            arcadeText(ctx, '?', 0, 9 + bob, 22, ['#ffffff', '#ffe0c8', '#ffd45c'], 'center');
            break;
        }
    }
    ctx.restore();
    if (on) {
        ctx.fillStyle = '#fff6c8';
        const s = Math.max(0, Math.sin(t * 2.4));
        sparkle(ctx, x + 28 * k, y - 18 * k, 1.5 + 3 * s);
    }
}

/** Trace a rounded rectangle. */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** A #rrggbb colour with alpha `a`. */
export function hexA(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Trace a five-pointed star of outer radius `r` and inner radius `ri` centred on (x, y). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ri: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
            d = i % 2 ? ri : r;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
}
