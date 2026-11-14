// Pixel-art painters for the sky scenery: floating islands, clouds and distant rock spires. Each is painted once,
// pixel by pixel from a seed, into a small offscreen canvas (one pixel per meadow unit), and then drawn with
// smoothing off so it stays crisp and blocky at any screen size. Everything here is original art.
import { Rng } from '@/core/rng';
import type { Fade, IslandSpec, Painted } from '@/types';

/** The sky colour distant scenery fades toward. */
const HAZE = [0x9c, 0xc8, 0xee];

/** `hex` ('#rrggbb') faded toward the haze by `f`, as a little-endian ABGR word for ImageData. */
function color(hex: string, f: Fade): number {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * (1 - f) + HAZE[0] * f),
        g = Math.round(((n >> 8) & 255) * (1 - f) + HAZE[1] * f),
        b = Math.round((n & 255) * (1 - f) + HAZE[2] * f);
    return (255 << 24) | (b << 16) | (g << 8) | r;
}

/** A tiny pixel buffer: set pixels, then turn it into a canvas. */
class Pix {
    readonly data: Uint32Array;
    constructor(
        readonly w: number,
        readonly h: number,
    ) {
        this.data = new Uint32Array(w * h);
    }
    /** Set the pixel at (x, y), ignoring anything off the buffer. */
    set(x: number, y: number, c: number): void {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.data[y * this.w + x] = c;
    }
    /** The pixel at (x, y), or 0 (clear) off the buffer. */
    get(x: number, y: number): number {
        return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.data[y * this.w + x] : 0;
    }
    /** A filled disc of colour `c`. */
    disc(cx: number, cy: number, r: number, c: number): void {
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
            for (let x = Math.floor(cx - r); x <= cx + r; x++)
                if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c);
    }
    /** A filled rectangle of colour `c`. */
    rect(x: number, y: number, w: number, h: number, c: number): void {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    }
    /** Darken every opaque pixel that touches a clear one: the 16-bit outline. */
    outline(c: number): void {
        const out: number[] = [];
        for (let y = 0; y < this.h; y++)
            for (let x = 0; x < this.w; x++) {
                if (!this.get(x, y)) continue;
                if (!this.get(x - 1, y) || !this.get(x + 1, y) || !this.get(x, y - 1) || !this.get(x, y + 1))
                    out.push(y * this.w + x);
            }
        for (const i of out) this.data[i] = c;
    }
    /** The buffer as a canvas. */
    canvas(): HTMLCanvasElement {
        const cv = document.createElement('canvas');
        cv.width = this.w;
        cv.height = this.h;
        const ctx = cv.getContext('2d')!;
        const img = ctx.createImageData(this.w, this.h);
        new Uint32Array(img.data.buffer).set(this.data);
        ctx.putImageData(img, 0, 0);
        return cv;
    }
}

/** Flower colours dotted through the grass. */
const FLOWERS = ['#ff8ac8', '#ffe266', '#ffffff', '#b494ff'];

/** Room above the surface for trees and roofs. */
const HEAD = 30;

/** Paint a floating island: grass on top, banded soil, a jagged rocky underside, and what grows on it. */
export function paintIsland(s: IslandSpec): Painted {
    const rng = new Rng(s.seed);
    const f = s.fade;
    const W = s.w + 4,
        D = Math.round(s.w * s.depth);
    const H = HEAD + 6 + D + 8;
    const p = new Pix(W, H);
    const cx = Math.floor(W / 2);
    const half = s.w / 2;

    // The top surface: gently uneven, curling down at the ends.
    const top: number[] = [];
    let wob = 0;
    for (let x = 0; x < W; x++) {
        wob = Math.max(-1, Math.min(1, wob + (rng.next() < 0.3 ? (rng.next() < 0.5 ? -1 : 1) : 0)));
        const edge = Math.abs(x - cx) - (half - 5);
        top.push(HEAD + wob + (edge > 0 ? Math.round(edge * edge * 0.35) : 0));
    }
    // The underside: a rough cone with stalactite-like spikes.
    const bottom: number[] = [];
    let jag = 0;
    for (let x = 0; x < W; x++) {
        const t = Math.min(1, Math.abs(x - cx) / half);
        jag = jag * 0.6 + (rng.next() - 0.5) * 6;
        const spike = rng.next() < 0.12 ? rng.range(3, 9) * (1 - t) : 0;
        const d = D * Math.pow(Math.max(0, 1 - Math.pow(t, 1.7)), 0.85);
        bottom.push(top[x] + 4 + Math.max(0, d + jag + spike));
    }

    const grassHi = color('#a8ef6c', f),
        grass = color('#68c94a', f),
        grassDk = color('#3b9a3f', f),
        soil = [color('#a86d3c', f), color('#8a5530', f), color('#6c4126', f)],
        // Warm sandstone, lit from the left, cooling into shadow underneath.
        rock = [
            color('#e2c9a4', f),
            color('#c2a280', f),
            color('#9a7c66', f),
            color('#735a52', f),
            color('#4e3c46', f),
        ],
        ink = color('#2e2236', f);

    for (let x = 0; x < W; x++) {
        if (Math.abs(x - cx) > half + 1) continue;
        const lit = (cx - x) / half; // left side catches the light
        const drip = rng.next() < 0.35 ? rng.int(1, 3) : 0;
        for (let y = top[x]; y <= bottom[x]; y++) {
            const d = y - top[x];
            let c: number;
            if (d === 0) c = grassHi;
            else if (d < 2) c = grass;
            else if (d < 4 + drip) c = grassDk;
            else if (d < 10) {
                // Soil in bands, with a little dither so it doesn't look flat.
                const band = Math.floor((d - 4) / 2) % 3;
                c = soil[(band + ((x + y) % 5 === 0 ? 1 : 0)) % 3];
            } else {
                const depth = (y - top[x] - 10) / Math.max(1, bottom[x] - top[x] - 10);
                let i = Math.round(depth * 3.2 - lit * 1.4 + 0.6);
                if ((x + y) % 2 === 0 && rng.next() < 0.35) i++;
                c = rock[Math.max(0, Math.min(4, i))];
            }
            p.set(x, y, c);
        }
        // Cracks and ledges in the rock.
        if (rng.next() < 0.15) {
            const y0 = top[x] + rng.int(12, Math.max(13, bottom[x] - top[x] - 4));
            for (let k = 0; k < rng.int(2, 5); k++) p.set(x, y0 + k, rock[4]);
        }
    }

    // A pond set into the grass.
    if (s.pond && s.w > 50) {
        const pw = Math.round(s.w * rng.range(0.18, 0.28)),
            px = cx + Math.round(rng.range(-0.2, 0.2) * s.w) - Math.floor(pw / 2);
        for (let x = px; x < px + pw; x++) {
            const k = Math.abs(x - (px + pw / 2)) / (pw / 2);
            const dep = k > 0.75 ? 1 : 2;
            for (let y = top[x] + 1; y <= top[x] + dep; y++)
                p.set(x, y, color(y === top[x] + 1 && (x + y) % 4 === 0 ? '#c4f0ff' : '#5cb6ee', f));
            p.set(x, top[x], color('#88d4ff', f));
        }
    }

    p.outline(ink);

    // Hanging roots under the grass line.
    if (s.vines)
        for (let i = 0; i < Math.round(s.w / 9); i++) {
            const x = cx + Math.round(rng.range(-half + 3, half - 3));
            const len = rng.int(4, 12);
            for (let k = 0; k < len; k++) p.set(x + (k > len / 2 ? 1 : 0), top[x] + 9 + k, color('#4f8f3a', f));
            p.set(x + 1, top[x] + 9 + len, color('#ff9fce', f));
        }

    // What grows and stands on top, left to right so nearer things overlap.
    const used: [number, number][] = [];
    /** True if `[a, b]` is clear of anything already placed on the surface. */
    const free = (a: number, b: number) => used.every(([u, v]) => b < u || a > v);
    /** Reserve `[a, b]` on the surface. */
    const take = (a: number, b: number) => used.push([a, b]);

    if (s.cottage && s.w >= 60) {
        const hx = cx + Math.round(rng.range(-0.15, 0.15) * s.w);
        cottage(p, hx, top[hx], rng, f);
        take(hx - 9, hx + 9);
    }
    if (s.ruins && s.w >= 45) {
        const rx = cx + Math.round(rng.range(-0.25, 0.25) * s.w);
        if (free(rx - 8, rx + 8)) {
            ruins(p, rx, top[rx], rng, f);
            take(rx - 8, rx + 8);
        }
    }
    for (let i = 0; i < s.trees; i++) {
        const tx = cx + Math.round(rng.range(-half + 6, half - 6));
        const r = rng.int(4, Math.min(9, Math.max(4, Math.round(s.w / 10))));
        if (!free(tx - r + 2, tx + r - 2)) continue;
        if (s.pines && rng.next() < 0.5) pine(p, tx, top[tx], r, f);
        else tree(p, tx, top[tx], r, rng, f);
        take(tx - r + 2, tx + r - 2);
    }
    // Bushes, flowers, mushrooms and rocks fill the gaps.
    for (let x = cx - Math.floor(half) + 3; x < cx + half - 3; x++) {
        const y = top[x] - 1;
        const roll = rng.next();
        if (roll < 0.05 && free(x - 2, x + 2)) {
            bush(p, x, top[x], rng.int(2, 3), f);
            x += 3;
        } else if (roll < 0.17) p.set(x, y, color(FLOWERS[rng.int(0, FLOWERS.length - 1)], f));
        else if (roll < 0.19 && free(x - 1, x + 1)) mushroom(p, x, top[x], f);
        else if (roll < 0.21) {
            p.set(x, y, color('#9a93ab', f));
            p.set(x + 1, y, color('#6f6884', f));
        }
    }

    // Waterfall lips, near the ends of the island where the water runs off.
    const falls: { x: number; y: number }[] = [];
    for (let i = 0; i < s.falls; i++) {
        const side = rng.next() < 0.5 ? -1 : 1;
        const x = cx + side * Math.round(half * rng.range(0.55, 0.85));
        falls.push({ x, y: top[x] + 1 });
    }
    const lx = cx - Math.floor(half) + 2,
        rx = cx + Math.floor(half) - 2;
    return {
        canvas: p.canvas(),
        cx,
        cy: HEAD,
        falls,
        left: { x: lx, y: top[lx] },
        right: { x: rx, y: top[rx] },
    };
}

/** A round leafy tree: a trunk and a canopy of three greens, lit from the upper left. */
function tree(p: Pix, x: number, y: number, r: number, rng: Rng, f: Fade): void {
    const trunk = color('#7a4a2a', f),
        dark = color('#2c7a39', f),
        mid = color('#46a64a', f),
        light = color('#86d65c', f);
    p.rect(x - 1, y - r, 2, r, trunk);
    const cy = y - r - r * 0.6;
    // A dark rim first, so the canopy reads as one shape against the sky (16-bit style outline).
    p.disc(x, cy, r + 1, color('#1d4a2a', f));
    p.disc(x, cy, r, dark);
    p.disc(x - 1, cy - 1, r - 1.5, mid);
    p.disc(x - r * 0.35, cy - r * 0.35, r * 0.45, light);
    // A few extra lumps so no two trees are quite the same.
    for (let i = 0; i < 3; i++)
        p.disc(x + rng.range(-r, r) * 0.8, cy + rng.range(-r, r) * 0.5, r * 0.4, rng.next() < 0.5 ? mid : dark);
}

/** A tall pine: stacked triangles of dark green. */
function pine(p: Pix, x: number, y: number, r: number, f: Fade): void {
    const dark = color('#246b3c', f),
        light = color('#3f9a50', f);
    p.rect(x - 1, y - 3, 2, 3, color('#6a4026', f));
    const h = r * 3;
    for (let k = 0; k < h; k++) {
        const w = Math.round(((k % (h / 3)) / (h / 3)) * r * 0.7 + (k / h) * r * 0.5) + 1;
        const yy = y - 3 - h + k;
        for (let i = -w; i <= w; i++) p.set(x + i, yy, i < 0 ? light : dark);
    }
}

/** A round bush. */
function bush(p: Pix, x: number, y: number, r: number, f: Fade): void {
    p.disc(x, y - r + 1, r, color('#3b9a3f', f));
    p.disc(x - 1, y - r, r - 1, color('#66c24a', f));
}

/** A little red-capped mushroom. */
function mushroom(p: Pix, x: number, y: number, f: Fade): void {
    p.set(x, y - 1, color('#f4ecd8', f));
    p.rect(x - 1, y - 3, 3, 2, color('#e0443c', f));
    p.set(x, y - 3, color('#ffffff', f));
}

/** A small cottage: walls, a pitched roof, a door, a lit window and a chimney. */
function cottage(p: Pix, x: number, y: number, rng: Rng, f: Fade): void {
    const roof = rng.next() < 0.5 ? ['#d8503c', '#9a2f2a'] : ['#4f7bd8', '#2f4f9a'];
    const ink = color('#2a2140', f);
    const wall = color('#f2e2bc', f),
        wallDk = color('#cdb48a', f);
    p.rect(x - 7, y - 9, 14, 9, wall);
    p.rect(x + 3, y - 9, 4, 9, wallDk);
    p.rect(x - 2, y - 5, 3, 5, color('#7a4a2a', f));
    p.rect(x + 3, y - 7, 3, 2, color('#ffd85a', f));
    for (let k = 0; k < 7; k++) {
        const w = 9 - k + 1;
        for (let i = -w; i <= w; i++) p.set(x + i, y - 9 - k, color(i < 0 ? roof[0] : roof[1], f));
    }
    p.rect(x + 4, y - 17, 2, 4, color('#8a7a8e', f));
    // Its outline, without darkening the island under it.
    for (let i = -8; i <= 8; i++) p.set(x + i, y - 9, ink);
}

/** Old stone ruins: two or three broken columns, maybe with a lintel across. */
function ruins(p: Pix, x: number, y: number, rng: Rng, f: Fade): void {
    const stone = color('#d8d2e4', f),
        shade = color('#9c94b0', f),
        moss = color('#6fb24c', f);
    const n = rng.int(2, 3);
    const hs: number[] = [];
    for (let i = 0; i < n; i++) {
        const cx = x - 6 + i * 6;
        const h = rng.int(6, 14);
        hs.push(h);
        p.rect(cx, y - h, 3, h, stone);
        p.rect(cx + 2, y - h, 1, h, shade);
        p.set(cx, y - h, moss);
        p.rect(cx - 1, y - 1, 5, 1, shade);
    }
    if (n === 3 && Math.min(...hs) > 9) p.rect(x - 7, y - Math.min(...hs) - 2, 16, 2, stone);
}

/** A puffy cloud: overlapping round lumps, white on top and shaded underneath. */
export function paintCloud(seed: number, w: number, f: Fade): HTMLCanvasElement {
    const rng = new Rng(seed);
    const h = Math.round(w * rng.range(0.32, 0.45));
    const p = new Pix(w + 8, h + 8);
    const lumps: [number, number, number][] = [];
    const n = Math.max(4, Math.round(w / 12));
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const r = h * (0.32 + 0.42 * Math.sin(Math.PI * t)) * rng.range(0.8, 1.1);
        lumps.push([4 + t * w, h + 6 - r * 0.9, r]);
    }
    // Smaller puffs along the top, so the outline billows instead of reading as a rounded box.
    for (let i = 0; i < n * 2; i++) {
        const [x, y, r] = lumps[rng.int(0, lumps.length - 1)];
        const ang = rng.range(Math.PI * 1.1, Math.PI * 1.9);
        lumps.push([x + Math.cos(ang) * r * 0.8, y + Math.sin(ang) * r * 0.75, r * rng.range(0.3, 0.55)]);
    }
    for (const [x, y, r] of lumps) p.disc(x, y, r, color('#c9daf6', f));
    for (const [x, y, r] of lumps) p.disc(x - r * 0.12, y - r * 0.18, r * 0.86, color('#eef4ff', f));
    for (const [x, y, r] of lumps) p.disc(x - r * 0.3, y - r * 0.4, r * 0.45, color('#ffffff', f));
    return p.canvas();
}

/** A distant rock spire: a tall, narrow floating crag, pale with haze, with a tuft of green on top. */
export function paintSpire(seed: number, w: number, f: Fade): HTMLCanvasElement {
    const rng = new Rng(seed);
    const h = Math.round(w * rng.range(1.6, 2.6));
    const p = new Pix(w + 2, h + 6);
    const cx = (w + 2) / 2;
    for (let y = 0; y < h; y++) {
        const t = y / h;
        const half = (w / 2) * (t < 0.15 ? 0.7 + t * 2 : 1 - Math.pow((t - 0.15) / 0.85, 1.4) * 0.92);
        for (let x = Math.round(cx - half); x <= cx + half; x++) {
            const lit = x < cx - half * 0.3;
            p.set(x, y + 4, color(y < 3 ? '#7ccf5a' : lit ? '#a99cc4' : '#7f73a0', f));
        }
    }
    p.outline(color('#5a5078', f));
    return p.canvas();
}
