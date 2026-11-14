// The endless sky behind each meadow: a floating-island forest that scrolls down past the meadow as the round goes
// on, so the fairy seems to keep climbing. Three parallax layers (far, mid, near), each cut into horizontal bands
// ("cells") of world height. What a cell holds is worked out from the round's seed and the cell's number alone, so
// it's always the same (nothing pops) and never runs out; the sprites are painted once when a cell comes near and
// dropped again once it's long gone. It's only scenery: nothing here touches the game.
import { Rng } from '@/core/rng';
import { SCENERY_STRIPS } from '@/data/scenery';
import type { IslandSpec, Painted } from '@/types';
import { paintCloud, paintIsland, paintSpire } from './paint';

/** The three layers, back to front. */
type LayerName = 'far' | 'mid' | 'near';

/** How each layer moves and how tall its cells are, in world units. */
const LAYERS: Record<LayerName, { speed: number; cellH: number }> = {
    far: { speed: 0.22, cellH: 130 },
    mid: { speed: 0.55, cellH: 170 },
    near: { speed: 1, cellH: 240 },
};
const ORDER: LayerName[] = ['far', 'mid', 'near'];

/** How fast the near layer climbs, in meadow units a second. */
const CLIMB = 16;
/** How far past the top and bottom of the view cells are worked out (and their sprites painted ahead of time). */
const AHEAD = 320;
const BEHIND = 60;
/** Sprites painted per frame at most, so a busy stretch never hitches a frame. */
const PAINT_BUDGET = 2;
/** Sprites and cells kept after they were last needed, in frames, before they're let go. */
const KEEP_FRAMES = 900;

/** One thing in a cell: an island, a cloud or a distant spire. */
interface Item {
    kind: 'island' | 'cloud' | 'spire';
    /** Across the meadow, as a share of its width (a near island can sit partly off the side). */
    x: number;
    /** Up from the bottom of its cell, in world units. */
    y: number;
    /** How to paint it (only called once, when it first comes near). */
    paint: () => Painted;
    /** For each waterfall, how far it falls. */
    fallLen: number[];
    /** Sideways drift, meadow units a second (clouds only). */
    drift: number;
    alpha: number;
    /** A bridge to another island in the same cell, by index. */
    bridgeTo: number;
}

/** A painted sprite and when it was last drawn. */
interface Cached {
    art: Painted | null;
    used: number;
}

/** A tiny integer hash, so every (seed, layer, cell) gets its own stream of numbers. */
function hash(a: number, b: number, c: number): number {
    let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35) ^ Math.imul(c, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    return (h ^ (h >>> 13)) >>> 0;
}

/** A painted sprite as a Painted with no anchors (clouds and spires are drawn from their top-left). */
const plain = (canvas: HTMLCanvasElement): Painted => ({
    canvas,
    cx: canvas.width / 2,
    cy: 0,
    falls: [],
    left: { x: 0, y: 0 },
    right: { x: 0, y: 0 },
});

/** The sky scenery, shared by every meadow drawn this frame (each passes its own seed and climb). */
export class SkyScenery {
    private cells = new Map<string, { items: Item[]; used: number }>();
    private art = new Map<string, Cached>();
    private frame = 0;
    private painted = 0;
    private strips: HTMLImageElement[] = SCENERY_STRIPS.map(src => {
        const img = new Image();
        img.src = src;
        return img;
    });
    /** Glowing motes: where each sits (as shares of the meadow), its size and twinkle phase. */
    private motes = Array.from({ length: 22 }, (_, i) => {
        const r = new Rng(hash(7, i, 99));
        return { x: r.next(), y: r.next(), s: r.range(0.5, 1.4), p: r.range(0, 6), v: r.range(0.4, 1) };
    });

    /** Start a frame: the paint budget refills, and long-unused sprites and cells are let go. */
    beginFrame(): void {
        this.frame++;
        this.painted = 0;
        if (this.frame % 120 !== 0) return;
        const old = this.frame - KEEP_FRAMES;
        for (const [k, v] of this.art) if (v.used < old) this.art.delete(k);
        for (const [k, v] of this.cells) if (v.used < old) this.cells.delete(k);
    }

    /**
     * Paint the sky behind a meadow `w` × `h`: `seed` picks the world, `time` (seconds into the round) how far
     * it has climbed, and `clock` drives the animation (waterfalls, drifting clouds, twinkling motes).
     */
    draw(ctx: CanvasRenderingContext2D, seed: number, time: number, clock: number, w: number, h: number): void {
        const climb = time * CLIMB;
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        if (!this.drawStrips(ctx, climb * LAYERS.far.speed, w, h)) {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, '#3a6cc4');
            g.addColorStop(0.55, '#6ea6e2');
            g.addColorStop(1, '#a6d2f0');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            this.layer(ctx, seed, 'far', climb, clock, w, h);
        }
        this.layer(ctx, seed, 'mid', climb, clock, w, h);
        this.drawMotes(ctx, climb, clock, w, h);
        this.layer(ctx, seed, 'near', climb, clock, w, h);
        ctx.imageSmoothingEnabled = smooth;
        // A soft veil over it all keeps the fairies, critters and fireballs the brightest things on screen.
        const v = ctx.createLinearGradient(0, 0, 0, h);
        v.addColorStop(0, 'rgba(20,14,56,0.42)');
        v.addColorStop(0.18, 'rgba(20,14,56,0.24)');
        v.addColorStop(0.8, 'rgba(20,14,56,0.24)');
        v.addColorStop(1, 'rgba(20,14,56,0.45)');
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
    }

    /** The far layer from the painted strip images, if any are listed and loaded; false to paint it instead. */
    private drawStrips(ctx: CanvasRenderingContext2D, a: number, w: number, h: number): boolean {
        const imgs = this.strips;
        if (!imgs.length || !imgs.every(i => i.complete && i.naturalWidth)) return false;
        // The strip's images stacked bottom to top, each scaled to the meadow's width.
        const hs = imgs.map(i => (i.naturalHeight * w) / i.naturalWidth);
        const total = hs.reduce((s, x) => s + x, 0);
        const base = Math.floor(a / total) * total;
        for (let lap = base - total; lap <= a + h; lap += total) {
            let s = lap;
            imgs.forEach((img, i) => {
                // World altitude s..s+hs[i] shows at screen y from h-(s+hs[i]-a) down.
                const top = h - (s + hs[i] - a);
                if (top < h && top + hs[i] > 0) ctx.drawImage(img, 0, Math.floor(top), w, Math.ceil(hs[i]) + 1);
                s += hs[i];
            });
        }
        return true;
    }

    /** Draw one layer: every cell near the view, its sprites, waterfalls and bridges. */
    private layer(
        ctx: CanvasRenderingContext2D,
        seed: number,
        name: LayerName,
        climb: number,
        clock: number,
        w: number,
        h: number,
    ): void {
        const L = LAYERS[name];
        const a = climb * L.speed;
        const k0 = Math.floor((a - BEHIND) / L.cellH),
            k1 = Math.floor((a + h + AHEAD) / L.cellH);
        for (let k = k0; k <= k1; k++) {
            const items = this.cell(seed, name, k);
            const spots: ({ x: number; y: number; art: Painted } | null)[] = [];
            items.forEach((it, i) => {
                const art = this.sprite(`${seed}|${name}|${k}|${i}`, it);
                if (!art) return void spots.push(null);
                let x = it.x * w;
                if (it.drift) {
                    // Clouds drift sideways and wrap around the meadow.
                    const cw = art.canvas.width,
                        span = w + cw;
                    x = ((((x + it.drift * clock + cw / 2) % span) + span) % span) - cw / 2;
                }
                const y = h - (k * L.cellH + it.y - a);
                const dx = Math.round(x - art.cx),
                    dy = Math.round(y - art.cy);
                spots.push({ x: dx, y: dy, art });
                if (dy > h || dy + art.canvas.height + Math.max(0, ...it.fallLen) < 0) return;
                if (dx > w || dx + art.canvas.width < 0) return;
                // Waterfalls pour from behind the island's lip, so they're drawn first.
                it.fallLen.forEach((len, j) => {
                    const f = art.falls[j];
                    if (f) waterfall(ctx, dx + f.x, dy + f.y, len, name === 'far' ? 2 : name === 'mid' ? 3 : 4, clock);
                });
                ctx.globalAlpha = it.alpha;
                ctx.drawImage(art.canvas, dx, dy);
                ctx.globalAlpha = 1;
            });
            items.forEach((it, i) => {
                const a1 = spots[i],
                    b1 = it.bridgeTo >= 0 ? spots[it.bridgeTo] : null;
                if (a1 && b1)
                    bridge(
                        ctx,
                        a1.x + a1.art.right.x,
                        a1.y + a1.art.right.y,
                        b1.x + b1.art.left.x,
                        b1.y + b1.art.left.y,
                    );
            });
        }
    }

    /** A cell's contents, worked out once from (seed, layer, cell) and kept while it's in use. */
    private cell(seed: number, name: LayerName, k: number): Item[] {
        const key = `${seed}|${name}|${k}`;
        let c = this.cells.get(key);
        if (!c) {
            c = { items: plan(new Rng(hash(seed, ORDER.indexOf(name) + 1, k)), name, L(name).cellH), used: 0 };
            this.cells.set(key, c);
        }
        c.used = this.frame;
        return c.items;
    }

    /** An item's sprite, painted the first time it's needed (within this frame's budget). */
    private sprite(key: string, it: Item): Painted | null {
        let c = this.art.get(key);
        if (!c) {
            if (this.painted >= PAINT_BUDGET) return null;
            this.painted++;
            c = { art: it.paint(), used: 0 };
            this.art.set(key, c);
        }
        c.used = this.frame;
        return c.art;
    }

    /** Glowing motes drifting through the middle distance. */
    private drawMotes(ctx: CanvasRenderingContext2D, climb: number, clock: number, w: number, h: number): void {
        const a = climb * 0.75;
        ctx.fillStyle = '#fff4b0';
        for (const m of this.motes) {
            const y = (((m.y * h + a * m.v + clock * 4 * m.v) % h) + h) % h;
            const x = m.x * w + Math.sin(clock * 0.7 + m.p) * 5;
            ctx.globalAlpha = 0.25 + 0.3 * Math.sin(clock * 2.2 + m.p);
            const s = m.s;
            ctx.fillRect(Math.round(x), Math.round(y), s > 1 ? 2 : 1, s > 1 ? 2 : 1);
        }
        ctx.globalAlpha = 1;
    }
}

/** A layer's settings. */
const L = (name: LayerName) => LAYERS[name];

/** Decide what a cell holds: sizes, places and what grows on each island, all from its own random stream. */
function plan(r: Rng, name: LayerName, cellH: number): Item[] {
    const items: Item[] = [];
    const seedOf = () => Math.floor(r.next() * 2 ** 31);
    /** An island item with features rolled for this layer. */
    const island = (x: number, y: number, spec: IslandSpec, falls: number[], alpha = 1): Item => ({
        kind: 'island',
        x,
        y,
        paint: () => paintIsland(spec),
        fallLen: falls,
        drift: 0,
        alpha,
        bridgeTo: -1,
    });
    /** A cloud item. */
    const cloud = (x: number, y: number, cw: number, fade: number, drift: number, alpha: number): Item => {
        const s = seedOf();
        return {
            kind: 'cloud',
            x,
            y,
            paint: () => plain(paintCloud(s, cw, fade)),
            fallLen: [],
            drift,
            alpha,
            bridgeTo: -1,
        };
    };
    /** The rest of an island's spec, rolled. */
    const spec = (w: number, fade: number, rich: boolean): IslandSpec => ({
        seed: seedOf(),
        w,
        depth: r.range(0.45, 0.78),
        fade,
        trees: rich ? r.int(1, Math.max(1, Math.round(w / 22))) : r.int(0, 2),
        pines: r.next() < 0.4,
        cottage: rich && r.next() < 0.18,
        ruins: rich && r.next() < 0.16,
        pond: rich && r.next() < 0.25,
        falls: r.next() < (rich ? 0.5 : 0.3) ? (r.next() < 0.25 ? 2 : 1) : 0,
        vines: r.next() < 0.5,
    });

    if (name === 'far') {
        for (let i = r.int(1, 2); i > 0; i--)
            items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(50, 120)), 0.35, r.range(-2.5, 2.5), 0.8));
        for (let i = r.int(0, 2); i > 0; i--) {
            const s = spec(Math.round(r.range(16, 40)), 0.55, false);
            items.push(island(r.next(), r.range(10, cellH), s, falls(s.falls, 18, 45, r)));
        }
        if (r.next() < 0.25) {
            const s = seedOf(),
                sw = Math.round(r.range(9, 18));
            items.push({
                kind: 'spire',
                x: r.next(),
                y: r.range(0, cellH),
                paint: () => plain(paintSpire(s, sw, 0.55)),
                fallLen: [],
                drift: 0,
                alpha: 1,
                bridgeTo: -1,
            });
        }
        return items;
    }

    if (name === 'mid') {
        const n = r.next() < 0.15 ? 0 : r.next() < 0.55 ? 1 : 2;
        const ys: number[] = [];
        for (let i = 0; i < n; i++) {
            const x = n === 2 ? (i === 0 ? r.range(0.1, 0.36) : r.range(0.64, 0.9)) : r.range(0.15, 0.85);
            const y = i === 1 && r.next() < 0.5 ? ys[0] + r.range(-12, 12) : r.range(20, cellH);
            ys.push(y);
            const s = spec(Math.round(r.range(46, 100)), 0.28, true);
            items.push(island(x, y, s, falls(s.falls, 40, 110, r)));
        }
        // Two islands at about the same height can be joined by a rope bridge.
        if (n === 2 && Math.abs(ys[0] - ys[1]) < 14 && r.next() < 0.55) items[0].bridgeTo = 1;
        if (r.next() < 0.3)
            items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(60, 110)), 0.15, r.range(-4, 4), 0.55));
        return items;
    }

    // Near: big islands that pass by at the sides, leaving the middle of the meadow clear for play.
    if (r.next() < 0.62) {
        const left = r.next() < 0.5;
        const x = left ? r.range(-0.14, 0.06) : r.range(0.94, 1.14);
        const s = spec(Math.round(r.range(90, 150)), 0, true);
        s.cottage = false;
        items.push(island(x, r.range(30, cellH), s, falls(s.falls, 60, 140, r), 0.95));
    }
    if (r.next() < 0.35)
        items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(80, 150)), 0, r.range(-6, 6), 0.32));
    return items;
}

/** `n` waterfall lengths between `a` and `b`. */
function falls(n: number, a: number, b: number, r: Rng): number[] {
    return Array.from({ length: n }, () => Math.round(r.range(a, b)));
}

/** A waterfall `width` wide falling `len` from (x, y): bright streaks running down, misting out at the bottom. */
function waterfall(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, width: number, t: number): void {
    const x0 = Math.round(x - width / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + len);
    g.addColorStop(0, 'rgba(150,214,255,0.95)');
    g.addColorStop(0.7, 'rgba(170,224,255,0.7)');
    g.addColorStop(1, 'rgba(200,236,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x0, Math.round(y), width, Math.round(len));
    // Streaks of white running down it.
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < width; i++) {
        const off = (t * 38 + i * 7) % 9;
        for (let s = off; s < len * 0.8; s += 9) ctx.fillRect(x0 + i, Math.round(y + s), 1, 3);
    }
    // A puff of spray where it thins out.
    ctx.fillStyle = 'rgba(235,248,255,0.35)';
    const by = Math.round(y + len * 0.82);
    ctx.fillRect(x0 - 1, by, width + 2, 2);
    ctx.fillRect(x0 - 2 + Math.round(Math.sin(t * 3) * 1), by + 3, width + 4, 1);
}

/** A rope bridge of planks from (x0, y0) to (x1, y1), sagging in the middle. */
function bridge(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0)));
    const sag = Math.min(8, n * 0.12);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = Math.round(x0 + (x1 - x0) * t),
            y = Math.round(y0 + (y1 - y0) * t + Math.sin(Math.PI * t) * sag);
        ctx.fillStyle = i % 3 === 0 ? '#5a3a24' : '#9a6a3c';
        ctx.fillRect(x, y, 1, 2);
        ctx.fillStyle = '#c9a77a';
        ctx.fillRect(x, y - 4 + Math.round(Math.sin(Math.PI * t) * -1), 1, 1);
    }
    ctx.fillStyle = '#5a3a24';
    ctx.fillRect(Math.round(x0), Math.round(y0) - 5, 1, 5);
    ctx.fillRect(Math.round(x1), Math.round(y1) - 5, 1, 5);
}
