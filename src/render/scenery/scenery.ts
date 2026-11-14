// The endless sky behind each meadow: a floating-island garden seen from above at an angle, scrolling down past the
// meadow as the round goes on, so the fairy seems to keep flying onward over it. Three parallax layers (far, mid, near), each cut into horizontal bands
// ("cells") of world height. What a cell holds is worked out from the round's seed and the cell's number alone, so
// it's always the same (nothing pops) and never runs out; the sprites are painted once when a cell comes near and
// dropped again once it's long gone. It's only scenery: nothing here touches the game.
import { Rng } from '@/core/rng';
import { MAPS } from '@/data/maps';
import { SCENERY_STRIPS } from '@/data/scenery';
import type { IslandSpec, MapTheme, Painted, Prop } from '@/types';
import { paintCloud, paintGround, paintIsland, paintProp } from './paint';

/** The three layers, back to front. */
type LayerName = 'far' | 'mid' | 'near';

/** How each layer moves and how tall its cells are, in world units. */
const LAYERS: Record<LayerName, { speed: number; cellH: number }> = {
    far: { speed: 0.3, cellH: 110 },
    mid: { speed: 0.62, cellH: 150 },
    near: { speed: 1, cellH: 230 },
};
const ORDER: LayerName[] = ['far', 'mid', 'near'];

/** How fast the near layer climbs, in meadow units a second. */
const CLIMB = 16;
/** How far past the top and bottom of the view cells are worked out (and their sprites painted ahead of time). */
const AHEAD = 320;
const BEHIND = 60;
/** Sprites painted per frame at most, so a busy stretch never hitches a frame. */
const PAINT_BUDGET = 2;
/** How wide a band of ground is painted: enough for the widest meadow. */
const GROUND_W = 384;
/** Sprites and cells kept after they were last needed, in frames, before they're let go. */
const KEEP_FRAMES = 900;

/** One thing in a cell: an island, a cloud, or (on a ground map) something standing on the ground. */
interface Item {
    kind: 'island' | 'cloud' | 'prop';
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
    /** A soft pulsing light round it (crystals, glowing mushrooms, torches), and how far it reaches. */
    glow?: string;
    glowR?: number;
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

/** A painted cloud as a Painted, anchored at its top middle. */
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
    /** Sprites painted per frame at most (raised while a screen shows several maps at once). */
    budget = PAINT_BUDGET;
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
     * Paint the sky behind a meadow `w` × `h` in map `map`'s look: `seed` picks the world, `time` (seconds into
     * the round) how far it has come, and `clock` drives the animation (waterfalls, drifting clouds, motes).
     */
    draw(
        ctx: CanvasRenderingContext2D,
        seed: number,
        time: number,
        clock: number,
        w: number,
        h: number,
        map: MapTheme = MAPS[0],
    ): void {
        const climb = time * CLIMB;
        const smooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        if (map.terrain === 'ground') {
            // Solid ground far below, with big things standing on it, and haze drifting over it all.
            this.ground(ctx, seed, map, climb * LAYERS.mid.speed, w, h);
            this.layer(ctx, seed, map, 'mid', climb, clock, w, h);
            this.drawMotes(ctx, map.mote, climb, clock, w, h);
            this.layer(ctx, seed, map, 'near', climb, clock, w, h);
        } else if (!this.drawStrips(ctx, climb * LAYERS.far.speed, w, h)) {
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, map.sky[0]);
            g.addColorStop(1, map.sky[1]);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);
            this.layer(ctx, seed, map, 'far', climb, clock, w, h);
        }
        if (map.terrain !== 'ground') {
            this.layer(ctx, seed, map, 'mid', climb, clock, w, h);
            this.drawMotes(ctx, map.mote, climb, clock, w, h);
            this.layer(ctx, seed, map, 'near', climb, clock, w, h);
        }
        ctx.imageSmoothingEnabled = smooth;
        atmosphere(ctx, map, clock, w, h);
        // A soft veil over it all keeps the fairies, critters and fireballs the brightest things on screen.
        const v = ctx.createLinearGradient(0, 0, 0, h);
        const [edge, mid] = map.veil;
        v.addColorStop(0, `rgba(16,14,52,${edge})`);
        v.addColorStop(0.14, `rgba(16,14,52,${mid})`);
        v.addColorStop(0.84, `rgba(16,14,52,${mid})`);
        v.addColorStop(1, `rgba(16,14,52,${edge})`);
        ctx.fillStyle = v;
        ctx.fillRect(0, 0, w, h);
    }

    /**
     * A ground map's terrain: bands of ground one cell tall, painted from world position so they meet without a
     * seam. A band about to scroll into view is painted ahead within the frame's budget; one already in view is
     * painted at once, so there's never a gap.
     */
    private ground(ctx: CanvasRenderingContext2D, seed: number, map: MapTheme, a: number, w: number, h: number): void {
        const cellH = LAYERS.mid.cellH;
        ctx.fillStyle = map.top[1];
        ctx.fillRect(0, 0, w, h);
        const k0 = Math.floor(a / cellH),
            k1 = Math.floor((a + h + AHEAD) / cellH);
        for (let k = k0; k <= k1; k++) {
            const top = Math.round(h - ((k + 1) * cellH - a));
            const visible = top < h && top + cellH > 0;
            const key = `${map.id}|${seed}|ground|${k}`;
            let c = this.art.get(key);
            if (!c && (visible || this.painted < this.budget)) {
                this.painted++;
                c = { art: plain(paintGround(map, seed, k * cellH, GROUND_W, cellH)), used: 0 };
                this.art.set(key, c);
            }
            if (!c?.art) continue;
            c.used = this.frame;
            if (visible)
                ctx.drawImage(c.art.canvas, 0, 0, Math.min(w, GROUND_W), cellH, 0, top, Math.min(w, GROUND_W), cellH);
        }
        // The shadows of clouds high above, sliding over the ground a little faster than it scrolls.
        for (let i = 0; i < 3; i++) {
            const span = h + 260;
            const y = ((((i * 211 + a * 1.5) % span) + span) % span) - 130;
            const x = ((i * 0.39 + 0.15) % 1) * w + Math.sin(a * 0.004 + i * 2) * 30;
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(1.7, 1);
            const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 60);
            g.addColorStop(0, 'rgba(14,8,40,0.2)');
            g.addColorStop(1, 'rgba(14,8,40,0)');
            ctx.fillStyle = g;
            ctx.fillRect(-60, -60, 120, 120);
            ctx.restore();
        }
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
        map: MapTheme,
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
        // Top of the view first, so things lower down (nearer the viewer) overlap the ones above them.
        for (let k = k1; k >= k0; k--) {
            const items = this.cell(seed, map, name, k);
            const spots: ({ x: number; y: number; art: Painted } | null)[] = [];
            items.forEach((it, i) => {
                const art = this.sprite(`${map.id}|${seed}|${name}|${k}|${i}`, it);
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
                ctx.globalAlpha = it.alpha;
                ctx.drawImage(art.canvas, dx, dy);
                ctx.globalAlpha = 1;
                if (it.glow && it.glowR)
                    glow(ctx, dx + art.cx, dy + art.cy - art.canvas.height * 0.3, it.glowR, it.glow, clock + it.x * 9);
                // Waterfalls pour off the front edge, down over the cliff face and on into the sky below.
                it.fallLen.forEach((len, j) => {
                    const f = art.falls[j];
                    if (f) waterfall(ctx, dx + f.x, dy + f.y, len, name === 'far' ? 2 : name === 'mid' ? 3 : 4, clock);
                });
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
    private cell(seed: number, map: MapTheme, name: LayerName, k: number): Item[] {
        const key = `${map.id}|${seed}|${name}|${k}`;
        let c = this.cells.get(key);
        if (!c) {
            c = { items: plan(new Rng(hash(seed, ORDER.indexOf(name) + 1, k)), map, name, L(name).cellH), used: 0 };
            this.cells.set(key, c);
        }
        c.used = this.frame;
        return c.items;
    }

    /** An item's sprite, painted the first time it's needed (within this frame's budget). */
    private sprite(key: string, it: Item): Painted | null {
        let c = this.art.get(key);
        if (!c) {
            if (this.painted >= this.budget) return null;
            this.painted++;
            c = { art: it.paint(), used: 0 };
            this.art.set(key, c);
        }
        c.used = this.frame;
        return c.art;
    }

    /** Glowing motes drifting through the middle distance. */
    private drawMotes(
        ctx: CanvasRenderingContext2D,
        color: string,
        climb: number,
        clock: number,
        w: number,
        h: number,
    ): void {
        const a = climb * 0.75;
        ctx.fillStyle = color;
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

/** Decide what a cell holds: sizes, places and what's on each island, all from its own random stream. */
function plan(r: Rng, m: MapTheme, name: LayerName, cellH: number): Item[] {
    const items: Item[] = [];
    const seedOf = () => Math.floor(r.next() * 2 ** 31);
    /** An island item. */
    const island = (x: number, y: number, spec: IslandSpec, falls: number[], alpha = 1): Item => ({
        kind: 'island',
        x,
        y,
        paint: () => paintIsland(spec, m),
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
            paint: () => plain(paintCloud(s, cw, fade, m)),
            fallLen: [],
            drift,
            alpha: alpha * m.cloudAlpha,
            bridgeTo: -1,
        };
    };
    /** An island's spec: its size, and what's on it rolled from the map's odds (`rich`: the full set). */
    const spec = (w: number, fade: number, rich: boolean): IslandSpec => {
        const o = m.odds;
        return {
            seed: seedOf(),
            w,
            d: Math.round(w * r.range(0.4, 0.62)),
            cliff: Math.round(Math.max(6, w * r.range(0.16, 0.24))),
            fade,
            big: Math.max(rich ? 1 : 0, Math.round((w / 26) * sum(m.big) * r.range(0.6, 1.3))),
            small: Math.round(((w * w * 0.5) / 110) * Math.min(1, sum(m.small) / 4) * r.range(0.7, 1.2)),
            pond: rich && w > 50 && r.next() < o.pond,
            cottage: rich && w > 70 && r.next() < o.cottage,
            fence: rich && r.next() < o.fence,
            path: rich && r.next() < o.path,
            falls: r.next() < o.falls ? (r.next() < 0.3 ? 2 : 1) : 0,
        };
    };

    if (m.terrain === 'ground') return planGround(r, m, name, cellH, cloud, seedOf);

    if (name === 'far') {
        // The sea of clouds far below, and small islands down among it.
        for (let i = r.int(7, 10); i > 0; i--)
            items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(22, 70)), 0.06, r.range(-1.5, 1.5), 1));
        for (let i = r.next() < 0.7 ? r.int(1, 2) : 0; i > 0; i--) {
            const s = spec(Math.round(r.range(24, 46)), 0.4, false);
            items.push(island(r.next(), r.range(10, cellH), s, falls(s.falls, 20, 45, r)));
        }
        return items;
    }

    if (name === 'mid') {
        const n = r.next() < 0.3 ? 3 : 2;
        const ys: number[] = [];
        for (let i = 0; i < n; i++) {
            // Spread across the meadow: left, right, and a third somewhere between at another height.
            const x = i === 0 ? r.range(0.06, 0.32) : i === 1 ? r.range(0.68, 0.94) : r.range(0.35, 0.65);
            const y =
                i === 1 && r.next() < 0.5
                    ? ys[0] + r.range(-8, 8)
                    : i === 2
                      ? (ys[0] + cellH / 2 + r.range(-20, 20)) % cellH
                      : r.range(20, cellH);
            ys.push(y);
            const s = spec(Math.round(r.range(i === 2 ? 44 : 56, i === 2 ? 70 : 100)), 0.08, true);
            items.push(island(x, y, s, falls(s.falls, 40, 100, r)));
        }
        // Two islands at about the same height can be joined by a stone arch.
        if (n === 2 && Math.abs(ys[0] - ys[1]) < 10 && r.next() < 0.6) items[0].bridgeTo = 1;
        if (r.next() < 0.25)
            items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(40, 80)), 0.05, r.range(-4, 4), 0.6));
        return items;
    }

    // Near: big islands that pass by at the sides, leaving the middle of the meadow clear for play.
    for (const left of [true, false]) {
        if (r.next() > 0.45) continue;
        const x = left ? r.range(-0.12, 0.08) : r.range(0.92, 1.12);
        const s = spec(Math.round(r.range(80, 130)), 0, true);
        s.cottage = s.cottage && r.next() < 0.5;
        items.push(island(x, r.range(30, cellH), s, falls(s.falls, 70, 150, r), 0.96));
    }
    if (r.next() < 0.3)
        items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(70, 130)), 0, r.range(-6, 6), 0.3));
    giant(items, r, m, cellH, seedOf);
    return items;
}

/** A ground map's cell: big and small things standing on the ground (mid), or haze drifting over it (near). */
function planGround(
    r: Rng,
    m: MapTheme,
    name: LayerName,
    cellH: number,
    cloud: (x: number, y: number, cw: number, fade: number, drift: number, alpha: number) => Item,
    seedOf: () => number,
): Item[] {
    const items: Item[] = [];
    if (name === 'mid') {
        /** Something standing at a random spot, picked from `table`, `scale` times its usual size. */
        const add = (table: Partial<Record<Prop, number>>, scale: number) => {
            const kind = weighted(table, r);
            if (!kind) return;
            const s = seedOf();
            items.push({
                kind: 'prop',
                x: r.range(-0.05, 1.05),
                y: r.range(0, cellH),
                paint: () => paintProp(kind, s, m, scale),
                fallLen: [],
                drift: 0,
                alpha: 1,
                bridgeTo: -1,
                glow: glowOf(kind, m),
                glowR: scale * 9,
            });
        };
        for (let i = r.int(2, 4); i > 0; i--) add(m.big, r.range(2.2, 3.4));
        for (let i = r.int(3, 6); i > 0; i--) add(m.small, r.range(1.3, 1.8));
        // Back to front, so nearer things overlap farther ones.
        items.sort((a, b) => b.y - a.y);
    } else if (name === 'near') {
        for (let i = r.int(1, 3); i > 0; i--)
            items.push(cloud(r.next(), r.range(0, cellH), Math.round(r.range(100, 190)), 0, r.range(-4, 4), 0.6));
        giant(items, r, m, cellH, seedOf);
    }
    return items;
}

/**
 * Now and then, a giant faint shape passing close by at one side (a huge palm, tree, crystal or tower), hazy and
 * see-through, for depth: the big soft silhouettes of a classic arcade backdrop.
 */
function giant(items: Item[], r: Rng, m: MapTheme, cellH: number, seedOf: () => number): void {
    if (!m.mood.giants.length || r.next() > 0.32) return;
    const kind = m.mood.giants[r.int(0, m.mood.giants.length - 1)];
    const s = seedOf(),
        scale = r.range(4.6, 6.2);
    items.push({
        kind: 'prop',
        x: r.next() < 0.5 ? r.range(-0.12, 0.06) : r.range(0.94, 1.12),
        y: r.range(0, cellH),
        paint: () => paintProp(kind, s, m, scale, 0.45),
        fallLen: [],
        drift: 0,
        alpha: 0.32,
        bridgeTo: -1,
    });
}

/** The light a prop gives off, if it glows. */
function glowOf(kind: Prop, m: MapTheme): string | undefined {
    return kind === 'crystal'
        ? m.cone[0]
        : kind === 'glowshroom'
          ? m.leaves[2]
          : kind === 'torch'
            ? '#ffb04a'
            : undefined;
}

/** Soft round lights, one painted per colour and reused, scaled to each glow. */
const glowSprites = new Map<string, HTMLCanvasElement>();

/** A soft pulsing light of colour `color` at (x, y), reaching `r`. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, t: number): void {
    let sprite = glowSprites.get(color);
    if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const gc = sprite.getContext('2d')!;
        const g = gc.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        gc.fillStyle = g;
        gc.fillRect(0, 0, 64, 64);
        glowSprites.set(color, sprite);
    }
    const rr = r * (1 + 0.12 * Math.sin(t * 2.4));
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.32;
    ctx.drawImage(sprite, x - rr, y - rr, rr * 2, rr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = op;
}

/** The map's mood over everything: slow light rays, the odd flock of birds or bats crossing, and a colour tint. */
function atmosphere(ctx: CanvasRenderingContext2D, m: MapTheme, clock: number, w: number, h: number): void {
    const mood = m.mood;
    if (mood.rays > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const x = w * (0.15 + 0.32 * i) + Math.sin(clock * 0.18 + i * 1.7) * 18;
            const bw = 26 + 14 * Math.sin(clock * 0.31 + i);
            const g = ctx.createLinearGradient(0, 0, 0, h);
            g.addColorStop(0, `rgba(255,248,220,${mood.rays})`);
            g.addColorStop(1, 'rgba(255,248,220,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x + bw, 0);
            ctx.lineTo(x + bw + h * 0.45, h);
            ctx.lineTo(x + h * 0.45 - bw * 0.5, h);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
    if (mood.flyers !== 'none') {
        // A flock crosses for six seconds out of every fifteen, in a V, flapping.
        const cycle = 15,
            n = Math.floor(clock / cycle),
            t = (clock % cycle) / 6;
        if (t < 1) {
            const fromLeft = n % 2 === 0;
            const bats = mood.flyers === 'bats';
            const y0 = h * (0.25 + ((n * 0.37) % 0.5)) - t * h * 0.2;
            ctx.fillStyle = bats ? 'rgba(30,18,60,0.85)' : 'rgba(40,30,70,0.7)';
            for (let i = 0; i < 5; i++) {
                const row = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
                const x =
                    (fromLeft ? -20 + t * (w + 40) : w + 20 - t * (w + 40)) - Math.abs(row) * 7 * (fromLeft ? 1 : -1);
                const y = y0 + row * 6 + Math.sin(clock * 3 + i) * 1.5;
                const wing = Math.floor(clock * (bats ? 12 : 7) + i) % 2 === 0 ? -1 : 1;
                const px = Math.round(x),
                    py = Math.round(y);
                ctx.fillRect(px - 1, py, 3, 1);
                ctx.fillRect(px - 3, py + wing, 2, 1);
                ctx.fillRect(px + 2, py + wing, 2, 1);
                if (bats) ctx.fillRect(px, py - 1, 1, 1);
            }
        }
    }
    ctx.fillStyle = mood.tint;
    ctx.fillRect(0, 0, w, h);
}

/** A key from a table of weights, picked at random, or null if the table is empty. */
function weighted<K extends string>(table: Partial<Record<K, number>>, r: Rng): K | null {
    const entries = Object.entries(table) as [K, number][];
    let roll = r.next() * sum(table);
    for (const [k, w] of entries) if ((roll -= w) <= 0) return k;
    return entries.length ? entries[entries.length - 1][0] : null;
}

/** The sum of a table of weights. */
function sum(t: Partial<Record<string, number>>): number {
    return Object.values(t).reduce((a: number, b) => a + (b ?? 0), 0);
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

/** A stone arch bridge from (x0, y0) to (x1, y1), rising in the middle, with a lit walkway and a shaded side. */
function bridge(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const n = Math.max(2, Math.round(Math.abs(x1 - x0)));
    const rise = Math.min(16, n * 0.28);
    for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = Math.round(x0 + (x1 - x0) * t),
            y = Math.round(y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * rise);
        // Outline, walkway, then the arch's shaded face below it.
        ctx.fillStyle = '#23285c';
        ctx.fillRect(x, y - 3, 1, 10);
        ctx.fillStyle = i % 4 === 0 ? '#b4a6d0' : '#d6cce8';
        ctx.fillRect(x, y - 2, 1, 3);
        ctx.fillStyle = '#9486b8';
        ctx.fillRect(x, y + 1, 1, 4);
        ctx.fillStyle = '#7466a0';
        ctx.fillRect(x, y + 5, 1, 1);
    }
}
