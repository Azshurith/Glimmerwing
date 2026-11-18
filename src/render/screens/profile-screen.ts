// The Profile screen: who's playing (a guest, until sign-in exists), the Endless top three, and two tabs: their record
// and unlocks, and their match history (each game opens in full on the match details screen, match-screen.ts).
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { mapById } from '@/data/maps';
import { STAGES } from '@/data/stages';
import { clock } from '@/render/hud';
import type { Fairy, HistoryRow, Layout, ProfileView } from '@/types';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted } from '@/render/draw';
import { ARCADE, FONT, SANS } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import { kitCorners, kitDivider, kitPanel, kitPill, kitReady, kitTab } from './kit-ui';
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
