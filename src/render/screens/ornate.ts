// The ornate night look shared by the lobby and the Characters screen: a purple night over a still lake, a great
// planet rising behind the middle, purple clouds and pines along the horizon, flowers in the corners; and panels,
// plates and headings framed in gold.
import { arcadeText, sparkle } from '@/render/draw';
import { ARCADE } from '@/render/theme';
import { roundRect } from './emblems';
import lakeUrl from '@/../assets/backgrounds/lobby-lake.jpg';
import nightUrl from '@/../assets/backgrounds/menu-night.jpg';

/** Which painted night: the lake under the planet (the lobby), or the castle on its cliff (the other menu screens). */
export type NightArt = 'lake' | 'castle';

/** The painted nights (assets/backgrounds; their sources in assets/source/backgrounds). */
const ARTS: Record<NightArt, HTMLImageElement | null> = { lake: null, castle: null };
if (typeof Image !== 'undefined') {
    ARTS.lake = new Image();
    ARTS.lake.src = lakeUrl;
    ARTS.castle = new Image();
    ARTS.castle.src = nightUrl;
}

/** Whether a painted night has loaded (until then the night is drawn in code). */
export function nightReady(art: NightArt = 'castle'): boolean {
    const im = ARTS[art];
    return !!im && im.complete && im.naturalWidth > 0;
}

/** A box, in design units. */
interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** Fixed-seed scatter for the stars, clouds and trees, so the night looks the same every frame. */
const scatter = (i: number, k: number) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
};

/** Where the night's parts go: its planet (centre and radius) and the horizon's height. */
export interface NightShape {
    planet: { x: number; y: number; r: number };
    horizon: number;
    /** The painting to show once it's loaded. */
    art?: NightArt;
}

/**
 * The night, filling `w` from `x0` and `H` tall: the sky deepening upward with twinkling stars and a few big
 * four-point ones, the planet with its bands and lit rim, purple clouds drifting along the horizon, dark pines either
 * side, and a still lake below with light shimmering on it.
 */
export function drawNight(
    ctx: CanvasRenderingContext2D,
    t: number,
    x0: number,
    w: number,
    H: number,
    s: NightShape,
): void {
    const nightArt = ARTS[s.art ?? 'castle'];
    if (nightArt && nightReady(s.art ?? 'castle')) {
        // The painting, covering the view (cropped at the sides on a tall screen, keeping the moon in view), with a
        // few stars twinkling over it.
        const iw = nightArt.naturalWidth,
            ih = nightArt.naturalHeight;
        const k = Math.max(w / iw, H / ih);
        const dw = iw * k,
            dh = ih * k;
        const dx = x0 + (w - dw) * (dw > w * 1.5 && s.art !== 'lake' ? 0.78 : 0.5);
        ctx.drawImage(nightArt, dx, (H - dh) / 2, dw, dh);
        ctx.fillStyle = '#fff6e0';
        for (let i = 0; i < 10; i++) {
            ctx.globalAlpha = Math.max(0, Math.sin(t * (0.8 + scatter(i, 5)) + i * 2)) * 0.9;
            sparkle(ctx, x0 + scatter(i, 6) * w, H * (0.16 + scatter(i, 7) * 0.4), 1.5 + scatter(i, 8) * 2);
        }
        ctx.globalAlpha = 1;
        return;
    }
    const hz = s.horizon;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#0b0520');
    sky.addColorStop(0.55, '#1e0f48');
    sky.addColorStop(1, '#3a2072');
    ctx.fillStyle = sky;
    ctx.fillRect(x0, 0, w, hz);
    for (let i = 0; i < 90; i++) {
        const sx = x0 + scatter(i, 1) * w,
            sy = scatter(i, 2) * hz * 0.9;
        const a = 0.25 + 0.6 * Math.max(0, Math.sin(t * (1 + scatter(i, 3)) + i));
        ctx.fillStyle = `rgba(255,240,255,${a.toFixed(3)})`;
        ctx.fillRect(sx, sy, scatter(i, 4) > 0.85 ? 1.5 : 1, scatter(i, 4) > 0.85 ? 1.5 : 1);
    }
    ctx.fillStyle = '#fff6e0';
    for (let i = 0; i < 5; i++) {
        const sx = x0 + scatter(i, 7) * w,
            sy = 14 + scatter(i, 8) * hz * 0.5;
        ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.3 + i * 2));
        sparkle(ctx, sx, sy, 2.5 + scatter(i, 9) * 3);
    }
    ctx.globalAlpha = 1;
    // The planet: a glow round it, a banded purple disc, lit along its upper left.
    const p = s.planet;
    const glow = ctx.createRadialGradient(p.x, p.y, p.r * 0.9, p.x, p.y, p.r * 1.35);
    glow.addColorStop(0, 'rgba(160,120,255,0.35)');
    glow.addColorStop(1, 'rgba(160,120,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.clip();
    const disc = ctx.createRadialGradient(p.x - p.r * 0.4, p.y - p.r * 0.45, p.r * 0.1, p.x, p.y, p.r * 1.05);
    disc.addColorStop(0, '#8a6ad8');
    disc.addColorStop(0.5, '#4a3090');
    disc.addColorStop(1, '#1e1048');
    ctx.fillStyle = disc;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    ctx.globalAlpha = 0.09;
    for (let i = 0; i < 7; i++) {
        ctx.fillStyle = i % 2 ? '#c9b0ff' : '#2a1660';
        const by = p.y - p.r + (i + 0.5) * ((p.r * 2) / 7);
        ctx.beginPath();
        ctx.ellipse(p.x + Math.sin(t * 0.05 + i) * 4, by, p.r * 1.1, p.r * 0.07, -0.18, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.strokeStyle = 'rgba(220,200,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r - 0.5, Math.PI * 0.95, Math.PI * 1.65);
    ctx.stroke();
    // Clouds drifting along the horizon, nearer ones darker.
    for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? 'rgba(60,34,120,0.7)' : 'rgba(140,100,220,0.28)';
        for (let i = 0; i < 9; i++) {
            const span = w + 120;
            const cx = x0 - 60 + ((scatter(i, 11 + layer) * span + t * (3 + layer * 2)) % span);
            const cy = hz - 18 - layer * -6 - scatter(i, 13) * 30;
            const r = 14 + scatter(i, 14) * 18;
            ctx.beginPath();
            ctx.ellipse(cx, cy, r * 1.8, r * 0.55, 0, 0, Math.PI * 2);
            ctx.ellipse(cx + r * 0.9, cy - r * 0.25, r * 1.1, r * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    // Pines along the horizon at either side, thinning towards the middle.
    ctx.fillStyle = '#140a30';
    for (let i = 0; i < 60; i++) {
        const u = scatter(i, 21);
        const side = i % 2 ? u * 0.36 : 1 - u * 0.36;
        const tx = x0 + side * w;
        const th =
            (14 + scatter(i, 22) * 26) * (1 - Math.abs(side - 0.5) * 0.2 - (0.36 - Math.min(side, 1 - side)) * 0.8);
        if (th < 6) continue;
        ctx.beginPath();
        ctx.moveTo(tx, hz - th);
        ctx.lineTo(tx + th * 0.28, hz + 2);
        ctx.lineTo(tx - th * 0.28, hz + 2);
        ctx.closePath();
        ctx.fill();
    }
    // The lake: dark water, the sky's glow along its edge, and light shimmering in streaks.
    const lake = ctx.createLinearGradient(0, hz, 0, H);
    lake.addColorStop(0, '#2c1764');
    lake.addColorStop(0.35, '#180c3c');
    lake.addColorStop(1, '#0a0520');
    ctx.fillStyle = lake;
    ctx.fillRect(x0, hz, w, H - hz);
    for (let i = 0; i < 22; i++) {
        const ly = hz + 4 + scatter(i, 31) * (H - hz - 4);
        const lw = 10 + scatter(i, 32) * 40;
        const lx = x0 + ((scatter(i, 33) * w + Math.sin(t * 0.6 + i) * 6) % w);
        ctx.fillStyle = `rgba(190,160,255,${(0.08 + 0.1 * Math.abs(Math.sin(t + i))).toFixed(3)})`;
        ctx.fillRect(lx, ly, lw, 0.8);
    }
}

/**
 * A cluster of purple flowers (five-petalled, a pale heart each) around (x, y), `k` their size, swaying a little; the
 * painted night has its own, so none over it.
 */
export function drawFlowers(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, seed = 0): void {
    if (nightReady('lake') && nightReady('castle')) return;
    for (let i = 0; i < 6; i++) {
        const fx = x + (scatter(i, 41 + seed) - 0.5) * 40 * k,
            fy = y + (scatter(i, 42 + seed) - 0.5) * 26 * k,
            r = (3.5 + scatter(i, 43 + seed) * 3) * k,
            spin = scatter(i, 44 + seed) * 6 + Math.sin(t * 0.8 + i) * 0.08;
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(spin);
        ctx.fillStyle = i % 3 ? '#9a5ae0' : '#c07af0';
        for (let j = 0; j < 5; j++) {
            ctx.rotate((Math.PI * 2) / 5);
            ctx.beginPath();
            ctx.ellipse(0, -r * 0.6, r * 0.42, r * 0.62, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#ffe6ff';
        ctx.beginPath();
        ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

/** A gold gradient running down from `y0` to `y1`: pale at the top, deep amber at the bottom. */
export function goldGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fff3c0');
    g.addColorStop(0.45, '#e9b949');
    g.addColorStop(1, '#9a6a1a');
    return g;
}

/** Trace a plate whose two ends come to points (`tip` deep), like a badge's ribbon. */
export function pointed(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tip: number): void {
    ctx.beginPath();
    ctx.moveTo(x + tip, y);
    ctx.lineTo(x + w - tip, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x + w - tip, y + h);
    ctx.lineTo(x + tip, y + h);
    ctx.lineTo(x, y + h / 2);
    ctx.closePath();
}

/**
 * A panel framed in gold: a deep purple, see-through fill, a gold rim with a fainter line inside it, and a small gold
 * diamond at the middle of its top and bottom edges.
 */
export function ornatePanel(ctx: CanvasRenderingContext2D, b: Rect, r = 8, glow = false): void {
    ctx.save();
    if (glow) {
        ctx.shadowColor = 'rgba(255,200,110,0.6)';
        ctx.shadowBlur = 10;
    }
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, 'rgba(46,24,92,0.88)');
    g.addColorStop(1, 'rgba(22,10,50,0.9)');
    ctx.fillStyle = g;
    roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = goldGradient(ctx, b.y, b.y + b.h);
    ctx.lineWidth = 1.6;
    roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,160,0.22)';
    ctx.lineWidth = 0.7;
    roundRect(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, Math.max(1, r - 3));
    ctx.stroke();
    for (const y of [b.y, b.y + b.h]) gem(ctx, b.x + b.w / 2, y, 2.6);
}

/** A small gold diamond centred on (x, y). */
export function gem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.fillStyle = goldGradient(ctx, y - r, y + r);
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
}

/**
 * A heading in gold with a pair of gold wings either side and a swooping gold line under it ending in a star, centred
 * on (cx, y), `size` high.
 */
export function wingedTitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    cx: number,
    y: number,
    size: number,
    t: number,
): void {
    ctx.font = `${size}px ${ARCADE}`;
    const tw = ctx.measureText(text).width;
    arcadeText(ctx, text, cx, y + size * 0.38, size, ['#fff7d8', '#ffd98a', '#e0a040'], 'center');
    for (const dir of [-1, 1]) {
        const wx = cx + dir * (tw / 2 + size * 0.5);
        wing(ctx, wx, y, size * 0.9, dir);
    }
    // The swoop under it.
    const half = tw / 2 + size * 3;
    ctx.strokeStyle = goldGradient(ctx, y, y + size);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - half, y + size * 0.55);
    ctx.quadraticCurveTo(cx, y + size * 1.25, cx + half, y + size * 0.55);
    ctx.stroke();
    ctx.fillStyle = '#fff3c0';
    sparkle(ctx, cx, y + size * 0.92, size * 0.35 + Math.abs(Math.sin(t * 2)) * size * 0.1);
}

/** A wing (gold unless `fill` says otherwise) spreading `dir` (−1 left, 1 right) from (x, y), `s` across: three swept feathers. */
export function wing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    dir: number,
    fill: string | CanvasGradient = goldGradient(ctx, y - s * 0.6, y + s * 0.4),
): void {
    ctx.fillStyle = fill;
    for (let i = 0; i < 3; i++) {
        const len = s * (1 - i * 0.22),
            yy = y - s * 0.32 + i * s * 0.26;
        ctx.beginPath();
        ctx.moveTo(x, yy);
        ctx.quadraticCurveTo(x + dir * len * 0.55, yy - s * 0.3, x + dir * len, yy - s * 0.18);
        ctx.quadraticCurveTo(x + dir * len * 0.6, yy + s * 0.08, x, yy + s * 0.16);
        ctx.closePath();
        ctx.fill();
    }
}

/** The shape of a frame for `b` with a little notch-and-star crest at the middle of its top, for portraits. */
export function crest(ctx: CanvasRenderingContext2D, cx: number, y: number, s: number, t: number): void {
    ctx.fillStyle = goldGradient(ctx, y - s, y + s);
    ctx.beginPath();
    ctx.moveTo(cx, y - s);
    ctx.lineTo(cx + s * 0.32, y);
    ctx.lineTo(cx, y + s * 0.5);
    ctx.lineTo(cx - s * 0.32, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    sparkle(ctx, cx, y - s * 0.15, s * 0.35 + Math.abs(Math.sin(t * 2.2)) * s * 0.15);
}

/**
 * A menu screen's backdrop and heading in this look, filling `W` (reaching `bleed` past each side) by `H`: the night
 * with its planet rising at the top right over the horizon low down, flowers in the bottom corners, and the screen's
 * name as a winged gold heading at the top.
 */
export function ornateScreen(
    ctx: CanvasRenderingContext2D,
    t: number,
    W: number,
    H: number,
    bleed: number,
    title: string,
    tall: boolean,
): void {
    drawNight(ctx, t, -bleed - 2, W + 2 * bleed + 4, H, {
        planet: { x: W + bleed - (tall ? 40 : 70), y: tall ? 52 : 30, r: tall ? 34 : 46 },
        horizon: H * (tall ? 0.86 : 0.8),
    });
    drawFlowers(ctx, -bleed + 12, H - 12, tall ? 0.8 : 1, t, 0);
    drawFlowers(ctx, W + bleed - 12, H - 12, tall ? 0.8 : 1, t, 3);
    ornateTitle(ctx, title, W, t, tall);
}

/** Just the winged heading of `ornateScreen`, for a screen that paints its own background. */
export function ornateTitle(ctx: CanvasRenderingContext2D, title: string, W: number, t: number, tall: boolean): void {
    // On a phone the page's Back tab takes the top-left corner, so the heading sits a little right of centre.
    wingedTitle(ctx, title, tall ? W / 2 + 22 : W / 2, tall ? 18 : 14, tall ? 10.5 : 15, t);
}

/**
 * The key hints along the bottom of a menu screen, centred on (cx, y): each key drawn as a little gold-edged keycap,
 * then what it does, the groups split by thin gold lines. On a touchscreen `touch` is shown instead, plain.
 */
export function keyHints(
    ctx: CanvasRenderingContext2D,
    hints: [string[], string][],
    cx: number,
    y: number,
    touch: string | null,
): void {
    ctx.textBaseline = 'alphabetic';
    if (touch !== null) {
        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.8)';
        ctx.fillText(touch, cx, y + 2.5);
        return;
    }
    ctx.font = `6px ${ARCADE}`;
    const capW = (k: string) => Math.max(11, ctx.measureText(k).width + 7);
    const groupW = hints.map(
        ([keys, what]) => keys.reduce((a, k) => a + capW(k) + 2, 0) + 4 + ctx.measureText(what).width,
    );
    const total = groupW.reduce((a, b) => a + b, 0) + (hints.length - 1) * 16;
    let x = cx - total / 2;
    hints.forEach(([keys, what], i) => {
        for (const k of keys) {
            const w = capW(k);
            ctx.fillStyle = 'rgba(22,10,50,0.9)';
            roundRect(ctx, x, y - 6, w, 11, 2.5);
            ctx.fill();
            ctx.strokeStyle = goldGradient(ctx, y - 6, y + 5);
            ctx.lineWidth = 0.8;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(k, x + w / 2, y + 2);
            x += w + 2;
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(239,230,255,0.85)';
        ctx.fillText(what, x + 3, y + 2);
        x += 4 + ctx.measureText(what).width;
        if (i < hints.length - 1) {
            ctx.fillStyle = 'rgba(233,185,73,0.5)';
            ctx.fillRect(x + 7.5, y - 5, 0.8, 9);
            x += 16;
        }
    });
}

/** A gold frame round `trace`'s shape, `width` thick, glowing softly, with a fainter line just inside it. */
export function goldFrame(ctx: CanvasRenderingContext2D, trace: () => void, y0: number, y1: number, width = 2.2): void {
    ctx.save();
    ctx.shadowColor = 'rgba(255,190,90,0.55)';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = goldGradient(ctx, y0, y1);
    ctx.lineWidth = width;
    trace();
    ctx.stroke();
    ctx.restore();
}

/**
 * A round gold-ringed medallion with a deep glowing middle in `color`, for icons: a skill's, a stat tile's, a map's.
 */
export function iconOrb(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string,
    on = false,
): void {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(0.6, '#2a1260');
    g.addColorStop(1, '#140830');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = on ? '#fff3c9' : goldGradient(ctx, y - r, y + r);
    ctx.lineWidth = on ? 1.8 : 1.3;
    ctx.stroke();
}
