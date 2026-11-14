// Pixel-art painters for the scenery, seen from above at an angle (a three-quarter top-down view): an island shows
// its flat top (grass, sand, rock or flagstones, by map) and, below its front edge, its cliff face (bricks, sandstone
// strata, crags or a castle wall) with roots or drips hanging off it, all floating over clouds, mist or haze. Each sprite is painted once, pixel by pixel from a seed, into a small
// offscreen canvas (one pixel per meadow unit) and drawn with smoothing off, so it stays crisp and blocky at any
// screen size. Colours come from the map (see data/maps.ts). Everything here is original art.
import { Rng } from '@/core/rng';
import type { Fade, IslandSpec, MapTheme, Painted, Prop } from '@/types';

/** Turns '#rrggbb' into a little-endian ABGR word for ImageData, faded toward the map's haze. */
type Paint = (hex: string) => number;

/** A colour function for map `m` at fade `f`. */
function palette(m: MapTheme, f: Fade): Paint {
    const h = parseInt(m.haze.slice(1), 16);
    const hz = [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const cache = new Map<string, number>();
    return hex => {
        let v = cache.get(hex);
        if (v === undefined) {
            const n = parseInt(hex.slice(1), 16);
            const r = Math.round(((n >> 16) & 255) * (1 - f) + hz[0] * f),
                g = Math.round(((n >> 8) & 255) * (1 - f) + hz[1] * f),
                b = Math.round((n & 255) * (1 - f) + hz[2] * f);
            v = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
            cache.set(hex, v);
        }
        return v;
    };
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
    /** A filled ellipse of colour `c` (a disc when `ry` is left out). */
    oval(cx: number, cy: number, rx: number, c: number, ry = rx): void {
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
            for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
                if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) this.set(x, y, c);
    }
    /** A filled rectangle of colour `c`. */
    rect(x: number, y: number, w: number, h: number, c: number): void {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
    }
    /** Colour every clear pixel that touches an opaque one: a 16-bit outline drawn just outside the shape. */
    outline(c: number): void {
        const out: number[] = [];
        for (let y = 0; y < this.h; y++)
            for (let x = 0; x < this.w; x++) {
                if (this.get(x, y)) continue;
                if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1))
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

/** Room above the grassy top for trees, roofs and spires. */
const HEAD = 34;
/** Room below the cliff for the drips. */
const DRIP = 22;

/** Paint a floating island seen from above at an angle: its grassy top, its brick cliff, and what's on it. */
export function paintIsland(s: IslandSpec, m: MapTheme): Painted {
    const rng = new Rng(s.seed);
    const c = palette(m, s.fade);
    const W = s.w + Math.round(s.w * 0.5) + 6,
        H = HEAD + s.d + Math.round(s.d * 0.6) + s.cliff + DRIP + 4;
    const p = new Pix(W, H);

    // ---- the top's shape: a main slab, sometimes with a lobe off one side (an L), corners clipped ----
    const top = new Uint8Array(W * H);
    /** Mark a rectangle of the top. */
    const slab = (x: number, y: number, w: number, d: number) => {
        for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) top[(y + j) * W + x + i] = 1;
    };
    const x0 = Math.round((W - s.w) / 2);
    const y0 = HEAD + Math.round(s.d * 0.3);
    slab(x0, y0, s.w, s.d);
    if (rng.next() < 0.55) {
        const lw = Math.round(s.w * rng.range(0.3, 0.5)),
            ld = Math.round(s.d * rng.range(0.55, 0.85));
        const right = rng.next() < 0.5;
        const ly = rng.next() < 0.5 ? y0 - Math.round(s.d * 0.3) : y0 + s.d - ld + Math.round(s.d * 0.25);
        const lx = right ? x0 + s.w - Math.round(lw * 0.4) : x0 - Math.round(lw * 0.6);
        slab(Math.max(1, Math.min(W - lw - 1, lx)), Math.max(HEAD, ly), lw, ld);
    }
    // Clip the corners: a top pixel with too few top neighbours goes, twice over.
    for (let pass = 0; pass < 2; pass++) {
        const cut: number[] = [];
        for (let y = 1; y < H - 1; y++)
            for (let x = 1; x < W - 1; x++) {
                if (!top[y * W + x]) continue;
                let n = 0;
                for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) n += top[(y + j) * W + x + i];
                if (n < 6) cut.push(y * W + x);
            }
        for (const i of cut) top[i] = 0;
    }
    /** True if (x, y) is on the grassy top. */
    const onTop = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && top[y * W + x] === 1;

    // Each column's front edge (its lowest top pixel), where its cliff hangs from.
    const front = new Int16Array(W).fill(-1);
    for (let x = 0; x < W; x++)
        for (let y = H - 1; y >= 0; y--)
            if (onTop(x, y)) {
                front[x] = y;
                break;
            }

    // ---- the cliff face, in the map's style, darker toward a ragged bottom ----
    const bottom = new Int16Array(W).fill(-1);
    cliffFace(p, front, bottom, s.cliff, c, m, rng);

    // ---- the top, in the map's ground, with a bright back edge and a lip over the cliff ----
    topFace(p, onTop, front, s, c, m, rng);

    p.outline(c(m.ink));

    // ---- roots and water dripping off the bottom of the cliff ----
    const [dripDk, dripMid, dripTip] = m.drips.map(c);
    let run = 0;
    for (let x = 0; x < W; x++) {
        if (bottom[x] < 0) continue;
        run = rng.next() < 0.35 ? rng.int(0, 1) * rng.int(3, 14) : Math.max(0, run - rng.int(0, 3));
        const len = run + (rng.next() < 0.08 ? rng.int(6, DRIP - 4) : 0);
        for (let k = 2; k <= len + 1; k++)
            p.set(x, bottom[x] + k, k === len + 1 ? dripTip : k > len * 0.6 ? dripMid : dripDk);
    }

    // ---- what stands on top, placed so nothing overlaps, drawn back to front ----
    const spots: { x: number; y: number; r: number }[] = [];
    /** A free spot on the top, at least `r` from anything else and `inset` in from the sides, or null. */
    const place = (r: number, inset: number) => {
        for (let tries = 0; tries < 30; tries++) {
            const x = rng.int(0, W - 1),
                y = rng.int(0, H - 1);
            if (!onTop(x - inset, y) || !onTop(x + inset, y) || !onTop(x, y - 2) || !onTop(x, y + 2)) continue;
            if (spots.some(o => (o.x - x) ** 2 + ((o.y - y) * 1.6) ** 2 < (o.r + r) ** 2)) continue;
            spots.push({ x, y, r });
            return { x, y };
        }
        return null;
    };
    const draws: { y: number; draw: () => void }[] = [];
    const falls: { x: number; y: number }[] = [];

    if (s.pond) {
        const rx = Math.max(4, Math.round(s.w * rng.range(0.12, 0.18))),
            spot = place(rx + 2, rx + 2);
        if (spot) draws.push({ y: -99, draw: () => pond(p, spot.x, spot.y, rx, c, m, front, falls, s.falls > 0) });
    }
    if (s.path) {
        const x = Math.round(W / 2 + rng.range(-0.2, 0.2) * s.w);
        draws.push({ y: -98, draw: () => path(p, x, onTop, c, rng) });
    }
    if (s.fence) draws.push({ y: -97, draw: () => fence(p, W, onTop, c, m, rng) });
    if (s.cottage) {
        const spot = place(14, 10);
        if (spot) draws.push({ y: spot.y, draw: () => cottage(p, spot.x, spot.y, c, m) });
    }
    // Big things first so they get the room, then the small ones in the gaps; each picked by the map's weights.
    for (const [n, table, room] of [
        [s.big, m.big, 8],
        [s.small, m.small, 4],
    ] as const)
        for (let i = 0; i < n; i++) {
            const kind = pick(table, rng);
            if (!kind) break;
            const r = kind === 'tree' ? rng.int(7, Math.max(8, Math.min(15, Math.round(s.w / 6)))) : room;
            const spot = place(r, Math.min(r, 6));
            if (!spot) continue;
            const pr = new Rng(Math.floor(rng.next() * 2 ** 31));
            draws.push({ y: spot.y, draw: () => prop(kind, p, spot.x, spot.y, r, c, m, pr) });
        }
    draws.sort((a, b) => a.y - b.y);
    for (const d of draws) d.draw();

    // Waterfalls off the front edge, if a pond didn't already make one.
    for (let tries = 0; falls.length < s.falls && tries < 10; tries++) {
        const x = rng.int(x0 + 3, x0 + s.w - 4);
        if (front[x] > 0) falls.push({ x, y: front[x] + 1 });
    }

    // The anchor is the middle of the main slab; bridges land on its left and right edges.
    const cy = y0 + Math.round(s.d / 2);
    let lx = 0,
        rx = W - 1;
    while (lx < W - 1 && !onTop(lx, cy)) lx++;
    while (rx > 0 && !onTop(rx, cy)) rx--;
    return { canvas: p.canvas(), cx: Math.round(W / 2), cy, falls, left: { x: lx, y: cy }, right: { x: rx, y: cy } };
}

/** Build the cliff face under each column's front edge in the map's style, noting where each column ends. */
function cliffFace(
    p: Pix,
    front: Int16Array,
    bottom: Int16Array,
    cliff: number,
    c: Paint,
    m: MapTheme,
    rng: Rng,
): void {
    const [hi, face, shade, joint] = m.cliff.map(c);
    let rag = 0;
    // Sandstone strata: each band its own shade, the same all the way across.
    const bands = Array.from({ length: 12 }, () => [hi, face, face, shade][rng.int(0, 3)]);
    for (let x = 0; x < p.w; x++) {
        const fy = front[x];
        if (fy < 0) continue;
        rag = Math.max(-2, Math.min(3, rag + rng.int(-1, 1)));
        const len = cliff + rag + (m.cliffStyle === 'crag' ? rng.int(0, 3) : 0);
        bottom[x] = fy + len;
        for (let k = 1; k <= len; k++) {
            const t = k / len;
            let col: number;
            switch (m.cliffStyle) {
                case 'bricks': {
                    const row = Math.floor((k - 1) / 4);
                    const j = (k - 1) % 4 === 3 || (x + (row % 2) * 3) % 6 === 0;
                    col = j ? joint : row === 0 ? hi : t < 0.45 ? face : shade;
                    if (!j && rng.next() < 0.06) col = shade;
                    break;
                }
                case 'wall': {
                    // Big castle blocks, with a dark arrow slit now and then.
                    const row = Math.floor((k - 1) / 5);
                    const j = (k - 1) % 5 === 4 || (x + (row % 2) * 5) % 10 === 0;
                    col = j ? joint : row === 0 ? hi : t < 0.5 ? face : shade;
                    if (x % 23 === 11 && k > 3 && k < 9) col = joint;
                    break;
                }
                case 'strata': {
                    const band = Math.floor((k - 1 + Math.sin(x * 0.15) * 1.5) / 3);
                    col = bands[Math.max(0, band) % bands.length];
                    if (t > 0.7) col = shade;
                    if (rng.next() < 0.05) col = joint;
                    break;
                }
                default: {
                    // Crags: rough rock shaded by facets, with seams of crystal.
                    const facet = Math.floor((x + k * 0.6) / 5) % 3;
                    col = [hi, face, shade][Math.min(2, facet + (t > 0.6 ? 1 : 0))];
                    if ((x * 7 + k * 3) % 41 === 0) col = c(m.cone[0]);
                    if (rng.next() < 0.08) col = joint;
                }
            }
            p.set(x, fy + k, col);
        }
    }
}

/** Fill the island's top in the map's ground, with a bright back edge and a darker lip hanging over the cliff. */
function topFace(
    p: Pix,
    onTop: (x: number, y: number) => boolean,
    front: Int16Array,
    s: IslandSpec,
    c: Paint,
    m: MapTheme,
    rng: Rng,
): void {
    const [hi, body, tex, edge] = m.top.map(c);
    for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) if (onTop(x, y)) p.set(x, y, body);
    const area = s.w * s.d;
    switch (m.ground) {
        case 'grass':
            for (let i = 0; i < area / 4; i++) {
                const x = rng.int(0, p.w - 1),
                    y = rng.int(0, p.h - 1);
                if (!onTop(x, y) || !onTop(x, y + 1)) continue;
                if (rng.next() < 0.55) {
                    p.set(x, y, tex);
                    p.set(x - 1, y + 1, tex);
                    p.set(x + 1, y + 1, tex);
                    p.set(x, y - 1, hi);
                } else p.set(x, y, hi);
            }
            break;
        case 'sand':
            // Wind ripples: short wavy strokes, a dark trough under a lit crest.
            for (let i = 0; i < area / 40; i++) {
                const x0 = rng.int(0, p.w - 1),
                    y0 = rng.int(0, p.h - 1),
                    len = rng.int(5, 12);
                for (let k = 0; k < len; k++) {
                    const x = x0 + k,
                        y = y0 + Math.round(Math.sin(k * 0.7) * 1);
                    if (!onTop(x, y) || !onTop(x, y + 1)) continue;
                    p.set(x, y, hi);
                    p.set(x, y + 1, tex);
                }
            }
            for (let i = 0; i < area / 12; i++) {
                const x = rng.int(0, p.w - 1),
                    y = rng.int(0, p.h - 1);
                if (onTop(x, y)) p.set(x, y, rng.next() < 0.5 ? tex : hi);
            }
            break;
        case 'rock':
            // Cracked stone with a little glowing moss.
            for (let i = 0; i < area / 30; i++) {
                let x = rng.int(0, p.w - 1),
                    y = rng.int(0, p.h - 1);
                for (let k = rng.int(3, 8); k > 0 && onTop(x, y); k--) {
                    p.set(x, y, edge);
                    x += rng.int(-1, 1);
                    y += rng.next() < 0.5 ? 1 : 0;
                }
            }
            for (let i = 0; i < area / 10; i++) {
                const x = rng.int(0, p.w - 1),
                    y = rng.int(0, p.h - 1);
                if (onTop(x, y)) p.set(x, y, rng.next() < 0.2 ? c(m.leaves[2]) : rng.next() < 0.5 ? hi : tex);
            }
            break;
        case 'tiles':
            // Flagstones: a staggered grid, some cracked, moss in the joints.
            for (let y = 0; y < p.h; y++)
                for (let x = 0; x < p.w; x++) {
                    if (!onTop(x, y)) continue;
                    const row = Math.floor(y / 5);
                    if (y % 5 === 0 || (x + (row % 2) * 4) % 8 === 0) p.set(x, y, tex);
                    else if (y % 5 === 1) p.set(x, y, hi);
                }
            for (let i = 0; i < area / 50; i++) {
                const x = rng.int(0, p.w - 1),
                    y = rng.int(0, p.h - 1);
                if (onTop(x, y)) p.set(x, y, c(m.leaves[1]));
            }
            break;
    }
    for (let x = 0; x < p.w; x++) {
        if (front[x] < 0) continue;
        for (let y = 0; y < p.h; y++)
            if (onTop(x, y)) {
                p.set(x, y, hi);
                break;
            }
        const hang = m.ground === 'grass' && rng.next() < 0.5 ? rng.int(1, 3) : 1;
        for (let k = 0; k <= hang; k++) p.set(x, front[x] + k, k === 0 ? body : edge);
    }
}

/** A prop chosen from weights `table`, or null if the table is empty. */
function pick(table: Partial<Record<Prop, number>>, rng: Rng): Prop | null {
    const entries = Object.entries(table) as [Prop, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    if (total <= 0) return null;
    let roll = rng.next() * total;
    for (const [k, w] of entries) if ((roll -= w) <= 0) return k;
    return entries[entries.length - 1][0];
}

/**
 * Paint prop `kind` standing at (x, y), `r` being a tree's canopy radius and `s` how many times its usual size
 * anything else is (the islands' props are 1; the ground maps' big standing things are larger).
 */
function prop(kind: Prop, p: Pix, x: number, y: number, r: number, c: Paint, m: MapTheme, rng: Rng, s = 1): void {
    switch (kind) {
        case 'tree':
            return tree(p, x, y, r, c, m, rng);
        case 'palm':
            return palm(p, x, y, s, c, m, rng);
        case 'cactus':
            return cactus(p, x, y, Math.round(rng.int(8, 14) * s), c, m, rng);
        case 'crystal':
            return crystal(p, x, y, Math.round(rng.int(6, 12) * s), c, m, rng);
        case 'glowshroom':
            return glowshroom(p, x, y, Math.round(rng.int(5, 10) * s), c, m);
        case 'tower':
            return tower(p, x, y, s, c, m, rng);
        case 'torch':
            return torch(p, x, y, c, m);
        case 'cone':
            return cone(p, x, y, Math.round(rng.int(10, 15) * s), c, m);
        case 'rock':
            return rock(p, x, y, Math.round(rng.int(3, 6) * Math.sqrt(s)), c, m);
        case 'bush':
            return bush(p, x, y, c, m, rng);
        case 'flowers':
            return flowers(p, x, y, c, m, rng);
        case 'lupine':
            return lupine(p, x, y, c, m);
        case 'bones':
            return bones(p, x, y, c, m);
    }
}

/** A palm `s` times its usual size: a curving ringed trunk and a crown of drooping, feathered fronds. */
function palm(p: Pix, x: number, y: number, s: number, c: Paint, m: MapTheme, rng: Rng): void {
    const h = Math.round(rng.int(14, 22) * s),
        lean = rng.next() < 0.5 ? -1 : 1,
        tw = Math.max(1, Math.round(1.2 * s));
    const ink = c(m.ink);
    p.oval(x + 3 * s, y, 7 * s, c(m.top[2]), 2.2 * s);
    let tx = x,
        ty = y;
    for (let k = 0; k < h; k++) {
        tx = x + lean * Math.round((k / h) ** 2 * 6 * s);
        ty = y - k;
        const ring = k % Math.max(2, Math.round(3 * s)) === 0;
        p.set(tx - tw - 1, ty, ink);
        for (let i = -tw; i <= tw; i++) p.set(tx + i, ty, c(ring ? m.top[3] : i < 0 ? m.top[0] : m.trunk));
        p.set(tx + tw + 1, ty, ink);
    }
    const [rim, body, light] = m.leaves.map(c);
    const n = s > 1.5 ? 8 : 6;
    for (let f = 0; f < n; f++) {
        const a = (f / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
        const len = Math.round(rng.int(8, 12) * s);
        for (let k = 1; k <= len; k++) {
            const t = k / len;
            const fx = tx + Math.cos(a) * k,
                fy = ty + Math.sin(a) * k * 0.55 + t * t * 5 * s;
            // Leaflets either side of the rib, longest in the middle of the frond.
            const leaf = Math.round(Math.sin(Math.PI * t) * 2.2 * s);
            const nx = -Math.sin(a),
                ny = Math.cos(a) * 0.55;
            for (let l = -leaf; l <= leaf; l++) {
                const lx = fx + nx * l,
                    ly = fy + ny * l + Math.abs(l) * 0.35;
                p.set(lx, ly + 1, ink);
                p.set(lx, ly, l < 0 ? light : Math.abs(l) === leaf ? rim : body);
            }
            p.set(fx, fy, light);
        }
    }
    p.oval(tx - 1.5 * s, ty + 1.5 * s, 1.3 * s, c('#7a4a22'));
    p.oval(tx + 1.5 * s, ty + 1.5 * s, 1.3 * s, c('#6a3c1c'));
}

/** A saguaro-like cactus with one or two arms and a flower on top. */
function cactus(p: Pix, x: number, y: number, h: number, c: Paint, m: MapTheme, rng: Rng): void {
    const [, body, light] = m.leaves.map(c);
    const ink = c(m.ink);
    p.oval(x + 2, y, 4, c(m.top[2]), 1.5);
    /** A rounded column from (cx, bottom) up `len`. */
    const column = (cx: number, bottom: number, len: number) => {
        p.rect(cx - 2, bottom - len, 5, len + 1, ink);
        p.rect(cx - 1, bottom - len + 1, 3, len - 1, body);
        p.rect(cx - 1, bottom - len + 1, 1, len - 1, light);
    };
    column(x, y, h);
    const arms = rng.int(1, 2);
    for (let a = 0; a < arms; a++) {
        const side = a === 0 ? -1 : 1,
            ay = y - rng.int(Math.round(h * 0.35), Math.round(h * 0.6));
        p.rect(x + side * 2, ay - 1, 3 * side, 3, ink);
        p.rect(Math.min(x + side * 2, x + side * 4), ay, 2, 1, body);
        column(x + side * 4, ay + 1, rng.int(4, 6));
    }
    p.set(x, y - h, c(m.flower[0]));
    p.set(x, y - h - 1, c(m.flower[1]));
}

/** A cluster of glowing crystal prisms. */
function crystal(p: Pix, x: number, y: number, h: number, c: Paint, m: MapTheme, rng: Rng): void {
    const ink = c(m.ink),
        lit = c(m.cone[0]),
        shade = c(m.cone[1]),
        glint = c('#ffffff');
    for (let i = rng.int(2, 3); i > 0; i--) {
        const cx = x + rng.int(-3, 3),
            ch = Math.round(h * rng.range(0.55, 1)),
            tilt = rng.int(-2, 2);
        for (let k = 0; k <= ch; k++) {
            const t = k / ch,
                half = k < 3 ? k * 0.8 : 2;
            const px = cx + Math.round(tilt * t);
            for (let dx = -Math.round(half) - 1; dx <= Math.round(half) + 1; dx++) {
                const edgePx = Math.abs(dx) === Math.round(half) + 1;
                p.set(px + dx, y - ch + k, edgePx ? ink : dx < 0 ? lit : shade);
            }
        }
        p.set(cx + tilt, y - ch + 2, glint);
    }
}

/** A tall glowing mushroom. */
function glowshroom(p: Pix, x: number, y: number, h: number, c: Paint, m: MapTheme): void {
    const ink = c(m.ink);
    p.rect(x - 1, y - h, 3, h, ink);
    p.rect(x, y - h, 1, h, c('#d8d0f0'));
    const r = Math.max(3, Math.round(h * 0.55));
    p.oval(x, y - h, r + 1, ink, r * 0.6 + 1);
    p.oval(x, y - h, r, c(m.leaves[1]), r * 0.6);
    p.oval(x - 1, y - h - 1, r * 0.6, c(m.leaves[2]), r * 0.3);
    p.set(x + r * 0.4, y - h, c(m.flower[1]));
    p.set(x - r * 0.5, y - h + 1, c(m.flower[0]));
}

/** A round castle tower: stone courses, a window slit, a pointed roof and a pennant. */
function tower(p: Pix, x: number, y: number, s: number, c: Paint, m: MapTheme, rng: Rng): void {
    const w = Math.round(rng.int(5, 7) * s),
        h = Math.round(rng.int(14, 22) * s);
    const ink = c(m.ink);
    const [hi, face, shade, joint] = m.cliff.map(c);
    p.rect(x - w - 1, y - h - 1, w * 2 + 3, h + 2, ink);
    for (let k = 0; k < h; k++)
        for (let i = -w; i <= w; i++) {
            const j = k % 4 === 0 || (i + Math.floor(k / 4) * 2) % 5 === 0;
            p.set(x + i, y - h + k, j ? joint : i < -w / 2 ? hi : i > w / 2 ? shade : face);
        }
    p.rect(x - 1, y - h + 5, 2, 4, c('#2a2040'));
    p.rect(x - 1, y - 5, 3, 5, c('#4a3428'));
    const [light, body, dark] = m.roof.map(c);
    const rh = Math.round(w * 2.2);
    for (let k = 0; k < rh; k++) {
        const half = Math.round(((k + 1) / rh) * (w + 2));
        for (let i = -half - 1; i <= half + 1; i++)
            p.set(x + i, y - h - rh + k, Math.abs(i) > half ? ink : i < -half / 3 ? light : i > half / 3 ? dark : body);
    }
    p.rect(x, y - h - rh - 6, 1, 6, ink);
    p.rect(x + 1, y - h - rh - 6, 3, 2, c(m.flower[0]));
}

/** A standing torch: an iron post with a flickering flame. */
function torch(p: Pix, x: number, y: number, c: Paint, m: MapTheme): void {
    p.rect(x - 1, y - 7, 3, 8, c(m.ink));
    p.rect(x, y - 7, 1, 7, c('#8a7a8e'));
    p.rect(x - 2, y - 8, 5, 2, c(m.ink));
    p.oval(x, y - 10, 2, c('#ff7a2a'), 2.5);
    p.oval(x, y - 10, 1, c('#ffe066'), 1.5);
    p.set(x, y - 13, c('#ffb84a'));
}

/** A scatter of old bleached bones. */
function bones(p: Pix, x: number, y: number, c: Paint, m: MapTheme): void {
    const bone = c('#f2ead4'),
        ink = c(m.ink);
    for (let i = -3; i <= 3; i++) p.set(x + i, y - 1 + Math.round(i * 0.3), bone);
    for (const [dx, dy] of [
        [-4, -2],
        [-4, 0],
        [4, 0],
        [4, 2],
    ])
        p.set(x + dx, y - 1 + dy * 0.5, bone);
    p.oval(x + 5, y - 3, 2, ink, 1.6);
    p.oval(x + 5, y - 3, 1.5, bone, 1.2);
    p.set(x + 5, y - 3, ink);
}

/** A big leafy tree: a soft shadow, a trunk, and a round canopy of leaf clusters lit from the upper left. */
function tree(p: Pix, x: number, y: number, r: number, c: Paint, m: MapTheme, rng: Rng): void {
    const [rim, body, light] = m.leaves.map(c);
    p.oval(x + 2, y, r * 0.9, c(m.top[2]), r * 0.32);
    const th = Math.round(r * 0.9);
    p.rect(x - 2, y - th, 4, th, c(m.trunk));
    p.rect(x + 1, y - th, 1, th, c(m.ink));
    p.set(x - 3, y, c(m.trunk));
    p.set(x + 2, y, c(m.trunk));
    const cy = y - th - r * 0.55;
    p.oval(x, cy, r + 1, c(m.ink), r * 0.85 + 1);
    p.oval(x, cy, r, rim, r * 0.85);
    for (let i = 0; i < 10; i++) {
        const a = rng.range(0, Math.PI * 2),
            d = rng.range(0, r * 0.55);
        const lx = x + Math.cos(a) * d,
            ly = cy + Math.sin(a) * d * 0.85;
        p.oval(lx, ly, r * rng.range(0.32, 0.45), lx - x + (ly - cy) < 0 ? body : rim);
    }
    for (let i = 0; i < 6; i++)
        p.oval(x - r * rng.range(0.1, 0.5), cy - r * rng.range(0.1, 0.5), r * rng.range(0.15, 0.25), light);
    for (let i = 0; i < r * 3; i++) {
        const a = rng.range(0, Math.PI * 2),
            d = rng.range(0, r * 0.9);
        p.set(x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rng.next() < 0.5 ? light : rim);
    }
}

/** A clump of cream flowers among leaves. */
function flowers(p: Pix, x: number, y: number, c: Paint, m: MapTheme, rng: Rng): void {
    p.oval(x, y - 1, 4, c(m.leaves[0]), 2.5);
    p.oval(x, y - 2, 3, c(m.leaves[1]), 2);
    for (let i = rng.int(2, 4); i > 0; i--) {
        const fx = x + rng.int(-3, 3),
            fy = y - 2 + rng.int(-2, 1);
        p.set(fx, fy - 1, c(m.flower[0]));
        p.set(fx - 1, fy, c(m.flower[0]));
        p.set(fx + 1, fy, c(m.flower[0]));
        p.set(fx, fy + 1, c(m.flower[0]));
        p.set(fx, fy, c(m.flower[1]));
    }
}

/** A round shrub, outlined, lit from the upper left. */
function bush(p: Pix, x: number, y: number, c: Paint, m: MapTheme, rng: Rng): void {
    const r = rng.int(3, 5);
    p.oval(x + 1, y, r, c(m.top[2]), r * 0.35);
    p.oval(x, y - r * 0.7, r + 1, c(m.ink), r * 0.8 + 1);
    p.oval(x, y - r * 0.7, r, c(m.leaves[0]), r * 0.8);
    p.oval(x - 1, y - r * 0.9, r * 0.7, c(m.leaves[1]), r * 0.55);
    p.oval(x - r * 0.4, y - r * 1.1, r * 0.3, c(m.leaves[2]), r * 0.25);
}

/** A spike of pink lupine flowers. */
function lupine(p: Pix, x: number, y: number, c: Paint, m: MapTheme): void {
    p.oval(x, y - 1, 2.5, c(m.leaves[0]), 1.5);
    for (let k = 0; k < 6; k++) {
        p.set(x, y - 2 - k, c(k % 2 ? '#f2a8d8' : '#d870b4'));
        if (k < 4) p.set(x + (k % 2 ? -1 : 1), y - 2 - k, c('#e88ac6'));
    }
}

/** A lavender boulder. */
function rock(p: Pix, x: number, y: number, r: number, c: Paint, m: MapTheme): void {
    p.oval(x, y - r * 0.6, r + 1, c(m.ink), r * 0.75 + 1);
    p.oval(x, y - r * 0.6, r, c('#7a72b0'), r * 0.75);
    p.oval(x - 1, y - r * 0.8, r * 0.75, c('#a49cd4'), r * 0.5);
    p.oval(x - r * 0.4, y - r, r * 0.3, c('#d4cef2'), r * 0.2);
}

/** A little cone spire, lit on its left side. */
function cone(p: Pix, x: number, y: number, h: number, c: Paint, m: MapTheme): void {
    const w = Math.round(h * 0.42);
    for (let k = 0; k < h; k++) {
        const half = Math.round(((k + 1) / h) * w);
        for (let i = -half; i <= half; i++) p.set(x + i, y - h + k, c(i <= 0 ? m.cone[0] : m.cone[1]));
        p.set(x - half - 1, y - h + k, c(m.ink));
        p.set(x + half + 1, y - h + k, c(m.ink));
    }
    p.set(x, y - h - 1, c(m.ink));
}

/** A pond set into the grass, with lily pads; if it spills, a channel runs to the front edge for a waterfall. */
function pond(
    p: Pix,
    x: number,
    y: number,
    rx: number,
    c: Paint,
    m: MapTheme,
    front: Int16Array,
    falls: { x: number; y: number }[],
    spills: boolean,
): void {
    const ry = Math.max(2, Math.round(rx * 0.5));
    const [deep, body, light] = m.water.map(c);
    p.oval(x, y, rx + 1, c(m.ink), ry + 1);
    p.oval(x, y, rx, deep, ry);
    p.oval(x, y + 0.5, rx - 1, body, ry - 0.5);
    p.oval(x - rx * 0.3, y - ry * 0.3, rx * 0.4, light, ry * 0.3);
    p.oval(x + rx * 0.35, y + ry * 0.1, 1.5, c(m.leaves[1]));
    p.oval(x - rx * 0.5, y + ry * 0.3, 1.2, c(m.leaves[1]));
    p.set(x + rx * 0.35, y - ry * 0.2, c(m.flower[0]));
    if (spills && front[x] > y) {
        for (let k = y + ry; k <= front[x]; k++) {
            p.set(x - 1, k, body);
            p.set(x, k, light);
            p.set(x + 1, k, body);
        }
        falls.push({ x, y: front[x] + 1 });
    }
}

/** A path of pale stepping stones across the top, from the front edge toward the back. */
function path(p: Pix, x: number, onTop: (x: number, y: number) => boolean, c: Paint, rng: Rng): void {
    let y = p.h - 1;
    while (y > 0 && !onTop(x, y)) y--;
    for (y -= 2; y > 0 && onTop(x, y - 3); y -= 4) {
        if (!onTop(x - 2, y) || !onTop(x + 3, y)) continue;
        p.rect(x - 2, y - 2, 5, 3, c('#cbbfdc'));
        p.rect(x - 2, y, 5, 1, c('#9a8cba'));
        p.set(x - 1, y - 2, c('#ece4f6'));
        x += rng.int(-1, 1);
    }
}

/** A wooden fence along part of the back edge. */
function fence(p: Pix, W: number, onTop: (x: number, y: number) => boolean, c: Paint, m: MapTheme, rng: Rng): void {
    const start = rng.int(Math.round(W * 0.15), Math.round(W * 0.5)),
        len = rng.int(10, Math.max(11, Math.round(W * 0.35)));
    for (let x = start; x < start + len; x++) {
        let y = 0;
        while (y < p.h && !onTop(x, y)) y++;
        if (y >= p.h) continue;
        y += 2;
        if ((x - start) % 5 === 0) {
            p.rect(x, y - 6, 2, 6, c('#a8743a'));
            p.set(x, y - 6, c('#e0a85a'));
            p.set(x + 2, y - 5, c(m.ink));
        }
        p.set(x, y - 4, c('#c48a44'));
        p.set(x, y - 2, c('#c48a44'));
    }
}

/** A stone cottage with a round, scalloped roof, windows and a chimney. */
function cottage(p: Pix, x: number, y: number, c: Paint, m: MapTheme): void {
    const ink = c(m.ink);
    p.rect(x - 9, y - 11, 18, 12, ink);
    p.rect(x - 8, y - 10, 16, 10, c('#eadcc0'));
    for (let j = 0; j < 10; j += 3)
        for (let i = (j % 2) * 2; i < 16; i += 5) p.set(x - 8 + i, y - 10 + j, c('#c8b490'));
    p.rect(x - 6, y - 8, 4, 4, c('#8a5a2c'));
    p.rect(x - 5, y - 7, 2, 2, c('#3c3440'));
    p.rect(x + 2, y - 8, 4, 4, c('#8a5a2c'));
    p.rect(x + 3, y - 7, 2, 2, c('#3c3440'));
    const [light, body, dark] = m.roof.map(c);
    p.oval(x, y - 13, 13, ink, 8);
    p.oval(x, y - 13, 12, body, 7);
    for (let j = -5; j <= 4; j += 3)
        for (let i = -11 + (j % 2 ? 2 : 0); i <= 11; i += 4)
            if ((i / 12) ** 2 + (j / 7) ** 2 < 0.85) p.set(x + i, y - 13 + j, dark);
    p.oval(x - 5, y - 17, 4, light, 2);
    p.rect(x + 5, y - 23, 3, 5, c('#c4604a'));
    p.rect(x + 5, y - 24, 3, 1, ink);
}

/** A puffy cloud: overlapping lumps with a billowing top, lit above and shaded underneath. */
export function paintCloud(seed: number, w: number, f: Fade, m: MapTheme): HTMLCanvasElement {
    const rng = new Rng(seed);
    const c = palette(m, f);
    const h = Math.round(w * rng.range(0.35, 0.5));
    const p = new Pix(w + 8, h + 8);
    const base = h + 5;
    // Lumps sit on a flat base, small at the ends and tall in the middle, so the cloud rises in a dome.
    const lumps: [number, number, number][] = [];
    const n = Math.max(3, Math.round(w / 9));
    for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const r = Math.max(2, h * (0.14 + 0.42 * Math.sin(Math.PI * t)) * rng.range(0.75, 1.1));
        lumps.push([4 + t * w, base - r, r]);
    }
    // Smaller puffs billowing from the upper half of the big ones.
    for (let i = 0; i < n; i++) {
        const [x, y, r] = lumps[rng.int(0, n - 1)];
        const a = rng.range(Math.PI * 1.15, Math.PI * 1.85);
        lumps.push([x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.6, r * rng.range(0.35, 0.55)]);
    }
    const [lit, body, shade] = m.cloud.map(c);
    for (const [x, y, r] of lumps) p.oval(x, y, r, shade);
    for (const [x, y, r] of lumps) p.oval(x + r * 0.1, y - r * 0.15, r * 0.88, body);
    for (const [x, y, r] of lumps) p.oval(x - r * 0.2, y - r * 0.35, r * 0.5, lit);
    return p.canvas();
}

/** A smooth pseudo-random value in [0, 1) for world position (x, y): value noise from a hashed grid. */
function noise(x: number, y: number, seed: number): number {
    /** A grid point's random value. */
    const at = (ix: number, iy: number) => {
        let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ seed;
        h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
        return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
    };
    const ix = Math.floor(x),
        iy = Math.floor(y);
    const fx = x - ix,
        fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx),
        sy = fy * fy * (3 - 2 * fy);
    const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
    const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
    return a + (b - a) * sy;
}

/** Three octaves of `noise`, for terrain with large shapes and fine detail. */
function fbm(x: number, y: number, seed: number): number {
    return (
        noise(x, y, seed) * 0.57 + noise(x * 2.1, y * 2.1, seed + 7) * 0.29 + noise(x * 4.3, y * 4.3, seed + 13) * 0.14
    );
}

/**
 * Paint a band of a ground map's terrain, `w` wide and `h` tall, whose bottom edge sits `wy` world units up.
 * Everything comes from world position alone, so neighbouring bands meet without a seam.
 */
export function paintGround(m: MapTheme, seed: number, wy: number, w: number, h: number): HTMLCanvasElement {
    const p = new Pix(w, h);
    const c = palette(m, 0);
    const [hi, body, tex, edge] = m.top.map(c);
    const [deep, water, light] = m.water.map(c);
    const abyss = c(m.sky[0]),
        ink = c(m.ink),
        leaf = m.leaves.map(c);
    for (let y = 0; y < h; y++) {
        const Y = wy + (h - 1 - y); // world height of this row
        for (let x = 0; x < w; x++) {
            const n = fbm(x / 70, Y / 55, seed);
            const dither = (x + Y) % 2 === 0 ? 0.012 : -0.012;
            let col: number;
            switch (m.ground) {
                case 'sand': {
                    // Dunes in bands of shade, with wind ripples curving across them.
                    const v = n + dither;
                    col = v < 0.36 ? edge : v < 0.47 ? tex : v < 0.66 ? body : hi;
                    const rip = Math.sin((Y + n * 46) * 0.55 + x * 0.04);
                    if (rip > 0.97) col = v < 0.47 ? body : hi;
                    else if (rip < -0.985) col = v < 0.47 ? edge : tex;
                    // Now and then an oasis: water ringed with damp, darker sand.
                    const oasis = fbm(x / 40, Y / 40, seed + 99);
                    if (oasis > 0.78) col = oasis > 0.81 ? (oasis > 0.84 ? light : water) : deep;
                    else if (oasis > 0.765) col = edge;
                    break;
                }
                case 'rock': {
                    // Cave floor: stone with cracks, dark chasms and glowing pools.
                    const v = n + dither;
                    col = v < 0.4 ? edge : v < 0.52 ? tex : v < 0.66 ? body : hi;
                    const ridge = Math.abs(fbm(x / 26, Y / 26, seed + 3) - 0.5);
                    if (ridge < 0.012) col = ink;
                    const pit = fbm(x / 48, Y / 48, seed + 51);
                    if (pit < 0.28) col = pit < 0.26 ? abyss : ink;
                    else if (pit > 0.75) col = pit > 0.79 ? light : pit > 0.77 ? water : deep;
                    break;
                }
                case 'tiles': {
                    // A courtyard of flagstones, each its own shade, with garden beds of hedge between.
                    const row = Math.floor(Y / 7),
                        tx = Math.floor((x + (row % 2) * 5) / 10);
                    const joint = Y % 7 === 0 || (x + (row % 2) * 5) % 10 === 0;
                    const shade = noise(tx * 1.7, row * 1.3, seed + 5);
                    col = joint ? tex : Y % 7 === 6 ? hi : shade < 0.35 ? tex : shade < 0.8 ? body : hi;
                    const bed = fbm(x / 50, Y / 50, seed + 21);
                    if (bed > 0.7) col = bed > 0.72 ? ((x + Y) % 3 === 0 ? leaf[2] : leaf[1]) : leaf[0];
                    if (bed > 0.66 && bed <= 0.7) col = edge;
                    break;
                }
                default: {
                    const v = n + dither;
                    col = v < 0.42 ? tex : v < 0.7 ? body : hi;
                }
            }
            p.set(x, y, col);
        }
    }
    return p.canvas();
}

/**
 * Paint one standing prop on its own, `s` times its usual size, anchored at the middle of its base: the big things
 * of a ground map (palms, towers, crystals…), drawn standing on the terrain.
 */
export function paintProp(kind: Prop, seed: number, m: MapTheme, s: number): Painted {
    const rng = new Rng(seed);
    const c = palette(m, 0);
    const W = Math.round(46 * s + 16),
        H = Math.round(62 * s + 16);
    const p = new Pix(W, H);
    const cx = Math.round(W / 2),
        cy = H - 6;
    prop(kind, p, cx, cy, Math.round(7 * s), c, m, rng, s);
    return { canvas: p.canvas(), cx, cy, falls: [], left: { x: cx, y: cy }, right: { x: cx, y: cy } };
}
