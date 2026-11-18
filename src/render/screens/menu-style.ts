// The main menu's look, shared by the screens around it (Profile, match details, Characters, Maps, fairy and map
// select): its dusk sky over a sea of clouds, plum panels framed in gold, capsule tabs and buttons.
import { arcadeText, sparkle } from '@/render/draw';
import { ARCADE } from '@/render/theme';
import { hexA, roundRect } from './emblems';

/** Gold, for frames and lettering. */
export const GOLD = '#e9b949';
/** Gold lettering: white at the top, through gold, to amber. */
export const GOLD_TEXT: [string, string, string] = ['#ffffff', '#ffe08a', '#ff9a2e'];

/**
 * The lobby's sky, `W` wide (reaching `b` past each side) and `H` tall: dusk deepening from violet above to a warm glow
 * at the horizon (`horizon` down, the sun's glow centred on `sunX`), a sea of clouds below it lit pink and gold,
 * drifting slowly, and faint stars at the top.
 */
export function drawDuskSky(
    ctx: CanvasRenderingContext2D,
    t: number,
    W: number,
    H: number,
    b: number,
    sunX: number,
    horizon: number,
): void {
    const x0 = -b,
        w = W + 2 * b;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const k = horizon / H;
    g.addColorStop(0, '#1c0f42');
    g.addColorStop(k * 0.45, '#4a2470');
    g.addColorStop(k * 0.85, '#b04a86');
    g.addColorStop(k, '#ffaf7a');
    g.addColorStop(Math.min(0.99, k + 0.08), '#d06a8a');
    g.addColorStop(Math.min(1, k + 0.3), '#5a2c6a');
    g.addColorStop(1, '#22123c');
    ctx.fillStyle = g;
    ctx.fillRect(x0, 0, w, H);
    // Stars, twinkling in the dark part.
    for (let i = 0; i < 40; i++) {
        const sx = x0 + ((i * 131.7) % w),
            sy = (i * 47.3) % (horizon * 0.5);
        const a = 0.25 + 0.5 * Math.max(0, Math.sin(t * 1.5 + i * 2.1));
        ctx.fillStyle = `rgba(255,240,220,${a * (1 - sy / (horizon * 0.5))})`;
        ctx.fillRect(sx, sy, 1, 1);
    }
    // The sun's glow behind the island.
    const sun = ctx.createRadialGradient(sunX, horizon, 2, sunX, horizon, w * 0.45);
    sun.addColorStop(0, 'rgba(255,230,180,0.75)');
    sun.addColorStop(0.25, 'rgba(255,170,140,0.35)');
    sun.addColorStop(1, 'rgba(255,140,160,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(x0, 0, w, H);
    // Far mountains on the horizon, then the sea of clouds in bands, nearer bands bigger and darker.
    ctx.fillStyle = 'rgba(70,30,90,0.45)';
    ctx.beginPath();
    ctx.moveTo(x0, horizon + 4);
    for (let x = 0; x <= w; x += 14) {
        const hgt = 6 + 8 * Math.abs(Math.sin(x * 0.031)) + 5 * Math.sin(x * 0.11);
        ctx.lineTo(x0 + x, horizon + 4 - hgt);
    }
    ctx.lineTo(x0 + w, horizon + 10);
    ctx.lineTo(x0, horizon + 10);
    ctx.closePath();
    ctx.fill();
    const bands = [
        { y: horizon + 6, r: 16, col: [255, 196, 190], a: 0.5, v: 3 },
        { y: horizon + 22, r: 22, col: [236, 140, 170], a: 0.45, v: 5 },
        { y: horizon + 44, r: 30, col: [170, 90, 150], a: 0.5, v: 8 },
        { y: horizon + 74, r: 40, col: [100, 50, 120], a: 0.55, v: 12 },
        { y: horizon + 112, r: 52, col: [60, 30, 90], a: 0.6, v: 16 },
    ];
    bands.forEach((band, j) => {
        if (band.y - band.r > H) return;
        const [r, gg, bb] = band.col;
        ctx.fillStyle = `rgba(${r},${gg},${bb},${band.a})`;
        const step = band.r * 1.3;
        const off = (t * band.v + j * 37) % step;
        ctx.beginPath();
        for (let x = x0 - step + off; x < x0 + w + step; x += step) {
            const wob = Math.sin(x * 0.07 + j) * band.r * 0.18;
            ctx.moveTo(x + band.r, band.y + wob);
            ctx.ellipse(x, band.y + wob, band.r, band.r * 0.45, 0, 0, Math.PI * 2);
        }
        ctx.fill();
        // A lit top edge on each band.
        ctx.fillStyle = `rgba(255,220,200,${0.12 + j * 0.02})`;
        ctx.fillRect(x0, band.y - band.r * 0.32, w, 1);
    });
}

/**
 * Options for a plate: its corner radius, a gold rim (for the big panels and the chosen item; otherwise just a faint
 * edge), a colour for its rim instead, and a glow round it.
 */
export interface PlateStyle {
    r?: number;
    gold?: boolean;
    edge?: string;
    glow?: string;
    /** How see-through the plate is (1 is solid). */
    alpha?: number;
}

/**
 * A panel in the lobby's style: a plum slab darkening downward and a sheen over its upper part, edged faintly, or with a
 * gold rim and a fainter line inside it when `gold` (or a colour of its own when `edge`).
 */
export function drawPlate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    o: PlateStyle = {},
): void {
    const r = Math.min(o.r ?? 6, h / 2, w / 2);
    const a = o.alpha ?? 0.9;
    ctx.save();
    if (o.glow) {
        ctx.shadowColor = o.glow;
        ctx.shadowBlur = 10;
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(78,44,92,${a})`);
    g.addColorStop(Math.min(0.5, 40 / h), `rgba(50,26,66,${a})`);
    g.addColorStop(1, `rgba(26,13,40,${a})`);
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, w, h, r);
    ctx.clip();
    const sh = Math.min(h / 2, 24);
    const sheen = ctx.createLinearGradient(0, y, 0, y + sh);
    sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, sh);
    ctx.restore();
    const strong = o.gold === true || o.edge !== undefined;
    ctx.strokeStyle = o.edge ?? (o.gold ? GOLD : 'rgba(255,214,190,0.16)');
    ctx.lineWidth = strong ? 1.2 : 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r);
    ctx.stroke();
    if (strong && w > 16 && h > 16) {
        ctx.strokeStyle = hexA(o.edge && o.edge.startsWith('#') ? o.edge : GOLD, 0.3);
        ctx.lineWidth = 0.6;
        roundRect(ctx, x + 3, y + 3, w - 6, h - 6, Math.max(1, r - 3));
        ctx.stroke();
    }
}

/**
 * A capsule tab or small button: when `on`, gold-lit (in `colour`'s glow) with dark lettering; otherwise plum with a
 * gold rim and pale lettering.
 */
export function drawCapsule(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number; h: number },
    text: string,
    on: boolean,
    colour = '#ffd45c',
    size = 7,
    dim = false,
): void {
    const r = b.h / 2;
    ctx.save();
    if (on) {
        ctx.shadowColor = colour;
        ctx.shadowBlur = 8;
    }
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    if (on) {
        g.addColorStop(0, '#fff3c4');
        g.addColorStop(0.45, '#ffd45c');
        g.addColorStop(1, '#e08a2a');
    } else {
        g.addColorStop(0, 'rgba(90,58,90,0.92)');
        g.addColorStop(1, 'rgba(34,18,42,0.92)');
    }
    ctx.fillStyle = g;
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.restore();
    if (!on) {
        ctx.save();
        roundRect(ctx, b.x, b.y, b.w, b.h, r);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(b.x, b.y, b.w, b.h / 2);
        ctx.restore();
    }
    ctx.strokeStyle = on ? '#fff6d8' : dim ? 'rgba(255,214,190,0.12)' : 'rgba(255,214,190,0.25)';
    ctx.lineWidth = on ? 1.2 : 1;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r - 0.5);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `${size}px ${ARCADE}`;
    ctx.fillStyle = on ? '#2a1030' : dim ? 'rgba(239,230,255,0.45)' : '#f3e6ff';
    ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + size * 0.42, b.w - r);
}

/**
 * A big call-to-action button in the lobby's style (like the mode button): when `on`, gold-framed with `colour`'s glow
 * and a light sweeping across; otherwise a quieter plum capsule.
 */
export function drawCallButton(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number; h: number },
    text: string,
    on: boolean,
    colour: string,
    t: number,
    size = 8,
): void {
    const r = Math.min(b.h / 2, 10);
    ctx.save();
    if (on) {
        ctx.shadowColor = colour;
        ctx.shadowBlur = 9 + 3 * Math.sin(t * 4);
    }
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, on ? '#6a3e66' : 'rgba(70,44,78,0.85)');
    g.addColorStop(0.5, on ? '#3e2246' : 'rgba(44,24,54,0.85)');
    g.addColorStop(1, on ? '#22122a' : 'rgba(26,14,34,0.85)');
    ctx.fillStyle = g;
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.clip();
    if (on) {
        const sweep = ((t % 2.6) / 2.6) * (b.w + 80) - 40;
        const sg = ctx.createLinearGradient(b.x + sweep - 20, 0, b.x + sweep + 20, 0);
        sg.addColorStop(0, 'rgba(255,240,200,0)');
        sg.addColorStop(0.5, 'rgba(255,240,200,0.25)');
        sg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(b.x, b.y, b.w, b.h / 2);
    ctx.restore();
    ctx.strokeStyle = on ? '#ffe9a0' : 'rgba(255,214,190,0.25)';
    ctx.lineWidth = on ? 1.5 : 1;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r);
    ctx.stroke();
    const ink: [string, string, string] = on ? GOLD_TEXT : ['#efe6ff', '#cbbcf5', '#9a88c8'];
    arcadeText(ctx, text, b.x + b.w / 2, b.y + b.h / 2 + size * 0.4, size, ink, 'center', b.w - 12);
}

/** A small gold diamond with a sparkle, for ornaments either side of a heading. */
export function drawGem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff2c0';
    ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 2 + x));
    sparkle(ctx, x, y, r * 0.9);
    ctx.globalAlpha = 1;
}

/** Stroke the shape `trace` draws with a gold rim `width` wide and a pale highlight running along it. */
export function goldFrame(ctx: CanvasRenderingContext2D, trace: (c: CanvasRenderingContext2D) => void, width = 2): void {
    ctx.save();
    trace(ctx);
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,242,192,0.55)';
    ctx.lineWidth = width * 0.35;
    ctx.stroke();
    ctx.restore();
}
