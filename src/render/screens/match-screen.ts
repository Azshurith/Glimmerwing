// The match details screen: one game from Profile's match history in full, in three tabs. Overview has the result,
// both fairies, the score and its numbers, with buttons to watch its replay and copy its share link; Scoreboard has
// each side's numbers side by side and the rounds; Graphs has the match over time (who was ahead, hearts, pops and
// attacks sent), with its big moments marked. The Scoreboard and Graphs come from playing the replay through.
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import type { Fairy, HighlightKind, Layout, MatchInfoView, MatchStats, MatchTab, SideStats } from '@/types';
import { arcadeText, slanted } from '@/render/draw';
import { clock } from '@/render/hud';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { drawKit } from './kit';
import { kitButton, kitHintBar, kitPanel, kitPill, kitReady, kitTab } from './kit-ui';
import { drawMedal } from './profile-screen';
import { enter } from '@/render/transition';
import { ornateScreen, ornateTitle } from './ornate';

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
export function matchBoxes(layout: Layout, h: number = C.TALL_H): ReturnType<typeof designLayout> {
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
                enter(ctx, 'buttons', () => this.tab(b, GRAPHS[i], i === v.graph, '#c9b8ff', t, 6), { box: b, i: i + 3 }),
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
    private graph(v: MatchInfoView, s: MatchStats, tall: boolean, W: number, bleed: number): void {
        const ctx = this.ctx;
        const p: Plot = tall
            ? { x: 30, y: 112, w: W - 42, h: 268 }
            : { x: 36 - bleed, y: 76, w: W + 2 * bleed - 70, h: 182 };
        const T = Math.max(1, s.seconds);
        const X = (t: number) => p.x + (t / T) * p.w;
        this.panel(p.x, p.y, p.w, p.h);
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
        this.key(key, W / 2, p.y + p.h + 22, graph === 'ADVANTAGE');
        if (!s.exact) {
            ctx.textAlign = 'right';
            ctx.font = `italic 600 8px ${FONT}`;
            ctx.fillStyle = 'rgba(255,226,122,0.85)';
            ctx.fillText('Recorded on another version: may be a little off', p.x + p.w, p.y - 4);
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
