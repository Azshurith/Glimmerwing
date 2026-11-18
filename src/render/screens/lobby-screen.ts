// The lobby, the game's main menu, laid out like an arena game's home screen. A sunset sky over a sea of clouds,
// with the stage you've reached floating in the middle as an island (its scenery on top, cliffs below, a slow
// swirl in the clouds under it) and the mode button under the island: ◀ ▶ change the mode, Enter or a tap plays
// it. The player's plate and counters run across the top; quick buttons and a card for the next stage on the
// trophy road sit at the top left, World chat's latest lines at the bottom left (a tap opens the chat panel, the
// page's #chat), friends down the right, and the other screens (Characters, Maps, Profile, Settings) on a bar
// along the bottom. On a phone held upright the friends panel tucks into a tab on the right edge.
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
import { TOP_BAR_H } from './top-bar';
import { Backdrop } from '@/render/backdrop';
import { drawMedal } from './profile-screen';
import { enter } from '@/render/transition';

/** A box, in design or view units. */
export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The screens on the bar along the bottom, in order. */
export const LOBBY_NAV: { action: TitleAction; label: string; color: string }[] = [
    { action: 'characters', label: 'CHARACTERS', color: '#ff9ac8' },
    { action: 'maps', label: 'MAPS', color: '#8ff0a0' },
    { action: 'profile', label: 'PROFILE', color: '#8fd8ff' },
    { action: 'settings', label: 'SETTINGS', color: '#c9b8ff' },
];

/** The quick buttons at the top left: the match history and the ranking (both on Profile), and the guide. */
export const LOBBY_QUICK = [
    { id: 'history', label: 'HISTORY', color: '#ffb35c' },
    { id: 'ranking', label: 'RANKING', color: '#ffd45c' },
    { id: 'guide', label: 'GUIDE', color: '#c9b8ff' },
] as const;

const GOLD_TEXT: [string, string, string] = ['#ffffff', '#ffe08a', '#ff9a2e'];

/** Paints a map's scenery over a rectangle, in the current transform. */
type StagePainter = (map: string, x: number, y: number, w: number, h: number) => void;

/** Where everything on the lobby sits. */
export interface LobbyLayout {
    /** The mode button, and its arrows. */
    play: Box;
    prev: Box;
    next: Box;
    nav: Box[];
    quick: Box[];
    /** The next stage's card (none on a phone). */
    card: Box | null;
    /** World chat's ticker (a tap opens the panel), and where the panel opens: the whole height, at the left. */
    ticker: Box;
    chat: Box;
    /** The friends panel, and on a phone the tab on the right edge that pulls it out. */
    friends: Box;
    friendsTab: Box | null;
    /** The island: the centre of its top and how wide it is. */
    island: { x: number; y: number; r: number };
}

/**
 * The lobby's boxes in its design units: the usual 504-wide view reaching `bleed` past each side in landscape, or
 * the tall view `H` high on a phone.
 */
function designLayout(layout: Layout, H: number, bleed: number): LobbyLayout {
    if (layout === 'tall') {
        const W = C.TALL_W,
            playY = H - 178;
        return {
            play: { x: W / 2 - 98, y: playY, w: 196, h: 46 },
            prev: { x: W / 2 - 131, y: playY + 3, w: 32, h: 40 },
            next: { x: W / 2 + 99, y: playY + 3, w: 32, h: 40 },
            nav: LOBBY_NAV.map((_, i) => ({ x: 4 + i * ((W - 8) / 4), y: H - 64, w: (W - 8) / 4, h: 60 })),
            quick: LOBBY_QUICK.map((_, i) => ({ x: 6 + i * 52, y: 42, w: 48, h: 50 })),
            card: null,
            ticker: { x: 8, y: H - 120, w: W - 16, h: 48 },
            chat: { x: 0, y: 0, w: W, h: H },
            friends: { x: W - 166, y: 44, w: 160, h: playY - 56 },
            friendsTab: { x: W - 28, y: 112, w: 28, h: 110 },
            island: { x: W / 2, y: (96 + playY) / 2 - 40, r: 100 },
        };
    }
    const W = C.VIEW_W,
        L = -bleed + 6,
        R = W + bleed - 6;
    // On a screen no wider than the usual view (a small or squarer window), the sides and the island draw in so
    // nothing overlaps; on a wider one they spread out.
    const compact = bleed < 40;
    const side = compact ? 108 : 124,
        playW = compact ? 168 : 190,
        isle = compact ? 90 : 102;
    return {
        play: { x: W / 2 - playW / 2, y: 224, w: playW, h: 38 },
        prev: { x: W / 2 - playW / 2 - 37, y: 225, w: 34, h: 36 },
        next: { x: W / 2 + playW / 2 + 3, y: 225, w: 34, h: 36 },
        nav: LOBBY_NAV.map((_, i) => ({ x: L + (i * (R - L)) / 4, y: 278, w: (R - L) / 4, h: 42 })),
        quick: LOBBY_QUICK.map((_, i) => ({ x: L + i * (compact ? 42 : 47), y: 30, w: compact ? 40 : 45, h: 46 })),
        card: { x: L, y: 82, w: compact ? 122 : 137, h: 62 },
        ticker: { x: L, y: 226, w: Math.max(96, Math.min(150, W / 2 - playW / 2 - 42 - L)), h: 46 },
        chat: { x: -bleed, y: 0, w: Math.max(210, Math.min(280, W / 2 - 108 + bleed)), h: C.VIEW_H },
        friends: { x: R - side, y: 30, w: side, h: 240 },
        friendsTab: null,
        island: { x: W / 2, y: 108, r: isle },
    };
}

/** The lobby's boxes in view units: the tap targets, and where the page puts the chat panel. */
export function lobbyLayout(layout: Layout, h: number = C.TALL_H, bleed = 0): LobbyLayout {
    if (layout !== 'tall') return designLayout(layout, C.VIEW_H, bleed);
    const f = tallMenuFit(h);
    const d = designLayout(layout, f.h, 0);
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    return {
        ...d,
        play: view(d.play),
        prev: view(d.prev),
        next: view(d.next),
        nav: d.nav.map(view),
        quick: d.quick.map(view),
        card: d.card && view(d.card),
        ticker: view(d.ticker),
        chat: view(d.chat),
        friends: view(d.friends),
        friendsTab: d.friendsTab && view(d.friendsTab),
    };
}

/** The lobby. */
export class LobbyScreen {
    /** The night sky the other menu screens share. */
    private backdrop: Backdrop;

    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

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
        const lay = designLayout(layout, H, tall ? 0 : bleed);
        const theme = mapById(v.map);
        // Coming in from another screen, the bar and buttons pop in first, then the sky and the island rise out of the
        // dark, then the panels slide in (see render/transition.ts).
        enter(ctx, 'bg', () => {
            // The night sky of the other menu screens, its light rays turning from behind the island.
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, lay.island.x + bleed, lay.island.y, W + 2 * bleed, H);
            ctx.restore();
        });
        if (theme) enter(ctx, 'panels', () => this.island(v.map, theme, lay.island, t, stage), { dx: 0, dy: 14 });
        enter(ctx, 'panels', () => this.stageName(v, lay.island.x, lay.play.y - 10), { dx: 0, dy: 8 });
        enter(ctx, 'bar', () => this.topBar(v, t, W, bleed, tall));
        lay.quick.forEach((b, i) => enter(ctx, 'buttons', () => this.quick(b, i, t), { box: b, i }));
        const card = lay.card;
        if (card && v.next) enter(ctx, 'panels', () => this.card(v, card, t, stage), { dx: -22 });
        enter(ctx, 'buttons', () => this.modeButton(v, lay, t), { box: lay.play, i: 2 });
        enter(ctx, 'panels', () => this.ticker(v, lay.ticker, t), { dx: -22 });
        if (!tall || v.friendsOpen) enter(ctx, 'panels', () => this.friends(lay.friends, t), { dx: 22 });
        if (lay.friendsTab && !v.friendsOpen) {
            const tab = lay.friendsTab;
            enter(ctx, 'buttons', () => this.friendsTab(tab, t), { box: tab, i: 3 });
        }
        enter(ctx, 'buttons', () => this.nav(v, lay.nav, t, W, bleed, tall), { i: 1, dy: 10 });
        if (!v.touch && !v.chatOpen && !v.mode.off) {
            enter(ctx, 'hint', () => {
                ctx.textAlign = 'center';
                ctx.font = `5px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,236,220,0.75)';
                const y = lay.play.y + lay.play.h + (tall ? 10 : 9);
                ctx.fillText('◀ ▶ MODE  ·  ENTER PLAY  ·  ▼ MENU  ·  T CHAT', lay.island.x, y, tall ? W - 20 : 230);
            });
        }
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
            ctx.strokeStyle = `rgba(201,162,74,${0.3 - i * 0.06})`;
            ctx.lineWidth = 1.4;
            ctx.setLineDash([18 + i * 6, 10]);
            ctx.lineDashOffset = (i % 2 ? 1 : -1) * t * (14 - i * 2);
            ctx.beginPath();
            ctx.ellipse(cx, sy, rx * (0.6 + i * 0.32), rx * (0.12 + i * 0.07), 0, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        const pool = ctx.createRadialGradient(cx, sy, 2, cx, sy, rx * 0.9);
        pool.addColorStop(0, 'rgba(120,90,220,0.22)');
        pool.addColorStop(1, 'rgba(120,90,220,0)');
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

    /** The stage's name on a banner between the island and the mode button. */
    private stageName(v: LobbyView, cx: number, y: number): void {
        const ctx = this.ctx;
        ctx.font = `5.5px ${ARCADE}`;
        const text = `STAGE ${v.stages[0]}/${v.stages[1]}  ·  ${v.mapName.toUpperCase()}`;
        const w = ctx.measureText(text).width + 22;
        ctx.fillStyle = 'rgba(20,12,48,0.85)';
        slanted(cx - w / 2, y - 7, w, 11, 4)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText(text, cx, y + 1);
    }

    /**
     * The bar across the top: the player's avatar in their frame, name and wins; counters (trophies, stages) on
     * pills; and whether the game server is reached.
     */
    private topBar(v: LobbyView, t: number, W: number, bleed: number, tall: boolean): void {
        const ctx = this.ctx;
        const h = tall ? TOP_BAR_H.tall : TOP_BAR_H.wide;
        // The same bar as the other menu screens': dark, over a gold line.
        const g = ctx.createLinearGradient(0, 0, 0, h + 1);
        g.addColorStop(0, 'rgba(10,6,28,0.95)');
        g.addColorStop(1, 'rgba(10,6,28,0.6)');
        ctx.fillStyle = g;
        ctx.fillRect(-bleed, 0, W + 2 * bleed, h);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(-bleed, h, W + 2 * bleed, 1);
        ctx.fillStyle = 'rgba(255,230,160,0.25)';
        ctx.fillRect(-bleed, h + 1, W + 2 * bleed, 1);
        // The page's Back tab sits in the top-left corner, so the player starts after it.
        const x = tall ? 90 : -bleed + 84,
            cy = h / 2,
            r = tall ? 13 : 10.5;
        this.framedAvatar(v.fairy, v.frame, x, cy, r, t);
        ctx.textAlign = 'left';
        ctx.font = `700 ${tall ? 10 : 9}px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(v.name, x + r + 6, cy - 1, tall ? 96 : 104);
        ctx.font = `5px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText(`${v.wins} WINS`, x + r + 6, cy + 8);
        if (tall) {
            this.online(v, W + bleed - 10, cy);
            return;
        }
        // Counters on pills, then the online light.
        let px = W + bleed - 50;
        this.online(v, W + bleed - 8, cy);
        /** One counter on a pill, laid out leftward from the last. */
        const counter = (label: string, icon: (x: number, y: number) => void) => {
            ctx.font = `6px ${ARCADE}`;
            const w = ctx.measureText(label).width + 22;
            px -= w + 6;
            this.pill(px, cy - 5.5, w, 11);
            icon(px + 7, cy);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(label, px + 14, cy + 2.5);
        };
        counter(String(v.trophies), (ix, iy) => drawTrophy(ctx, ix, iy + 0.5, 5.5));
        counter(`${v.stages[0]}/${v.stages[1]}`, (ix, iy) => {
            ctx.fillStyle = '#8ff0a0';
            sparkle(ctx, ix, iy, 4);
        });
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

    /** A dark slanted plate with a thin gold edge, like the other menu screens' tabs. */
    private pill(x: number, y: number, w: number, h: number): void {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(20,12,48,0.85)';
        slanted(x, y, w, h, 3)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
    }

    /** A panel like the other menu screens': navy, darkening downward, in a thin gold edge, slanted by `slant`. */
    private panel(x: number, y: number, w: number, h: number, slant = 0): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(40,26,88,0.85)');
        g.addColorStop(1, 'rgba(16,10,40,0.85)');
        ctx.fillStyle = g;
        slanted(x, y, w, h, slant)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        slanted(x + 0.5, y + 0.5, w - 1, h - 1, slant)(ctx);
        ctx.stroke();
    }

    /** A quick button at the top left: a gold-ringed round button with its picture, and its name under it. */
    private quick(b: Box, i: number, t: number): void {
        const ctx = this.ctx;
        const q = LOBBY_QUICK[i];
        const r = Math.min(b.w, b.h) * 0.34,
            cx = b.x + b.w / 2,
            cy = b.y + r + 3;
        drawBadge(ctx, q.color, cx, cy, r, false, t);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(r / 12, r / 12);
        ctx.strokeStyle = '#fff6dc';
        ctx.fillStyle = '#fff6dc';
        ctx.lineWidth = 1.4;
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
            ctx.font = `10px ${ARCADE}`;
            ctx.fillText('?', 0, 4);
        }
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText(q.label, cx, b.y + b.h - 2, b.w + 4);
    }

    /** The next stage on the trophy road: its scenery in a card, its name, and a bar of trophies toward it. */
    private card(v: LobbyView, b: Box, t: number, stage: StagePainter): void {
        const ctx = this.ctx;
        const n = v.next!;
        ctx.save();
        ctx.beginPath();
        ctx.rect(b.x, b.y, b.w, b.h);
        ctx.clip();
        stage(n.map, b.x, b.y, b.w, b.h);
        const shade = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        shade.addColorStop(0, 'rgba(20,8,40,0.1)');
        shade.addColorStop(1, 'rgba(20,8,40,0.85)');
        ctx.fillStyle = shade;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        // A ribbon in the corner.
        ctx.fillStyle = '#ff5a8a';
        slanted(b.x + b.w - 52, b.y + 4, 48, 10, 3)(ctx);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = `5px ${ARCADE}`;
        ctx.fillStyle = '#fff';
        ctx.fillText('NEXT STAGE', b.x + b.w - 28, b.y + 11);
        arcadeText(ctx, n.name.toUpperCase(), b.x + 7, b.y + b.h - 18, 10, GOLD_TEXT, 'left', b.w - 14);
        // The bar toward it.
        const bx = b.x + 7,
            bw = b.w - 14,
            by = b.y + b.h - 11;
        const k = Math.max(0, Math.min(1, n.have / n.need));
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        slanted(bx, by, bw, 5, 2)(ctx);
        ctx.fill();
        const fill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
        fill.addColorStop(0, '#ffd45c');
        fill.addColorStop(1, '#ff8a5c');
        ctx.fillStyle = fill;
        slanted(bx, by, Math.max(5, bw * k), 5, 2)(ctx);
        ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(t * 3)})`;
        ctx.fillRect(bx + 2, by + 1, Math.max(0, bw * k - 4), 1);
        ctx.textAlign = 'right';
        ctx.font = `5px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText(`${n.have}/${n.need}`, b.x + b.w - 7, b.y + b.h - 18);
    }

    /**
     * The mode button under the island: a slanted navy slab in a gold edge like the other screens' buttons, glowing
     * while it has the cursor, with the mode's emblem and name, between two gold arrows.
     */
    private modeButton(v: LobbyView, lay: LobbyLayout, t: number): void {
        const ctx = this.ctx;
        const m = v.mode,
            b = lay.play,
            on = v.focus === 'mode';
        const slab = slanted(b.x, b.y, b.w, b.h, 10);
        ctx.save();
        if (on && !m.off) {
            ctx.shadowColor = '#ffd86b';
            ctx.shadowBlur = 10 + 4 * Math.sin(t * 5);
        }
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, on ? 'rgba(58,40,120,0.95)' : 'rgba(40,26,88,0.9)');
        g.addColorStop(1, on ? 'rgba(24,14,58,0.95)' : 'rgba(16,10,40,0.9)');
        ctx.fillStyle = g;
        slab(ctx);
        ctx.fill();
        ctx.restore();
        // A light sweeping across now and then.
        ctx.save();
        slab(ctx);
        ctx.clip();
        const sweep = ((t % 3) / 3) * (b.w + 100) - 50;
        const sg = ctx.createLinearGradient(b.x + sweep - 24, 0, b.x + sweep + 24, 0);
        sg.addColorStop(0, 'rgba(255,240,200,0)');
        sg.addColorStop(0.5, 'rgba(255,240,200,0.16)');
        sg.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
        ctx.strokeStyle = on ? '#ffd86b' : 'rgba(201,162,74,0.8)';
        ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.3 : 1.4;
        slab(ctx);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        slanted(b.x + 3, b.y + 3, b.w - 6, b.h - 6, 9)(ctx);
        ctx.stroke();
        // Emblem and name, centred together.
        const size = Math.round(b.h * 0.36);
        ctx.font = `${size}px ${ARCADE}`;
        const tw = Math.min(b.w - 52, ctx.measureText(m.label).width);
        const x0 = b.x + b.w / 2 - (tw + 26) / 2;
        ctx.save();
        if (m.off) {
            ctx.filter = 'grayscale(1)';
            ctx.globalAlpha = 0.6;
        }
        drawEmblem(ctx, m.action, x0 + 9, b.y + b.h / 2, b.h / 110, t, false);
        ctx.restore();
        const ink: [string, string, string] = m.off ? ['#ffffff', '#d6d0e6', '#8a80aa'] : GOLD_TEXT;
        arcadeText(ctx, m.label, x0 + 26, b.y + b.h / 2 + size * 0.38, size, ink, 'left', b.w - 52);
        if (m.off) {
            ctx.textAlign = 'center';
            ctx.font = `5px ${ARCADE}`;
            ctx.fillStyle = '#ffb3b3';
            ctx.fillText(m.ribbon === 'Coming soon' ? 'COMING SOON' : 'SWITCHED OFF', b.x + b.w / 2, b.y + b.h + 9);
        }
        // The arrows: gold arcade triangles, nudging outward now and then.
        const nudge = Math.max(0, Math.sin(t * 3)) * 1.8;
        for (const [box, dir] of [
            [lay.prev, -1],
            [lay.next, 1],
        ] as const) {
            const cx = box.x + box.w / 2 + dir * nudge,
                cy = box.y + box.h / 2,
                k = Math.min(box.w, box.h) / 36;
            /** Trace the arrow, pointing outward. */
            const tri = () => {
                ctx.beginPath();
                ctx.moveTo(cx + dir * 11 * k, cy);
                ctx.lineTo(cx - dir * 7 * k, cy - 12 * k);
                ctx.lineTo(cx - dir * 7 * k, cy + 12 * k);
                ctx.closePath();
            };
            ctx.save();
            if (on) {
                ctx.shadowColor = '#ffd86b';
                ctx.shadowBlur = 6;
            }
            const ag = ctx.createLinearGradient(0, cy - 12 * k, 0, cy + 12 * k);
            ag.addColorStop(0, '#fff7c2');
            ag.addColorStop(0.5, '#ffd45c');
            ag.addColorStop(1, '#ff9a2e');
            ctx.fillStyle = ag;
            tri();
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = '#140a26';
            ctx.lineWidth = 1.4;
            ctx.lineJoin = 'round';
            tri();
            ctx.stroke();
            // A second, fainter arrow behind it.
            ctx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 4);
            ctx.fillStyle = '#ffd45c';
            ctx.beginPath();
            ctx.moveTo(cx - dir * 9 * k, cy);
            ctx.lineTo(cx - dir * 15 * k, cy - 7 * k);
            ctx.lineTo(cx - dir * 15 * k, cy + 7 * k);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    /** World chat's latest lines at the bottom left (a tap opens the panel); hidden while the panel's open. */
    private ticker(v: LobbyView, b: Box, t: number): void {
        if (v.chatOpen) return;
        const ctx = this.ctx;
        this.panel(b.x, b.y, b.w, b.h);
        // The channel's tag: a blue tab.
        const tg = ctx.createLinearGradient(0, b.y + 4, 0, b.y + 13);
        tg.addColorStop(0, '#8fd8ff');
        tg.addColorStop(1, '#3a7ad8');
        ctx.fillStyle = tg;
        slanted(b.x + 4, b.y + 4, 36, 11, 3)(ctx);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = '#0c2350';
        ctx.fillText('WORLD', b.x + 22, b.y + 11.5);
        ctx.textAlign = 'right';
        ctx.fillStyle = `rgba(255,226,122,${0.6 + 0.3 * Math.sin(t * 3)})`;
        ctx.fillText(v.touch ? 'TAP TO CHAT' : 'T TO CHAT', b.x + b.w - 5, b.y + 11.5);
        const lines = v.chat.slice(-2);
        ctx.textAlign = 'left';
        if (!lines.length) {
            ctx.font = `700 7.5px ${SANS}`;
            ctx.fillStyle = 'rgba(214,204,250,0.8)';
            const empty = v.online ? 'Say hi to everyone online' : 'Chat needs the game server';
            ctx.fillText(empty, b.x + 6, b.y + 24, b.w - 12);
            return;
        }
        lines.forEach((l, i) => {
            const y = b.y + 26 + i * 12;
            ctx.font = `700 8.5px ${SANS}`;
            ctx.fillStyle = '#ffe27a';
            const name = `${l.name}:`;
            ctx.fillText(name, b.x + 6, y, 58);
            const nw = Math.min(58, ctx.measureText(name).width) + 3;
            ctx.font = `8.5px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(l.body, b.x + 6 + nw, y, b.w - 12 - nw);
        });
    }

    /** The friends panel: online count, empty places where friends will be, and the buttons that will add them. */
    private friends(b: Box, t: number): void {
        const ctx = this.ctx;
        this.panel(b.x, b.y, b.w, b.h);
        // Online count and the switch beside it.
        ctx.textAlign = 'left';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('ONLINE 0/0', b.x + 10, b.y + 12);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        roundRect(ctx, b.x + 58, b.y + 6, 16, 8, 4);
        ctx.fill();
        ctx.fillStyle = '#8ff0a0';
        ctx.beginPath();
        ctx.arc(b.x + 70, b.y + 10, 3, 0, Math.PI * 2);
        ctx.fill();
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
        [0, 1, 2].forEach(i => this.person(b.x + b.w * (0.2 + i * 0.3), by, i));
    }

    /** A small person icon for the friends panel's buttons: with a friend, with a plus, or with a letter. */
    private person(x: number, y: number, kind: number): void {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(214,204,250,0.6)';
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
            ctx.strokeStyle = 'rgba(214,204,250,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 3.5, y - 6, 5, 3.5);
        }
    }

    /** On a phone, the tab on the right edge that pulls the friends panel out. */
    private friendsTab(b: Box, t: number): void {
        const ctx = this.ctx;
        this.panel(b.x, b.y, b.w + 8, b.h);
        this.person(b.x + b.w / 2 + 1, b.y + 14, 0);
        ctx.save();
        ctx.translate(b.x + b.w / 2 + 2, b.y + b.h / 2 + 8);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = `rgba(255,247,194,${0.75 + 0.25 * Math.sin(t * 3)})`;
        ctx.fillText('FRIENDS', 0, 2.5);
        ctx.restore();
    }

    /** The bar of other screens along the bottom: each its emblem and name side by side; the chosen one lit. */
    private nav(v: LobbyView, boxes: Box[], t: number, W: number, bleed: number, tall: boolean): void {
        const ctx = this.ctx;
        const y = boxes[0].y,
            h = boxes[0].h;
        // The top bar's twin: dark, under a gold line.
        const g = ctx.createLinearGradient(0, y - 4, 0, y + h);
        g.addColorStop(0, 'rgba(10,6,28,0.6)');
        g.addColorStop(1, 'rgba(10,6,28,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-bleed, y - 4, W + 2 * bleed, h + 40);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(-bleed, y - 5, W + 2 * bleed, 1);
        ctx.fillStyle = 'rgba(255,230,160,0.25)';
        ctx.fillRect(-bleed, y - 6, W + 2 * bleed, 1);
        boxes.forEach((b, i) => {
            const n = LOBBY_NAV[i],
                on = v.focus === 'nav' && v.nav === i;
            if (on) {
                const lg = ctx.createRadialGradient(b.x + b.w / 2, b.y + b.h, 2, b.x + b.w / 2, b.y + b.h, b.w * 0.6);
                lg.addColorStop(0, hexA(n.color, 0.45));
                lg.addColorStop(1, hexA(n.color, 0));
                ctx.fillStyle = lg;
                ctx.fillRect(b.x, b.y, b.w, b.h);
                ctx.fillStyle = n.color;
                slanted(b.x + b.w * 0.2, b.y + b.h - 3, b.w * 0.6, 2.5, 1.5)(ctx);
                ctx.fill();
            }
            const r = tall ? 16 : 11;
            if (tall) {
                drawBadge(ctx, n.color, b.x + b.w / 2, b.y + r + 5, r, on, t);
                drawEmblem(ctx, n.action, b.x + b.w / 2, b.y + r + 5, r / 34, t, on);
                ctx.textAlign = 'center';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = on ? '#fff7c2' : 'rgba(239,230,255,0.85)';
                ctx.fillText(n.label, b.x + b.w / 2, b.y + b.h - 8, b.w - 4);
                return;
            }
            ctx.font = `7px ${ARCADE}`;
            const lw = ctx.measureText(n.label).width;
            const x0 = b.x + b.w / 2 - (lw + r * 2 + 6) / 2;
            drawBadge(ctx, n.color, x0 + r, b.y + b.h / 2, r, on, t);
            drawEmblem(ctx, n.action, x0 + r, b.y + b.h / 2, r / 34, t, on);
            ctx.textAlign = 'left';
            ctx.fillStyle = on ? '#fff7c2' : 'rgba(239,230,255,0.85)';
            ctx.fillText(n.label, x0 + r * 2 + 6, b.y + b.h / 2 + 2.5);
        });
    }
}
