/* Attacks sent from the rival's meadow: fireballs, brambles, comets and Extra Attack critters. */
import * as C from '@/core/config';

import { PALETTE } from '@/render/theme';

/** Fireball colours: [outer flame, inner flame, core] by state. */
const FIRE: Record<'p1' | 'p2' | 'fever', [string, string, string]> = {
    p1: ['#ff6a1a', '#ffb347', '#fff1c4'],
    p2: ['#9b4dff', '#d29bff', '#f6e8ff'],
    fever: ['#ffd21a', '#fff27a', '#ffffff'],
};

/** How a fireball looks: a player's own colour, Fever yellow, or a flashing Reverse. */
export type FireLook = 'p1' | 'p2' | 'fever' | 'reverse';

/**
 * A fireball (TSS Normal or Reverse Attack): a glowing core with a little face, wrapped in flickering
 * flame tongues that stream back along its flight. `size` 1 to 4 scales it; `hurt` (0 to 1) is how much
 * of it has been shot away, shown as a dimmer, smaller core. Fever ones flash yellow, and Reverse ones
 * cycle through colours so they can't be mistaken.
 */
export function drawFireball(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    t: number,
    spin: number,
    vx: number,
    vy: number,
    size: number,
    look: FireLook,
    hurt: number,
): void {
    const r = C.fireballRadius(size);
    let [outer, inner, core] = look === 'reverse' ? FIRE.p1 : FIRE[look];
    if (look === 'reverse') {
        const h = (t * 900 + spin * 60) % 360;
        outer = `hsl(${h}, 100%, 58%)`;
        inner = `hsl(${(h + 120) % 360}, 100%, 72%)`;
        core = '#ffffff';
    } else if (look === 'fever' && Math.floor(t * 14) % 2 === 0) {
        [outer, inner] = [inner, '#ffffff'];
    }
    // Flames stream away from the direction of travel (straight up while it's barely moving).
    const sp = Math.hypot(vx, vy);
    const ang = sp > 30 ? Math.atan2(-vy, -vx) : -Math.PI / 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = outer;
    ctx.shadowBlur = 8 + size * 2;
    const tongues = 5;
    for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? inner : outer;
        const k = layer ? 0.62 : 1;
        for (let i = 0; i < tongues; i++) {
            const spread = (i - (tongues - 1) / 2) * 0.32;
            const flick = 0.75 + 0.25 * Math.sin(t * 22 + i * 1.9 + spin * 3);
            const len = r * (1.5 + Math.min(1, sp / 200) * 1.2) * flick * k;
            const a = ang + spread;
            const tipx = Math.cos(a) * (r * 0.55 + len),
                tipy = Math.sin(a) * (r * 0.55 + len);
            const nx = -Math.sin(a) * r * 0.42 * k,
                ny = Math.cos(a) * r * 0.42 * k;
            ctx.beginPath();
            ctx.moveTo(nx, ny);
            ctx.quadraticCurveTo(tipx * 0.55 + nx * 0.6, tipy * 0.55 + ny * 0.6, tipx, tipy);
            ctx.quadraticCurveTo(tipx * 0.55 - nx * 0.6, tipy * 0.55 - ny * 0.6, -nx, -ny);
            ctx.closePath();
            ctx.fill();
        }
    }
    // The ball itself.
    const pulse = 1 + Math.sin(t * 9 + spin) * 0.05;
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(0, 0, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, core);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.globalAlpha = 1 - hurt * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.9 - hurt * 0.2) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // A little face, as on the TSS fireballs.
    ctx.fillStyle = 'rgba(60,20,10,0.85)';
    const ey = -r * 0.1,
        ex = r * 0.3;
    ctx.beginPath();
    ctx.ellipse(-ex, ey, r * 0.1, r * 0.17, 0, 0, Math.PI * 2);
    ctx.ellipse(ex, ey, r * 0.1, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,20,10,0.75)';
    ctx.lineWidth = Math.max(0.8, r * 0.09);
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    if (look === 'reverse') {
        // A flashing ring as well, so a Reverse reads at a glance.
        ctx.strokeStyle = Math.floor(t * 12) % 2 ? 'rgba(190,120,255,0.95)' : 'rgba(120,255,160,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.restore();
}
/**
 * A Reverse fireball's glowing trail: its recent positions (x, y pairs, oldest first) drawn as a tapering,
 * colour-cycling streak, so it bends with the path the Reverse is retracing.
 */
export function drawReverseTrail(ctx: CanvasRenderingContext2D, tail: number[], t: number, size: number): void {
    const n = tail.length / 2;
    if (n < 2) return;
    const r = C.fireballRadius(size);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
        const k = i / (n - 1);
        ctx.strokeStyle = `hsla(${(t * 900 + i * 28) % 360}, 100%, 65%, ${0.15 + k * 0.55})`;
        ctx.lineWidth = r * (0.4 + k * 1.1);
        ctx.beginPath();
        ctx.moveTo(tail[(i - 1) * 2], tail[(i - 1) * 2 + 1]);
        ctx.lineTo(tail[i * 2], tail[i * 2 + 1]);
        ctx.stroke();
    }
    ctx.restore();
}

/** The flash as a fireball breaks and turns into a Reverse: a white burst and a widening ring. `k` runs 1 to 0. */
export function drawFireFlash(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, size: number): void {
    const r = C.fireballRadius(size);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + (1 - k) * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * k + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r + (1 - k) * 22, 0, Math.PI * 2);
    ctx.stroke();
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
