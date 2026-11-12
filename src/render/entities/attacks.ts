/* Attacks sent from the rival's meadow: stars, brambles, comets and Extra Attack critters. */
import * as C from '@/core/config';

import { PALETTE } from '@/render/theme';

/** Star colour by hits remaining: 1 pale, 2 gold, 3 orange, 4 rose. */
const STAR_COLORS: [number, number, number][] = [
    [235, 245, 255],
    [255, 214, 92],
    [255, 145, 64],
    [255, 84, 128],
];
/**
 * A falling star with a straight spark trail. Its colour shows how many
 * hits it still needs, and it shrinks a little with each hit.
 */
export function drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    spin: number,
    level: number,
    hp: number,
    vx: number,
    vy: number,
    lining: boolean,
): void {
    const [r, g, b] = STAR_COLORS[Math.min(STAR_COLORS.length - 1, Math.max(0, hp - 1))];
    const size = C.STAR_RADIUS * (0.8 + hp * 0.12);
    if (lining) {
        // A seeker lining up: a pulsing halo and a faint line showing where it will fall.
        ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, C.FIELD_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, size + 4 + Math.sin(spin * 4) * 2, 0, Math.PI * 2);
        ctx.stroke();
    } else {
        // Spark trail pointing back along the direction of travel.
        const len = 18 + level * 10;
        const sp = Math.hypot(vx, vy) || 1;
        const ux = vx / sp,
            uy = vy / sp;
        const tx = x - ux * len,
            ty = y - uy * len;
        const tg = ctx.createLinearGradient(tx, ty, x, y);
        tg.addColorStop(0, `rgba(${r},${g},${b},0)`);
        tg.addColorStop(0.6, `rgba(${r},${g},${b},0.5)`);
        tg.addColorStop(1, `rgba(${r},${g},${b},0.95)`);
        ctx.fillStyle = tg;
        const nx = -uy,
            ny = ux; // perpendicular, for the trail's width
        ctx.beginPath();
        ctx.moveTo(tx + nx * 0.5, ty + ny * 0.5);
        ctx.lineTo(tx - nx * 0.5, ty - ny * 0.5);
        ctx.lineTo(x - nx * 4.5, y - ny * 4.5);
        ctx.lineTo(x + nx * 4.5, y + ny * 4.5);
        ctx.closePath();
        ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    const col = `rgb(${r},${g},${b})`;
    ctx.shadowColor = col;
    ctx.shadowBlur = 6 + level * 3;
    ctx.fillStyle = col;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const rad = i % 2 ? size * 0.45 : size;
        const a = (Math.PI * i) / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** A thorny bramble ball. */
export function drawBramble(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = PALETTE.bramble;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, C.BRAMBLE_RADIUS, C.BRAMBLE_RADIUS * 0.45, (Math.PI * i) / 3, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = '#e7c9ff';
    for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(C.BRAMBLE_RADIUS * 0.9, 0);
        ctx.beginPath();
        ctx.moveTo(0, -1.5);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 1.5);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}
/** An unbreakable comet: a hot pink core with a long straight tail. */
export function drawComet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const len = 60;
    const g = ctx.createLinearGradient(x, y - len, x, y);
    g.addColorStop(0, 'rgba(255,111,156,0)');
    g.addColorStop(1, 'rgba(255,190,210,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - len);
    ctx.lineTo(x + 1, y - len);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff6f9c';
    ctx.shadowBlur = 14 + Math.sin(t * 30) * 4;
    ctx.beginPath();
    ctx.arc(x, y, C.COMET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}
/** An Extra Attack critter, drawn in the sender's colour and her critter's look. */
export function drawImp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    t: number,
    lining: boolean,
    look: string,
    vx: number,
    vy: number,
): void {
    ctx.save();
    if (lining) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x, C.FIELD_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    const eyes = (dy = -1) => {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1a1033';
        ctx.fillRect(-1.8, dy, 1.2, 1.2);
        ctx.fillRect(0.6, dy, 1.2, 1.2);
    };
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 14));
    switch (look) {
        case 'burr': {
            // A spiky seed burr, rolling.
            ctx.rotate(t * 3);
            ctx.shadowBlur = 6;
            ctx.beginPath();
            for (let i = 0; i < 18; i++) {
                const a = (Math.PI * 2 * i) / 18,
                    r = i % 2 ? 4 : 7.5;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.rotate(-t * 3);
            eyes(-1);
            break;
        }
        case 'glimmer': {
            // A spinning crystal.
            const w = 3 + 2.5 * Math.abs(Math.cos(t * 6));
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(w, 0);
            ctx.lineTo(0, 7);
            ctx.lineTo(-w, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(w * 0.4, -1);
            ctx.lineTo(0, 1);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'dart': {
            // A petal pointing where it's flying.
            ctx.rotate(Math.atan2(vy, vx) - Math.PI / 2);
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(0, 8);
            ctx.quadraticCurveTo(6, 0, 0, -7);
            ctx.quadraticCurveTo(-6, 0, 0, 8);
            ctx.fill();
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(0, -13);
            ctx.lineWidth = 1.2;
            ctx.stroke();
            break;
        }
        case 'cinder': {
            // A flickering ember.
            const fl = 1 + 0.25 * Math.sin(t * 30);
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(0, -9 * fl);
            ctx.quadraticCurveTo(6, -1, 0, 5);
            ctx.quadraticCurveTo(-6, -1, 0, -9 * fl);
            ctx.fill();
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath();
            ctx.arc(0, 1, 2.2, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'moth': {
            // A dusk moth: broad flapping wings, dark body.
            ctx.globalAlpha = 0.85;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(0, -1);
                ctx.quadraticCurveTo(s * 11 * flap, -9, s * 10 * flap, 2);
                ctx.quadraticCurveTo(s * 6 * flap, 6, 0, 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#2a1846';
            ctx.beginPath();
            ctx.ellipse(0, 0, 2, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.fillRect(-1.6, -2, 1.1, 1.1);
            ctx.fillRect(0.5, -2, 1.1, 1.1);
            break;
        }
        default: {
            // A hearth spark: glowing body, fluttering wings, little rays.
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.ellipse(-5, -1, 5 * flap, 3, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(5, -1, 5 * flap, 3, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
            ctx.fill();
            eyes();
        }
    }
    ctx.restore();
}
