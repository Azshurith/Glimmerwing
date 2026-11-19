// The lobby, the game's main menu: a purple night over a still lake, a great planet rising behind the stage you've
// reached, which floats in the middle as an island (its scenery on top, cliffs below, rings of light on the water
// under it), with ◀ STAGE · NAME ▶ under it to look at the other stages you've opened (a tap on the island or the
// plate opens the trophy road). An ornate bar along the bottom holds Characters and Maps, a big winged PLAY in the
// middle (which opens the mode picker) and Profile and Settings; the player's plate sits at the top left with
// History, Ranking and Guide under it, the counters at the top right, World chat's latest lines at the bottom left
// (a tap opens the chat panel, the page's #chat) and friends down the right (a tab on the right edge on a phone).
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import { frameById } from '@/data/looks';
import { mapById } from '@/data/maps';
import type { Layout, LobbyView, MapTheme, TitleAction } from '@/types';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { drawTrophy } from '@/render/icons';
import { ARCADE, SANS } from '@/render/theme';
import { drawBadge, drawEmblem, hexA, roundRect } from './emblems';
import { tallMenuFit } from './menu-fit';
import { drawMedal } from './profile-screen';
import { enter } from '@/render/transition';
import { STAGES } from '@/data/stages';
import { drawPadlock } from './map-screen';
import { shine } from './kit';
import { frameCrest } from './roster-screen';
import { drawFlowers, drawNight, goldGradient, pointed } from './ornate';

/** A box, in design or view units. */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The other screens, in the bottom bar's order (two either side of PLAY). */
export const LOBBY_NAV: { action: TitleAction; label: string; sub: string; color: string }[] = [
    { action: 'characters', label: 'CHARACTERS', sub: 'Meet the fairies', color: '#ff9ac8' },
    { action: 'maps', label: 'MAPS', sub: 'Stages and their monsters', color: '#8ff0a0' },
    { action: 'profile', label: 'PROFILE', sub: 'Record, history, ranking', color: '#8fd8ff' },
    { action: 'settings', label: 'SETTINGS', sub: 'Sound, display, keys', color: '#c9b8ff' },
];

/** The quick buttons under the player's plate: the match history and the ranking (both on Profile), and the guide. */
export const LOBBY_QUICK = [
    { id: 'history', label: 'HISTORY', color: '#ffb35c' },
    { id: 'ranking', label: 'RANKING', color: '#ffd45c' },
    { id: 'guide', label: 'GUIDE', color: '#c9b8ff' },
] as const;

/** Paints a map's scenery over a rectangle, in the current transform. */
type StagePainter = (map: string, x: number, y: number, w: number, h: number) => void;

/** One of the mode picker's diamond tiles: its centre and half its diagonal. */
export interface Tile {
    x: number;
    y: number;
    d: number;
}

/**
 * The mode picker's tiles, in LOBBY_MODES order (Story, VS CPU, Endless, Online, 2 Players), as offsets from the
 * cluster's centre: VS CPU and Online Play big and side by side on the diagonal, the others small against their
 * edges; and the stage painted inside each.
 */
const MODE_TILES: { x: number; y: number; d: number; map: string }[] = (() => {
    const big = 66,
        small = 38,
        gap = 4;
    const bb = (big + big) / 4 + gap / 2,
        bs = (big + small) / 2 + gap;
    const cpu = { x: -bb, y: bb },
        online = { x: bb, y: -bb };
    return [
        { x: online.x - bs, y: online.y - bs, d: small, map: 'space' },
        { ...cpu, d: big, map: 'forest' },
        { x: cpu.x - bs, y: cpu.y - bs, d: small, map: 'volcano' },
        { ...online, d: big, map: 'castle' },
        { x: online.x + bs, y: online.y + bs, d: small, map: 'beach' },
    ];
})();

/** Whether the point (x, y) is inside a diamond tile. */
export function inTile(p: { x: number; y: number }, t: Tile): boolean {
    return Math.abs(p.x - t.x) + Math.abs(p.y - t.y) <= t.d;
}

/** How far apart two stages' gates are on the trophy road, in design units. */
const ROAD_STAGE = 200;

/**
 * The trophy road's geometry for a view `H` tall: where on screen the road's start sits (`anchor`, scrolled to 0),
 * how far apart the stages are, and how far up it scrolls (the last stage's gate under the heading).
 */
export function roadGeometry(layout: Layout, H: number): { anchor: number; step: number; max: number } {
    const anchor = H - (layout === 'tall' ? 150 : 112);
    return { anchor, step: ROAD_STAGE, max: Math.max(0, (STAGES.length - 1) * ROAD_STAGE - anchor + 112) };
}

/** Where `trophies` sit on the trophy road, in design units up from its start (the first stage's gate). */
export function roadAt(trophies: number): number {
    for (let k = 0; k < STAGES.length - 1; k++) {
        const a = STAGES[k].trophies,
            b = STAGES[k + 1].trophies;
        if (trophies < b) return (k + Math.max(0, trophies - a) / (b - a)) * ROAD_STAGE;
    }
    const last = STAGES[STAGES.length - 1].trophies;
    return (STAGES.length - 1 + Math.min(0.4, (trophies - last) / 2000)) * ROAD_STAGE;
}

/** Where everything on the lobby sits. */
export interface LobbyLayout {
    /** The PLAY button, and over everything once it's pressed, the mode picker's tiles and its close button. */
    play: Box;
    tiles: Tile[];
    close: Box;
    /** The bottom bar, and the four other screens in it (two either side of PLAY). */
    bar: Box;
    nav: Box[];
    /** The player's plate, and the quick buttons under it (History, Ranking, Guide). */
    plate: Box;
    quick: Box[];
    /** The stage plate under the island and its arrows; the island itself (a tap opens the road); the road's OK. */
    road: Box;
    prev: Box;
    next: Box;
    isle: Box;
    roadOk: Box;
    /** World chat's ticker (a tap opens the panel), and where the panel opens: the whole height, at the left. */
    ticker: Box;
    chat: Box;
    /** The friends panel, and on a phone the tab on the right edge that pulls it out. */
    friends: Box;
    friendsTab: Box | null;
    /** The island: the centre of its top and how wide it is. */
    island: { x: number; y: number; r: number };
}

/** The bottom bar's four screens, two either side of PLAY, as boxes splitting the room between its ends and PLAY. */
function barSlots(bar: Box, play: Box, pad: number): Box[] {
    const lw = (play.x - pad - (bar.x + pad)) / 2,
        rx = play.x + play.w + pad,
        rw = (bar.x + bar.w - pad - rx) / 2;
    return [
        { x: bar.x + pad, y: bar.y, w: lw, h: bar.h },
        { x: bar.x + pad + lw, y: bar.y, w: lw, h: bar.h },
        { x: rx, y: bar.y, w: rw, h: bar.h },
        { x: rx + rw, y: bar.y, w: rw, h: bar.h },
    ];
}

/**
 * The lobby's boxes in its design units: the usual 504-wide view reaching `bleed` past each side in landscape, or
 * the tall view `H` high on a phone.
 */
function designLayout(layout: Layout, H: number, bleed: number): LobbyLayout {
    if (layout === 'tall') {
        const W = C.TALL_W;
        // The sides keep to the screen's edges, however much wider than the design it is (`bleed`).
        const L = -bleed,
            R = W + bleed;
        const iy = Math.round(H * 0.33);
        const road = { x: W / 2 - 66, y: iy + 122, w: 132, h: 17 };
        // The four screens share the bar evenly, PLAY raised above its middle (a phone is too narrow for five
        // across).
        const bar = { x: L + 3, y: H - 54, w: R - L - 6, h: 50 };
        const play = { x: W / 2 - 60, y: bar.y - 44, w: 120, h: 38.5 };
        return {
            play,
            tiles: MODE_TILES.map(m => ({ x: W / 2 + m.x * 0.98, y: H / 2 + 14 + m.y * 0.98, d: m.d * 0.98 })),
            close: { x: R - 40, y: 44, w: 32, h: 32 },
            bar,
            nav: [0, 1, 2, 3].map(i => ({
                x: bar.x + 10 + (i * (bar.w - 20)) / 4,
                y: bar.y,
                w: (bar.w - 20) / 4,
                h: bar.h,
            })),
            plate: { x: L + 4, y: 3, w: 170, h: 34 },
            quick: LOBBY_QUICK.map((_, i) => ({ x: L + 6, y: 46 + i * 32, w: 28, h: 28 })),
            road,
            prev: { x: road.x - 26, y: road.y - 3, w: 22, h: 23 },
            next: { x: road.x + road.w + 4, y: road.y - 3, w: 22, h: 23 },
            isle: { x: W / 2 - 100, y: iy - 44, w: 200, h: 140 },
            roadOk: { x: W / 2 - 60, y: H - 54, w: 120, h: 38 },
            ticker: { x: L + 8, y: H - 162, w: R - L - 16, h: 46 },
            chat: { x: L, y: 0, w: R - L, h: H },
            friends: { x: R - 170, y: 44, w: 162, h: Math.min(300, H - 200) },
            friendsTab: { x: R - 24, y: 84, w: 24, h: 96 },
            island: { x: W / 2, y: iy, r: 96 },
        };
    }
    const W = C.VIEW_W,
        L = -bleed + 6,
        R = W + bleed - 6;
    // On a screen no wider than the usual view (a small or squarer window) the sides and the island draw in a little.
    const compact = bleed < 40;
    const side = compact ? 116 : 128,
        isle = compact ? 80 : 90;
    const road = { x: W / 2 - 64, y: 208, w: 128, h: 17 };
    const bar = { x: L + 14, y: 262, w: R - L - 28, h: 38 };
    // PLAY's gold face, sized and placed as on the UI kit's sheet, where the bar's halves end flush against it: the
    // sheet's bar is 194 pixels high, the face 680 by 218 and 10 above the bar's top.
    const k = bar.h / 194;
    const play = { x: W / 2 - 340 * k, y: bar.y - 10 * k, w: 680 * k, h: 218 * k };
    return {
        play,
        tiles: MODE_TILES.map(m => ({ x: W / 2 + m.x * 1.1, y: 194 + m.y * 1.1, d: m.d * 1.1 })),
        close: { x: R - 34, y: 34, w: 28, h: 28 },
        bar,
        nav: barSlots(bar, play, compact ? 18 : 26),
        plate: { x: L - 2, y: 2, w: compact ? 160 : 176, h: 40 },
        quick: LOBBY_QUICK.map((_, i) => ({ x: L + 2, y: 50 + i * 29, w: 80, h: 23 })),
        road,
        prev: { x: road.x - 24, y: road.y - 3, w: 20, h: 23 },
        next: { x: road.x + road.w + 4, y: road.y - 3, w: 20, h: 23 },
        isle: { x: W / 2 - isle, y: 104 - isle * 0.45, w: isle * 2, h: isle * 1.2 },
        roadOk: { x: W / 2 - 56, y: C.VIEW_H - 40, w: 112, h: 32 },
        ticker: { x: L, y: 186, w: side + 10, h: 56 },
        chat: { x: -bleed, y: 0, w: Math.max(210, Math.min(280, W / 2 - 108 + bleed)), h: C.VIEW_H },
        friends: { x: R - side, y: 36, w: side, h: 206 },
        friendsTab: null,
        island: { x: W / 2, y: 104, r: isle },
    };
}

/** The lobby's boxes in view units: the tap targets, and where the page puts the chat panel. */
export function lobbyLayout(layout: Layout, h: number = C.TALL_H, bleed = 0): LobbyLayout {
    if (layout !== 'tall') return designLayout(layout, C.VIEW_H, bleed);
    const f = tallMenuFit(h);
    const d = designLayout(layout, f.h, f.bleed);
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    return {
        ...d,
        play: view(d.play),
        tiles: d.tiles.map(t => ({ x: f.x + t.x * f.s, y: t.y * f.s, d: t.d * f.s })),
        close: view(d.close),
        bar: view(d.bar),
        nav: d.nav.map(view),
        plate: view(d.plate),
        quick: d.quick.map(view),
        road: view(d.road),
        prev: view(d.prev),
        next: view(d.next),
        isle: view(d.isle),
        roadOk: view(d.roadOk),
        ticker: view(d.ticker),
        chat: view(d.chat),
        friends: view(d.friends),
        friendsTab: d.friendsTab && view(d.friendsTab),
    };
}

/** The lobby. */
export class LobbyScreen {
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /**
     * Draw the lobby. `stage` paints a map's scenery over a rectangle; `bleed` is how far a widened landscape view
     * reaches past each side.
     */
    draw(v: LobbyView, t: number, layout: Layout, h: number, bleed: number, stage: StagePainter): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H;
        if (tall) {
            const f = tallMenuFit(h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
        }
        const lay = designLayout(layout, H, bleed);
        const theme = mapById(v.map);
        const isle = lay.island;
        // Coming in from another screen, the bars and buttons pop in first, then the night rises out of the dark,
        // then the panels slide in (see render/transition.ts).
        enter(ctx, 'bg', () => {
            const horizon = tall ? isle.y + isle.r * 1.05 : isle.y + isle.r * 1.15;
            drawNight(ctx, t, -bleed - 2, W + 2 * bleed + 4, H, {
                planet: { x: isle.x + isle.r * 0.15, y: isle.y - isle.r * 0.42, r: isle.r * 0.72 },
                horizon,
                art: 'lake',
            });
            drawFlowers(ctx, -bleed + 14, H - 14, tall ? 0.9 : 1.1, t, 0);
            drawFlowers(ctx, W + bleed - 14, H - 14, tall ? 0.9 : 1.1, t, 3);
        });
        if (theme) enter(ctx, 'panels', () => this.island(v.map, theme, isle, t, stage), { dx: 0, dy: 14 });
        enter(ctx, 'buttons', () => this.stagePlate(v, lay, t), { box: lay.road, i: 3 });
        enter(ctx, 'bar', () => this.header(v, lay.plate, t, W, bleed, tall));
        lay.quick.forEach((b, i) => enter(ctx, 'buttons', () => this.quickPill(b, i, t, tall), { box: b, i }));
        enter(ctx, 'panels', () => this.ticker(v, lay.ticker, t), { dx: -22 });
        if (lay.friendsTab === null || v.friendsOpen)
            enter(ctx, 'panels', () => this.friends(lay.friends, t), { dx: 22 });
        else {
            const tab = lay.friendsTab;
            enter(ctx, 'buttons', () => this.friendsTab(tab, t), { box: tab, i: 3 });
        }
        enter(ctx, 'buttons', () => this.bottomBar(v, lay, t, tall), { i: 1, dy: 10 });
        enter(ctx, 'buttons', () => this.playButton(v, lay.play, t, tall), { box: lay.play, i: 2 });
        if (!v.touch && !tall && !v.chatOpen) {
            enter(ctx, 'hint', () => {
                ctx.textAlign = 'center';
                ctx.font = `5px ${ARCADE}`;
                ctx.fillStyle = 'rgba(203,188,245,0.65)';
                ctx.fillText('◀ ▶ CHOOSE  ·  ▲ STAGES  ·  ENTER PICKS  ·  T CHAT', isle.x, H - 5, 260);
            });
        }
        if (v.picking) this.modePicker(v, lay, t, stage, W, H, bleed, tall);
        if (v.roadOpen) this.trophyRoad(v, lay, t, stage, W, H, bleed, tall);
        ctx.restore();
    }

    /**
     * The stage as a floating island: a swirl in the clouds below it, cliffs in the map's colours hanging under an
     * oval top that shows the map's own scenery (squashed, as if seen at an angle), a lit rim, a waterfall over
     * the front, and little rocks floating round it.
     */
    private island(
        map: string,
        theme: MapTheme,
        isle: { x: number; y: number; r: number },
        t: number,
        stage: StagePainter,
    ): void {
        const ctx = this.ctx;
        const bob = Math.sin(t * 0.8) * 2.5;
        const cx = isle.x,
            rx = isle.r,
            ry = rx * 0.42,
            cy = isle.y + bob;
        const depth = rx * 0.78;
        const [hl, face, shade, joint] = theme.cliff;
        // The swirl in the clouds below: rings turning slowly.
        ctx.save();
        const sy = isle.y + depth + 26;
        for (let i = 0; i < 4; i++) {
            ctx.strokeStyle = `rgba(120,200,255,${0.55 - i * 0.11})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([18 + i * 6, 10]);
            ctx.lineDashOffset = (i % 2 ? 1 : -1) * t * (14 - i * 2);
            ctx.beginPath();
            ctx.ellipse(cx, sy, rx * (0.6 + i * 0.32), rx * (0.12 + i * 0.07), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        const pool = ctx.createRadialGradient(cx, sy, 2, cx, sy, rx * 0.9);
        pool.addColorStop(0, 'rgba(110,190,255,0.35)');
        pool.addColorStop(1, 'rgba(110,190,255,0)');
        ctx.fillStyle = pool;
        ctx.beginPath();
        ctx.ellipse(cx, sy, rx * 0.9, rx * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // The cliffs: from the oval's sides down to a jagged point, lit on the left.
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - rx, cy);
        const tips = 9;
        for (let i = 0; i <= tips; i++) {
            const u = i / tips;
            const x = cx - rx + u * rx * 2;
            const sag = Math.sin(u * Math.PI);
            const jag = (i % 2 ? 0.62 : 0.86) + 0.08 * Math.sin(i * 2.7);
            ctx.lineTo(x, cy + ry * 0.6 + depth * sag * jag);
        }
        ctx.lineTo(cx + rx, cy);
        ctx.closePath();
        const cg = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
        cg.addColorStop(0, hl);
        cg.addColorStop(0.35, face);
        cg.addColorStop(1, shade);
        ctx.fillStyle = cg;
        ctx.fill();
        ctx.clip();
        // Strata across the face, and darkness lower down.
        ctx.strokeStyle = hexA(joint, 0.5);
        ctx.lineWidth = 1;
        for (let i = 1; i < 6; i++) {
            ctx.beginPath();
            const y = cy + ry * 0.4 + i * depth * 0.14;
            ctx.moveTo(cx - rx, y);
            for (let x = -rx; x <= rx; x += 12) ctx.lineTo(cx + x, y + Math.sin(x * 0.2 + i) * 2);
            ctx.stroke();
        }
        const dark = ctx.createLinearGradient(0, cy, 0, cy + depth + ry);
        dark.addColorStop(0, 'rgba(20,8,30,0)');
        dark.addColorStop(1, 'rgba(20,8,30,0.7)');
        ctx.fillStyle = dark;
        ctx.fillRect(cx - rx, cy, rx * 2, depth + ry);
        ctx.restore();
        // A waterfall over the front edge, falling into the clouds.
        const wx = cx - rx * 0.32;
        const fall = ctx.createLinearGradient(0, cy + ry * 0.8, 0, cy + depth + 30);
        fall.addColorStop(0, 'rgba(200,240,255,0.85)');
        fall.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = fall;
        ctx.fillRect(wx, cy + ry * 0.8, 6, depth + 10);
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let i = 0; i < 4; i++) {
            const fy = cy + ry * 0.8 + ((t * 40 + i * 17) % (depth * 0.8));
            ctx.fillRect(wx + 1 + (i % 2) * 3, fy, 1, 6);
        }
        // The top: the map's scenery in an oval, squashed to look tilted away, with a lit rim.
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        if (theme.terrain === 'islands') this.meadowTop(theme, cx, cy, rx, ry, t);
        else {
            ctx.translate(cx - rx, cy - ry);
            ctx.scale(1, ry / rx);
            stage(map, 0, 0, rx * 2, rx * 2);
        }
        ctx.restore();
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.clip();
        const rim = ctx.createRadialGradient(cx, cy + ry * 0.2, rx * 0.55, cx, cy, rx * 1.05);
        rim.addColorStop(0, 'rgba(0,0,0,0)');
        rim.addColorStop(1, 'rgba(30,10,40,0.55)');
        ctx.fillStyle = rim;
        ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        // The evening light falling across it.
        const glow = ctx.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
        glow.addColorStop(0, 'rgba(255,190,150,0.25)');
        glow.addColorStop(1, 'rgba(120,60,160,0.2)');
        ctx.fillStyle = glow;
        ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        ctx.restore();
        ctx.strokeStyle = hl;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI * 0.05, Math.PI * 0.95);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,230,200,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        // Rocks floating round it.
        for (let i = 0; i < 5; i++) {
            const a = i * 1.37 + 0.6;
            const rr = 4 + (i % 3) * 3;
            const fx = cx + Math.cos(a) * rx * (1.12 + (i % 2) * 0.18);
            const fy = cy + depth * 0.25 + Math.sin(a) * ry * 1.4 + Math.sin(t * 1.1 + i) * 3;
            ctx.fillStyle = face;
            ctx.beginPath();
            ctx.moveTo(fx - rr, fy);
            ctx.lineTo(fx + rr, fy);
            ctx.lineTo(fx + rr * 0.3, fy + rr * 1.3);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = hl;
            ctx.beginPath();
            ctx.ellipse(fx, fy, rr, rr * 0.38, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        // Sparkles over it.
        ctx.fillStyle = '#fff3d0';
        for (let i = 0; i < 7; i++) {
            const s = Math.max(0, Math.sin(t * 1.8 + i * 1.7));
            sparkle(ctx, cx + Math.cos(i * 2.3) * rx * 0.9, cy - ry - 6 - (i % 3) * 9, 0.8 + 2 * s);
        }
    }

    /**
     * The top of an island map's island (whose own scenery is open sky): a meadow in its top colours, a pond, a
     * cottage and trees in its leaves, flowers dotted about, all set out the same way every time, back to front.
     */
    private meadowTop(theme: MapTheme, cx: number, cy: number, rx: number, ry: number, t: number): void {
        const ctx = this.ctx;
        const [hi, body, tex] = theme.top;
        const g = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
        g.addColorStop(0, body);
        g.addColorStop(1, hi);
        ctx.fillStyle = g;
        ctx.fillRect(cx - rx, cy - ry, rx * 2, ry * 2);
        /** A spot on the oval from fixed numbers in [0, 1): (u across, v from back to front). */
        const at = (u: number, v: number) => {
            const a = u * Math.PI * 2,
                d = Math.sqrt(v) * 0.85;
            return { x: cx + Math.cos(a) * rx * d, y: cy + Math.sin(a) * ry * d };
        };
        /** The n-th fixed number in [0, 1). */
        const rnd = (n: number) => {
            const x = Math.sin(n * 12.9898) * 43758.5453;
            return x - Math.floor(x);
        };
        // Tufts of darker grass.
        ctx.fillStyle = tex;
        for (let i = 0; i < 70; i++) {
            const p = at(rnd(i), rnd(i + 100));
            ctx.fillRect(p.x, p.y, 2, 1);
        }
        // A winding path and a pond.
        ctx.strokeStyle = hexA(theme.cone[0], 0.75);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.7, cy + ry * 0.2);
        ctx.quadraticCurveTo(cx - rx * 0.1, cy - ry * 0.5, cx + rx * 0.2, cy + ry * 0.1);
        ctx.quadraticCurveTo(cx + rx * 0.45, cy + ry * 0.5, cx + rx * 0.75, cy + ry * 0.05);
        ctx.stroke();
        const [deep, water, light] = theme.water;
        const px = cx - rx * 0.35,
            py = cy + ry * 0.35;
        ctx.fillStyle = deep;
        ctx.beginPath();
        ctx.ellipse(px, py, rx * 0.2, ry * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = water;
        ctx.beginPath();
        ctx.ellipse(px, py - 1, rx * 0.17, ry * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = light;
        ctx.fillRect(px - rx * 0.08 + Math.sin(t) * 2, py - 3, rx * 0.06, 1);
        // Things standing on it, back to front: trees, a cottage, flowers.
        const things: { x: number; y: number; kind: number }[] = [];
        for (let i = 0; i < 16; i++) {
            const p = at(rnd(i + 200), 0.15 + rnd(i + 300) * 0.85);
            if (Math.hypot((p.x - px) / rx, (p.y - py) / ry) < 0.3) continue;
            things.push({ ...p, kind: i === 3 ? 1 : i % 4 === 0 ? 2 : 0 });
        }
        things.sort((a, b) => a.y - b.y);
        const [dark, mid, lit] = theme.leaves;
        for (const th of things) {
            if (th.kind === 0) {
                const s = 6 + (th.x % 4);
                ctx.fillStyle = theme.trunk;
                ctx.fillRect(th.x - 1, th.y - s * 0.4, 2, s * 0.5);
                ctx.fillStyle = dark;
                ctx.beginPath();
                ctx.arc(th.x, th.y - s * 0.9, s * 0.62, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = mid;
                ctx.beginPath();
                ctx.arc(th.x - 1, th.y - s * 1.0, s * 0.48, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = lit;
                ctx.beginPath();
                ctx.arc(th.x - 2, th.y - s * 1.15, s * 0.22, 0, Math.PI * 2);
                ctx.fill();
            } else if (th.kind === 1) {
                const [r1, r2] = theme.roof;
                ctx.fillStyle = '#f4e6c8';
                ctx.fillRect(th.x - 6, th.y - 7, 12, 7);
                ctx.fillStyle = r1;
                ctx.beginPath();
                ctx.moveTo(th.x - 8, th.y - 6);
                ctx.lineTo(th.x, th.y - 13);
                ctx.lineTo(th.x + 8, th.y - 6);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = r2;
                ctx.fillRect(th.x - 1.5, th.y - 4, 3, 4);
            } else {
                ctx.fillStyle = theme.flower[(th.x | 0) % 2];
                for (let k = 0; k < 4; k++)
                    ctx.fillRect(th.x + (k % 2) * 3 - 2, th.y + Math.floor(k / 2) * 2, 1.5, 1.5);
            }
        }
    }

    /** Whether the game server is reached: a light and a word, right-aligned at `rx`. */
    private online(v: LobbyView, rx: number, cy: number): void {
        const ctx = this.ctx;
        const label = v.online ? 'ONLINE' : 'OFFLINE';
        ctx.font = `5px ${ARCADE}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = v.online ? '#8ff0a0' : '#a99fc8';
        ctx.fillText(label, rx, cy + 2);
        ctx.beginPath();
        ctx.arc(rx - ctx.measureText(label).width - 5, cy, 2.3, 0, Math.PI * 2);
        ctx.fill();
    }

    /** An avatar in its frame's colours: a ring (turning, for a frame earned on the trophy road) round her face. */
    private framedAvatar(fairy: string, frame: string, x: number, y: number, r: number, t: number): void {
        const ctx = this.ctx;
        const f = frameById(frame);
        const [a, b] = f.colors;
        ctx.save();
        if (f.trophies >= 600) {
            ctx.shadowColor = a;
            ctx.shadowBlur = 6 + 2 * Math.sin(t * 3);
        }
        const ring = f.trophies
            ? ctx.createConicGradient(t, x, y)
            : ctx.createLinearGradient(x - r, y - r, x + r, y + r);
        ring.addColorStop(0, a);
        ring.addColorStop(0.5, b);
        ring.addColorStop(1, a);
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(x, y, r + 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawMedal(ctx, fairyById(fairy), x, y, r, t);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }

    /** The friends panel: online count, empty places where friends will be, and the buttons that will add them. */
    private friends(b: Box, t: number): void {
        const ctx = this.ctx;
        lobbyPanel(ctx, b, 9, t, 2.5);
        // Online count and the switch beside it.
        ctx.textAlign = 'left';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('ONLINE 0/0', b.x + 10, b.y + 12);
        toggle(ctx, b.x + b.w - 30, b.y + 5.5, 19, 9.5, true);
        // Friend rows, empty for now.
        const rows = Math.max(3, Math.min(5, Math.floor((b.h - 80) / 32)));
        for (let i = 0; i < rows; i++) {
            const y = b.y + 22 + i * 32;
            ctx.strokeStyle = 'rgba(214,204,250,0.25)';
            ctx.setLineDash([2, 2]);
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(b.x + 20, y + 13, 10, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            const shimmer = 0.1 + 0.07 * Math.sin(t * 2 + i);
            ctx.fillStyle = `rgba(214,204,250,${shimmer})`;
            roundRect(ctx, b.x + 36, y + 6, b.w - 74, 5, 2.5);
            ctx.fill();
            roundRect(ctx, b.x + 36, y + 15, b.w - 92, 4, 2);
            ctx.fill();
            ctx.strokeStyle = `rgba(214,204,250,${shimmer + 0.1})`;
            ctx.strokeRect(b.x + b.w - 24, y + 7, 12, 12);
            ctx.fillStyle = 'rgba(214,204,250,0.12)';
            ctx.fillRect(b.x + 8, y + 29, b.w - 16, 0.6);
        }
        const ny = b.y + 30 + rows * 32;
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#ffe27a';
        ctx.fillText('FRIENDS COMING NEXT', b.x + b.w / 2, ny);
        ctx.font = `700 7.5px ${SANS}`;
        ctx.fillStyle = 'rgba(214,204,250,0.85)';
        ['Add them by code, from your', 'matches or from World chat.'].forEach((l, i) =>
            ctx.fillText(l, b.x + b.w / 2, ny + 11 + i * 10, b.w - 10),
        );
        // The buttons along the bottom: friends, add, requests.
        const by = b.y + b.h - 16;
        ctx.fillStyle = 'rgba(214,204,250,0.12)';
        ctx.fillRect(b.x + 6, by - 8, b.w - 12, 0.6);
        [0, 1, 2].forEach(i => {
            const x = b.x + b.w * (0.2 + i * 0.3);
            smallOrb(ctx, x, by, 8);
            this.person(x, by + 0.5, i, '#f4ecff');
        });
    }

    /** A small person icon for the friends panel's buttons: with a friend, with a plus, or with a letter. */
    private person(x: number, y: number, kind: number, ink = 'rgba(214,204,250,0.6)'): void {
        const ctx = this.ctx;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(x, y - 3, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x, y + 4, 4.2, 3, 0, Math.PI, 0);
        ctx.fill();
        if (kind === 0) {
            ctx.beginPath();
            ctx.arc(x - 5, y - 1.5, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (kind === 1) {
            ctx.fillRect(x + 4, y - 4.5, 4, 1.2);
            ctx.fillRect(x + 5.4, y - 6, 1.2, 4);
        } else {
            ctx.strokeStyle = ink;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3.5, y - 6, 5, 3.5);
        }
    }

    /** A quick icon in the top bar: a small gold-ringed badge with its picture. */
    private quickIcon(b: Box, i: number, t: number): void {
        const ctx = this.ctx;
        const q = LOBBY_QUICK[i];
        const r = Math.min(b.w, b.h) / 2 - 1,
            cx = b.x + b.w / 2,
            cy = b.y + b.h / 2;
        drawBadge(ctx, q.color, cx, cy, r, false, t);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(r / 12, r / 12);
        ctx.strokeStyle = '#fff6dc';
        ctx.fillStyle = '#fff6dc';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (q.id === 'history') {
            // A clock face with a back-turning arrow.
            ctx.beginPath();
            ctx.arc(0, 0, 6, -Math.PI * 0.8, Math.PI * 1.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-5.8, -4.3);
            ctx.lineTo(-6.2, -1.1);
            ctx.lineTo(-3.1, -1.9);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, -3.4);
            ctx.lineTo(0, 0);
            ctx.lineTo(2.5, 1.7);
            ctx.stroke();
        } else if (q.id === 'ranking') {
            // A podium.
            ctx.globalAlpha = 0.35;
            ctx.fillRect(-7, -1, 4.5, 6);
            ctx.fillRect(-2.2, -5, 4.4, 10);
            ctx.fillRect(2.6, 1, 4.5, 4);
            ctx.globalAlpha = 1;
            ctx.strokeRect(-7, -1, 4.5, 6);
            ctx.strokeRect(-2.2, -5, 4.4, 10);
            ctx.strokeRect(2.6, 1, 4.5, 4);
        } else {
            ctx.textAlign = 'center';
            ctx.font = `11px ${ARCADE}`;
            ctx.fillText('?', 0, 4);
        }
        ctx.restore();
    }

    /**
     * The mode picker, over the dimmed lobby: the modes as diamond tiles in a lattice, each its stage painted inside
     * with the mode's emblem and name over it (VS CPU and Online Play big, the others small), the one with the
     * cursor lifted in a glowing gold edge, one that can't be played greyed with its reason; a close button.
     */
    private modePicker(
        v: LobbyView,
        lay: LobbyLayout,
        t: number,
        stage: StagePainter,
        W: number,
        H: number,
        bleed: number,
        tall: boolean,
    ): void {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(6,4,18,0.8)';
        ctx.fillRect(-bleed - 4, 0, W + 2 * bleed + 8, H);
        // Light rays turning behind the tiles.
        const mid = { x: (lay.tiles[1].x + lay.tiles[3].x) / 2, y: (lay.tiles[1].y + lay.tiles[3].y) / 2 };
        ctx.save();
        ctx.translate(mid.x, mid.y);
        ctx.rotate(t * 0.08);
        for (let i = 0; i < 12; i++) {
            ctx.rotate(Math.PI / 6);
            ctx.fillStyle = i % 2 ? 'rgba(255,214,140,0.05)' : 'rgba(170,140,255,0.05)';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-30, -400);
            ctx.lineTo(30, -400);
            ctx.fill();
        }
        ctx.restore();
        arcadeText(
            ctx,
            'CHOOSE A MODE',
            W / 2,
            tall ? 52 : 46,
            tall ? 14 : 16,
            ['#fff7c2', '#ffd45c', '#ff9a2e'],
            'center',
        );
        // The tile with the cursor is drawn last, on top.
        const order = v.modes.map((_, i) => i).filter(i => i !== v.pick);
        order.push(v.pick);
        for (const i of order) this.modeTile(v, i, lay.tiles[i], i === v.pick, t, stage);
        // The close button.
        const cb = lay.close;
        ctx.fillStyle = 'rgba(20,12,48,0.9)';
        slanted(cb.x, cb.y, cb.w, cb.h, 4)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.strokeStyle = '#fff3c9';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const k = cb.w * 0.2;
        ctx.beginPath();
        ctx.moveTo(cb.x + cb.w / 2 - k, cb.y + cb.h / 2 - k);
        ctx.lineTo(cb.x + cb.w / 2 + k, cb.y + cb.h / 2 + k);
        ctx.moveTo(cb.x + cb.w / 2 + k, cb.y + cb.h / 2 - k);
        ctx.lineTo(cb.x + cb.w / 2 - k, cb.y + cb.h / 2 + k);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP A MODE TO PLAY  ·  ✕ TO CLOSE' : 'ARROWS CHOOSE  ·  ENTER PLAYS  ·  ESC CLOSES';
        ctx.fillText(hint, W / 2, H - (tall ? 16 : 5), W - 20);
    }

    /** One mode's diamond tile: its stage inside, darkening downward, the mode's emblem and name. */
    private modeTile(v: LobbyView, i: number, tile: Tile, on: boolean, t: number, stage: StagePainter): void {
        const ctx = this.ctx;
        const m = v.modes[i];
        const big = tile.d > 50;
        const d = tile.d * (on ? 1.06 : 1) + (on ? Math.sin(t * 4) * 0.6 : 0);
        const x = tile.x,
            y = tile.y;
        /** Trace the diamond. */
        const diamond = (r: number) => {
            ctx.beginPath();
            ctx.moveTo(x, y - r);
            ctx.lineTo(x + r, y);
            ctx.lineTo(x, y + r);
            ctx.lineTo(x - r, y);
            ctx.closePath();
        };
        ctx.save();
        if (m.off) {
            ctx.filter = 'grayscale(1)';
            ctx.globalAlpha = 0.75;
        }
        ctx.save();
        if (on) {
            ctx.shadowColor = m.off ? '#9a9a9a' : '#ffb43c';
            ctx.shadowBlur = 18 + 4 * Math.sin(t * 5);
        }
        ctx.fillStyle = '#140c30';
        diamond(d);
        ctx.fill();
        ctx.restore();
        ctx.save();
        diamond(d - 1);
        ctx.clip();
        stage(MODE_TILES[i].map, x - d, y - d, d * 2, d * 2);
        const shade = ctx.createLinearGradient(0, y - d, 0, y + d);
        shade.addColorStop(0, on ? 'rgba(20,10,40,0.05)' : 'rgba(20,10,40,0.3)');
        shade.addColorStop(0.55, on ? 'rgba(20,10,40,0.35)' : 'rgba(20,10,40,0.55)');
        shade.addColorStop(1, 'rgba(10,6,28,0.92)');
        ctx.fillStyle = shade;
        ctx.fillRect(x - d, y - d, d * 2, d * 2);
        ctx.restore();
        // The edge: gold, brighter and doubled on the tile with the cursor.
        ctx.strokeStyle = on ? '#ffe9a0' : 'rgba(201,162,74,0.75)';
        ctx.lineWidth = on ? 2.2 : 1.2;
        diamond(d);
        ctx.stroke();
        if (on) {
            ctx.strokeStyle = hexA(m.color, 0.8);
            ctx.lineWidth = 1;
            diamond(d - 4);
            ctx.stroke();
        }
        // The emblem, on a badge in the mode's colour, and the name under it.
        const er = d * (big ? 0.24 : 0.3);
        const ey = y - d * (big ? 0.12 : 0.1);
        drawBadge(ctx, m.color, x, ey, er, on, t);
        drawEmblem(ctx, m.action, x, ey, er / 34, t, on);
        const size = big ? 11 : 6.5;
        arcadeText(
            ctx,
            m.label,
            x,
            y + d * (big ? 0.38 : 0.42),
            size,
            on ? ['#ffffff', '#fff3a0', '#ffb43c'] : ['#ffffff', '#efe6ff', '#cbbcf5'],
            'center',
            d * (big ? 1.25 : 1.35),
        );
        if (big && !m.off) {
            ctx.textAlign = 'center';
            ctx.font = `700 6.5px ${SANS}`;
            ctx.fillStyle = 'rgba(239,230,255,0.85)';
            ctx.fillText(m.sub, x, y + d * 0.52, d * 0.95);
        }
        ctx.restore();
        if (m.off) {
            // A ribbon across it saying why it can't be played.
            ctx.save();
            ctx.translate(x, y + d * 0.05);
            ctx.rotate(-0.18);
            const rw = d * 1.3;
            ctx.fillStyle = '#ff5a8a';
            slanted(-rw / 2, -6, rw, 12, 3)(ctx);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.font = `${big ? 6 : 5}px ${ARCADE}`;
            ctx.fillStyle = '#fff';
            ctx.fillText(m.ribbon === 'Coming soon' ? 'COMING SOON' : 'OFF', 0, 2.5, rw - 6);
            ctx.restore();
        }
    }

    /**
     * The trophy road, over everything: a carpet running up the middle of the screen with a step for every few
     * trophies (gold once reached) and, at each stage, a gate with its scenery in a window, its name and the trophies
     * it needs (gold once open, dark and padlocked until then); the player's avatar on the carpet at their trophies.
     * It scrolls (`v.roadScroll`, design units up from its start): drag, the wheel or ▲ ▼. OK closes it.
     */
    private trophyRoad(
        v: LobbyView,
        lay: LobbyLayout,
        t: number,
        stage: StagePainter,
        W: number,
        H: number,
        bleed: number,
        tall: boolean,
    ): void {
        const ctx = this.ctx;
        const g = roadGeometry(tall ? 'tall' : 'wide', H);
        const x0 = -bleed - 4,
            w = W + 2 * bleed + 8;
        const cx = W / 2;
        /** Where a point `u` units up the road is on screen. */
        const Y = (u: number) => g.anchor - (u - v.roadScroll);
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#1a0c3a');
        bg.addColorStop(1, '#0c0620');
        ctx.fillStyle = bg;
        ctx.fillRect(x0, 0, w, H);
        // Stone walls either side, in bands that scroll with the road.
        ctx.save();
        ctx.globalAlpha = 0.5;
        const band = 24,
            off = ((v.roadScroll % band) + band) % band;
        for (let y = -band + off; y < H + band; y += band) {
            ctx.fillStyle = Math.floor((y - off) / band) % 2 ? 'rgba(60,40,110,0.35)' : 'rgba(40,26,88,0.35)';
            ctx.fillRect(x0, y, w, band - 1);
        }
        ctx.restore();
        // The carpet, purple with gold edges and a lighter stripe down the middle.
        const cw = tall ? 54 : 60;
        const carpet = ctx.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0);
        carpet.addColorStop(0, '#4a1a78');
        carpet.addColorStop(0.5, '#7a34b8');
        carpet.addColorStop(1, '#4a1a78');
        ctx.fillStyle = carpet;
        ctx.fillRect(cx - cw / 2, 0, cw, H);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(cx - cw / 2 - 2, 0, 2, H);
        ctx.fillRect(cx + cw / 2, 0, 2, H);
        ctx.fillStyle = 'rgba(255,214,255,0.18)';
        ctx.fillRect(cx - 3, 0, 6, H);
        const best = v.best;
        const sw = tall ? 168 : 190;
        // The steps between the gates, then the gates over them.
        for (let k = 0; k < STAGES.length - 1; k++) {
            const a = STAGES[k].trophies,
                b = STAGES[k + 1].trophies;
            for (let j = 1; j <= 3; j++) {
                const u = (k + j / 4) * g.step;
                const y = Y(u);
                if (y < -30 || y > H + 30) continue;
                const n = Math.round((a + ((b - a) * j) / 4) / 10) * 10;
                const got = best >= n;
                const sh = 30;
                ctx.save();
                const sg = ctx.createLinearGradient(0, y - sh / 2, 0, y + sh / 2);
                sg.addColorStop(0, got ? '#ffe08a' : '#5a4a8a');
                sg.addColorStop(1, got ? '#d08a2a' : '#2a2050');
                ctx.fillStyle = sg;
                slanted(cx - sw / 2, y - sh / 2, sw, sh, 6)(ctx);
                ctx.fill();
                ctx.strokeStyle = got ? '#fff3c9' : 'rgba(201,162,74,0.55)';
                ctx.lineWidth = 1;
                ctx.stroke();
                // The carpet runs over the step's middle; trophies on the stone either side.
                ctx.fillStyle = got ? 'rgba(122,52,184,0.9)' : 'rgba(74,26,120,0.9)';
                ctx.fillRect(cx - cw / 2, y - sh / 2 + 1, cw, sh - 2);
                ctx.restore();
                drawTrophy(ctx, cx - sw / 2 + 22, y, 7);
                drawTrophy(ctx, cx + sw / 2 - 22, y, 7);
                arcadeText(
                    ctx,
                    String(n),
                    cx,
                    y + 5,
                    12,
                    got ? ['#ffffff', '#fff3c9', '#ffe08a'] : ['#e9e2ff', '#cbbcf5', '#9a88c8'],
                    'center',
                );
            }
        }
        STAGES.forEach((st, k) => {
            const y = Y(k * g.step);
            if (y < -90 || y > H + 90) return;
            this.roadGate(st.mapId, k, st.trophies, best >= st.trophies, cx, y, tall, t, stage);
        });
        // The player on the carpet at their trophies.
        const my = Y(roadAt(v.trophies));
        if (my > -20 && my < H + 20) {
            const r = tall ? 13 : 14;
            const bob = Math.sin(t * 3) * 2;
            this.framedAvatar(v.fairy, v.frame, cx, my + bob, r, t);
            const tag = `YOU  ${v.trophies}`;
            ctx.font = `7px ${ARCADE}`;
            const tw = ctx.measureText(tag).width + 18;
            const tx = cx + r + 8;
            ctx.fillStyle = 'rgba(20,12,48,0.92)';
            slanted(tx, my - 7 + bob, tw, 14, 4)(ctx);
            ctx.fill();
            ctx.strokeStyle = '#ffd45c';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.textAlign = 'left';
            ctx.fillStyle = '#ffe08a';
            ctx.fillText(tag, tx + 7, my + 3 + bob);
            drawTrophy(ctx, tx + tw - 8, my + bob, 4.5);
        }
        // The heading, and the OK button.
        const hh = tall ? 36 : 27;
        const hg = ctx.createLinearGradient(0, 0, 0, hh);
        hg.addColorStop(0, 'rgba(10,6,28,0.98)');
        hg.addColorStop(1, 'rgba(10,6,28,0.8)');
        ctx.fillStyle = hg;
        ctx.fillRect(x0, 0, w, hh);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(x0, hh, w, 1);
        arcadeText(ctx, 'TROPHY ROAD', cx, hh / 2 + 6, tall ? 14 : 16, ['#fff7c2', '#ffd45c', '#ff9a2e'], 'center');
        ctx.textAlign = 'right';
        ctx.font = `${tall ? 9 : 9}px ${ARCADE}`;
        ctx.fillStyle = '#ffe08a';
        ctx.fillText(String(v.trophies), W + bleed - 10, hh / 2 + 4);
        drawTrophy(ctx, W + bleed - 18 - ctx.measureText(String(v.trophies)).width, hh / 2, 6);
        const fade = ctx.createLinearGradient(0, H - 60, 0, H);
        fade.addColorStop(0, 'rgba(10,6,28,0)');
        fade.addColorStop(1, 'rgba(10,6,28,0.95)');
        ctx.fillStyle = fade;
        ctx.fillRect(x0, H - 60, w, 60);
        const ok = lay.roadOk;
        const okBar = slanted(ok.x, ok.y, ok.w, ok.h, 8);
        ctx.save();
        ctx.shadowColor = '#ffb43c';
        ctx.shadowBlur = 12 + 4 * Math.sin(t * 5);
        const og = ctx.createLinearGradient(ok.x, 0, ok.x + ok.w, 0);
        og.addColorStop(0, '#fff0a8');
        og.addColorStop(0.5, '#ffd45c');
        og.addColorStop(1, '#ff9a2e');
        ctx.fillStyle = og;
        okBar(ctx);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = '#fffbe0';
        ctx.lineWidth = 1.5;
        okBar(ctx);
        ctx.stroke();
        arcadeText(ctx, 'OK', ok.x + ok.w / 2, ok.y + ok.h / 2 + 6, 16, ['#5a1a2e', '#3a0f2e', '#2a0f2e'], 'center');
        if (!v.touch) {
            ctx.textAlign = 'left';
            ctx.font = `5.5px ${ARCADE}`;
            ctx.fillStyle = 'rgba(203,188,245,0.7)';
            ctx.fillText('▲ ▼ / WHEEL SCROLLS', x0 + 14, H - 14);
        }
    }

    /**
     * One stage's gate on the trophy road, centred on (cx, y): a banner with the stage's scenery in an arched window,
     * STAGE n and its name over it, and the trophies it needs; gold once open, dark with a padlock until then.
     */
    private roadGate(
        map: string,
        k: number,
        need: number,
        open: boolean,
        cx: number,
        y: number,
        tall: boolean,
        t: number,
        stage: StagePainter,
    ): void {
        const ctx = this.ctx;
        const gw = tall ? 220 : 250,
            gh = 112;
        const x = cx - gw / 2,
            top = y - gh / 2;
        // The banner: a slanted plate with a gold (or dim) frame, glowing once open.
        ctx.save();
        if (open) {
            ctx.shadowColor = '#ffb43c';
            ctx.shadowBlur = 12;
        }
        const g = ctx.createLinearGradient(0, top, 0, top + gh);
        g.addColorStop(0, open ? '#5a2a8a' : '#2a2050');
        g.addColorStop(1, open ? '#2a1250' : '#141030');
        ctx.fillStyle = g;
        slanted(x, top, gw, gh, 10)(ctx);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = open ? '#ffd45c' : 'rgba(201,162,74,0.5)';
        ctx.lineWidth = open ? 2 : 1.2;
        slanted(x, top, gw, gh, 10)(ctx);
        ctx.stroke();
        // The scenery in an arched window.
        const ww = gw * 0.56,
            wh = 58,
            wx = cx - ww / 2,
            wy = top + 24;
        /** Trace the window: straight sides, an arch on top. */
        const win = () => {
            ctx.beginPath();
            ctx.moveTo(wx, wy + wh);
            ctx.lineTo(wx, wy + ww * 0.25);
            ctx.quadraticCurveTo(wx, wy, cx, wy);
            ctx.quadraticCurveTo(wx + ww, wy, wx + ww, wy + ww * 0.25);
            ctx.lineTo(wx + ww, wy + wh);
            ctx.closePath();
        };
        ctx.save();
        win();
        ctx.clip();
        stage(map, wx, wy, ww, wh);
        if (!open) {
            ctx.fillStyle = 'rgba(8,5,22,0.72)';
            ctx.fillRect(wx, wy, ww, wh);
        }
        ctx.restore();
        ctx.strokeStyle = open ? '#fff3c9' : 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1.5;
        win();
        ctx.stroke();
        if (!open) drawPadlock(ctx, cx, wy + wh * 0.42, 22);
        // STAGE n, the name, and the trophies it needs.
        ctx.textAlign = 'center';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = open ? '#ffe08a' : '#9a88c8';
        ctx.fillText(`STAGE ${k + 1}`, cx, top + 15);
        const name = (mapById(map)?.name ?? map).toUpperCase();
        arcadeText(
            ctx,
            name,
            cx,
            wy + wh + 15,
            13,
            open ? ['#ffffff', '#fff3a0', '#ffb43c'] : ['#cbbcf5', '#9a88c8', '#6a5a9a'],
            'center',
        );
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = open ? '#fff3c9' : '#cbbcf5';
        const label = need ? String(need) : 'START';
        const lw = ctx.measureText(label).width;
        ctx.fillText(label, cx + (need ? 5 : 0), wy + wh + 27);
        if (need) drawTrophy(ctx, cx - lw / 2 - 2, wy + wh + 24.5, 4.5);
        // Gold crowns at the banner's corners once it's open.
        if (open) {
            ctx.fillStyle = '#ffd45c';
            sparkle(ctx, x + 14, top + 12, 3 + Math.abs(Math.sin(t * 2 + k)) * 1.5);
            sparkle(ctx, x + gw - 14, top + 12, 3 + Math.abs(Math.cos(t * 2 + k)) * 1.5);
        }
    }

    /**
     * The player's plate in the top-left corner: their avatar in an ornate gold ring (a curl either side, a star under
     * it), their name large and their wins under it, over a sweeping gold underline that curls up at its end; and at
     * the top right the counters (stages open, trophies) on slanted plates and the server's light on a capsule.
     */
    private header(v: LobbyView, b: Box, t: number, W: number, bleed: number, tall: boolean): void {
        const ctx = this.ctx;
        const r = tall ? 13 : 15;
        const ax = b.x + r + 7,
            ay = b.y + b.h / 2;
        // The plate: a dark violet card with rounded corners and a soft lilac edge, running from behind the avatar.
        const px = ax,
            py = b.y + 3,
            pw = b.x + b.w - px,
            ph = b.h - 6;
        const g = ctx.createLinearGradient(0, py, 0, py + ph);
        g.addColorStop(0, 'rgba(46,22,92,0.94)');
        g.addColorStop(1, 'rgba(20,8,46,0.94)');
        ctx.save();
        ctx.shadowColor = 'rgba(150,80,255,0.4)';
        ctx.shadowBlur = 14;
        ctx.fillStyle = g;
        roundRect(ctx, px, py, pw, ph, 7);
        ctx.fill();
        ctx.restore();
        gloss(ctx, () => roundRect(ctx, px, py, pw, ph, 7), px, py, pw, ph);
        goldEdge(ctx, () => roundRect(ctx, px, py, pw, ph, 7), py, py + ph);
        shine(ctx, () => roundRect(ctx, px, py, pw, ph, 7), px, py, pw, ph, t, 0, 6);
        // Sparkles in its top-right corner.
        const tw = 0.6 + Math.abs(Math.sin(t * 1.7)) * 0.4;
        ctx.fillStyle = `rgba(255,236,190,${0.75 * tw})`;
        sparkle(ctx, px + pw - 12, py + 9, 3.6 * tw + 1);
        ctx.fillStyle = 'rgba(255,236,190,0.5)';
        sparkle(ctx, px + pw - 22, py + 5, 1.6);
        sparkle(ctx, px + pw - 6, py + ph - 9, 1.4);
        // The swoosh: a gold crescent from above the avatar round its left and under it, sweeping off along the plate's
        // foot and thinning to a point.
        const by = py + ph - 1.5;
        const tip = px + pw * 0.62;
        ctx.fillStyle = goldGradient(ctx, ay - r - 6, by + 2);
        ctx.beginPath();
        ctx.arc(ax - 1, ay + 0.5, r + 7.5, -2.45, Math.PI / 2 + 0.25, true);
        ctx.bezierCurveTo(ax + r, by + 3, tip - 30, by + 1, tip, by - 1);
        ctx.bezierCurveTo(tip - 30, by - 0.5, ax + r, by + 0.5, ax + 4, ay + r + 3.2);
        ctx.arc(ax + 1.2, ay + 0.6, r + 3.2, Math.PI / 2 + 0.05, -2.45, false);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, by - 4, by + 2);
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(tip - 20, by + 1.2);
        ctx.quadraticCurveTo(tip + 30, by + 0.5, px + pw - 14, by - 4);
        ctx.stroke();
        const sa = -2.45;
        ctx.fillStyle = '#fff3c9';
        const sr = 2.4 + Math.abs(Math.sin(t * 2)) * 1.2;
        sparkle(ctx, ax - 1 + Math.cos(sa) * (r + 6.5), ay + 0.5 + Math.sin(sa) * (r + 6.5), sr);
        // The avatar in its gold ring.
        this.framedAvatar(v.fairy, v.frame, ax, ay, r, t);
        ctx.strokeStyle = goldGradient(ctx, ay - r, ay + r);
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(ax, ay, r + 1.6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(70,40,10,0.6)';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(ax, ay, r + 3, 0, Math.PI * 2);
        ctx.stroke();
        // Name, then the stage reached in gold, a divider and the wins.
        const tx = ax + r + 9;
        ctx.textAlign = 'left';
        ctx.font = `800 ${tall ? 11 : 13}px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(v.name, tx, ay - 1, b.w - (tx - b.x) - 14);
        const ly = ay + (tall ? 9 : 10);
        ctx.font = `800 ${tall ? 7 : 8}px ${SANS}`;
        ctx.fillStyle = '#ffd45c';
        sparkle(ctx, tx + 2.5, ly - 3, 2.6);
        const lv = `Stage ${v.stages[0]}`;
        ctx.fillText(lv, tx + 7, ly);
        const dx = tx + 7 + ctx.measureText(lv).width + 6;
        ctx.fillStyle = 'rgba(220,200,255,0.45)';
        ctx.fillRect(dx, ly - 7, 0.8, 8);
        ctx.fillStyle = '#e8e0ff';
        ctx.fillText(`${v.wins} WINS`, dx + 6, ly);
        this.counters(v, t, W, bleed, tall);
    }

    /**
     * The counters at the top right: on a phone just the server light; in landscape the stages open, the trophies
     * and the server light, on the kit's painted plates once it has loaded.
     */
    private counters(v: LobbyView, t: number, W: number, bleed: number, tall: boolean): void {
        const ctx = this.ctx;
        const right = W + bleed - 8;
        if (tall) {
            this.online(v, right - 2, 14);
            return;
        }
        ctx.font = `800 8.5px ${SANS}`;
        const onW = ctx.measureText(v.online ? 'ONLINE' : 'OFFLINE').width + 28;
        let x = right - onW;
        // The server light on a capsule of its own, green while the server's reached; the light breathes.
        const cap = () => roundRect(ctx, x, 6, onW, 19, 9.5);
        const cg = ctx.createLinearGradient(0, 6, 0, 25);
        cg.addColorStop(0, v.online ? '#1c5a34' : '#3a3058');
        cg.addColorStop(1, v.online ? '#0a2a18' : '#1a1430');
        ctx.fillStyle = cg;
        cap();
        ctx.fill();
        gloss(ctx, cap, x, 6, onW, 19);
        goldEdge(ctx, cap, 6, 25, v.online ? ['#c8ffd8', '#5ef08a', '#1e8a48'] : undefined);
        shine(ctx, cap, x, 6, onW, 19, t, 2.2, 6);
        const lx = x + 11;
        if (v.online) {
            ctx.fillStyle = `rgba(120,255,150,${0.3 + 0.2 * Math.sin(t * 3)})`;
            ctx.beginPath();
            ctx.arc(lx, 15.5, 5.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = v.online ? '#5ef08a' : '#a99fc8';
        ctx.beginPath();
        ctx.arc(lx, 15.5, 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = v.online ? '#b8ffc8' : '#cbbcf5';
        ctx.fillText(v.online ? 'ONLINE' : 'OFFLINE', x + 19, 19);
        const pills: { text: string; icon: (x: number, y: number) => void }[] = [
            { text: String(v.trophies), icon: (px, py) => drawTrophy(ctx, px, py + 0.5, 6.5) },
            {
                text: `${v.stages[0]}/${v.stages[1]}`,
                icon: (px, py) => {
                    ctx.fillStyle = '#5ef08a';
                    sparkle(ctx, px, py, 5);
                },
            },
        ];
        pills.forEach((p, i) => {
            const w = ctx.measureText(p.text).width + 38;
            x -= w + 6;
            this.counterPlate(x, 6, w, 19, t, 1.4 + i * 0.5);
            p.icon(x + 16, 15.5);
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'left';
            ctx.fillText(p.text, x + 26, 19);
        });
    }

    /** A counter's plate: deep violet and glossy, slanted, in a gold edge, a light sweeping over it now and then. */
    private counterPlate(x: number, y: number, w: number, h: number, t: number, phase: number): void {
        const ctx = this.ctx;
        const plate = () => slanted(x, y, w, h, 6)(ctx);
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#4a2486');
        g.addColorStop(0.55, '#22103f');
        g.addColorStop(1, '#341762');
        ctx.fillStyle = g;
        plate();
        ctx.fill();
        gloss(ctx, plate, x, y, w, h);
        goldEdge(ctx, plate, y, y + h);
        shine(ctx, plate, x, y, w, h, t, phase, 6);
    }

    /**
     * A quick button: a round gold-ringed badge with its picture and (in landscape) its name on a dark plate running
     * out from under it, rounded at the badge and coming to a chevron point at its far end, framed in gold.
     */
    private quickPill(b: Box, i: number, t: number, tall: boolean): void {
        const ctx = this.ctx;
        const q = LOBBY_QUICK[i];
        const r = b.h / 2 + (tall ? 0 : 2),
            cx = b.x + r,
            cy = b.y + b.h / 2;
        if (!tall) {
            const x0 = cx,
                x1 = b.x + b.w,
                y0 = b.y + 1,
                y1 = b.y + b.h - 1,
                tip = 7;
            /** Trace the plate: square under the badge, a chevron at the far end, its corners softened. */
            const plate = () => {
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1 - tip - 2, y0);
                ctx.quadraticCurveTo(x1 - tip, y0, x1 - tip + 1, y0 + 1.5);
                ctx.lineTo(x1, cy);
                ctx.lineTo(x1 - tip + 1, y1 - 1.5);
                ctx.quadraticCurveTo(x1 - tip, y1, x1 - tip - 2, y1);
                ctx.lineTo(x0, y1);
                ctx.closePath();
            };
            const g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, '#4a2486');
            g.addColorStop(0.55, '#22103f');
            g.addColorStop(1, '#341762');
            ctx.fillStyle = g;
            plate();
            ctx.fill();
            gloss(ctx, plate, x0, y0, x1 - x0, y1 - y0);
            goldEdge(ctx, plate, y0, y1);
            shine(ctx, plate, x0, y0, x1 - x0, y1 - y0, t, i * 0.35, 5);
            ctx.textAlign = 'center';
            ctx.font = `800 8px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(q.label, (x0 + r + x1 - tip) / 2, cy + 2.6, x1 - tip - x0 - r - 4);
        }
        this.quickIcon({ x: cx - r, y: cy - r, w: r * 2, h: r * 2 }, i, t);
        goldRing(ctx, cx, cy, r - 0.5, 1.8);
    }

    /**
     * The stage plate under the island: a pointed plate in a gold edge saying which stage of how many open is shown
     * and its name, gold arrows either side to look at the others, and a dot for each open stage.
     */
    private stagePlate(v: LobbyView, lay: LobbyLayout, t: number): void {
        const ctx = this.ctx;
        const b = lay.road,
            on = v.focus === 'stage';
        const plate = () => pointed(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.save();
        if (on) {
            ctx.shadowColor = '#ffb43c';
            ctx.shadowBlur = 12 + 4 * Math.sin(t * 5);
        }
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, '#4a2486');
        g.addColorStop(0.55, '#1c0c38');
        g.addColorStop(1, '#2e1458');
        ctx.fillStyle = g;
        plate();
        ctx.fill();
        ctx.restore();
        gloss(ctx, plate, b.x, b.y, b.w, b.h);
        goldEdge(ctx, plate, b.y, b.y + b.h, on ? ['#ffffff', '#ffe9a0', '#f2b53a'] : undefined);
        // A second, finer gold line just inside the first.
        ctx.strokeStyle = 'rgba(255,214,120,0.45)';
        ctx.lineWidth = 0.6;
        pointed(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 6.5);
        ctx.stroke();
        shine(ctx, plate, b.x, b.y, b.w, b.h, t, 3, 5);
        ctx.textAlign = 'center';
        ctx.font = `800 8px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(
            `STAGE ${v.stageNo}/${v.stages[1]}  ·  ${v.mapName.toUpperCase()}`,
            b.x + b.w / 2,
            b.y + b.h / 2 + 2.5,
            b.w - 20,
        );
        for (const [box, dir] of [
            [lay.prev, -1],
            [lay.next, 1],
        ] as const) {
            const k = Math.max(0, Math.sin(t * 4)) * (on ? 1.6 : 0.8) * dir;
            const ax = box.x + box.w / 2 + dir * 5 + k,
                ay = box.y + box.h / 2;
            /** Traces the arrow: a gold triangle pointing out, its corners softened. */
            const arrow = () => {
                ctx.beginPath();
                ctx.moveTo(ax + dir * 2, ay);
                ctx.lineTo(ax - dir * 11, ay - 10);
                ctx.lineTo(ax - dir * 11, ay + 10);
                ctx.closePath();
            };
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#1a0a10';
            ctx.lineWidth = 3;
            arrow();
            ctx.stroke();
            ctx.fillStyle = goldGradient(ctx, ay - 10, ay + 10);
            arrow();
            ctx.fill();
            // The lit upper face.
            ctx.fillStyle = 'rgba(255,250,220,0.45)';
            ctx.beginPath();
            ctx.moveTo(ax + dir * 2, ay);
            ctx.lineTo(ax - dir * 11, ay - 10);
            ctx.lineTo(ax - dir * 11, ay - 1);
            ctx.closePath();
            ctx.fill();
            shine(ctx, arrow, ax - 12, ay - 10, 15, 20, t, dir < 0 ? 3.6 : 3.8, 5);
        }
        const n = v.stages[0],
            gap = 7;
        for (let i = 0; i < n; i++) {
            const x = b.x + b.w / 2 - ((n - 1) * gap) / 2 + i * gap,
                y = b.y + b.h + 8;
            ctx.beginPath();
            ctx.arc(x, y, 2.1, 0, Math.PI * 2);
            if (i === v.stageAt) {
                ctx.fillStyle = '#ffd45c';
                ctx.fill();
            } else {
                ctx.strokeStyle = 'rgba(239,230,255,0.6)';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        }
    }

    /** World chat's latest lines, in a gold-framed panel at the bottom left; hidden while the chat panel's open. */
    private ticker(v: LobbyView, b: Box, t: number): void {
        if (v.chatOpen) return;
        const ctx = this.ctx;
        lobbyPanel(ctx, b, 8, t, 4);
        const tg = ctx.createLinearGradient(0, b.y + 5, 0, b.y + 16);
        tg.addColorStop(0, '#8fd8ff');
        tg.addColorStop(1, '#3a7ad8');
        ctx.fillStyle = tg;
        roundRect(ctx, b.x + 6, b.y + 6, 38, 11, 5.5);
        ctx.fill();
        ctx.strokeStyle = 'rgba(220,245,255,0.8)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#0c2350';
        ctx.fillText('WORLD', b.x + 25, b.y + 13.5);
        ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(255,226,122,${0.6 + 0.3 * Math.sin(t * 3)})`;
        ctx.fillText(v.touch ? 'TAP TO CHAT' : 'T TO CHAT', b.x + b.w - 7, b.y + 13.5);
        ctx.fillStyle = 'rgba(255,230,160,0.2)';
        ctx.fillRect(b.x + 6, b.y + 20, b.w - 12, 0.6);
        const lines = v.chat.slice(-2);
        ctx.textAlign = 'left';
        if (!lines.length) {
            ctx.font = `700 8px ${SANS}`;
            ctx.fillStyle = 'rgba(214,204,250,0.8)';
            ctx.fillText(
                v.online ? 'Say hi to everyone online' : 'Chat needs the game server',
                b.x + 8,
                b.y + 34,
                b.w - 16,
            );
            return;
        }
        lines.forEach((l, i) => {
            const y = b.y + 32 + i * 12;
            ctx.font = `800 8.5px ${SANS}`;
            ctx.fillStyle = '#ffe27a';
            const name = `${l.name}:`;
            ctx.fillText(name, b.x + 8, y, 64);
            const nw = Math.min(64, ctx.measureText(name).width) + 3;
            ctx.font = `700 8.5px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(l.body, b.x + 8 + nw, y, b.w - 16 - nw);
        });
    }

    /** On a phone, the tab on the right edge that pulls the friends panel out. */
    private friendsTab(b: Box, t: number): void {
        const ctx = this.ctx;
        lobbyPanel(ctx, { x: b.x, y: b.y, w: b.w + 10, h: b.h }, 6, t, 3);
        smallOrb(ctx, b.x + b.w / 2 + 1, b.y + 14, 7);
        this.person(b.x + b.w / 2 + 1, b.y + 14.5, 0, '#f4ecff');
        ctx.save();
        ctx.translate(b.x + b.w / 2 + 2, b.y + b.h / 2 + 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = `rgba(255,247,194,${0.75 + 0.25 * Math.sin(t * 3)})`;
        ctx.fillText('FRIENDS', 0, 2.5);
        ctx.restore();
    }

    /**
     * The bar along the bottom, in two halves either side of PLAY: each a dark plate framed in gold, coming to a point
     * with a star at its outer end and rounded where it meets PLAY. Each half holds two screens, a gold-ringed badge
     * with its emblem and its name, a thin gold line between them, the one with the cursor lit in its colour.
     */
    private bottomBar(v: LobbyView, lay: LobbyLayout, t: number, tall: boolean): void {
        const ctx = this.ctx;
        const b = lay.bar,
            p = lay.play,
            tip = tall ? 9 : 18,
            r = b.h / 2;
        if (tall) this.phoneBar(b, t);
        for (const dir of tall ? [] : [-1, 1]) {
            const outer = dir < 0 ? b.x : b.x + b.w,
                inner = dir < 0 ? p.x + 10 : p.x + p.w - 10;
            /** Trace this half: a point at the outer end, rounded at the inner end, under PLAY's edge. */
            const half = (inset: number) => {
                const y0 = b.y + inset,
                    y1 = b.y + b.h - inset,
                    o = outer - dir * inset,
                    rr = r - inset;
                ctx.beginPath();
                ctx.moveTo(o, b.y + b.h / 2);
                ctx.lineTo(o - dir * tip, y0);
                ctx.lineTo(inner - dir * rr, y0);
                ctx.arc(inner - dir * rr, b.y + b.h / 2, rr, -Math.PI / 2, Math.PI / 2, dir < 0);
                ctx.lineTo(o - dir * tip, y1);
                ctx.closePath();
            };
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 10;
            const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
            g.addColorStop(0, '#4a2486');
            g.addColorStop(0.5, '#1c0c38');
            g.addColorStop(1, '#2e1458');
            ctx.fillStyle = g;
            half(0);
            ctx.fill();
            ctx.restore();
            const x0 = Math.min(outer, inner),
                bw = Math.abs(inner - outer) + r;
            gloss(ctx, () => half(0), x0 - (dir > 0 ? r : 0), b.y, bw, b.h);
            goldEdge(ctx, () => half(0), b.y, b.y + b.h, undefined, 2);
            ctx.strokeStyle = 'rgba(255,214,120,0.4)';
            ctx.lineWidth = 0.7;
            half(3.5);
            ctx.stroke();
            shine(ctx, () => half(0), x0 - (dir > 0 ? r : 0), b.y, bw, b.h, t, dir < 0 ? 0 : 0.6, 6);
            // A star at the point.
            ctx.fillStyle = '#fff3c0';
            sparkle(ctx, outer + dir * 2, b.y + b.h / 2, 4 + Math.abs(Math.sin(t * 2 + dir)) * 1.5);
        }
        lay.nav.forEach((n, i) => {
            const it = LOBBY_NAV[i],
                on = v.focus === 'nav' && v.nav === i;
            if (on) {
                const lg = ctx.createRadialGradient(
                    n.x + n.w / 2,
                    n.y + n.h / 2,
                    2,
                    n.x + n.w / 2,
                    n.y + n.h / 2,
                    n.w * 0.6,
                );
                lg.addColorStop(0, hexA(it.color, 0.4));
                lg.addColorStop(1, hexA(it.color, 0));
                ctx.fillStyle = lg;
                ctx.beginPath();
                ctx.ellipse(n.x + n.w / 2, n.y + n.h / 2, n.w / 2, n.h / 2 - 3, 0, 0, Math.PI * 2);
                ctx.fill();
            }
            if (tall ? i > 0 : i === 1 || i === 3) {
                ctx.fillStyle = 'rgba(233,185,73,0.5)';
                ctx.fillRect(n.x, n.y + n.h * 0.25, 1, n.h * 0.5);
            }
            const orb = (x: number, y: number, rr: number) => {
                const k = on ? 1.08 + 0.03 * Math.sin(t * 5) : 1;
                drawBadge(ctx, it.color, x, y, rr * k, on, t);
                drawEmblem(ctx, it.action, x, y, (rr * k) / 34, t, on);
                goldRing(ctx, x, y, rr * k, 1.6);
            };
            if (tall) {
                const rr = 12.5;
                orb(n.x + n.w / 2, n.y + rr + 5, rr);
                ctx.textAlign = 'center';
                ctx.font = `800 7px ${SANS}`;
                ctx.fillStyle = on ? '#ffe27a' : '#ffffff';
                ctx.fillText(it.label, n.x + n.w / 2, n.y + n.h - 7, n.w - 4);
                return;
            }
            const rr = 12;
            ctx.font = `800 9px ${SANS}`;
            const lw = Math.min(n.w - rr * 2 - 14, ctx.measureText(it.label).width);
            const x0 = n.x + n.w / 2 - (lw + rr * 2 + 7) / 2;
            orb(x0 + rr, n.y + n.h / 2, rr);
            ctx.textAlign = 'left';
            ctx.fillStyle = on ? '#ffe27a' : '#ffffff';
            ctx.fillText(it.label, x0 + rr * 2 + 7, n.y + n.h / 2 + 3.6, n.w - rr * 2 - 14);
        });
    }

    /**
     * The bar along the bottom on a phone: one dark violet capsule edged in gold, pointed at both ends with a star
     * at each point, and a dip of gold light in the middle where PLAY stands over it.
     */
    private phoneBar(b: Box, t: number): void {
        const ctx = this.ctx,
            tip = 9;
        /** Traces the bar, `inset` in from its edge. */
        const shape = (inset: number) => {
            const y0 = b.y + inset,
                y1 = b.y + b.h - inset,
                x0 = b.x + inset,
                x1 = b.x + b.w - inset,
                my = b.y + b.h / 2;
            ctx.beginPath();
            ctx.moveTo(x0, my);
            ctx.lineTo(x0 + tip, y0);
            ctx.lineTo(x1 - tip, y0);
            ctx.lineTo(x1, my);
            ctx.lineTo(x1 - tip, y1);
            ctx.lineTo(x0 + tip, y1);
            ctx.closePath();
        };
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, 'rgba(60,30,116,0.97)');
        g.addColorStop(1, 'rgba(20,8,48,0.98)');
        ctx.fillStyle = g;
        shape(0);
        ctx.fill();
        ctx.restore();
        // The glow under PLAY.
        const cx = b.x + b.w / 2,
            lg = ctx.createRadialGradient(cx, b.y, 2, cx, b.y, 60);
        lg.addColorStop(0, 'rgba(255,200,90,0.35)');
        lg.addColorStop(1, 'rgba(255,200,90,0)');
        ctx.save();
        shape(0);
        ctx.clip();
        ctx.fillStyle = lg;
        ctx.fillRect(cx - 60, b.y, 120, b.h);
        ctx.restore();
        ctx.strokeStyle = goldGradient(ctx, b.y, b.y + b.h);
        ctx.lineWidth = 1.8;
        shape(0);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,230,160,0.25)';
        ctx.lineWidth = 0.7;
        shape(3.5);
        ctx.stroke();
        ctx.fillStyle = '#fff3c0';
        sparkle(ctx, b.x + 1, b.y + b.h / 2, 3.5 + Math.abs(Math.sin(t * 2)) * 1.3);
        sparkle(ctx, b.x + b.w - 1, b.y + b.h / 2, 3.5 + Math.abs(Math.sin(t * 2 + 1)) * 1.3);
    }

    /**
     * The PLAY button, raised in the middle of the bar, as on the painted kit: a heavy setting (a dark outline, a broad
     * band of gold lit from above, a bright bead and a dark groove), a glossy gold face, PLAY in big dark letters with a
     * light rim, a swept gold wing either side of it, and the jewelled star crest standing on top; light sweeps over
     * it, more often while it has the cursor, when it also glows.
     */
    private playButton(v: LobbyView, b: Box, t: number, tall: boolean): void {
        const ctx = this.ctx;
        const on = v.focus === 'mode';
        const r = b.h / 2,
            o = tall ? 4.5 : 6,
            cx = b.x + b.w / 2,
            cy = b.y + b.h / 2;
        /** Traces the capsule grown by `d` all round. */
        const cap = (d: number) => roundRect(ctx, b.x - d, b.y - d, b.w + 2 * d, b.h + 2 * d, r + d);
        // The setting: the dark outline (glowing while it has the cursor), then the band of gold.
        ctx.save();
        ctx.shadowColor = on ? '#ffb43c' : 'rgba(0,0,0,0.65)';
        ctx.shadowBlur = on ? 20 + 6 * Math.sin(t * 5) : 12;
        ctx.fillStyle = '#1a0a08';
        cap(o + 1.8);
        ctx.fill();
        ctx.restore();
        const band = ctx.createLinearGradient(0, b.y - o, 0, b.y + b.h + o);
        band.addColorStop(0, '#fffbe0');
        band.addColorStop(0.22, '#ffd860');
        band.addColorStop(0.55, '#c47812');
        band.addColorStop(0.8, '#e8a42a');
        band.addColorStop(1, '#fff0b0');
        ctx.fillStyle = band;
        cap(o);
        ctx.fill();
        // A bright bead along the band's middle, then the dark groove round the face.
        ctx.strokeStyle = 'rgba(255,248,215,0.75)';
        ctx.lineWidth = 0.7;
        cap(o * 0.5);
        ctx.stroke();
        ctx.fillStyle = '#4a2008';
        cap(1.3);
        ctx.fill();
        // The face: bright gold, lighter while it has the cursor, with a gloss across its top and a warm glow at its
        // heart.
        const face = () => cap(0);
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, on ? '#fffbd0' : '#fff2b0');
        g.addColorStop(0.42, on ? '#ffd640' : '#ffcc34');
        g.addColorStop(0.8, on ? '#f29a10' : '#e48a0c');
        g.addColorStop(1, on ? '#ffc840' : '#f6b432');
        ctx.fillStyle = g;
        face();
        ctx.fill();
        ctx.save();
        face();
        ctx.clip();
        const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, b.w * 0.5);
        glow.addColorStop(0, 'rgba(255,255,230,0.45)');
        glow.addColorStop(1, 'rgba(255,255,230,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.ellipse(cx, b.y + b.h * 0.2, b.w * 0.44, b.h * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,252,230,0.8)';
        ctx.lineWidth = 0.9;
        roundRect(ctx, b.x + 1.3, b.y + 1.3, b.w - 2.6, b.h - 2.6, r - 1.3);
        ctx.stroke();
        ctx.restore();
        // PLAY, big and dark with a light rim, between its two wings.
        const size = tall ? 20 : 27;
        ctx.font = `${size}px ${ARCADE}`;
        const half = ctx.measureText('PLAY').width / 2;
        for (const dir of [-1, 1]) sweptWing(ctx, cx + dir * (half + 2), cy + b.h * 0.12, b.h * 0.7, dir);
        const ty = cy + size * 0.36;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        // A soft shadow, a dark outer edge, a light rim, then the letters in dark brown shading down.
        ctx.fillStyle = 'rgba(90,40,0,0.35)';
        ctx.fillText('PLAY', cx + 0.8, ty + 1.6);
        ctx.strokeStyle = '#2a0e04';
        ctx.lineWidth = size * 0.26;
        ctx.strokeText('PLAY', cx, ty);
        ctx.strokeStyle = '#fff4c8';
        ctx.lineWidth = size * 0.1;
        ctx.strokeText('PLAY', cx, ty);
        const ink = ctx.createLinearGradient(0, ty - size * 0.8, 0, ty);
        ink.addColorStop(0, '#6a2e10');
        ink.addColorStop(0.5, '#3a1206');
        ink.addColorStop(1, '#1e0a04');
        ctx.fillStyle = ink;
        ctx.fillText('PLAY', cx, ty);
        ctx.restore();
        // The light sweeping over the face and the setting.
        shine(ctx, face, b.x, b.y, b.w, b.h, t, 1, on ? 2.6 : 4);
        shine(ctx, () => cap(o), b.x - o, b.y - o, b.w + 2 * o, b.h + 2 * o, t, 1.3, on ? 2.6 : 4);
        // The crest: the jewelled gold star standing on the setting's top, little stars twinkling beside it.
        ctx.save();
        ctx.translate(cx, b.y - o - 0.5);
        const ck = tall ? 0.13 : 0.19;
        ctx.scale(ck, ck);
        frameCrest(ctx, 0, 0, t);
        ctx.restore();
        ctx.fillStyle = '#fff6d8';
        for (const dir of [-1, 1]) {
            const k = Math.abs(Math.sin(t * 2.2 + dir));
            sparkle(ctx, cx + dir * b.w * 0.17, b.y - o + 2, 1.5 + k * 1.5);
        }
        sparkle(ctx, b.x + b.w * 0.12, b.y + b.h * 0.3, 1.2 + Math.abs(Math.sin(t * 3)) * 1.4);
        sparkle(ctx, b.x + b.w * 0.88, b.y + b.h * 0.72, 1.2 + Math.abs(Math.sin(t * 3 + 1.5)) * 1.4);
    }
}

/**
 * A gold edge round a shape traced by `trace` (between y0 and y1): a dark outline under a band of gold shaded from
 * light to dark (or the three colours of `tones`), `w` wide.
 */
export function goldEdge(
    ctx: CanvasRenderingContext2D,
    trace: () => void,
    y0: number,
    y1: number,
    tones?: [string, string, string],
    w = 1.5,
): void {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1a0a10';
    ctx.lineWidth = w + 1.6;
    trace();
    ctx.stroke();
    if (tones) {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, tones[0]);
        g.addColorStop(0.45, tones[1]);
        g.addColorStop(1, tones[2]);
        ctx.strokeStyle = g;
    } else ctx.strokeStyle = goldGradient(ctx, y0, y1);
    ctx.lineWidth = w;
    trace();
    ctx.stroke();
    ctx.restore();
}

/** A glossy light across the top of a shape traced by `trace`, inside its box (x, y, w, h). */
export function gloss(
    ctx: CanvasRenderingContext2D,
    trace: () => void,
    x: number,
    y: number,
    w: number,
    h: number,
): void {
    ctx.save();
    trace();
    ctx.clip();
    const g = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
    g.addColorStop(0, 'rgba(230,190,255,0.28)');
    g.addColorStop(1, 'rgba(230,190,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h * 0.55);
    ctx.restore();
}

/** A gold ring `w` wide round a circle `r` across centred on (x, y), on a dark outline. */
function goldRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, w: number): void {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a0a10';
    ctx.lineWidth = w + 1.4;
    ctx.stroke();
    ctx.strokeStyle = goldGradient(ctx, y - r, y + r);
    ctx.lineWidth = w;
    ctx.stroke();
}

/**
 * A lobby panel over the box `b`, rounded `r`: violet glass (a soft glow behind, a deep gradient, a light across its
 * top) in a gold frame with a finer gold line inside it and a gem at the middle of its top and foot, a light sweeping
 * over the gold every few seconds (`phase` into its cycle).
 */
function lobbyPanel(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number; h: number },
    r: number,
    t: number,
    phase: number,
): void {
    const trace = () => roundRect(ctx, b.x, b.y, b.w, b.h, r);
    ctx.save();
    ctx.shadowColor = 'rgba(150,80,255,0.45)';
    ctx.shadowBlur = 16;
    const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, 'rgba(58,28,112,0.94)');
    g.addColorStop(0.5, 'rgba(28,12,62,0.94)');
    g.addColorStop(1, 'rgba(40,18,84,0.94)');
    ctx.fillStyle = g;
    trace();
    ctx.fill();
    ctx.restore();
    gloss(ctx, trace, b.x, b.y, b.w, Math.min(b.h, 60));
    goldEdge(ctx, trace, b.y, b.y + b.h, undefined, 1.8);
    ctx.strokeStyle = 'rgba(255,214,120,0.35)';
    ctx.lineWidth = 0.6;
    roundRect(ctx, b.x + 3, b.y + 3, b.w - 6, b.h - 6, Math.max(1, r - 3));
    ctx.stroke();
    for (const y of [b.y, b.y + b.h]) {
        const cx = b.x + b.w / 2;
        ctx.fillStyle = '#1a0a10';
        ctx.beginPath();
        ctx.moveTo(cx, y - 4);
        ctx.lineTo(cx + 3.2, y);
        ctx.lineTo(cx, y + 4);
        ctx.lineTo(cx - 3.2, y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = goldGradient(ctx, y - 3, y + 3);
        ctx.beginPath();
        ctx.moveTo(cx, y - 3);
        ctx.lineTo(cx + 2.2, y);
        ctx.lineTo(cx, y + 3);
        ctx.lineTo(cx - 2.2, y);
        ctx.closePath();
        ctx.fill();
    }
    shine(ctx, trace, b.x, b.y, b.w, b.h, t, phase, 7);
}

/** A switch over (x, y, w, h): a dark track in a gold edge with its knob, green and to the right when `on`. */
function toggle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, on: boolean): void {
    const trace = () => roundRect(ctx, x, y, w, h, h / 2);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, on ? '#1e8a48' : '#2a2048');
    g.addColorStop(1, on ? '#5ef08a' : '#4a3a78');
    ctx.fillStyle = g;
    trace();
    ctx.fill();
    goldEdge(ctx, trace, y, y + h, undefined, 0.9);
    const kx = on ? x + w - h / 2 : x + h / 2;
    const kg = ctx.createRadialGradient(kx - 1, y + h / 2 - 1.5, 0.5, kx, y + h / 2, h / 2);
    kg.addColorStop(0, '#ffffff');
    kg.addColorStop(1, '#d8d0f0');
    ctx.fillStyle = kg;
    ctx.beginPath();
    ctx.arc(kx, y + h / 2, h / 2 - 1.2, 0, Math.PI * 2);
    ctx.fill();
}

/** A small round violet orb `r` across centred on (x, y) in a gold ring, for an icon to sit in. */
function smallOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#6a3ab8');
    g.addColorStop(1, '#1e0c44');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    goldRing(ctx, x, y, r, 1.1);
}

/**
 * A swept gold wing from (x, y), `len` long, reaching out and up toward `dir` (−1 left, 1 right) as on the painted
 * PLAY: five feathers, the upper ones longest, each pale gold shading to deep gold on a dark outline.
 */
export function sweptWing(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, dir: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    // Lowest feather first, so the upper ones lie over them.
    for (let i = 0; i < 5; i++) {
        const a = -0.12 - i * 0.2,
            l = len * (0.55 + i * 0.11),
            w = len * (0.13 + i * 0.008);
        ctx.save();
        ctx.rotate(a);
        /** Traces a feather: a long leaf, round at its root and pointed at its tip. */
        const feather = (d: number) => {
            ctx.beginPath();
            ctx.moveTo(-d, 0);
            ctx.quadraticCurveTo(l * 0.35, -w - d, l + d, -w * 0.15);
            ctx.quadraticCurveTo(l * 0.45, w + d, -d, 0);
            ctx.closePath();
        };
        ctx.fillStyle = '#2a0e04';
        feather(0.8);
        ctx.fill();
        const g = ctx.createLinearGradient(0, -w, 0, w);
        g.addColorStop(0, '#fffbe8');
        g.addColorStop(0.4, '#ffd65a');
        g.addColorStop(1, '#b8640c');
        ctx.fillStyle = g;
        feather(0);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}
