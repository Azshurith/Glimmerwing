// The Profile screen: who's playing (a guest, until sign-in exists), the Endless top three, and two tabs: their record
// and unlocks, and their match history (each game opens in full on the match details screen, match-screen.ts).
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { mapById } from '@/data/maps';
import { STAGES } from '@/data/stages';
import { clock } from '@/render/hud';
import type { Fairy, HistoryRow, Layout, PlayerCard, ProfileView } from '@/types';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted } from '@/render/draw';
import { ARCADE, FONT, SANS } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import { PieceAtlas } from './kit';
import { kitCorners, kitDivider, kitPanel, kitPill, kitReady, kitTab, mockBox, mockFit } from './kit-ui';
import type { MockFit } from './kit-ui';
import kitUrl from '@/../assets/ui/profile-kit.png';
import goldUrl from '@/../assets/ui/profile-kit-gold.png';
import { PROFILE_KIT } from '@/data/profile-kit';
import {
    crest,
    gem,
    goldFrame,
    goldGradient,
    iconOrb,
    keyHints,
    ornatePanel,
    ornateScreen,
    ornateTitle,
    pointed,
} from './ornate';

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A box, in design or view units. */
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The Profile's painted pieces (`tools/extract-screen-kit.py profile`), used in landscape once loaded. */
const KIT = new PieceAtlas(kitUrl, goldUrl, PROFILE_KIT);

/**
 * The painted landscape Profile's layout, in its mockup's 2x pixels: each piece's box (the piece fills it), the tap
 * boxes of the tabs, the first history row and the rows' pitch, and where the game writes on the pieces.
 */
const MOCK = {
    area: [100, 0, 3545, 1480] as const,
    title: [1146, 2, 1194, 217],
    card: [134, 90, 876, 1384],
    tabsRecord: [1072, 229, 1394, 142],
    tabsHistory: [1100, 205, 1260, 145],
    tabs: [
        [1075, 230, 615, 138],
        [1700, 230, 760, 138],
    ],
    tiles: [
        ['tileWins', 1062, 398, 777, 192, 1347],
        ['tileChain', 1857, 398, 795, 193, 2133],
        ['tileFevers', 2670, 398, 849, 194, 2958],
        ['tileFlawless', 1061, 604, 779, 190, 1347],
        ['tileFairies', 1858, 604, 794, 190, 2153],
        ['tileTrophies', 2671, 604, 848, 190, 2933],
        ['tileEndless', 1062, 804, 1029, 181, 1349],
    ] as const,
    fairies: [1056, 995, 2332, 404],
    row: [1062, 365, 2263, 142],
    pitch: 139.5,
} as const;

/** Where the landscape Profile's mockup sits in a view widened by `bleed`. */
function profileFit(bleed: number): MockFit {
    const [x0, y0, x1, y1] = MOCK.area;
    return mockFit(C.VIEW_W, C.VIEW_H, bleed, x0, y0, x1, y1);
}

/** Whether landscape Profile is drawn from its painted pieces (once they've loaded). */
const painted = () => KIT.ready() && kitReady();

/** How wide the player card is in landscape. */
const CARD_W = 150;

/** Paints a map's scenery over a rectangle, in the current transform. */
type StagePainter = (map: string, x: number, y: number, w: number, h: number) => void;

/** The two tabs' labels, in order. */
const TABS = ['RECORD', 'MATCH HISTORY'] as const;

/** Rows of the match history in view at once in each layout; the list scrolls with the cursor. */
export const HISTORY_ROWS = { wide: 7, tall: 6 } as const;

/**
 * Where the tabs and the history rows sit, in the screen's design units (`dy` is the tall screen's shift down): to
 * the right of the player card in landscape, whose left edge reaches `bleed` past the view's, and under the card on
 * a phone. Also where the record starts.
 */
function designLayout(layout: Layout, dy: number, bleed: number): { tabs: Box[]; rows: Box[]; top: number } {
    if (layout === 'tall') {
        const tw = 112,
            x0 = (C.TALL_W - 2 * tw - 6) / 2,
            top = 218 + dy;
        return {
            tabs: [0, 1].map(i => ({ x: x0 + i * (tw + 6), y: 194 + dy, w: tw, h: 16 })),
            rows: Array.from({ length: HISTORY_ROWS.tall }, (_, i) => ({
                x: 12,
                y: top + i * 46,
                w: C.TALL_W - 24,
                h: 40,
            })),
            top,
        };
    }
    const x = CARD_W + 22 - bleed,
        w = C.VIEW_W + 2 * bleed - CARD_W - 34,
        top = 64;
    return {
        tabs: [0, 1].map(i => ({ x: x + i * 112, y: 38, w: 106, h: 18 })),
        rows: Array.from({ length: HISTORY_ROWS.wide }, (_, i) => ({ x, y: top + i * 32, w, h: 28 })),
        top,
    };
}

/** The tabs and the history rows in view units (also their tap targets), for a view `h` tall widened by `bleed`. */
export function profileBoxes(layout: Layout, h: number = C.TALL_H, bleed = 0): { tabs: Box[]; rows: Box[] } {
    if (layout !== 'tall' && painted()) {
        const f = profileFit(bleed);
        const [rx, ry, rw, rh] = MOCK.row;
        return {
            tabs: MOCK.tabs.map(([x, y, w, hh]) => mockBox(f, x, y, w, hh)),
            rows: Array.from({ length: HISTORY_ROWS.wide }, (_, i) => mockBox(f, rx, ry + i * MOCK.pitch, rw, rh)),
        };
    }
    if (layout !== 'tall') return designLayout(layout, 0, bleed);
    const f = tallMenuFit(h);
    const d = designLayout(layout, tallShift(f.h), f.bleed);
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    return { tabs: d.tabs.map(view), rows: d.rows.map(view) };
}

/** The Profile screen. */
export class ProfileScreen {
    /** Draw on `ctx`. */
    constructor(private ctx: CanvasRenderingContext2D) {}

    /**
     * Draw the screen; `bleed` is how far a widened landscape view reaches past each side, and `stage` paints a map's
     * scenery for the history's thumbnails.
     */
    draw(
        v: ProfileView,
        t: number,
        layout: Layout = 'wide',
        h: number = C.TALL_H,
        bleed = 0,
        stage?: StagePainter,
    ): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        if (!tall && painted()) {
            this.drawPainted(v, t, bleed, stage);
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
        enter(ctx, 'bar', () => ornateTitle(ctx, 'PROFILE', W, t, tall));
        ctx.translate(0, dy);
        const card = tall ? { x: 10, y: 40, w: W - 20, h: 146 } : { x: 10 - bleed, y: 34, w: CARD_W, h: 276 };
        enter(ctx, 'panels', () => this.card(v, card, t, tall), { dx: tall ? 0 : -22, dy: tall ? 10 : 0 });
        const lay = designLayout(layout, 0, bleed);
        const regionX = tall ? 10 : card.x + card.w + 12,
            regionW = tall ? W - 20 : W + bleed - 12 - regionX;
        enter(ctx, 'buttons', () => this.tabs(v, lay.tabs, t), { i: 1 });
        enter(ctx, 'panels', () => {
            if (v.tab === 'history') this.history(v, lay.rows, t, tall, stage);
            else this.record(v, t, tall, regionX, regionW, lay.top);
        });
        ctx.translate(0, -dy);
        enter(ctx, 'hint', () =>
            keyHints(
                ctx,
                v.tab === 'history'
                    ? [
                          [['◀', '▶'], 'TABS'],
                          [['▲', '▼'], 'CHOOSE'],
                          [['ENTER'], 'DETAILS'],
                          [['ESC'], 'BACK'],
                      ]
                    : [
                          [['◀', '▶'], 'TABS'],
                          [['ESC'], 'BACK'],
                      ],
                W / 2 + (tall ? 0 : (CARD_W + 12) / 2),
                tall ? H - 12 : H - 6,
                v.touch
                    ? v.tab === 'history'
                        ? 'TAP A GAME FOR ITS DETAILS'
                        : 'TAP MATCH HISTORY FOR YOUR GAMES'
                    : null,
            ),
        );
        ctx.restore();
    }

    /** Landscape Profile drawn from its painted pieces, laid out as its mockup and fitted to the view. */
    private drawPainted(v: ProfileView, t: number, bleed: number, stage?: StagePainter): void {
        const ctx = this.ctx;
        const W = C.VIEW_W,
            H = C.VIEW_H;
        const f = profileFit(bleed);
        ctx.save();
        enter(ctx, 'bg', () => ornateScreen(ctx, t, W, H, bleed, '', false));
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.s, f.s);
        const piece = (name: string, b: readonly number[], phase?: number) => {
            KIT.draw(ctx, name, b[0], b[1], b[2], b[3]);
            if (phase !== undefined) KIT.glint(ctx, name, b[0], b[1], b[2], b[3], t, phase, 7);
        };
        enter(ctx, 'bar', () => piece('title', MOCK.title, 0));
        enter(ctx, 'panels', () => drawPlayerCard(ctx, v, MOCK.card, t), { dx: -22 });
        enter(ctx, 'buttons', () =>
            v.tab === 'history' ? piece('tabsHistory', MOCK.tabsHistory, 1) : piece('tabsRecord', MOCK.tabsRecord, 1),
        );
        enter(ctx, 'panels', () =>
            v.tab === 'history' ? this.paintedHistory(v, t, stage) : this.paintedRecord(v, t, piece),
        );
        ctx.restore();
        enter(ctx, 'hint', () =>
            keyHints(
                ctx,
                v.tab === 'history'
                    ? [
                          [['◀', '▶'], 'TABS'],
                          [['▲', '▼'], 'CHOOSE'],
                          [['ENTER'], 'DETAILS'],
                          [['ESC'], 'BACK'],
                      ]
                    : [
                          [['◀', '▶'], 'TABS'],
                          [['ESC'], 'BACK'],
                      ],
                W / 2,
                H - 8,
                v.touch
                    ? v.tab === 'history'
                        ? 'TAP A GAME FOR ITS DETAILS'
                        : 'TAP MATCH HISTORY FOR YOUR GAMES'
                    : null,
            ),
        );
        ctx.restore();
    }

    /** The painted Record tab: the numbers on their tiles (with where the trophy road goes next) and the fairies. */
    private paintedRecord(
        v: ProfileView,
        t: number,
        piece: (name: string, b: readonly number[], phase?: number) => void,
    ): void {
        const ctx = this.ctx;
        const unlocked = v.locked.filter(l => !l).length;
        const values: Record<string, string> = {
            tileWins: String(v.wins),
            tileChain: String(v.bestChain),
            tileFevers: String(v.fevers),
            tileFlawless: String(v.flawless),
            tileFairies: `${unlocked}/${FAIRIES.length}`,
            tileTrophies: String(v.trophies),
            tileEndless: clock(v.endlessBest),
        };
        const gold: [string, string, string] = ['#fff7c2', '#ffd45c', '#ff9a2e'];
        MOCK.tiles.forEach(([name, x, y, w, h, vx], i) => {
            piece(name, [x, y, w, h], 2 + i * 0.4);
            arcadeText(ctx, values[name], vx, y + 150, 92, gold, 'left', 520);
        });
        // Where the trophy road goes next, on a lilac chip; the Endless rank on a dark one.
        const nextStage = STAGES.find(st => st.trophies > v.bestTrophies);
        const chip = nextStage
            ? `${(mapById(nextStage.mapId)?.name ?? '').toUpperCase()} AT ${nextStage.trophies}`
            : 'ALL STAGES';
        this.chip(chip, 3135, 662, 265, 86, 'lilac');
        if (v.rank) this.chip(`#${v.rank.rank} OF ${v.rank.players}`, 1745, 873, 302, 80, 'capsule');
        // The fairies, and what unlocks the next.
        const [fx, fy, fw, fh] = MOCK.fairies;
        piece('fairies', [fx, fy, fw, fh], 4);
        const next = FAIRIES.find((_, i) => v.locked[i]);
        ctx.textAlign = 'center';
        ctx.font = `italic 700 38px ${FONT}`;
        ctx.fillStyle = next ? '#ffe27a' : '#f0e8ff';
        ctx.fillText(
            next ? `Next: ${next.unlock?.hint ?? ''} to unlock ${next.name}` : '✦ Every fairy is unlocked! ✦',
            2986,
            1032,
            1100,
        );
        const xs = [1310, 1620, 1930, 2240, 2552, 2864, 3164];
        FAIRIES.slice(0, xs.length).forEach((fy2, i) => {
            const x = xs[i],
                y = 1224,
                r = 100;
            if (v.locked[i]) {
                const g = ctx.createRadialGradient(x, y - 30, 10, x, y, r);
                g.addColorStop(0, '#3a3360');
                g.addColorStop(1, '#141030');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.textAlign = 'center';
                ctx.font = `${r * 0.9}px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.fillText('?', x, y + r * 0.32);
            } else {
                ctx.save();
                const g = ctx.createRadialGradient(x, y - 30, 10, x, y, r);
                g.addColorStop(0, fy2.color);
                g.addColorStop(1, shade(fy2.color, 0.3));
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
                ctx.clip();
                drawFairy(ctx, fy2, x, y + 14, 5.2, t);
                ctx.restore();
            }
            ctx.strokeStyle = v.locked[i] ? 'rgba(201,162,74,0.55)' : goldGradient(ctx, y - r, y + r);
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.arc(x, y, r + 4, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    /** A chip of `kind` in the mockup's units, with its text. */
    private chip(text: string, x: number, y: number, w: number, h: number, kind: 'lilac' | 'capsule'): void {
        const ctx = this.ctx;
        kitPill(ctx, { x, y, w, h }, kind);
        ctx.textAlign = 'center';
        ctx.font = `800 ${h * 0.42}px ${SANS}`;
        ctx.fillStyle = kind === 'lilac' ? '#ffffff' : '#ffe27a';
        ctx.fillText(text, x + w / 2, y + h * 0.64, w - 30);
    }

    /** The painted Match History tab: a row per game, newest first, the chosen one glowing, and a scroll bar. */
    private paintedHistory(v: ProfileView, t: number, stage?: StagePainter): void {
        const ctx = this.ctx;
        const [rx, ry, rw, rh] = MOCK.row;
        if (v.message) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 48px ${FONT}`;
            ctx.fillStyle = 'rgba(239,230,255,0.9)';
            v.message.split('\n').forEach((l, i) => ctx.fillText(l, rx + rw / 2, ry + 140 + i * 64, rw - 40));
        }
        const n = HISTORY_ROWS.wide;
        const shown = v.history.slice(v.start, v.start + n);
        const pieces: Record<string, string> = {
            ENDLESS: 'rowEndless',
            'VS CPU': 'rowCpu',
            '2 PLAYERS': 'rowVersus',
            ONLINE: 'rowOnline',
        };
        shown.forEach((row, k) => {
            const y = ry + k * MOCK.pitch,
                on = v.start + k === v.index;
            const name = pieces[row.tag] ?? 'rowOnline';
            if (on) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,150,255,0.35)';
                ctx.lineWidth = 22 + 6 * Math.sin(t * 5);
                roundRect(ctx, rx + 8, y + 8, rw - 16, rh - 16, (rh - 16) / 2);
                ctx.stroke();
                ctx.restore();
            }
            KIT.draw(ctx, name, rx, y, rw, rh);
            if (on) {
                ctx.strokeStyle = 'rgba(255,214,255,0.95)';
                ctx.lineWidth = 5;
                roundRect(ctx, rx + 6, y + 6, rw - 12, rh - 12, (rh - 12) / 2);
                ctx.stroke();
                KIT.glint(ctx, name, rx, y, rw, rh, t, 0, 4);
            }
            if (name === 'rowOnline') {
                ctx.textAlign = 'center';
                ctx.font = `800 40px ${SANS}`;
                ctx.fillStyle = row.color;
                ctx.fillText(row.tag, rx + 180, y + 86, 300);
            }
            // The stage's picture, in a rounded frame.
            const tx = rx + 438,
                ty = y + 30,
                tw = 245,
                th = 92;
            if (stage && row.map) {
                ctx.save();
                roundRect(ctx, tx, ty, tw, th, 14);
                ctx.clip();
                stage(row.map, tx, ty, tw, th);
                ctx.restore();
            }
            ctx.strokeStyle = 'rgba(214,170,255,0.8)';
            ctx.lineWidth = 3;
            roundRect(ctx, tx, ty, tw, th, 14);
            ctx.stroke();
            // Who flew, the map and numbers, the result and when.
            ctx.textAlign = 'left';
            ctx.font = `700 46px ${FONT}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(row.title, rx + 768, y + 64, 760);
            ctx.font = `italic 600 36px ${FONT}`;
            ctx.fillStyle = 'rgba(224,214,255,0.95)';
            ctx.fillText(row.detail, rx + 768, y + 106, 760);
            const win = row.result.startsWith('WIN');
            const cx = rx + 1640;
            ctx.textAlign = 'center';
            ctx.font = `48px ${ARCADE}`;
            ctx.fillStyle = win ? '#c8f55a' : row.tag === 'ENDLESS' ? '#ffd45c' : row.resultColor;
            ctx.fillText(row.result, cx, y + 88, 330);
            if (win) {
                const lw = Math.min(330, ctx.measureText(row.result).width);
                for (const dir of [-1, 1]) {
                    ctx.save();
                    ctx.translate(cx + dir * (lw / 2 + 34), y + 72);
                    ctx.scale(7, 7);
                    laurel(ctx, 0, 0, 4, dir, '#c8f55a');
                    ctx.restore();
                }
            }
            ctx.textAlign = 'right';
            ctx.font = `30px ${ARCADE}`;
            ctx.fillStyle = row.local ? '#ffe27a' : '#e2ccff';
            ctx.fillText(row.local ? 'THIS DEVICE' : row.when, rx + 2150, y + 84, 260);
        });
        // The scroll bar down the right.
        if (v.history.length > n) {
            const x = 3345,
                y0 = ry + 5,
                h = n * MOCK.pitch - 10;
            ctx.fillStyle = 'rgba(20,10,44,0.8)';
            roundRect(ctx, x, y0, 44, h, 22);
            ctx.fill();
            ctx.strokeStyle = 'rgba(214,170,255,0.6)';
            ctx.lineWidth = 3;
            ctx.stroke();
            const th = Math.max(80, (h * n) / v.history.length);
            const g = ctx.createLinearGradient(x, 0, x + 44, 0);
            g.addColorStop(0, '#ffe9a0');
            g.addColorStop(1, '#e09a2c');
            ctx.fillStyle = g;
            roundRect(ctx, x + 8, y0 + ((h - th) * v.start) / (v.history.length - n), 28, th, 14);
            ctx.fill();
        }
    }

    /**
     * The player's card: their portrait in a gold frame with a crest, their name on a plaque, where their progress is
     * kept, and (in landscape) the Endless leaderboard's top three.
     */
    private card(v: ProfileView, c: Box, t: number, tall: boolean): void {
        const ctx = this.ctx;
        const kit = kitReady();
        if (kit) kitPanel(ctx, c, t, 0.5, true);
        else ornatePanel(ctx, c, 14, true);
        const fy = FAIRIES[0];
        const pw = tall ? 96 : c.w - 14,
            ph = tall ? c.h - 14 : 120;
        const px = c.x + 7,
            py = c.y + 7;
        ctx.save();
        roundRect(ctx, px, py, pw, ph, 10);
        ctx.clip();
        const bg = ctx.createRadialGradient(px + pw / 2, py + ph * 0.4, 6, px + pw / 2, py + ph * 0.4, ph);
        bg.addColorStop(0, fy.color);
        bg.addColorStop(0.6, shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(px, py, pw, ph);
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            const k = Math.max(pw / sw, ph / sh);
            ctx.drawImage(p.img, sx, sy, sw, sh, px + pw / 2 - (sw * k) / 2, py, sw * k, sh * k);
        } else drawFairy(ctx, fy, px + pw / 2, py + ph * 0.5, 3.2, t, 0, false);
        ctx.restore();
        goldFrame(ctx, () => roundRect(ctx, px, py, pw, ph, 10), py, py + ph, 1.6);
        if (kit) kitCorners(ctx, { x: px, y: py, w: pw, h: ph }, Math.min(30, pw * 0.26));
        crest(ctx, px + pw / 2, py + 1, 8, t);
        // The name plaque: across the portrait's foot in landscape, beside the portrait on a phone.
        const nx = tall ? px + pw + 8 : c.x + 8,
            nw = tall ? c.x + c.w - 8 - nx : c.w - 16,
            ny = tall ? c.y + 14 : py + ph - 10;
        if (kit) kitPill(ctx, { x: nx, y: ny, w: nw, h: 20 }, 'capsule');
        else {
            ctx.fillStyle = 'rgba(22,10,50,0.95)';
            pointed(ctx, nx, ny, nw, 20, 9);
            ctx.fill();
            ctx.strokeStyle = goldGradient(ctx, ny, ny + 20);
            ctx.lineWidth = 1.4;
            pointed(ctx, nx, ny, nw, 20, 9);
            ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.font = `800 10px ${SANS}`;
        ctx.fillStyle = '#ffe9b0';
        ctx.fillText(v.name, nx + nw / 2, ny + 13.5, nw - 22);
        ctx.font = `italic 600 7.5px ${FONT}`;
        ctx.fillStyle = 'rgba(239,230,255,0.85)';
        const sy = ny + 32;
        ctx.fillText(
            v.synced ? 'Progress is saved on the game server.' : 'Progress is saved in this browser.',
            nx + nw / 2,
            sy,
            nw,
        );
        ctx.fillText('Sign in with Google: coming soon', nx + nw / 2, sy + 10, nw);
        const ly = tall ? sy + 22 : sy + 20;
        // A divider with a gem, then the Endless top three.
        if (kit) kitDivider(ctx, nx + nw / 2, ly, nw - 10);
        else {
            ctx.fillStyle = goldGradient(ctx, ly, ly + 2);
            ctx.fillRect(nx + 10, ly, nw - 20, 0.8);
            gem(ctx, nx + nw / 2, ly + 0.4, 2.5);
        }
        this.leaders(v, nx + 2, ly + 14, nw - 4, tall);
    }

    /** The Endless leaderboard's top three: a laurelled heading, then a row each with a medal for the place. */
    private leaders(v: ProfileView, x: number, y: number, w: number, tall: boolean): void {
        const ctx = this.ctx;
        ctx.textAlign = 'center';
        ctx.font = `${tall ? 6 : 6.5}px ${ARCADE}`;
        ctx.fillStyle = '#ffd45c';
        ctx.fillText('ENDLESS TOP 3', x + w / 2, y);
        const lw = ctx.measureText('ENDLESS TOP 3').width;
        for (const dir of [-1, 1]) laurel(ctx, x + w / 2 + dir * (lw / 2 + 7), y - 2.5, 5, dir);
        const top = v.leaders.slice(0, tall ? 2 : 3);
        if (!top.length) {
            ctx.font = `italic 600 8px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            ctx.fillText(
                v.synced ? 'No runs yet: set the first!' : 'Shown when the server is reached',
                x + w / 2,
                y + 16,
            );
            return;
        }
        const medals = ['#ffd45c', '#d8dcef', '#e09a5a'];
        top.forEach((e, i) => {
            const ry = y + 6 + i * 15,
                mine = e.playerId === v.me;
            if (kitReady()) kitPill(ctx, { x, y: ry, w, h: 13 }, 'capsule');
            if (mine) {
                ctx.fillStyle = 'rgba(255,212,92,0.12)';
                roundRect(ctx, x, ry, w, 13, 4);
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,212,92,0.5)';
                ctx.lineWidth = 0.6;
                ctx.stroke();
            }
            ctx.fillStyle = medals[i];
            ctx.beginPath();
            ctx.arc(x + 9, ry + 6.5, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.textAlign = 'center';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#2a1408';
            ctx.fillText(String(i + 1), x + 9, ry + 9);
            ctx.textAlign = 'left';
            ctx.font = `800 8.5px ${SANS}`;
            ctx.fillStyle = mine ? '#ffe27a' : '#ffffff';
            ctx.fillText(e.name, x + 19, ry + 9.5, w - 58);
            ctx.textAlign = 'right';
            ctx.fillText(clock(e.seconds), x + w - 4, ry + 9.5);
        });
    }

    /** The two tabs: gold capsules with an icon each (bars for the record, crossed swords for the history). */
    private tabs(v: ProfileView, boxes: Box[], t: number): void {
        const ctx = this.ctx;
        if (kitReady()) {
            boxes.forEach((b, i) =>
                kitTab(ctx, b, TABS[i], (i === 1) === (v.tab === 'history'), t, (x, y, ink) =>
                    tabIcon(ctx, i, x, y, ink),
                ),
            );
            return;
        }
        boxes.forEach((b, i) => {
            const on = (i === 1) === (v.tab === 'history');
            ctx.save();
            if (on) {
                ctx.shadowColor = '#ffb43c';
                ctx.shadowBlur = 10;
            }
            const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
            if (on) {
                g.addColorStop(0, '#fff3b0');
                g.addColorStop(0.5, '#ffc93c');
                g.addColorStop(1, '#d87a10');
            } else {
                g.addColorStop(0, 'rgba(46,24,92,0.92)');
                g.addColorStop(1, 'rgba(22,10,50,0.92)');
            }
            ctx.fillStyle = g;
            roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = on ? '#fff6d8' : goldGradient(ctx, b.y, b.y + b.h);
            ctx.lineWidth = 1.2;
            roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, b.h / 2);
            ctx.stroke();
            const ink = on ? '#3a1408' : '#fff3c9';
            ctx.font = `7px ${ARCADE}`;
            const tw = ctx.measureText(TABS[i]).width;
            const x0 = b.x + b.w / 2 - (tw + 14) / 2,
                cy = b.y + b.h / 2;
            ctx.fillStyle = ink;
            ctx.strokeStyle = ink;
            if (i === 0) {
                ctx.fillRect(x0, cy, 2, 4);
                ctx.fillRect(x0 + 3, cy - 3, 2, 7);
                ctx.fillRect(x0 + 6, cy - 1, 2, 5);
            } else {
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(x0, cy - 4);
                ctx.lineTo(x0 + 8, cy + 4);
                ctx.moveTo(x0 + 8, cy - 4);
                ctx.lineTo(x0, cy + 4);
                ctx.stroke();
            }
            ctx.textAlign = 'left';
            ctx.fillText(TABS[i], x0 + 14, cy + 3);
        });
    }

    /**
     * The Record tab: the record as gold-framed tiles (a round icon, the name and the value in gold), then the
     * fairies in a framed panel, unlocked in colour and locked as a ?, with what unlocks the next one.
     */
    private record(v: ProfileView, t: number, tall: boolean, x0: number, w: number, top: number): void {
        const ctx = this.ctx;
        const unlocked = v.locked.filter(l => !l).length;
        const nextStage = STAGES.find(st => st.trophies > v.bestTrophies);
        const tiles: [string, string, string][] = [
            ['WINS', String(v.wins), 'trophy'],
            ['BEST CHAIN', String(v.bestChain), 'chain'],
            ['FEVERS', String(v.fevers), 'flame'],
            ['FLAWLESS WINS', String(v.flawless), 'crown'],
            ['FAIRIES', `${unlocked}/${FAIRIES.length}`, 'wings'],
            ['TROPHIES', String(v.trophies), 'trophy'],
            ['ENDLESS BEST', clock(v.endlessBest), 'clock'],
        ];
        const cols = tall ? 2 : w < 3 * 100 ? 2 : 3;
        const gap = 7,
            tw = (w - (cols - 1) * gap) / cols,
            th = tall ? 34 : 38;
        tiles.forEach(([label, value, icon], i) => {
            const x = x0 + (i % cols) * (tw + gap),
                y = top + Math.floor(i / cols) * (th + gap);
            const box = { x, y, w: label === 'ENDLESS BEST' && cols === 3 ? tw * 1.4 : tw, h: th };
            if (kitReady()) kitPanel(ctx, box, t, i * 0.6);
            else ornatePanel(ctx, box, 9);
            const r = th / 2 - 5;
            iconOrb(ctx, x + r + 6, y + th / 2, r, '#6a3ab8');
            recordIcon(ctx, icon, x + r + 6, y + th / 2, r * 0.62);
            const tx = x + r * 2 + 13;
            ctx.textAlign = 'left';
            ctx.font = `${tall ? 5.5 : 6}px ${ARCADE}`;
            ctx.fillStyle = '#f0e6ff';
            ctx.fillText(label, tx, y + 12, tw - (tx - x) - 4);
            arcadeText(ctx, value, tx, y + th - 7, tall ? 13 : 15, ['#fff7c2', '#ffd45c', '#ff9a2e'], 'left');
            // A chip on the right: where the trophy road goes next, or the Endless rank.
            const chip =
                label === 'TROPHIES'
                    ? nextStage
                        ? `${(mapById(nextStage.mapId)?.name ?? '').toUpperCase()} AT ${nextStage.trophies}`
                        : 'ALL STAGES'
                    : label === 'ENDLESS BEST' && v.rank
                      ? `#${v.rank.rank} OF ${v.rank.players}`
                      : '';
            if (chip && !tall) {
                ctx.font = `5px ${ARCADE}`;
                const cw = ctx.measureText(chip).width + 12;
                const right = x + (label === 'ENDLESS BEST' && cols === 3 ? tw * 1.4 : tw) - 6;
                ctx.fillStyle = 'rgba(12,6,30,0.85)';
                roundRect(ctx, right - cw, y + th - 15, cw, 10, 5);
                ctx.fill();
                ctx.strokeStyle = 'rgba(233,185,73,0.6)';
                ctx.lineWidth = 0.7;
                ctx.stroke();
                ctx.textAlign = 'center';
                ctx.fillStyle = '#ffe9b0';
                ctx.fillText(chip, right - cw / 2, y + th - 8);
            }
        });
        // The fairies, in a framed panel under a plaque.
        const rows = Math.ceil(tiles.length / cols);
        const fy = top + rows * (th + gap) + (tall ? 8 : 10);
        const ph = tall ? 46 : 52;
        if (kitReady()) {
            kitPanel(ctx, { x: x0, y: fy + 6, w, h: ph }, t, 3, true);
            kitPill(ctx, { x: x0 + 8, y: fy - 1, w: 70, h: 15 }, 'capsule');
        } else {
            ornatePanel(ctx, { x: x0, y: fy + 6, w, h: ph }, 10);
            ctx.fillStyle = 'rgba(22,10,50,0.95)';
            pointed(ctx, x0 + 8, fy, 66, 13, 6);
            ctx.fill();
            ctx.strokeStyle = goldGradient(ctx, fy, fy + 13);
            ctx.lineWidth = 1;
            pointed(ctx, x0 + 8, fy, 66, 13, 6);
            ctx.stroke();
        }
        ctx.textAlign = 'left';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = '#ffd45c';
        ctx.fillText('FAIRIES', x0 + 21, fy + 9);
        const next = FAIRIES.find((_, i) => v.locked[i]);
        ctx.textAlign = 'right';
        ctx.font = `italic 600 ${tall ? 7.5 : 8.5}px ${FONT}`;
        ctx.fillStyle = next ? '#ffe27a' : '#f0e8ff';
        ctx.fillText(
            next ? `Next: ${next.unlock?.hint ?? ''} to unlock ${next.name}` : 'Every fairy is unlocked!',
            x0 + w - 6,
            fy + 2,
            w - 90,
        );
        const n = FAIRIES.length,
            rgap = Math.min(tall ? 32 : 46, (w - 20) / n),
            rr = Math.min(tall ? 12 : 16, rgap / 2 - 2),
            ry = fy + 6 + ph / 2;
        FAIRIES.forEach((f, i) => {
            const x = x0 + w / 2 - ((n - 1) * rgap) / 2 + i * rgap,
                locked = v.locked[i];
            const g = ctx.createRadialGradient(x, ry - 4, 2, x, ry, rr);
            g.addColorStop(0, locked ? '#3a3360' : f.color);
            g.addColorStop(1, locked ? '#141030' : shade(f.color, 0.3));
            ctx.save();
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, ry, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.clip();
            if (locked) {
                ctx.font = `${rr * 0.8}px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.textAlign = 'center';
                ctx.fillText('?', x, ry + rr * 0.28);
            } else drawFairy(ctx, f, x, ry + 2, 0.75 * (rr / 15), t);
            ctx.restore();
            ctx.strokeStyle = locked ? 'rgba(201,162,74,0.45)' : goldGradient(ctx, ry - rr, ry + rr);
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(x, ry, rr, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    /** The Match History tab: one row per game, newest first, the chosen one lit. */
    private history(v: ProfileView, boxes: Box[], t: number, tall: boolean, stage?: StagePainter): void {
        const ctx = this.ctx;
        if (v.message) {
            const b = boxes[0];
            ctx.textAlign = 'center';
            ctx.font = `italic 600 10px ${FONT}`;
            ctx.fillStyle = 'rgba(239,230,255,0.9)';
            v.message.split('\n').forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, b.y + 30 + i * 14, b.w - 10));
        }
        const shown = v.history.slice(v.start, v.start + boxes.length);
        shown.forEach((row, k) => this.row(row, boxes[k], v.start + k === v.index, t, tall, stage));
        // A scroll bar down the right when there's more than fits.
        if (v.history.length > boxes.length) {
            const first = boxes[0],
                last = boxes[boxes.length - 1];
            const x = first.x + first.w + 4,
                y0 = first.y,
                h = last.y + last.h - y0;
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            roundRect(ctx, x, y0, 3, h, 1.5);
            ctx.fill();
            const k = boxes.length / v.history.length;
            ctx.fillStyle = '#ffd45c';
            roundRect(ctx, x, y0 + (h * v.start) / v.history.length, 3, Math.max(8, h * k), 1.5);
            ctx.fill();
        }
    }

    /**
     * One game in the history, as a gold-framed capsule: its mode on a chip, its stage in a little picture, who flew
     * with the map and numbers under it, the result (laurelled when won), and when.
     */
    private row(row: HistoryRow, b: Box, on: boolean, t: number, tall: boolean, stage?: StagePainter): void {
        if (kitReady()) this.kitRow(b, on, t);
        else this.plainRow(b, on, t);
        this.rowContent(row, b, tall, stage);
    }

    /** A history row's capsule from the kit, lit with a lilac halo when it's the one chosen. */
    private kitRow(b: Box, on: boolean, t: number): void {
        const ctx = this.ctx;
        if (on) {
            ctx.save();
            ctx.shadowColor = '#d9a6ff';
            ctx.shadowBlur = 12 + 4 * Math.sin(t * 5);
            ctx.fillStyle = 'rgba(200,140,255,0.35)';
            roundRect(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, (b.h - 4) / 2);
            ctx.fill();
            ctx.restore();
        }
        kitPill(ctx, b, 'capsule', on ? t : undefined);
        if (on) {
            ctx.strokeStyle = 'rgba(240,200,255,0.85)';
            ctx.lineWidth = 1;
            roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, (b.h - 2) / 2);
            ctx.stroke();
        }
    }

    /** A history row's capsule drawn in code, while the kit's picture loads. */
    private plainRow(b: Box, on: boolean, t: number): void {
        const ctx = this.ctx;
        ctx.save();
        if (on) {
            ctx.shadowColor = '#c07aff';
            ctx.shadowBlur = 10 + 3 * Math.sin(t * 5);
        }
        const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        g.addColorStop(0, on ? 'rgba(80,40,140,0.95)' : 'rgba(46,24,92,0.88)');
        g.addColorStop(1, on ? 'rgba(40,18,80,0.95)' : 'rgba(22,10,50,0.9)');
        ctx.fillStyle = g;
        roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = on ? '#f0c8ff' : goldGradient(ctx, b.y, b.y + b.h);
        ctx.lineWidth = on ? 1.6 : 1.1;
        roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, b.h / 2);
        ctx.stroke();
    }

    /** What a history row says: its mode, its stage, who flew, the result and when. */
    private rowContent(row: HistoryRow, b: Box, tall: boolean, stage?: StagePainter): void {
        const ctx = this.ctx;
        // The mode chip.
        const cw = tall ? 54 : 62;
        ctx.fillStyle = 'rgba(12,6,30,0.7)';
        roundRect(ctx, b.x + 3, b.y + 3, cw, b.h - 6, (b.h - 6) / 2);
        ctx.fill();
        ctx.strokeStyle = row.color;
        ctx.lineWidth = 0.9;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.font = `${tall ? 5.5 : 6}px ${ARCADE}`;
        ctx.fillStyle = row.color;
        ctx.fillText(row.tag, b.x + 3 + cw / 2, b.y + b.h / 2 + 2.2, cw - 8);
        // The stage's picture.
        let x = b.x + cw + 7;
        if (!tall && stage && row.map) {
            const tw = 40,
                th = b.h - 6;
            ctx.save();
            slanted(x, b.y + 3, tw, th, 4)(ctx);
            ctx.clip();
            stage(row.map, x - 4, b.y + 3, tw + 8, th);
            ctx.restore();
            ctx.strokeStyle = goldGradient(ctx, b.y, b.y + b.h);
            ctx.lineWidth = 0.8;
            slanted(x, b.y + 3, tw, th, 4)(ctx);
            ctx.stroke();
            x += tw + 7;
        }
        // Who flew, and the map and numbers under it.
        const right = b.x + b.w - 10;
        const resultW = tall ? 50 : 68,
            dateW = tall ? 0 : 30;
        ctx.textAlign = 'left';
        ctx.font = `800 ${tall ? 9 : 9}px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(row.title, x, b.y + b.h / 2 - 1, right - resultW - dateW - x);
        ctx.font = `italic 600 ${tall ? 7.5 : 7.5}px ${FONT}`;
        ctx.fillStyle = 'rgba(214,204,250,0.9)';
        ctx.fillText(row.detail, x, b.y + b.h / 2 + 9, right - resultW - dateW - x);
        // The result, laurelled when it's a win; the date at the end.
        const rx = right - dateW - resultW / 2;
        const win = row.result.startsWith('WIN');
        ctx.textAlign = 'center';
        ctx.font = `${tall ? 7 : 8}px ${ARCADE}`;
        ctx.fillStyle = win ? '#8ff07a' : row.resultColor;
        ctx.fillText(row.result, rx, b.y + b.h / 2 + 3);
        if (win) {
            const lw = ctx.measureText(row.result).width;
            laurel(ctx, rx - lw / 2 - 6, b.y + b.h / 2, 5, -1, '#8ff07a');
            laurel(ctx, rx + lw / 2 + 6, b.y + b.h / 2, 5, 1, '#8ff07a');
        }
        if (dateW) {
            ctx.textAlign = 'right';
            ctx.font = `5.5px ${ARCADE}`;
            ctx.fillStyle = row.local ? '#ffe27a' : '#ffd45c';
            ctx.fillText(row.local ? 'THIS DEVICE' : row.when, right, b.y + b.h / 2 + 2, dateW + 6);
        }
    }
}

/** A tab's little picture in `ink`, centred on (x, y): bars for the record (`i` 0), crossed swords for the history. */
function tabIcon(ctx: CanvasRenderingContext2D, i: number, x: number, y: number, ink: string): void {
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    if (i === 0) {
        ctx.fillRect(x - 4, y, 2, 4);
        ctx.fillRect(x - 1, y - 3, 2, 7);
        ctx.fillRect(x + 2, y - 1, 2, 5);
        return;
    }
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x - 4, y + 4);
    ctx.stroke();
}

/**
 * The painted player card filling `box` (in the units of the current transform): the card's picture, the player's
 * name on its plate, where progress is kept, and the Endless top three. Laid out in the card's own mockup pixels, so
 * it scales to any box; used by Profile and the match details in landscape once the Profile's pieces have loaded.
 */
export function drawPlayerCard(
    ctx: CanvasRenderingContext2D,
    card: PlayerCard,
    box: readonly number[],
    t: number,
): void {
    const [bx, by, bw, bh] = box;
    const [cx0, cy0, cw, ch] = MOCK.card;
    KIT.draw(ctx, 'card', bx, by, bw, bh);
    KIT.glint(ctx, 'card', bx, by, bw, bh, t, 0.5, 7);
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(bw / cw, bh / ch);
    ctx.translate(-cx0, -cy0);
    ctx.textAlign = 'center';
    ctx.font = `800 58px ${SANS}`;
    ctx.fillStyle = goldText(ctx, 862, 916);
    ctx.fillText(card.name, 560, 912, 560);
    ctx.font = `italic 600 34px ${FONT}`;
    ctx.fillStyle = '#efe6ff';
    ctx.fillText(
        card.synced ? 'Progress is saved on the game server.' : 'Progress is saved in this browser.',
        560,
        1003,
        700,
    );
    ctx.fillText('Sign in with Google: coming soon', 560, 1047, 700);
    const top = card.leaders.slice(0, 3);
    if (!top.length) {
        ctx.font = `italic 600 36px ${FONT}`;
        ctx.fillStyle = 'rgba(214,204,250,0.85)';
        ctx.fillText(card.synced ? 'No runs yet: set the first!' : 'Shown when the server is reached', 560, 1300, 700);
    }
    top.forEach((e, i) => {
        const y = 1262 + i * 67,
            mine = e.playerId === card.me;
        ctx.textAlign = 'left';
        ctx.font = `800 44px ${SANS}`;
        ctx.fillStyle = mine ? '#ffe27a' : '#ffffff';
        ctx.fillText(e.name, 240, y, 400);
        ctx.textAlign = 'right';
        ctx.fillText(clock(e.seconds), 718, y);
    });
    ctx.restore();
}

/** Whether the painted player card can be drawn (the Profile's pieces have loaded). */
export const playerCardReady = (): boolean => KIT.ready();

/** A gold gradient for lettering between y0 and y1, as on the painted name plate. */
function goldText(ctx: CanvasRenderingContext2D, y0: number, y1: number): CanvasGradient {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.55, '#ffd45c');
    g.addColorStop(1, '#f0a020');
    return g;
}

/** A sprig of laurel, `s` tall, curving out `dir` (−1 left, 1 right) from (x, y): a stem with leaves. */
function laurel(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: number, color = '#ffd45c'): void {
    // An arc round a centre on the far side, so the sprig cups the text it frames.
    const cx = x - dir * s,
        a0 = dir < 0 ? Math.PI * 0.6 : -Math.PI * 0.4,
        a1 = dir < 0 ? Math.PI * 1.4 : Math.PI * 0.4;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx + dir * 2 * s, y, s, a0, a1);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / 3;
        const lx = cx + dir * 2 * s + Math.cos(a) * s,
            ly = y + Math.sin(a) * s;
        ctx.beginPath();
        ctx.ellipse(lx, ly, 1.6, 0.8, a + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** A record tile's little picture, centred on (x, y) at size `s`: a trophy, a chain, a flame, a crown, wings or a clock. */
function recordIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, s: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 6, s / 6);
    ctx.fillStyle = '#ffd45c';
    ctx.strokeStyle = '#ffd45c';
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'trophy') {
        ctx.moveTo(-4, -5);
        ctx.lineTo(4, -5);
        ctx.quadraticCurveTo(4, 1, 0, 2);
        ctx.quadraticCurveTo(-4, 1, -4, -5);
        ctx.fill();
        ctx.fillRect(-1, 2, 2, 2.5);
        ctx.fillRect(-3, 4.5, 6, 1.5);
    } else if (kind === 'chain') {
        ctx.ellipse(-2, 1.5, 3, 2, -0.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(2, -1.5, 3, 2, -0.8, 0, Math.PI * 2);
        ctx.stroke();
    } else if (kind === 'flame') {
        ctx.fillStyle = '#ff9a2e';
        ctx.moveTo(0, -6);
        ctx.quadraticCurveTo(5, -1, 3, 4);
        ctx.quadraticCurveTo(0, 7, -3, 4);
        ctx.quadraticCurveTo(-5, -1, 0, -6);
        ctx.fill();
    } else if (kind === 'crown') {
        ctx.moveTo(-5, 3);
        ctx.lineTo(-5, -3);
        ctx.lineTo(-2.5, 0);
        ctx.lineTo(0, -4);
        ctx.lineTo(2.5, 0);
        ctx.lineTo(5, -3);
        ctx.lineTo(5, 3);
        ctx.closePath();
        ctx.fill();
    } else if (kind === 'wings') {
        ctx.fillStyle = '#e8a8ff';
        ctx.ellipse(-3, -1.5, 3, 2.2, -0.5, 0, Math.PI * 2);
        ctx.ellipse(3, -1.5, 3, 2.2, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-2, 2.5, 2, 1.5, 0.4, 0, Math.PI * 2);
        ctx.ellipse(2, 2.5, 2, 1.5, -0.4, 0, Math.PI * 2);
        ctx.fill();
    } else {
        ctx.arc(0, 0.5, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 0.5);
        ctx.lineTo(0, -2.5);
        ctx.moveTo(0, 0.5);
        ctx.lineTo(2, 1.5);
        ctx.moveTo(-1.5, -5.5);
        ctx.lineTo(1.5, -5.5);
        ctx.stroke();
    }
    ctx.restore();
}

/** A fairy in a round gold-edged medal: her portrait's face if she has one and it's loaded, else her in-game look. */
export function drawMedal(ctx: CanvasRenderingContext2D, fy: Fairy, x: number, y: number, r: number, t: number): void {
    ctx.save();
    ctx.shadowColor = fy.color;
    ctx.shadowBlur = 12 + 4 * Math.sin(t * 3);
    ctx.fillStyle = shade(fy.color, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    const p = fy.portrait;
    if (p && p.img.complete && p.img.naturalWidth) {
        const [fx, fyy, fr] = p.face;
        ctx.drawImage(p.img, fx - fr, fyy - fr, fr * 2, fr * 2, x - r, y - r, r * 2, r * 2);
    } else drawFairy(ctx, fy, x, y + r * 0.09, 2.4 * (r / 44), t);
    ctx.restore();
    ctx.strokeStyle = '#ffd45c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
}
