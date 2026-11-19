// The match details screen: one game from Profile's match history in full, in three tabs. Overview has the result,
// both fairies, the score and its numbers, with buttons to watch its replay and copy its share link; Scoreboard has
// each side's numbers side by side and the rounds; Graphs has the match over time (who was ahead, hearts, pops and
// attacks sent), with its big moments marked. The Scoreboard and Graphs come from playing the replay through.
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import type { Fairy, HighlightKind, Layout, MatchInfoView, MatchStats, MatchTab, SideStats } from '@/types';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { clock } from '@/render/hud';
import { ARCADE, FONT, SANS } from '@/render/theme';
import { roundRect } from './emblems';
import { tallMenuFit } from './menu-fit';
import { drawKit } from './kit';
import { PieceAtlas } from './kit';
import { kitButton, kitHintBar, kitPanel, kitPill, kitReady, kitTab, mockBox } from './kit-ui';
import type { MockFit } from './kit-ui';
import kitUrl from '@/../assets/ui/match-kit.png';
import goldUrl from '@/../assets/ui/match-kit-gold.png';
import { MATCH_KIT } from '@/data/match-kit';
import { drawMedal, drawPlayerCard, playerCardReady } from './profile-screen';
import { enter } from '@/render/transition';
import { goldGradient, ornateScreen, ornateTitle, pointed } from './ornate';
import { glassPanel, goldRoundFrame } from './roster-screen';

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A box, in design or view units. */
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A rectangle to plot a graph in. */
interface Plot {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The tabs, in order, and their labels. */
export const MATCH_TABS: MatchTab[] = ['overview', 'scoreboard', 'graphs'];
const TAB_LABELS: Record<MatchTab, string> = { overview: 'OVERVIEW', scoreboard: 'SCOREBOARD', graphs: 'GRAPHS' };

/** The graphs, in order. */
export const GRAPHS = ['ADVANTAGE', 'HEARTS', 'POPS', 'ATTACKS SENT'] as const;

/** The two sides' colours on the graphs and the scoreboard: the player's gold, the rival's blue. */
const SIDE_COLOURS = ['#ffd45c', '#8fd8ff'] as const;

/** The scoreboard's columns: a heading, the number, and whether fewer is better. */
const COLUMNS: { label: string; long: string; get: (s: SideStats) => number; low?: boolean }[] = [
    { label: 'POPS', long: 'CRITTERS POPPED', get: s => s.pops },
    { label: 'CHAINS', long: 'CHAINS', get: s => s.chains },
    { label: 'BEST', long: 'BEST CHAIN', get: s => s.bestChain },
    { label: 'FIRE', long: 'FIREBALLS SENT', get: s => s.fireballs },
    { label: 'REV', long: 'REVERSES', get: s => s.reverses },
    { label: 'EXTRA', long: 'EXTRA ATTACKS', get: s => s.extras },
    { label: 'GUARD', long: 'GUARDIANS SENT', get: s => s.guardians },
    { label: 'PERF', long: 'PERFECTS', get: s => s.perfects },
    { label: 'FEVER', long: 'FEVERS', get: s => s.fevers },
    { label: 'BOMB', long: 'BOMBS', get: s => s.bombs },
    { label: 'HITS', long: 'HITS TAKEN', get: s => s.hits, low: true },
    { label: 'STUN', long: 'STUNS', get: s => s.stuns, low: true },
];

/** The marks for a match's big moments on the Advantage graph: a letter and a colour each. */
const MARKS: Record<HighlightKind, { letter: string; colour: string; name: string }> = {
    chain: { letter: 'C', colour: '#ffd45c', name: 'BIG CHAIN' },
    fever: { letter: 'F', colour: '#ff7ad9', name: 'FEVER' },
    extra: { letter: 'E', colour: '#ff8a5c', name: 'EXTRA' },
    guardian: { letter: 'G', colour: '#8ff0a0', name: 'GUARDIAN' },
    bomb: { letter: 'B', colour: '#c9b8ff', name: 'BOMB' },
    ko: { letter: 'X', colour: '#ff5470', name: 'KO' },
};

/** The match details' painted pieces (`tools/extract-screen-kit.py match`), used in landscape once loaded. */
const KIT = new PieceAtlas(kitUrl, goldUrl, MATCH_KIT);

/**
 * The painted landscape screen's layout, in its mockups' 2x pixels: the part fitted to the view, and the boxes of
 * the tabs, graph tabs, buttons, the card, the score's frames and tiles, the scoreboard's columns and rows, and the
 * chart.
 */
const MOCK = {
    area: [90, 0, 3545, 1745] as const,
    title: [1119, 25, 1309, 200],
    tabs: [
        [923, 231, 580, 122],
        [1513, 231, 580, 122],
        [2103, 231, 580, 122],
    ],
    // The graphs' own tabs, a clear gap under the main tabs (which end at 353) and above the chart (640).
    graphs: [
        [588, 386, 575, 92],
        [1176, 386, 575, 92],
        [1764, 386, 575, 92],
        [2352, 386, 575, 92],
    ],
    card: [0, 220, 790, 1380],
    tag: [1570, 376, 425, 72],
    banner: [1279, 450, 995, 224],
    frames: [
        [1004, 600, 353, 488],
        [2223, 600, 353, 488],
    ],
    roundsPill: [1624, 940, 298, 94],
    tiles: { y: 1122, w: 450, h: 199, gap: 18, mid: 1871 },
    watch: [996, 1380, 935, 157],
    copy: [1962, 1382, 778, 159],
    head: [440, 385, 3115, 105],
    columns: [850, 1065, 1287, 1502, 1717, 1937, 2147, 2367, 2580, 2790, 3000, 3212, 3412],
    rows: [
        [55, 500, 3485, 225],
        [55, 745, 3485, 205],
    ],
    roundsHead: [900, 950, 1762, 112],
    round: { y: 1063, w: 811, h: 248, gap: 25, mid: 1790 },
    chart: [160, 640, 3360, 780],
    plot: [250, 712, 3190, 582],
    hint: [960, 1600, 1660, 140],
} as const;

/** Where the screen's middle is, in the mockups' pixels: the heading, tabs and hint bar are centred on it. */
const MID = 1790;

/**
 * Where landscape match details sit in a view widened by `bleed`: one fit at the scale that fits the mockups' height,
 * their middle on the view's, and the view's left and right edges (`L`, `R`) in their pixels, so the screen can reach
 * them.
 */
interface MatchFits {
    f: MockFit;
    L: number;
    R: number;
}

/** The match details fitted to a view widened by `bleed`, filling it edge to edge. */
function matchFits(bleed: number): MatchFits {
    const x0 = -bleed + 4,
        x1 = C.VIEW_W + bleed - 4,
        y0 = 2,
        y1 = C.VIEW_H - 2;
    const [, my0, , my1] = MOCK.area;
    const s = Math.min((y1 - y0) / (my1 - my0), (x1 - x0) / 3500);
    const f = { s, x: (x0 + x1) / 2 - MID * s, y: (y0 + y1) / 2 - ((my0 + my1) / 2) * s };
    const half = (x1 - x0) / 2 / s;
    return { f, L: MID - half, R: MID + half };
}

/**
 * Overview's room beside the player card, between `L` and `R`: its left and right edges and middle, where the
 * fairies' frames centre (`left`, `right`), and the Watch Replay and Copy Link buttons, all in the mockups' pixels.
 */
function overviewRoom(L: number, R: number) {
    const [, , cw] = MOCK.card;
    const a = L + 10 + cw + 60,
        b = R - 30,
        w = b - a,
        mid = (a + b) / 2;
    const [, wy, , wh] = MOCK.watch;
    const bw = Math.min(1100, (w - 60) / 2);
    return {
        a,
        b,
        mid,
        left: a + w * 0.18,
        right: b - w * 0.18,
        watch: [mid - 30 - bw, wy, bw, wh] as const,
        copy: [mid + 30, wy, bw, wh] as const,
    };
}

/** Whether the landscape screen is drawn from its painted pieces (once they've loaded). */
const painted = () => KIT.ready() && kitReady() && playerCardReady();

/** Where the tabs, the graph tabs and the buttons sit, in design units (`dy`: the tall screen's shift down). */
function designLayout(layout: Layout, dy: number): { tabs: Box[]; graphs: Box[]; watch: Box; copy: Box } {
    if (layout === 'tall') {
        const tw = 80,
            gw = 118;
        return {
            tabs: MATCH_TABS.map((_, i) => ({
                x: (C.TALL_W - 3 * tw - 8) / 2 + i * (tw + 4),
                y: 44 + dy,
                w: tw,
                h: 17,
            })),
            graphs: GRAPHS.map((_, i) => ({
                x: (C.TALL_W - 2 * gw - 6) / 2 + (i % 2) * (gw + 6),
                y: 68 + dy + Math.floor(i / 2) * 18,
                w: gw,
                h: 15,
            })),
            watch: { x: 22, y: 402 + dy, w: C.TALL_W - 44, h: 30 },
            copy: { x: 22, y: 440 + dy, w: C.TALL_W - 44, h: 24 },
        };
    }
    const W = C.VIEW_W,
        tw = 100,
        gw = 96;
    return {
        tabs: MATCH_TABS.map((_, i) => ({ x: (W - 3 * tw - 12) / 2 + i * (tw + 6), y: 32, w: tw, h: 15 })),
        graphs: GRAPHS.map((_, i) => ({ x: (W - 4 * gw - 18) / 2 + i * (gw + 6), y: 53, w: gw, h: 13 })),
        watch: { x: W / 2 - 150, y: 250, w: 170, h: 26 },
        copy: { x: W / 2 + 30, y: 250, w: 120, h: 26 },
    };
}

/** The tabs, graph tabs and buttons in view units (their tap targets), for a view `h` tall. */
export function matchBoxes(layout: Layout, h: number = C.TALL_H, bleed = 0): ReturnType<typeof designLayout> {
    if (layout !== 'tall' && painted()) {
        const { f, L, R } = matchFits(bleed);
        const room = overviewRoom(L, R);
        const box = (b: readonly number[]) => mockBox(f, b[0], b[1], b[2], b[3]);
        return {
            tabs: MOCK.tabs.map(box),
            graphs: MOCK.graphs.map(box),
            watch: box(room.watch),
            copy: box(room.copy),
        };
    }
    if (layout !== 'tall') return designLayout(layout, 0);
    const f = tallMenuFit(h);
    const d = designLayout(layout, tallShift(f.h));
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    return { tabs: d.tabs.map(view), graphs: d.graphs.map(view), watch: view(d.watch), copy: view(d.copy) };
}

/** A round number for a graph's scale, at least `v`: 1, 1.5, 2, 3, 4, 5, 6 or 8 times a power of ten. */
function niceCeil(v: number): number {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
}

/** The match details screen. */
export class MatchScreen {
    private gold: [string, string, string] = ['#ffffff', '#ffe08a', '#ff9a2e'];
    /** The time of the frame being drawn, for the panels' glints. */
    private t = 0;

    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: MatchInfoView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        this.t = t;
        const tall = layout === 'tall';
        if (!tall && painted()) {
            this.drawPainted(v, t, bleed);
            return;
        }
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
            dy = tallShift(f.h);
        }
        enter(ctx, 'bg', () => ornateScreen(ctx, t, W, H, bleed, '', tall));
        enter(ctx, 'bar', () => ornateTitle(ctx, 'MATCH DETAILS', W, t, tall));
        const lay = designLayout(layout, 0);
        ctx.translate(0, dy);
        lay.tabs.forEach((b, i) =>
            enter(ctx, 'buttons', () => this.tab(b, TAB_LABELS[MATCH_TABS[i]], MATCH_TABS[i] === v.tab, v.color, t), {
                box: b,
                i,
            }),
        );
        const stats = v.stats;
        if (v.tab === 'overview') enter(ctx, 'panels', () => this.overview(v, t, tall, W, lay));
        else if (!stats) this.waiting(v, W, tall);
        else if (v.tab === 'scoreboard') enter(ctx, 'panels', () => this.scoreboard(v, stats, t, tall, W, bleed));
        else {
            lay.graphs.forEach((b, i) =>
                enter(ctx, 'buttons', () => this.tab(b, GRAPHS[i], i === v.graph, '#c9b8ff', t, 6), {
                    box: b,
                    i: i + 3,
                }),
            );
            enter(ctx, 'panels', () => this.graph(v, stats, tall, W, bleed));
        }
        ctx.translate(0, -dy);

        enter(ctx, 'hint', () => {
            if (kitReady() && !v.touch) kitHintBar(ctx, W / 2, tall ? H - 16 : H - 10.5, Math.min(W - 16, 300), 15);
            ctx.textAlign = 'center';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            const keys =
                v.tab === 'graphs'
                    ? '◀ ▶ TABS  ·  ▲ ▼ GRAPHS  ·  ENTER WATCHES  ·  ESC BACK'
                    : '◀ ▶ TABS  ·  ENTER WATCHES  ·  ESC BACK';
            ctx.fillText(v.touch ? '◀ BACK TO THE HISTORY' : keys, W / 2, tall ? H - 14 : H - 8, W - 16);
        });
        ctx.restore();
    }

    /**
     * Landscape match details, filling the screen edge to edge and drawn in code but for the winged heading: the tabs,
     * then Overview beside the player card, or the Scoreboard or the chart across the whole width, and the hint bar.
     */
    private drawPainted(v: MatchInfoView, t: number, bleed: number): void {
        const ctx = this.ctx;
        const W = C.VIEW_W,
            H = C.VIEW_H;
        const { f, L, R } = matchFits(bleed);
        ctx.save();
        enter(ctx, 'bg', () => ornateScreen(ctx, t, W, H, bleed, '', false));
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.s, f.s);
        enter(ctx, 'bar', () =>
            this.piece('title', [MID - MOCK.title[2] / 2, MOCK.title[1], MOCK.title[2], MOCK.title[3]], 0),
        );
        MOCK.tabs.forEach((b, i) =>
            enter(ctx, 'buttons', () => this.paintedTab(b, TAB_LABELS[MATCH_TABS[i]], MATCH_TABS[i] === v.tab, 56), {
                i,
            }),
        );
        const stats = v.stats;
        if (v.tab === 'overview') enter(ctx, 'panels', () => this.paintedOverview(v, t, L, R));
        else if (!stats) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 52px ${FONT}`;
            ctx.fillStyle = 'rgba(214,204,250,0.9)';
            v.statsNote.split('\n').forEach((l, i) => ctx.fillText(l, MID, 820 + i * 70, 2600));
        } else if (v.tab === 'scoreboard') enter(ctx, 'panels', () => this.paintedBoard(v, stats, t, L, R));
        else {
            MOCK.graphs.forEach((b, i) =>
                enter(ctx, 'buttons', () => this.paintedTab(b, GRAPHS[i], i === v.graph, 44, true), { i: i + 3 }),
            );
            enter(ctx, 'panels', () => {
                // A dark pane in a gold frame for the chart to sit on.
                const [, cy, , ch] = MOCK.chart;
                ctx.fillStyle = 'rgba(16,8,40,0.88)';
                roundRect(ctx, L + 70, cy, R - L - 140, ch, 60);
                ctx.fill();
                goldRoundFrame(ctx, L + 70, cy, R - L - 140, ch, 60, 16);
            });
        }
        const [, hy, hw, hh] = MOCK.hint;
        enter(ctx, 'hint', () => {
            hintBar(ctx, MID - hw / 2, hy + 10, hw, hh - 20);
            ctx.textAlign = 'center';
            ctx.font = `800 40px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            const keys =
                v.tab === 'graphs'
                    ? '◀ ▶ TABS  ·  ▲ ▼ GRAPHS  ·  ENTER WATCHES  ·  ESC BACK'
                    : '◀ ▶ TABS  ·  ENTER WATCHES  ·  ESC BACK';
            ctx.fillText(v.touch ? '◀ BACK TO THE HISTORY' : keys, MID, hy + hh * 0.62, hw - 150);
        });
        ctx.restore();
        // The chart is drawn in view units inside its frame, so its lines and lettering stay crisp.
        if (v.tab === 'graphs' && stats) {
            const [, py, , ph] = MOCK.plot;
            enter(ctx, 'panels', () => this.graph(v, stats, false, W, bleed, mockBox(f, L + 160, py, R - L - 300, ph)));
        }
        ctx.restore();
    }

    /** Draws painted piece `name` filling box `b` (in the mockup's units), glinting if `phase` is given. */
    private piece(name: string, b: readonly number[], phase?: number): void {
        KIT.draw(this.ctx, name, b[0], b[1], b[2], b[3]);
        if (phase !== undefined) KIT.glint(this.ctx, name, b[0], b[1], b[2], b[3], this.t, phase, 7);
    }

    /** A slanted tab drawn in code, gold when it's showing (lilac for the graphs' own tabs), with its label. */
    private paintedTab(b: readonly number[], label: string, on: boolean, size: number, graph = false): void {
        const ctx = this.ctx;
        slantPlate(ctx, b[0], b[1], b[2], b[3], on ? (graph ? 'lilac' : 'gold') : 'violet', this.t);
        ctx.textAlign = 'center';
        ctx.font = `800 ${size}px ${SANS}`;
        ctx.fillStyle = on ? (graph ? '#1e0c3c' : '#2e1004') : '#ffffff';
        ctx.fillText(label, b[0] + b[2] / 2, b[1] + b[3] / 2 + size * 0.36, b[2] - 80);
    }

    /** The painted Overview: the card, the result on its banner, the fairies in their frames, score, tiles, buttons. */
    private paintedOverview(v: MatchInfoView, t: number, L: number, R: number): void {
        const ctx = this.ctx;
        const [, cy, cw, ch] = MOCK.card;
        drawPlayerCard(ctx, v.card, [L + 10, cy, cw, ch], t);
        // Everything else spreads across the room beside the card, out to the right edge.
        const room = overviewRoom(L, R),
            mid = room.mid;
        const [, ty, tw, th] = MOCK.tag;
        slantPlate(ctx, mid - tw / 2, ty, tw, th, 'gold', t);
        ctx.textAlign = 'center';
        ctx.font = `800 40px ${SANS}`;
        ctx.fillStyle = '#2e1004';
        ctx.fillText(v.tag, mid, ty + th * 0.68, tw - 60);
        const [, by, , bh] = MOCK.banner,
            bw = Math.min(1500, (room.b - room.a) * 0.55);
        banner(ctx, mid - bw / 2, by, bw, bh);
        const blue: [string, string, string] = ['#ffffff', '#c9d8ff', '#7d8cff'];
        arcadeText(ctx, v.banner, mid, by + 132, 110, v.won ? this.gold : blue, 'center', bw - 380);
        ctx.font = `italic 600 44px ${FONT}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(v.when, mid, by + 196, bw - 300);
        // The fairies in their frames: the player's left, the rival's right (or the score there in Endless).
        const fy = fairyById(v.fairy),
            rival = v.rival ? fairyById(v.rival) : null;
        const sides: [Fairy, number][] = [[fy, 0]];
        if (rival) sides.push([rival, 1]);
        sides.forEach(([fairy, side]) => {
            const [, y, w] = MOCK.frames[side];
            const cx = side ? room.right : room.left;
            drawMedal(ctx, fairy, cx, y + 232, 150, t);
            medalRing(ctx, cx, y + 232, 150);
            plate(ctx, cx - 100, y + 18, 200, 66, false);
            plate(ctx, cx - w / 2 + 20, y + 392, w - 40, 92, false);
            ctx.textAlign = 'center';
            ctx.font = `800 40px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(v.labels[side], cx, y + 64, 160);
            ctx.font = `700 56px ${FONT}`;
            ctx.fillText(fairy.name, cx, y + 456, 280);
        });
        // The score, and what it counts on its pill.
        const sx = rival ? mid : room.right;
        arcadeText(ctx, v.score, sx, 905, rival ? 150 : 130, this.gold, 'center');
        const [, ry, rw, rh] = MOCK.roundsPill;
        plate(ctx, sx - rw / 2, ry, rw, rh, true);
        ctx.font = `800 40px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(v.scoreLabel, sx, ry + rh * 0.66, rw - 50);
        ctx.fillStyle = '#fff3c0';
        sparkle(ctx, sx - 270, 810, 26 + 6 * Math.sin(t * 2.6));
        sparkle(ctx, sx + 270, 980, 22 + 6 * Math.sin(t * 2.6 + 2));
        // The numbers on tiles, sharing the room's width.
        const T = MOCK.tiles,
            n = v.tiles.length;
        const w = (room.b - room.a - (n - 1) * T.gap) / n;
        v.tiles.forEach(([label, value], i) => {
            const x = room.a + i * (w + T.gap);
            glassPanel(ctx, x, T.y, w, T.h, 30);
            ctx.strokeStyle = goldGradient(ctx, T.y, T.y + T.h);
            ctx.lineWidth = 6;
            roundRect(ctx, x, T.y, w, T.h, 30);
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.font = `800 40px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 34, T.y + 74, w - 60);
            arcadeText(ctx, value, x + 34, T.y + 162, 70, this.gold, 'left', w - 60);
        });
        // Watch the replay, copy its link: dimmed when there's nothing to do.
        const [wx, wy, ww, wh] = room.watch,
            [cx2, cy2, cw2, ch2] = room.copy;
        ctx.save();
        if (!v.hasReplay) ctx.globalAlpha = 0.45;
        slantPlate(ctx, wx, wy, ww, wh, 'gold', t);
        ctx.textAlign = 'center';
        ctx.font = `900 64px ${SANS}`;
        ctx.fillStyle = '#2e1004';
        ctx.fillText('▶  WATCH REPLAY', wx + ww / 2, wy + wh / 2 + 23, ww - 120);
        ctx.restore();
        ctx.save();
        if (!v.link) ctx.globalAlpha = 0.45;
        slantPlate(ctx, cx2, cy2, cw2, ch2, 'lilac', t);
        ctx.textAlign = 'center';
        ctx.font = `900 64px ${SANS}`;
        ctx.fillStyle = '#1e0c3c';
        ctx.fillText('COPY LINK', cx2 + cw2 / 2, cy2 + ch2 / 2 + 23, cw2 - 120);
        ctx.restore();
        const noteY = wy + wh + 48;
        ctx.textAlign = 'center';
        if (v.note) arcadeText(ctx, v.note, mid, noteY, 40, this.gold, 'center');
        else if (!v.hasReplay) {
            ctx.font = `italic 600 40px ${FONT}`;
            ctx.fillStyle = 'rgba(214,204,250,0.85)';
            ctx.fillText('No replay was saved for this game', mid, noteY);
        }
    }

    /** The painted Scoreboard: the column heads, a row per side (the winner's gold), and the rounds. */
    private paintedBoard(v: MatchInfoView, s: MatchStats, t: number, L: number, R: number): void {
        const ctx = this.ctx;
        const solo = !v.rival;
        const best = (c: (typeof COLUMNS)[number]) => {
            const [a, b] = [c.get(s.sides[0]), c.get(s.sides[1])];
            return a === b ? -1 : a > b !== !!c.low ? 0 : 1;
        };
        // The columns spread across the whole width: the rounds won, then the numbers.
        const x0 = L + 20,
            x1 = R - 20,
            c0 = x0 + 1000,
            c1 = x1 - 120,
            step = (c1 - c0) / (COLUMNS.length - 1);
        const cols = [x0 + 830, ...COLUMNS.map((_, i) => c0 + i * step)];
        const [, hy, , hh] = MOCK.head;
        const head = () => pointed(ctx, x0 + 360, hy, x1 - x0 - 360, hh, hh / 2);
        ctx.fillStyle = 'rgba(30,12,64,0.92)';
        head();
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, hy, hy + hh);
        ctx.lineWidth = 6;
        head();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `800 44px ${SANS}`;
        ['W', ...COLUMNS.map(c => c.label)].forEach((label, i) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, cols[i], hy + hh / 2 + 16, step - 30);
            if (i) {
                ctx.fillStyle = 'rgba(214,170,255,0.7)';
                sparkle(ctx, cols[i] - (i === 1 ? (cols[1] - cols[0]) / 2 : step / 2), hy + hh / 2, 10);
            }
        });
        [0, 1].forEach(side => {
            const st = s.sides[side];
            const won = !solo && st.roundsWon > s.sides[1 - side].roundsWon;
            const [, ry, , rh] = MOCK.rows[side];
            const y = ry + 10,
                h = rh - 20,
                x = x0,
                w = x1 - x0;
            glassPanel(ctx, x, y, w, h, h / 2);
            if (won) {
                ctx.save();
                ctx.shadowColor = 'rgba(255,190,60,0.5)';
                ctx.shadowBlur = 30;
                ctx.strokeStyle = goldGradient(ctx, y, y + h);
                ctx.lineWidth = 8;
                roundRect(ctx, x, y, w, h, h / 2);
                ctx.stroke();
                ctx.restore();
            }
            const my = y + h / 2;
            drawMedal(ctx, fairyById(s.fairies[side]), x + 120, my, 86, t);
            medalRing(ctx, x + 120, my, 86);
            if (won) {
                plate(ctx, x + 560, y + 14, 200, 56, true);
                ctx.textAlign = 'center';
                ctx.font = `900 34px ${SANS}`;
                ctx.fillStyle = '#ffe27a';
                ctx.fillText('WINNER', x + 660, y + 54, 170);
            }
            ctx.textAlign = 'left';
            ctx.font = `italic 700 64px ${FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(v.names[side], x + 240, y + h * 0.5 + (won ? 14 : 0), 520);
            ctx.font = `800 40px ${SANS}`;
            ctx.fillStyle = SIDE_COLOURS[side];
            ctx.fillText(v.labels[side], x + 240, y + h * 0.5 + (won ? 62 : 50), 400);
            const baseline = y + h * 0.5 + 22;
            ctx.fillStyle = 'rgba(10,4,26,0.6)';
            roundRect(ctx, cols[0] - 70, y + 24, 140, h - 48, 24);
            ctx.fill();
            ctx.strokeStyle = 'rgba(214,170,255,0.55)';
            ctx.lineWidth = 3;
            ctx.stroke();
            arcadeText(ctx, solo ? '—' : String(st.roundsWon), cols[0], baseline + 4, 64, this.gold, 'center');
            COLUMNS.forEach((c, i) => {
                const lit = best(c) === side;
                ctx.textAlign = 'center';
                ctx.font = `800 ${lit ? 60 : 54}px ${SANS}`;
                ctx.fillStyle = lit ? '#ffe27a' : '#ffffff';
                ctx.fillText(String(c.get(st)), cols[i + 1], baseline, step - 20);
            });
        });
        // The rounds' heading: winged lettering between gold rules.
        const [, rhy, , rhh] = MOCK.roundsHead,
            hcy = rhy + rhh / 2;
        arcadeText(ctx, 'ROUNDS', MID, hcy + 30, 84, this.gold, 'center');
        ctx.font = `84px ${ARCADE}`;
        const half = ctx.measureText('ROUNDS').width / 2 + 60;
        for (const d of [-1, 1]) {
            const g = ctx.createLinearGradient(MID + d * half, 0, MID + d * (half + 700), 0);
            g.addColorStop(0, 'rgba(255,212,92,0.95)');
            g.addColorStop(1, 'rgba(255,212,92,0)');
            ctx.fillStyle = g;
            ctx.fillRect(Math.min(MID + d * half, MID + d * (half + 700)), hcy - 3, 700, 6);
            ctx.fillStyle = '#ffe9a8';
            sparkle(ctx, MID + d * (half - 24), hcy, 16);
        }
        const RD = MOCK.round,
            n = s.rounds.length;
        const w = Math.min(1300, (R - L - 200 - (n - 1) * RD.gap) / Math.max(1, n));
        s.rounds.forEach((r, i) => {
            const x = MID - (n * w + (n - 1) * RD.gap) / 2 + i * (w + RD.gap);
            const who = r.winner === -1 ? null : r.winner;
            const gold = who === 0;
            glassPanel(ctx, x, RD.y, w, RD.h, 60);
            ctx.strokeStyle = gold ? goldGradient(ctx, RD.y, RD.y + RD.h) : 'rgba(120,200,255,0.75)';
            ctx.lineWidth = gold ? 8 : 5;
            roundRect(ctx, x, RD.y, w, RD.h, 60);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = `800 40px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(solo ? 'RUN' : `ROUND ${i + 1}  •  ${clock(r.seconds)}`, x + w / 2, RD.y + 80, w - 120);
            const line = solo ? `SURVIVED ${clock(r.seconds)}` : who === null ? 'NO WINNER' : `${v.labels[who]} WON`;
            arcadeText(
                ctx,
                line,
                x + w / 2,
                RD.y + 178,
                56,
                gold ? this.gold : ['#ffffff', '#bff4ff', '#5ad8ff'],
                'center',
                w - 260,
            );
        });
        if (!s.exact) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 38px ${FONT}`;
            ctx.fillStyle = '#ffe9b0';
            ctx.fillText(
                '✦  Recorded on another version of the game: these numbers may be a little off  ✦',
                MID,
                RD.y + RD.h + 70,
                3000,
            );
        }
    }

    /** A tab: lit in `colour` when it's the one showing. */
    private tab(b: Box, text: string, on: boolean, colour: string, t: number, size = 7): void {
        const ctx = this.ctx;
        // From the kit: gold for the screen's tabs, lilac for the graphs'.
        if (kitReady()) {
            kitTab(ctx, b, text, on, t, undefined, size < 7 ? 'lilac' : 'gold');
            return;
        }
        ctx.fillStyle = on ? colour : 'rgba(20,12,48,0.85)';
        slanted(b.x, b.y, b.w, b.h, 4)(ctx);
        ctx.fill();
        ctx.strokeStyle = on ? '#ffffff' : 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${size}px ${ARCADE}`;
        ctx.fillStyle = on ? '#140a26' : '#cbbcf5';
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + size / 2, b.w - 10);
    }

    /** In place of the Scoreboard or Graphs: why they aren't there yet (loading, or no replay to work them out). */
    private waiting(v: MatchInfoView, W: number, tall: boolean): void {
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        ctx.font = `italic 600 10px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.9)';
        v.statsNote.split('\n').forEach((l, i) => ctx.fillText(l, W / 2, (tall ? 200 : 140) + i * 14, W - 30));
    }

    /** The Overview tab: the result, both fairies and the score, the numbers, and the buttons. */
    private overview(
        v: MatchInfoView,
        t: number,
        tall: boolean,
        W: number,
        lay: ReturnType<typeof designLayout>,
    ): void {
        const ctx = this.ctx;
        const mid = W / 2,
            gold = this.gold;
        const blue: [string, string, string] = ['#ffffff', '#c9d8ff', '#7d8cff'];
        const tagW = 84,
            tagY = tall ? 70 : 52;
        if (kitReady()) kitPill(ctx, { x: mid - tagW / 2, y: tagY - 1, w: tagW, h: 15 }, 'gold');
        else {
            ctx.fillStyle = v.color;
            slanted(mid - tagW / 2, tagY, tagW, 13, 3)(ctx);
            ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = '#140a26';
        ctx.fillText(v.tag, mid, tagY + 9.5, tagW - 8);
        arcadeText(ctx, v.banner, mid, tagY + (tall ? 40 : 34), 22, v.won ? gold : blue, 'center');
        ctx.font = `italic 600 9px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        ctx.fillText(v.when, mid, tagY + (tall ? 54 : 47));

        // The two fairies, the score between them (an Endless run: the one fairy beside her time).
        const fy = fairyById(v.fairy),
            rival = v.rival ? fairyById(v.rival) : null;
        const my = tall ? 196 : 142,
            r = 30,
            apart = tall ? 78 : 140;
        if (tall && !rival) {
            this.fairy(fy, mid, my - 12, r, t, v.labels[0]);
            arcadeText(ctx, v.score, mid, my + 62, 22, gold, 'center');
            this.label(v.scoreLabel, mid, my + 76);
        } else {
            const meX = rival || tall ? mid - apart : mid - 90,
                scoreX = rival || tall ? mid : mid + 50;
            this.fairy(fy, meX, my, r, t, v.labels[0]);
            if (rival) this.fairy(rival, mid + apart, my, r, t, v.labels[1]);
            arcadeText(ctx, v.score, scoreX, my + 8, tall ? 24 : 28, gold, 'center');
            this.label(v.scoreLabel, scoreX, my + 24);
        }

        // The numbers, as tiles.
        const cols = tall ? 2 : Math.min(5, v.tiles.length);
        const tw = tall ? 106 : 88,
            th = 34,
            gap = 8,
            rowsW = cols * tw + (cols - 1) * gap,
            y0 = tall ? 292 : 198;
        v.tiles.forEach(([label, value], i) => {
            const x = mid - rowsW / 2 + (i % cols) * (tw + gap),
                y = y0 + Math.floor(i / cols) * (th + 6);
            this.panel(x, y, tw, th);
            ctx.textAlign = 'left';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(label, x + 7, y + 11, tw - 12);
            arcadeText(ctx, value, x + 7, y + 28, 11, gold, 'left', tw - 12);
        });

        // Watch the replay, copy its link.
        this.button(lay.watch, '▶ WATCH REPLAY', v.hasReplay, v.color, t);
        this.button(lay.copy, 'COPY LINK', !!v.link, '#c9b8ff', t);
        const noteY = lay.copy.y + lay.copy.h + (tall ? 18 : 14);
        if (v.note) arcadeText(ctx, v.note, mid, noteY, 8, gold, 'center');
        else if (!v.hasReplay) {
            ctx.font = `italic 600 9px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.8)';
            ctx.fillText('No replay was saved for this game', mid, noteY);
        }
    }

    /**
     * The Scoreboard tab: in landscape a row per side with a column per number (the better of each lit), as on a
     * match's scoreboard; on a phone a row per number with a column per side. Then the rounds, who won each and how
     * long it took.
     */
    private scoreboard(v: MatchInfoView, s: MatchStats, t: number, tall: boolean, W: number, bleed: number): void {
        const ctx = this.ctx;
        const solo = !v.rival;
        /** The index of the side with the better number in column `c`, or -1 for a tie. */
        const best = (c: (typeof COLUMNS)[number]) => {
            const [a, b] = [c.get(s.sides[0]), c.get(s.sides[1])];
            return a === b ? -1 : a > b !== !!c.low ? 0 : 1;
        };
        let roundsY: number;
        if (!tall) {
            const x0 = 10 - bleed,
                x1 = W + bleed - 10,
                nameW = 132,
                cw = (x1 - x0 - nameW - 28) / COLUMNS.length;
            const hy = 62;
            // The column heads on a capsule, as on a scoreboard.
            if (kitReady())
                kitPill(ctx, { x: x0 + nameW - 4, y: hy - 9.5, w: x1 - (x0 + nameW - 4), h: 14 }, 'capsule');
            ctx.font = `5.5px ${ARCADE}`;
            ctx.fillStyle = '#e8e0ff';
            ctx.textAlign = 'center';
            ctx.fillText('W', x0 + nameW + 14, hy, 26);
            COLUMNS.forEach((c, i) => ctx.fillText(c.label, x0 + nameW + 28 + (i + 0.5) * cw, hy, cw - 2));
            [0, 1].forEach(side => {
                const y = hy + 6 + side * 44,
                    st = s.sides[side];
                const won = !solo && st.roundsWon > s.sides[1 - side].roundsWon;
                this.panel(x0, y, x1 - x0, 40, won ? SIDE_COLOURS[side] : undefined);
                this.sideName(v, s, side, x0 + 22, y + 20, t);
                if (won) this.ribbon(x0 + nameW - 6, y + 4);
                arcadeText(ctx, solo ? '—' : String(st.roundsWon), x0 + nameW + 14, y + 25, 11, this.gold, 'center');
                COLUMNS.forEach((c, i) => {
                    const x = x0 + nameW + 28 + (i + 0.5) * cw;
                    const lit = best(c) === side;
                    ctx.textAlign = 'center';
                    ctx.font = `${lit ? 9 : 8}px ${ARCADE}`;
                    ctx.fillStyle = lit ? '#ffe27a' : '#e8e0ff';
                    ctx.fillText(String(c.get(st)), x, y + 24, cw - 2);
                });
            });
            roundsY = 170;
        } else {
            const cx = [W - 92, W - 36];
            [0, 1].forEach(side => {
                drawMedal(ctx, fairyById(s.fairies[side]), cx[side], 84, 13, t);
                ctx.textAlign = 'center';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = SIDE_COLOURS[side];
                ctx.fillText(v.labels[side], cx[side], 106, 52);
                if (!solo) arcadeText(ctx, String(s.sides[side].roundsWon), cx[side], 122, 10, this.gold, 'center');
            });
            ctx.textAlign = 'left';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            if (!solo) ctx.fillText('ROUNDS WON', 12, 121);
            COLUMNS.forEach((c, i) => {
                const y = 132 + i * 19;
                ctx.fillStyle = i % 2 ? 'rgba(20,12,48,0.55)' : 'rgba(40,26,88,0.55)';
                ctx.fillRect(8, y, W - 16, 17);
                ctx.textAlign = 'left';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = '#cbbcf5';
                ctx.fillText(c.long, 14, y + 11.5, cx[0] - 40);
                [0, 1].forEach(side => {
                    const lit = best(c) === side;
                    ctx.textAlign = 'center';
                    ctx.font = `${lit ? 8.5 : 7.5}px ${ARCADE}`;
                    ctx.fillStyle = lit ? '#ffe27a' : '#e8e0ff';
                    ctx.fillText(String(c.get(s.sides[side])), cx[side], y + 12);
                });
            });
            roundsY = 132 + COLUMNS.length * 19 + 16;
        }

        // The rounds.
        ctx.textAlign = tall ? 'left' : 'center';
        ctx.font = `${tall ? 6.5 : 8}px ${ARCADE}`;
        ctx.fillStyle = kitReady() ? '#ffd45c' : '#cbbcf5';
        const heading = solo ? 'THE RUN' : 'ROUNDS';
        ctx.fillText(heading, tall ? 12 : W / 2, roundsY);
        // Gold wings either side of it, as on the kit.
        if (kitReady() && !tall) {
            const hw = ctx.measureText(heading).width / 2;
            drawKit(ctx, 'wingLeft', W / 2 - hw - 30, roundsY - 9, 24, 10);
            drawKit(ctx, 'wingRight', W / 2 + hw + 6, roundsY - 9, 24, 10);
        }
        const n = s.rounds.length,
            rw = tall ? W - 24 : Math.min(150, (W - 40) / n - 8),
            rh = tall ? 18 : 34;
        s.rounds.forEach((r, i) => {
            const x = tall ? 12 : W / 2 - (n * rw + (n - 1) * 8) / 2 + i * (rw + 8),
                y = tall ? roundsY + 6 + i * (rh + 4) : roundsY + 8;
            const who = r.winner === -1 ? null : r.winner;
            this.panel(x, y, rw, rh, who === null ? undefined : SIDE_COLOURS[who]);
            const line = solo
                ? `SURVIVED ${clock(r.seconds)}`
                : `${who === null ? 'NO WINNER' : `${v.labels[who]} WON`}`;
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#e8e0ff';
            if (tall) {
                ctx.textAlign = 'left';
                ctx.fillText(solo ? 'RUN' : `ROUND ${i + 1}`, x + 8, y + 12);
                ctx.textAlign = 'right';
                ctx.fillText(solo ? line : `${line}  ·  ${clock(r.seconds)}`, x + rw - 8, y + 12);
            } else {
                ctx.textAlign = 'center';
                ctx.fillText(solo ? 'RUN' : `ROUND ${i + 1}  ·  ${clock(r.seconds)}`, x + rw / 2, y + 13, rw - 8);
                ctx.fillStyle = who === null ? '#cbbcf5' : SIDE_COLOURS[who];
                ctx.fillText(line, x + rw / 2, y + 26, rw - 8);
            }
        });
        if (!s.exact) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 8.5px ${FONT}`;
            ctx.fillStyle = 'rgba(255,226,122,0.85)';
            const y = tall ? roundsY + 6 + n * (rh + 4) + 14 : roundsY + 58;
            ctx.fillText(
                'Recorded on another version of the game: these numbers may be a little off',
                W / 2,
                y,
                W - 20,
            );
        }
    }

    /** A side's fairy in a small medal, her name and what she's called (YOU, RIVAL…), in the scoreboard's row. */
    private sideName(v: MatchInfoView, s: MatchStats, side: number, x: number, y: number, t: number): void {
        const ctx = this.ctx;
        drawMedal(ctx, fairyById(s.fairies[side]), x, y, 14, t);
        ctx.textAlign = 'left';
        ctx.font = `600 10px ${FONT}`;
        ctx.fillStyle = '#fff7c2';
        ctx.fillText(v.names[side], x + 20, y - 1, 86);
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = SIDE_COLOURS[side];
        ctx.fillText(v.labels[side], x + 20, y + 10, 86);
    }

    /** The WINNER ribbon on the winning side's row. */
    private ribbon(xr: number, y: number): void {
        const ctx = this.ctx;
        ctx.fillStyle = '#ffe27a';
        slanted(xr - 40, y, 40, 9, 2)(ctx);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = `5px ${ARCADE}`;
        ctx.fillStyle = '#140a26';
        ctx.fillText('WINNER', xr - 20, y + 7);
    }

    /** The Graphs tab: the chosen graph of the match over time, its rounds marked, and its key. */
    private graph(v: MatchInfoView, s: MatchStats, tall: boolean, W: number, bleed: number, plot?: Plot): void {
        const ctx = this.ctx;
        const p: Plot =
            plot ??
            (tall ? { x: 30, y: 112, w: W - 42, h: 268 } : { x: 36 - bleed, y: 76, w: W + 2 * bleed - 70, h: 182 });
        const T = Math.max(1, s.seconds);
        const X = (t: number) => p.x + (t / T) * p.w;
        if (!plot) this.panel(p.x, p.y, p.w, p.h);
        // Time along the bottom, and where each round began.
        const step = [15, 30, 60, 120, 300].find(st => T / st <= 6) ?? 600;
        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        for (let t = 0; t <= T + 0.01; t += step) {
            ctx.fillStyle = 'rgba(203,188,245,0.8)';
            ctx.fillText(clock(t), X(t), p.y + p.h + 10);
            ctx.fillStyle = 'rgba(203,188,245,0.12)';
            ctx.fillRect(Math.round(X(t)), p.y, 1, p.h);
        }
        s.rounds.forEach((r, i) => {
            if (!i) return;
            const x = Math.round(X(r.start));
            ctx.fillStyle = 'rgba(255,226,122,0.45)';
            for (let y = p.y; y < p.y + p.h; y += 6) ctx.fillRect(x, y, 1, 3);
            ctx.textAlign = 'left';
            ctx.font = `5.5px ${ARCADE}`;
            ctx.fillStyle = 'rgba(255,226,122,0.8)';
            ctx.fillText(`R${i + 1}`, x + 3, p.y + p.h - 4);
        });

        const graph = GRAPHS[v.graph] ?? GRAPHS[0];
        const key: [string, string][] = [];
        if (graph === 'ADVANTAGE') {
            // Who was ahead, around an even line: the player's lead in pops and in attacks sent (behind: below).
            const pops = s.samples.map(x => x.pops[0] - x.pops[1]),
                atk = s.samples.map(x => x.attacks[0] - x.attacks[1]);
            const m = niceCeil(Math.max(1, ...pops.map(Math.abs), ...atk.map(Math.abs)));
            const band = 26;
            const inner = { x: p.x, y: p.y + band, w: p.w, h: p.h - 2 * band };
            const Y = (val: number) => inner.y + inner.h / 2 - (val / m) * (inner.h / 2);
            ctx.fillStyle = 'rgba(255,212,92,0.06)';
            ctx.fillRect(inner.x, inner.y, inner.w, inner.h / 2);
            ctx.fillStyle = 'rgba(143,216,255,0.06)';
            ctx.fillRect(inner.x, inner.y + inner.h / 2, inner.w, inner.h / 2);
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(inner.x, Math.round(Y(0)), inner.w, 1);
            this.axis([m, 0, -m], Y, p.x, (n: number) => (n > 0 ? `+${n}` : String(n)));
            ctx.save();
            ctx.translate(p.x + 9, inner.y + inner.h / 4);
            ctx.rotate(-Math.PI / 2);
            this.label(`${v.labels[0]} AHEAD`, 0, 0, 'rgba(255,212,92,0.55)');
            ctx.restore();
            ctx.save();
            ctx.translate(p.x + 9, inner.y + (inner.h * 3) / 4);
            ctx.rotate(-Math.PI / 2);
            this.label(`${v.labels[1]} AHEAD`, 0, 0, 'rgba(143,216,255,0.55)');
            ctx.restore();
            this.line(s, pops, X, Y, '#ffd45c');
            this.line(s, atk, X, Y, '#e8e0ff');
            // The big moments: the player's along the top, the rival's along the bottom.
            this.marks(s, X, p.y + 8, p.y + p.h - 8);
            key.push(['#ffd45c', 'POPS LEAD'], ['#e8e0ff', 'ATTACKS LEAD']);
        } else {
            const pick =
                graph === 'HEARTS'
                    ? (x: (typeof s.samples)[number]) => x.hull.map(h => h / 2)
                    : graph === 'POPS'
                      ? (x: (typeof s.samples)[number]) => x.pops
                      : (x: (typeof s.samples)[number]) => x.attacks;
            const series = [0, 1].map(side => s.samples.map(x => pick(x)[side]));
            const top = graph === 'HEARTS' ? C.MAX_HULL / 2 : niceCeil(Math.max(1, ...series.flat()));
            const pad = 8;
            const Y = (val: number) => p.y + p.h - pad - (val / top) * (p.h - 2 * pad);
            this.axis([top, top / 2, 0], Y, p.x, (n: number) => String(Math.round(n * 10) / 10));
            // The rival's line first, so the player's is on top where they meet.
            [1, 0].forEach(side => {
                if (graph !== 'HEARTS' || v.rival || side === 0)
                    this.line(s, series[side], X, Y, SIDE_COLOURS[side], graph === 'HEARTS');
            });
            key.push([SIDE_COLOURS[0], v.labels[0]], [SIDE_COLOURS[1], v.labels[1]]);
        }
        this.key(key, plot ? p.x + p.w / 2 : W / 2, p.y + p.h + (plot ? 32 : 22), graph === 'ADVANTAGE');
        if (!s.exact) {
            ctx.textAlign = 'right';
            ctx.font = `italic 600 8px ${FONT}`;
            ctx.fillStyle = 'rgba(255,226,122,0.85)';
            ctx.fillText('Recorded on another version: may be a little off', p.x + p.w, p.y - (plot ? 15 : 4));
        }
    }

    /** The scale's numbers down the left of a graph. */
    private axis(values: number[], Y: (v: number) => number, x: number, fmt: (v: number) => string): void {
        const ctx = this.ctx;
        ctx.textAlign = 'right';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.8)';
        for (const n of values) {
            ctx.fillText(fmt(n), x - 4, Y(n) + 2);
            ctx.fillStyle = 'rgba(203,188,245,0.12)';
            ctx.fillRect(x, Math.round(Y(n)), 4, 1);
            ctx.fillStyle = 'rgba(203,188,245,0.8)';
        }
    }

    /** A series as a line over the match, one point per sample; `steps` draws it as steps (hearts change at once). */
    private line(
        s: MatchStats,
        values: number[],
        X: (t: number) => number,
        Y: (v: number) => number,
        colour: string,
        steps = false,
    ): void {
        const ctx = this.ctx;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        s.samples.forEach((x, i) => {
            const px = X(x.t),
                py = Y(values[i]);
            if (!i) ctx.moveTo(px, py);
            else {
                if (steps) ctx.lineTo(px, Y(values[i - 1]));
                ctx.lineTo(px, py);
            }
        });
        ctx.stroke();
    }

    /** The big moments as lettered marks: the player's along `yTop`, the rival's along `yBottom`, stacked apart. */
    private marks(s: MatchStats, X: (t: number) => number, yTop: number, yBottom: number): void {
        const ctx = this.ctx;
        const placed: { x: number; side: number; row: number }[] = [];
        for (const e of s.events) {
            const x = X(e.t);
            let row = 0;
            while (row < 2 && placed.some(q => q.side === e.side && q.row === row && Math.abs(q.x - x) < 9)) row++;
            placed.push({ x, side: e.side, row });
            const y = e.side === 0 ? yTop + row * 9 : yBottom - row * 9;
            const m = MARKS[e.kind];
            ctx.fillStyle = m.colour;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.font = `4.5px ${ARCADE}`;
            ctx.fillStyle = '#140a26';
            ctx.fillText(m.letter, x, y + 2);
        }
    }

    /** The graph's key under it: each line's colour and name, and the marks' letters on the Advantage graph. */
    private key(lines: [string, string][], mid: number, y: number, marks: boolean): void {
        const ctx = this.ctx;
        ctx.font = `6px ${ARCADE}`;
        const parts = lines.map(([, name]) => ctx.measureText(name).width + 22);
        let x = mid - parts.reduce((a, b) => a + b, 0) / 2;
        lines.forEach(([colour, name], i) => {
            ctx.fillStyle = colour;
            ctx.fillRect(x, y - 3, 12, 2);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(name, x + 16, y);
            x += parts[i];
        });
        if (!marks) return;
        const kinds = Object.values(MARKS);
        ctx.font = `5px ${ARCADE}`;
        const widths = kinds.map(m => ctx.measureText(m.name).width + 16);
        x = mid - widths.reduce((a, b) => a + b, 0) / 2;
        kinds.forEach((m, i) => {
            ctx.fillStyle = m.colour;
            ctx.beginPath();
            ctx.arc(x + 4, y + 9, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.textAlign = 'left';
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(m.name, x + 10, y + 11);
            x += widths[i];
        });
    }

    /** A dark panel with a gold edge (or `edge`). */
    private panel(x: number, y: number, w: number, h: number, edge?: string): void {
        const ctx = this.ctx;
        if (kitReady()) {
            kitPanel(ctx, { x, y, w, h }, this.t, (x + y) * 0.01, !!edge);
            return;
        }
        ctx.fillStyle = 'rgba(20,12,48,0.85)';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = edge ?? 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    /** A fairy's medal with her name under it, and a small YOU or RIVAL over it. */
    private fairy(fy: Fairy, x: number, y: number, r: number, t: number, who: string): void {
        const ctx = this.ctx;
        drawMedal(ctx, fy, x, y, r, t);
        this.label(who, x, y - r - 6);
        ctx.textAlign = 'center';
        ctx.font = `600 11px ${FONT}`;
        ctx.fillStyle = '#fff7c2';
        ctx.fillText(fy.name, x, y + r + 15);
    }

    /** A small arcade-lettered caption. */
    private label(text: string, x: number, y: number, colour = '#cbbcf5'): void {
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = colour;
        ctx.fillText(text, x, y);
    }

    /** A button: lit in its colour, or dim when there's nothing to do. */
    private button(b: Box, text: string, on: boolean, color: string, t: number): void {
        const ctx = this.ctx;
        if (kitReady()) {
            kitButton(ctx, b, text, color === '#c9b8ff' ? 'violet' : 'gold', on, t);
            return;
        }
        ctx.save();
        if (on) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 8 + 3 * Math.sin(t * 5);
        }
        ctx.fillStyle = on ? color : 'rgba(40,30,70,0.85)';
        slanted(b.x, b.y, b.w, b.h, 5)(ctx);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = on ? '#ffffff' : 'rgba(120,100,160,0.7)';
        ctx.lineWidth = 1;
        slanted(b.x, b.y, b.w, b.h, 5)(ctx);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `8px ${ARCADE}`;
        ctx.fillStyle = on ? '#140a26' : 'rgba(203,188,245,0.5)';
        ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 4, b.w - 10);
    }
}

/** A slanted plate drawn in code over (x, y, w, h): a dark outline, a gold rim and a glossy gold, lilac or violet fill. */
function slantPlate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: 'gold' | 'lilac' | 'violet',
    t: number,
): void {
    const k = h * 0.3;
    /** Traces the plate's slanted outline, `i` in from its edge. */
    const shape = (i: number) => {
        ctx.beginPath();
        ctx.moveTo(x + k + i, y + i);
        ctx.lineTo(x + w - i, y + i);
        ctx.lineTo(x + w - k - i, y + h - i);
        ctx.lineTo(x + i, y + h - i);
        ctx.closePath();
    };
    ctx.save();
    ctx.lineJoin = 'round';
    if (kind !== 'violet') {
        ctx.shadowColor = kind === 'gold' ? 'rgba(255,190,60,0.55)' : 'rgba(200,150,255,0.55)';
        ctx.shadowBlur = 30 + 6 * Math.sin(t * 3);
    }
    shape(0);
    ctx.strokeStyle = '#1a0a10';
    ctx.lineWidth = 16;
    ctx.stroke();
    ctx.shadowBlur = 0;
    const rim = ctx.createLinearGradient(0, y, 0, y + h);
    rim.addColorStop(0, '#fff3b0');
    rim.addColorStop(0.45, '#f2b53a');
    rim.addColorStop(1, '#b8640c');
    ctx.fillStyle = rim;
    ctx.fill();
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    if (kind === 'gold') {
        fill.addColorStop(0, '#fff7b8');
        fill.addColorStop(0.45, '#ffd23e');
        fill.addColorStop(1, '#f6a40a');
    } else if (kind === 'lilac') {
        fill.addColorStop(0, '#f4e8ff');
        fill.addColorStop(0.5, '#c9a4ff');
        fill.addColorStop(1, '#9a70f0');
    } else {
        fill.addColorStop(0, '#4a2486');
        fill.addColorStop(0.5, '#25103f');
        fill.addColorStop(1, '#341762');
    }
    shape(7);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.clip();
    const hl = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
    hl.addColorStop(0, kind === 'violet' ? 'rgba(255,190,255,0.3)' : 'rgba(255,255,255,0.6)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl;
    ctx.fillRect(x, y, w, h * 0.5);
    ctx.restore();
}

/** A rounded plate over (x, y, w, h): deep violet with a gold edge (or a lilac one when `gold` is false). */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gold: boolean): void {
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, '#4a2286');
    fill.addColorStop(0.5, '#22103f');
    fill.addColorStop(1, '#341660');
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = gold ? goldGradient(ctx, y, y + h) : 'rgba(255,200,120,0.9)';
    ctx.lineWidth = 5;
    ctx.stroke();
}

/** A gold ring round a medal `r` across centred on (x, y): a dark outline under a gold band. */
function medalRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a0a10';
    ctx.lineWidth = 22;
    ctx.stroke();
    ctx.strokeStyle = goldGradient(ctx, y - r, y + r);
    ctx.lineWidth = 14;
    ctx.stroke();
}

/** The result's banner over (x, y, w, h): a pointed violet ribbon with a double gold edge and gold wing tips. */
function banner(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    const by = y + h * 0.18,
        bh = h * 0.56;
    // Gold feathered wings fanning out and up from the ends.
    for (const d of [-1, 1]) {
        const ex = d < 0 ? x + 90 : x + w - 90;
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.translate(ex, by + bh * 0.62);
            ctx.scale(d, 1);
            ctx.rotate(-0.95 + i * 0.32);
            const len = 150 - i * 22;
            ctx.beginPath();
            ctx.ellipse(len / 2, 0, len / 2, 20 - i * 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#2a1006';
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(len / 2, 0, len / 2 - 5, 15 - i * 2, 0, 0, Math.PI * 2);
            ctx.fillStyle = goldGradient(ctx, -20, 20);
            ctx.fill();
            ctx.restore();
        }
    }
    const shape = () => pointed(ctx, x + 60, by, w - 120, bh, 60);
    const fill = ctx.createLinearGradient(0, by, 0, by + bh);
    fill.addColorStop(0, '#5a2a9a');
    fill.addColorStop(0.5, '#2a1050');
    fill.addColorStop(1, '#3a1868');
    ctx.fillStyle = fill;
    shape();
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0a10';
    ctx.lineWidth = 14;
    shape();
    ctx.stroke();
    ctx.strokeStyle = goldGradient(ctx, by, by + bh);
    ctx.lineWidth = 7;
    shape();
    ctx.stroke();
}

/** The hint bar along the foot over (x, y, w, h): a dark capsule in a gold rim. */
function hintBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.save();
    ctx.shadowColor = 'rgba(255,190,70,0.4)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#1a0a10';
    roundRect(ctx, x - 6, y - 6, w + 12, h + 12, (h + 12) / 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = goldGradient(ctx, y, y + h);
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    const fill = ctx.createLinearGradient(0, y, 0, y + h);
    fill.addColorStop(0, '#3a1a70');
    fill.addColorStop(1, '#1a0b36');
    ctx.fillStyle = fill;
    roundRect(ctx, x + 8, y + 8, w - 16, h - 16, (h - 16) / 2);
    ctx.fill();
}
