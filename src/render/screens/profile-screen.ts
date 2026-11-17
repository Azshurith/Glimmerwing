// The Profile screen: who's playing (a guest, until sign-in exists), the Endless top three, and two tabs: their record
// and unlocks, and their match history (each game opens in full on the match details screen, match-screen.ts).
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { mapById } from '@/data/maps';
import { STAGES } from '@/data/stages';
import { clock } from '@/render/hud';
import { drawTrophy } from '@/render/icons';
import type { Fairy, HistoryRow, Layout, ProfileView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A box, in design or view units. */
interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The two tabs' labels, in order. */
const TABS = ['RECORD', 'MATCH HISTORY'] as const;

/** Rows of the match history in view at once in each layout; the list scrolls with the cursor. */
export const HISTORY_ROWS = { wide: 8, tall: 6 } as const;

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
    const x = 224 - bleed,
        w = C.VIEW_W + 2 * bleed - 238,
        top = 64;
    return {
        tabs: [0, 1].map(i => ({ x: x + i * 104, y: 44, w: i ? 112 : 98, h: 15 })),
        rows: Array.from({ length: HISTORY_ROWS.wide }, (_, i) => ({ x, y: top + i * 30, w, h: 26 })),
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
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: ProfileView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        const tall = layout === 'tall';
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H,
            dy = 0;
        if (tall) {
            const f = tallMenuFit(h);
            this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            W = C.TALL_W;
            H = f.h;
            dy = tallShift(f.h);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
        }
        drawTopBar(ctx, 'PROFILE', W, bleed, tall, 16);

        ctx.translate(0, dy);
        // Player card: an avatar (Stella's face for now), the name, and the sign-in status.
        // On a widened landscape screen the player card keeps to the left edge and the record fills the rest.
        // In landscape the card is a framed panel right against the left edge, the same 14 in as the record's right edge.
        const card = { x: 14 - bleed, y: 46, w: 196, h: 228 };
        const cx = tall ? W / 2 : card.x + card.w / 2,
            cy = tall ? 92 : 104;
        const regionX = tall ? 0 : card.x + card.w + 14,
            regionW = tall ? W : W + bleed - 14 - regionX;
        if (!tall) this.panel(card.x, card.y, card.w, card.h);
        this.avatar(cx, cy, tall ? 40 : 44, t);
        ctx.textAlign = 'center';
        const name = v.name.toUpperCase();
        // A long guest name gets smaller so it stays inside the card.
        const nameSize = Math.min(18, Math.floor(172 / Math.max(1, name.length)));
        arcadeText(ctx, name, cx, cy + (tall ? 64 : 70), nameSize, ['#ffffff', '#fff0c8', '#ffd27a'], 'center');
        ctx.font = `italic 600 9px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        ctx.fillText(
            v.synced ? 'Progress is saved on the game server' : 'Progress is saved in this browser',
            cx,
            cy + (tall ? 80 : 86),
        );
        ctx.fillText('Sign in with Google: coming soon', cx, cy + (tall ? 92 : 98));
        // In landscape the card also holds the Endless leaderboard's top three.
        if (!tall) this.leaders(v, card.x + 12, cy + 118, card.w - 24);

        const lay = designLayout(layout, 0, bleed);
        this.tabs(v, lay.tabs, tall ? '#8fd8ff' : '#8fd8ff');
        if (v.tab === 'history') this.history(v, lay.rows, t, tall);
        else this.record(v, t, tall, W, regionX, regionW, lay.top);
        ctx.translate(0, -dy);

        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint =
            v.tab === 'history'
                ? v.touch
                    ? 'TAP A GAME FOR ITS DETAILS  ·  ◀ BACK'
                    : '◀ ▶ TABS  ·  ▲ ▼ CHOOSE  ·  ENTER DETAILS  ·  ESC BACK'
                : v.touch
                  ? 'TAP MATCH HISTORY FOR YOUR GAMES  ·  ◀ BACK'
                  : '◀ ▶ TABS  ·  ESC BACK';
        ctx.fillText(hint, W / 2, tall ? H - 14 : H - 8, W - 16);
        ctx.restore();
    }

    /** The Record tab: the record as tiles, then the fairies, unlocked in colour and locked as a ?. */
    private record(
        v: ProfileView,
        t: number,
        tall: boolean,
        W: number,
        regionX: number,
        regionW: number,
        top: number,
    ): void {
        const ctx = this.ctx;
        // Record, as tiles.
        const unlocked = v.locked.filter(l => !l).length;
        const tiles: [string, string][] = [
            ['WINS', String(v.wins)],
            ['BEST CHAIN', String(v.bestChain)],
            ['FEVERS', String(v.fevers)],
            ['FLAWLESS WINS', String(v.flawless)],
            ['FAIRIES', `${unlocked}/${FAIRIES.length}`],
            ['TROPHIES', String(v.trophies)],
            ['ENDLESS BEST', clock(v.endlessBest)],
        ];
        // The next stage on the trophy road, if any is still locked.
        const nextStage = STAGES.find(st => st.trophies > v.bestTrophies);
        // Two tiles to a row on a phone or a narrow screen; three once the record has room.
        const cols = tall || regionW < 3 * 104 + 16 ? 2 : 3;
        const tw = tall ? 112 : Math.min(190, (regionW - (cols - 1) * 8) / cols),
            th = tall ? 38 : cols === 3 ? 44 : 34,
            gap = tall || cols === 3 ? 8 : 6,
            x0 = tall ? (W - 2 * tw - 8) / 2 : regionX,
            y0 = top;
        tiles.forEach(([label, value], i) => {
            const x = x0 + (i % cols) * (tw + 8),
                y = y0 + Math.floor(i / cols) * (th + gap);
            ctx.fillStyle = 'rgba(20,12,48,0.85)';
            ctx.fillRect(x, y, tw, th);
            ctx.strokeStyle = 'rgba(201,162,74,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
            ctx.textAlign = 'left';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(label, x + 8, y + 12);
            arcadeText(ctx, value, x + 8, y + th - 7, th < 38 ? 14 : 16, ['#ffffff', '#ffe08a', '#ff9a2e'], 'left');
            if (label === 'ENDLESS BEST' && v.rank) {
                ctx.textAlign = 'right';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = '#ffe27a';
                ctx.fillText(`#${v.rank.rank} OF ${v.rank.players}`, x + tw - 6, y + th - 8);
            }
            if (label === 'TROPHIES') {
                drawTrophy(ctx, x + tw - 12, y + 10, 9);
                ctx.textAlign = 'right';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = nextStage ? '#ffe27a' : '#cbbcf5';
                const name = nextStage ? (mapById(nextStage.mapId)?.name ?? '').toUpperCase() : '';
                ctx.fillText(nextStage ? `${name} AT ${nextStage.trophies}` : 'ALL STAGES', x + tw - 6, y + th - 8);
            }
        });

        // The roster: unlocked fairies in colour, locked ones as a ? with how to get them.
        const rows = Math.ceil(tiles.length / cols);
        const ry = y0 + rows * (th + gap) + (tall ? 34 : 36),
            rx0 = tall ? 20 : regionX,
            rowW = tall ? W - 40 : regionW;
        // The whole roster fits the row: wider apart on a wide screen, closer and smaller once it's long.
        const rgap = Math.min(tall ? 38 : 64, (rowW - 30) / Math.max(1, FAIRIES.length - 1)),
            rr = Math.min(15, rgap / 2 - 2);
        ctx.textAlign = 'left';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('FAIRIES', rx0, ry - 22);
        FAIRIES.forEach((fy, i) => {
            const x = rx0 + 14 + i * rgap,
                locked = v.locked[i];
            const g = ctx.createRadialGradient(x, ry - 4, 2, x, ry, rr);
            g.addColorStop(0, locked ? '#3a3360' : fy.color);
            g.addColorStop(1, locked ? '#141030' : shade(fy.color, 0.3));
            ctx.save();
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, ry, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.clip();
            if (locked) {
                ctx.font = `12px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.textAlign = 'center';
                ctx.fillText('?', x, ry + 4);
            } else drawFairy(ctx, fy, x, ry + 2, 0.75 * (rr / 15), t);
            ctx.restore();
            ctx.strokeStyle = locked ? '#5a4f7a' : '#a8894a';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(x, ry, rr, 0, Math.PI * 2);
            ctx.stroke();
        });
        const next = FAIRIES.find((_, i) => v.locked[i]);
        ctx.textAlign = 'left';
        ctx.font = `italic 600 9px ${FONT}`;
        ctx.fillStyle = next ? '#ffe27a' : 'rgba(203,188,245,0.85)';
        ctx.fillText(
            next ? `Next: ${next.unlock?.hint ?? ''} to unlock ${next.name}` : 'Every fairy is unlocked!',
            rx0,
            ry + 30,
            tall ? W - 40 : regionW,
        );
    }

    /** The two tabs, the one showing lit. */
    private tabs(v: ProfileView, boxes: Box[], color: string): void {
        const ctx = this.ctx;
        boxes.forEach((b, i) => {
            const on = (i === 1) === (v.tab === 'history');
            ctx.fillStyle = on ? color : 'rgba(20,12,48,0.85)';
            slanted(b.x, b.y, b.w, b.h, 4)(ctx);
            ctx.fill();
            ctx.strokeStyle = on ? '#ffffff' : 'rgba(201,162,74,0.6)';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = on ? '#140a26' : '#cbbcf5';
            ctx.fillText(TABS[i], b.x + b.w / 2, b.y + b.h / 2 + 3.5, b.w - 10);
        });
    }

    /** The Match History tab: one row per game, newest first, the chosen one lit. */
    private history(v: ProfileView, boxes: Box[], t: number, tall: boolean): void {
        const ctx = this.ctx;
        if (v.message) {
            const b = boxes[0];
            ctx.textAlign = 'center';
            ctx.font = `italic 600 10px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.9)';
            v.message.split('\n').forEach((l, i) => ctx.fillText(l, b.x + b.w / 2, b.y + 30 + i * 14, b.w - 10));
        }
        const shown = v.history.slice(v.start, v.start + boxes.length);
        shown.forEach((row, k) => this.row(row, boxes[k], v.start + k === v.index, t, tall));
        ctx.fillStyle = 'rgba(255,226,122,0.8)';
        ctx.font = `7px ${ARCADE}`;
        ctx.textAlign = 'right';
        const first = boxes[0],
            last = boxes[boxes.length - 1];
        if (v.start > 0) ctx.fillText('▲', first.x + first.w, first.y - 2);
        if (v.start + boxes.length < v.history.length) ctx.fillText('▼', last.x + last.w, last.y + last.h + 8);
    }

    /** One game in the history: its mode's tag, who flew, the result, the map and length, and when. */
    private row(row: HistoryRow, b: Box, on: boolean, t: number, tall: boolean): void {
        const ctx = this.ctx;
        ctx.save();
        if (on) {
            ctx.shadowColor = row.color;
            ctx.shadowBlur = 10 + 3 * Math.sin(t * 6);
        }
        ctx.fillStyle = on ? 'rgba(52,32,104,0.95)' : 'rgba(20,12,48,0.85)';
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.restore();
        ctx.strokeStyle = on ? row.color : 'rgba(201,162,74,0.5)';
        ctx.lineWidth = on ? 1.5 : 1;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
        const tagW = tall ? 62 : 54,
            tagH = tall ? 13 : 11;
        ctx.fillStyle = row.color;
        slanted(b.x + 5, b.y + 4, tagW, tagH, 3)(ctx);
        ctx.fill();
        ctx.font = `${tall ? 6 : 5.5}px ${ARCADE}`;
        ctx.fillStyle = '#140a26';
        ctx.textAlign = 'center';
        ctx.fillText(row.tag, b.x + 5 + tagW / 2, b.y + 4 + tagH / 2 + 3, tagW - 8);
        // The result, on the right of the first line.
        ctx.textAlign = 'right';
        ctx.font = `${tall ? 8 : 7}px ${ARCADE}`;
        ctx.fillStyle = row.resultColor;
        const right = b.x + b.w - 8;
        ctx.fillText(row.result, right, b.y + (tall ? 15 : 13));
        const resultW = ctx.measureText(row.result).width;
        ctx.textAlign = 'left';
        ctx.font = `600 ${tall ? 10 : 9}px ${FONT}`;
        ctx.fillStyle = on ? '#fff7c2' : '#f2ecff';
        const tx = b.x + tagW + 11;
        ctx.fillText(row.title, tx, b.y + (tall ? 15 : 13), right - resultW - 8 - tx);
        // The second line: the map, length and trophies, and when.
        ctx.font = `italic 600 ${tall ? 8.5 : 8}px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        const ly = b.y + (tall ? 32 : 23);
        ctx.fillText(row.detail, tall ? b.x + 8 : tx, ly, b.w - 90);
        ctx.textAlign = 'right';
        ctx.font = `${tall ? 6 : 5.5}px ${ARCADE}`;
        ctx.fillStyle = row.local ? '#ffe27a' : 'rgba(203,188,245,0.8)';
        ctx.fillText(row.local ? 'THIS DEVICE' : row.when, right, ly);
    }

    /** The Endless leaderboard's top three, in a column `w` wide from (x, y); the player's own line in gold. */
    private leaders(v: ProfileView, x: number, y: number, w: number): void {
        const ctx = this.ctx;
        ctx.textAlign = 'left';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('ENDLESS TOP 3', x, y);
        ctx.strokeStyle = 'rgba(201,162,74,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + 4.5);
        ctx.lineTo(x + w, y + 4.5);
        ctx.stroke();
        const top = v.leaders.slice(0, 3);
        if (!top.length) {
            ctx.font = `italic 600 9px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.7)';
            ctx.fillText(v.synced ? 'No runs yet: set the first!' : 'Shown when the server is reached', x, y + 18);
            return;
        }
        top.forEach((e, i) => {
            const ly = y + 17 + i * 13,
                mine = e.playerId === v.me;
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = mine ? '#ffe27a' : i === 0 ? '#ffd27a' : '#e8e0ff';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}`, x, ly);
            ctx.font = `600 9px ${FONT}`;
            ctx.fillText(e.name, x + 12, ly, w - 60);
            ctx.textAlign = 'right';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillText(clock(e.seconds), x + w, ly);
        });
    }

    /** The player card's frame in landscape: a dark panel with a gold edge, like the record's tiles. */
    private panel(x: number, y: number, w: number, h: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, 'rgba(40,26,88,0.85)');
        g.addColorStop(1, 'rgba(16,10,40,0.85)');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    /** A round avatar: Stella's portrait face if it's loaded, else her in-game look. */
    private avatar(x: number, y: number, r: number, t: number): void {
        drawMedal(this.ctx, FAIRIES[0], x, y, r, t);
    }
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
