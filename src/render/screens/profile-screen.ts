// The Profile screen: who's playing (a guest, until sign-in exists), the Endless top three, and two tabs: their record
// and unlocks, and their match history (each game opens in full on the match details screen, match-screen.ts).
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { mapById } from '@/data/maps';
import { STAGES } from '@/data/stages';
import { clock } from '@/render/hud';
import type { Fairy, HistoryRow, Layout, PlayerCard, ProfileView } from '@/types';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted, sparkle } from '@/render/draw';
import { ARCADE, FONT, SANS } from '@/render/theme';
import { tallMenuFit } from './menu-fit';
import { enter } from '@/render/transition';
import { roundRect } from './emblems';
import { PieceAtlas } from './kit';
import { frameCrest, glassPanel, goldRoundFrame, namePlaque } from './roster-screen';
import { kitCorners, kitDivider, kitPanel, kitPill, kitReady, kitTab, mockBox } from './kit-ui';
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
    title: [1146, 2, 1194, 217],
    card: [134, 90, 876, 1384],
    // The tabs' pills, the same on both tabs (only which is gold changes), and their tap boxes.
    tabs: [
        [1075, 230, 605, 140],
        [1690, 230, 772, 140],
    ],
    // The history fills the record's area: from the first tiles' top to the fairies' foot, as wide as the tiles
    // (less the scroll bar); a row is laid out 2263 wide and spread to its width by `rw / ROW_W`.
    row: [1062, 398, 2380, 142],
    pitch: 143.2,
} as const;

/** A tab's Record icon: three rising bars, `w` wide, left edge at `x`, centred on `cy`, in `ink`. */
function tabBars(ctx: CanvasRenderingContext2D, x: number, cy: number, w: number, ink: string, on: boolean): void {
    const bw = w * 0.26,
        gap = (w - 3 * bw) / 2,
        base = cy + w * 0.42;
    [0.55, 0.95, 0.72].forEach((k, i) => {
        const h = w * k,
            bx = x + i * (bw + gap);
        if (!on) {
            const g = ctx.createLinearGradient(0, base - h, 0, base);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(1, '#e6b8d8');
            ctx.fillStyle = g;
        } else ctx.fillStyle = ink;
        roundRect(ctx, bx, base - h, bw, h, 4);
        ctx.fill();
    });
}

/** A tab's Match History icon: two crossed swords, `w` across, centred on (cx, cy), in `ink`. */
function tabSwords(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, ink: string, on: boolean): void {
    for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(dir * Math.PI * 0.25);
        const L = w * 0.62;
        ctx.fillStyle = on ? ink : '#f2e2ff';
        // The blade, pointed at the top.
        ctx.beginPath();
        ctx.moveTo(0, -L);
        ctx.lineTo(w * 0.07, -L * 0.78);
        ctx.lineTo(w * 0.07, L * 0.38);
        ctx.lineTo(-w * 0.07, L * 0.38);
        ctx.lineTo(-w * 0.07, -L * 0.78);
        ctx.closePath();
        ctx.fill();
        // The guard and the grip.
        ctx.fillStyle = on ? ink : '#d9a8ff';
        roundRect(ctx, -w * 0.2, L * 0.36, w * 0.4, w * 0.09, w * 0.04);
        ctx.fill();
        roundRect(ctx, -w * 0.05, L * 0.42, w * 0.1, w * 0.24, w * 0.04);
        ctx.fill();
        ctx.restore();
    }
}

/** How wide the history's row pieces were cut, in the mockup's pixels. */
const ROW_W = 2263;

/** Where the main area (tabs, record and history) starts, in the mockup's pixels. */
const MAIN_L = 1062;

/**
 * Where landscape Profile's parts sit in a view widened by `bleed`, all at one scale so it fills the screen: the
 * player card against the left edge and the main area (`main`, in the mockup's pixels) running from beside it to
 * the right edge, which is at `R` in its pixels.
 */
interface ProfileFits {
    card: MockFit;
    main: MockFit;
    R: number;
}

/** Profile's parts fitted to a view widened by `bleed`, the card left and the main area reaching the right edge. */
function profileFits(bleed: number): ProfileFits {
    const x0 = -bleed + 4,
        x1 = C.VIEW_W + bleed - 4,
        y0 = 2,
        y1 = C.VIEW_H - 18;
    const [cx, cy, cw, ch] = MOCK.card;
    const gap = 40,
        minMain = 2400;
    const s = Math.min((y1 - y0) / 1480, (x1 - x0) / (cw + gap + minMain));
    /** A fit drawing the mockup's point (mx, my) at the view's (vx, vy). */
    const at = (mx: number, my: number, vx: number, vy: number): MockFit => ({ s, x: vx - mx * s, y: vy - my * s });
    const band = (y0 + y1) / 2;
    // The card starts under the page's Back button (its crest reaches up to `crestTop` in its pixels), shrinking a
    // little if it has to.
    const crestTop = cy - 52,
        cardS = Math.min(s, (y1 - BACK_CLEAR) / (cy + ch - crestTop));
    const mainX = x0 + cw * cardS + gap * s;
    return {
        card: { s: cardS, x: x0 - cx * cardS, y: BACK_CLEAR - crestTop * cardS },
        main: at(MAIN_L, 740, mainX, band),
        R: MAIN_L + (x1 - mainX) / s - 6,
    };
}

/** How far down the view the player card's crest must start, clear of the page's Back button. */
const BACK_CLEAR = 30;

/** Where the history's rows sit across the main area that ends at `R`: their left, width and the scroll bar's x. */
function rowSpan(R: number): { x: number; w: number; scroll: number } {
    return { x: MAIN_L, w: R - MAIN_L - 70, scroll: R - 44 };
}

/** Whether landscape Profile is drawn from its painted pieces (once they've loaded). */
const painted = () => KIT.ready() && kitReady();

/** How wide the player card is in landscape. */
const CARD_W = 150;

/** Paints a map's scenery over a rectangle, in the current transform. */
type StagePainter = (map: string, x: number, y: number, w: number, h: number) => void;

/** The two tabs' labels, in order. */
const TABS = ['RECORD', 'MATCH HISTORY'] as const;

/** Rows of the match history in view at once in each layout; the list scrolls with the cursor, wheel or bar. */
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
export function profileBoxes(
    layout: Layout,
    h: number = C.TALL_H,
    bleed = 0,
): { tabs: Box[]; rows: Box[]; scroll: Box } {
    if (layout !== 'tall' && painted()) {
        const { main: f, R } = profileFits(bleed);
        const [, ry, , rh] = MOCK.row,
            span = rowSpan(R);
        return {
            tabs: MOCK.tabs.map(([x, y, w, hh]) => mockBox(f, x, y, w, hh)),
            rows: Array.from({ length: HISTORY_ROWS.wide }, (_, i) =>
                mockBox(f, span.x, ry + i * MOCK.pitch, span.w, rh),
            ),
            scroll: mockBox(f, span.scroll, ry + 5, 44, HISTORY_ROWS.wide * MOCK.pitch - 10),
        };
    }
    /** The thin scroll bar drawn just right of the rows. */
    const bar = (rows: Box[]): Box => {
        const first = rows[0],
            last = rows[rows.length - 1];
        return { x: first.x + first.w + 4, y: first.y, w: 3, h: last.y + last.h - first.y };
    };
    if (layout !== 'tall') {
        const d = designLayout(layout, 0, bleed);
        return { tabs: d.tabs, rows: d.rows, scroll: bar(d.rows) };
    }
    const f = tallMenuFit(h);
    const d = designLayout(layout, tallShift(f.h), f.bleed);
    const view = (b: Box) => ({ x: f.x + b.x * f.s, y: b.y * f.s, w: b.w * f.s, h: b.h * f.s });
    const rows = d.rows.map(view);
    return { tabs: d.tabs.map(view), rows, scroll: bar(rows) };
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

    /**
     * Landscape Profile, filling the screen: the player card against the left edge and the main area out to the right,
     * all drawn in code but for the winged heading.
     */
    private drawPainted(v: ProfileView, t: number, bleed: number, stage?: StagePainter): void {
        const ctx = this.ctx;
        const W = C.VIEW_W,
            H = C.VIEW_H;
        const { card, main, R } = profileFits(bleed);
        /** Runs `draw` in the mockup's pixels under `f`. */
        const inFit = (f: MockFit, draw: () => void) => {
            ctx.save();
            ctx.translate(f.x, f.y);
            ctx.scale(f.s, f.s);
            draw();
            ctx.restore();
        };
        ctx.save();
        enter(ctx, 'bg', () => ornateScreen(ctx, t, W, H, bleed, '', false));
        enter(ctx, 'bar', () =>
            inFit(main, () => {
                const [, ty, tw, th] = MOCK.title,
                    tx = (W / 2 - main.x) / main.s - tw / 2;
                KIT.draw(ctx, 'title', tx, ty, tw, th);
                KIT.glint(ctx, 'title', tx, ty, tw, th, t, 0, 7);
            }),
        );
        enter(ctx, 'panels', () => inFit(card, () => drawPlayerCard(ctx, v, MOCK.card, t)), { dx: -22 });
        enter(ctx, 'buttons', () =>
            inFit(main, () => {
                this.paintedTab(MOCK.tabs[0], 'RECORD', 'record', v.tab !== 'history', t);
                this.paintedTab(MOCK.tabs[1], 'MATCH HISTORY', 'history', v.tab === 'history', t);
            }),
        );
        enter(ctx, 'panels', () =>
            inFit(main, () =>
                v.tab === 'history' ? this.paintedHistory(v, t, R, stage) : this.paintedRecord(v, t, R),
            ),
        );
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

    /**
     * The Record tab across the main area out to `R`: three rows of tiles (each a glass panel with its icon in an orb,
     * its name and its number), the last row the Endless best (with its rank) and where the trophy road goes next,
     * then the fairies in a framed panel, each in a gold ring.
     */
    private paintedRecord(v: ProfileView, t: number, R: number): void {
        const ctx = this.ctx;
        const unlocked = v.locked.filter(l => !l).length;
        const g = 22,
            colW = (R - MAIN_L - 2 * g) / 3,
            col = (i: number) => MAIN_L + i * (colW + g);
        const nextStage = STAGES.find(st => st.trophies > v.bestTrophies);
        const road = nextStage ? (mapById(nextStage.mapId)?.name ?? '').toUpperCase() : 'ALL OPEN';
        const tiles: [string, string, string, number, number, number][] = [
            ['trophy', 'WINS', String(v.wins), col(0), 398, colW],
            ['chain', 'BEST CHAIN', String(v.bestChain), col(1), 398, colW],
            ['flame', 'FEVERS', String(v.fevers), col(2), 398, colW],
            ['crown', 'FLAWLESS WINS', String(v.flawless), col(0), 602, colW],
            ['wings', 'FAIRIES', `${unlocked}/${FAIRIES.length}`, col(1), 602, colW],
            ['cup', 'TROPHIES', String(v.trophies), col(2), 602, colW],
            ['clock', 'ENDLESS BEST', clock(v.endlessBest), col(0), 806, colW * 2 + g],
            ['flag', nextStage ? 'NEXT STAGE' : 'TROPHY ROAD', road, col(2), 806, colW],
        ];
        const gold: [string, string, string] = ['#fff7c2', '#ffd45c', '#ff9a2e'];
        tiles.forEach(([kind, label, value, x, y, w]) => {
            const h = 180;
            glassPanel(ctx, x, y, w, h, 40);
            tileIcon(ctx, kind, x + 98, y + h / 2, 66, t);
            ctx.textAlign = 'left';
            ctx.font = `800 44px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, x + 192, y + 70, w - 220);
            const small = kind === 'flag';
            arcadeText(ctx, value, x + 192, y + 150, small ? 64 : 88, gold, 'left', w - 230);
            if (kind === 'flag' && nextStage) {
                ctx.textAlign = 'right';
                ctx.font = `800 36px ${SANS}`;
                ctx.fillStyle = '#e2ccff';
                ctx.fillText(`AT ${nextStage.trophies}`, x + w - 34, y + 70);
            }
            if (kind === 'clock' && v.rank)
                capsule(ctx, `#${v.rank.rank} OF ${v.rank.players}`, x + w - 340, y + 50, 300, 80);
        });
        // The fairies: a heading tag on a gold rule, what unlocks the next, and a framed panel with a ring each.
        const py = 1000,
            pw = R - MAIN_L;
        const tag = () => pointed(ctx, MAIN_L + 6, py, 400, 86, 30);
        ctx.fillStyle = '#2a1458';
        tag();
        ctx.fill();
        ctx.strokeStyle = goldGradient(ctx, py, py + 86);
        ctx.lineWidth = 5;
        tag();
        ctx.stroke();
        tileIcon(ctx, 'wings', MAIN_L + 90, py + 43, 0, t);
        arcadeText(ctx, 'FAIRIES', MAIN_L + 150, py + 64, 50, ['#fff7d8', '#ffd98a', '#e0a040'], 'left', 230);
        const next = FAIRIES.find((_, i) => v.locked[i]);
        ctx.textAlign = 'right';
        ctx.font = `italic 700 38px ${FONT}`;
        ctx.fillStyle = next ? '#ffe27a' : '#f0e8ff';
        ctx.fillText(
            next ? `Next: ${next.unlock?.hint ?? ''} to unlock ${next.name}` : '✦ Every fairy is unlocked! ✦',
            R - 30,
            py + 56,
            pw - 500,
        );
        const by = py + 104,
            bh = 290;
        glassPanel(ctx, MAIN_L, by, pw, bh, 56);
        const n = FAIRIES.length,
            step = (pw - 60) / n,
            r = Math.min(104, step * 0.38),
            y = by + bh / 2;
        FAIRIES.forEach((fy, i) => {
            const x = MAIN_L + 30 + step * (i + 0.5),
                locked = v.locked[i];
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            const bg = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
            bg.addColorStop(0, locked ? '#3a3360' : fy.color);
            bg.addColorStop(1, locked ? '#141030' : shade(fy.color, 0.3));
            ctx.fillStyle = bg;
            ctx.fill();
            ctx.clip();
            const p = fy.portrait;
            if (locked) {
                ctx.textAlign = 'center';
                ctx.font = `${r * 0.9}px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.fillText('?', x, y + r * 0.32);
            } else if (p && p.img.complete && p.img.naturalWidth) {
                const [fx, fyy, fr] = p.face;
                ctx.drawImage(p.img, fx - fr, fyy - fr, fr * 2, fr * 2, x - r, y - r, r * 2, r * 2);
            } else drawFairy(ctx, fy, x, y + r * 0.14, 5.2 * (r / 100), t);
            ctx.restore();
            ctx.strokeStyle = '#1a0a10';
            ctx.lineWidth = 18;
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.strokeStyle = locked ? 'rgba(201,162,74,0.55)' : goldGradient(ctx, y - r, y + r);
            ctx.lineWidth = locked ? 6 : 11;
            ctx.stroke();
        });
    }

    /**
     * One of the two tabs, drawn in code as a vector capsule so both tabs are the very same shape and only their
     * colours change: a dark outline, a gold rim, a glossy fill (gold when it's the tab showing, deep violet
     * otherwise) with a highlight across its top, then its icon and label.
     */
    private paintedTab(b: readonly number[], label: string, icon: 'record' | 'history', on: boolean, t: number): void {
        const ctx = this.ctx,
            [x, y, w, h] = b,
            r = h / 2;
        // A soft glow under the chosen tab.
        if (on) {
            ctx.save();
            ctx.shadowColor = 'rgba(255,190,60,0.55)';
            ctx.shadowBlur = 40 + 8 * Math.sin(t * 3);
            ctx.fillStyle = 'rgba(255,190,60,0.3)';
            roundRect(ctx, x, y, w, h, r);
            ctx.fill();
            ctx.restore();
        }
        // Outline, then the gold rim.
        ctx.fillStyle = '#1a0a10';
        roundRect(ctx, x - 6, y - 6, w + 12, h + 12, r + 6);
        ctx.fill();
        const rim = ctx.createLinearGradient(0, y, 0, y + h);
        rim.addColorStop(0, '#fff3b0');
        rim.addColorStop(0.45, '#f2b53a');
        rim.addColorStop(1, '#b8640c');
        ctx.fillStyle = rim;
        roundRect(ctx, x, y, w, h, r);
        ctx.fill();
        // The fill, inset inside the rim.
        const i = on ? 7 : 8,
            fill = ctx.createLinearGradient(0, y + i, 0, y + h - i);
        if (on) {
            fill.addColorStop(0, '#fff7b8');
            fill.addColorStop(0.42, '#ffd23e');
            fill.addColorStop(0.58, '#f9b912');
            fill.addColorStop(1, '#f6a40a');
        } else {
            fill.addColorStop(0, '#4a2486');
            fill.addColorStop(0.5, '#25103f');
            fill.addColorStop(1, '#341762');
        }
        ctx.fillStyle = fill;
        roundRect(ctx, x + i, y + i, w - 2 * i, h - 2 * i, r - i);
        ctx.fill();
        // The highlight across the top, and on violet a pink sheen along the inner edge.
        ctx.save();
        roundRect(ctx, x + i, y + i, w - 2 * i, h - 2 * i, r - i);
        ctx.clip();
        const hl = ctx.createLinearGradient(0, y + i, 0, y + h * 0.5);
        hl.addColorStop(0, on ? 'rgba(255,255,255,0.75)' : 'rgba(255,190,255,0.45)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        roundRect(ctx, x + i + r * 0.35, y + i + 4, w - 2 * i - r * 0.7, h * 0.32, h * 0.16);
        ctx.fill();
        if (!on) {
            ctx.strokeStyle = 'rgba(255,170,255,0.55)';
            ctx.lineWidth = 3;
            roundRect(ctx, x + i + 3, y + i + 3, w - 2 * i - 6, h - 2 * i - 6, r - i - 3);
            ctx.stroke();
        }
        ctx.restore();
        // Icon and label, centred together.
        const size = 60,
            iconW = 78,
            gap = 26;
        ctx.font = `900 ${size}px ${SANS}`;
        const tw = Math.min(ctx.measureText(label).width, w - iconW - gap - 120),
            x0 = x + (w - iconW - gap - tw) / 2,
            cy = y + h / 2;
        const ink = on ? '#2a0f04' : '#ffffff';
        if (icon === 'record') tabBars(ctx, x0, cy, iconW, ink, on);
        else tabSwords(ctx, x0 + iconW / 2, cy, iconW, ink, on);
        ctx.textAlign = 'left';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8;
        ctx.strokeStyle = on ? 'rgba(255,248,214,0.85)' : 'rgba(20,6,40,0.9)';
        ctx.strokeText(label, x0 + iconW + gap, cy + size * 0.36, tw);
        ctx.fillStyle = ink;
        ctx.fillText(label, x0 + iconW + gap, cy + size * 0.36, tw);
    }

    /** The painted Match History tab: a row per game, newest first, the chosen one glowing, and a scroll bar. */
    private paintedHistory(v: ProfileView, t: number, R: number, stage?: StagePainter): void {
        const ctx = this.ctx;
        const [, ry, , rh] = MOCK.row,
            span = rowSpan(R),
            rx = span.x,
            rw = span.w;
        /** Where a point `d` across a row piece (as cut, 2263 wide) lands on the wider row. */
        const at = (d: number) => rx + (d * rw) / ROW_W;
        if (v.message) {
            ctx.textAlign = 'center';
            ctx.font = `italic 600 48px ${FONT}`;
            ctx.fillStyle = 'rgba(239,230,255,0.9)';
            v.message.split('\n').forEach((l, i) => ctx.fillText(l, rx + rw / 2, ry + 140 + i * 64, rw - 40));
        }
        const n = HISTORY_ROWS.wide;
        const shown = v.history.slice(v.start, v.start + n);
        shown.forEach((row, k) => {
            const y = ry + k * MOCK.pitch,
                on = v.start + k === v.index;
            // The row: a glass capsule, the chosen one ringed in pink light; the mode on a tag in its colour.
            const py = y + 8,
                ph = rh - 16;
            if (on) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255,150,255,0.35)';
                ctx.lineWidth = 22 + 6 * Math.sin(t * 5);
                roundRect(ctx, rx, py, rw, ph, ph / 2);
                ctx.stroke();
                ctx.restore();
            }
            glassPanel(ctx, rx, py, rw, ph, ph / 2);
            if (on) {
                ctx.strokeStyle = 'rgba(255,214,255,0.95)';
                ctx.lineWidth = 5;
                roundRect(ctx, rx + 4, py + 4, rw - 8, ph - 8, (ph - 8) / 2);
                ctx.stroke();
            }
            const tagX = at(36),
                tagW = at(330) - tagX;
            ctx.fillStyle = shade(row.color, 0.35);
            roundRect(ctx, tagX, py + 22, tagW, ph - 44, (ph - 44) / 2);
            ctx.fill();
            ctx.strokeStyle = row.color;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = `800 38px ${SANS}`;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(row.tag, tagX + tagW / 2, py + ph / 2 + 13, tagW - 30);
            // The stage's picture, in a rounded frame.
            const tx = at(438),
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
            ctx.fillText(row.title, at(768), y + 64, 760);
            ctx.font = `italic 600 36px ${FONT}`;
            ctx.fillStyle = 'rgba(224,214,255,0.95)';
            ctx.fillText(row.detail, at(768), y + 106, 760);
            const win = row.result.startsWith('WIN');
            const cx = at(1640);
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
            ctx.fillText(row.local ? 'THIS DEVICE' : row.when, at(2150), y + 84, 260);
        });
        // The scroll bar down the right.
        if (v.history.length > n) {
            const x = span.scroll,
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
 * The player card filling `box` (in the units of the current transform), drawn in code: a gold-framed violet card,
 * the player's fairy in a window under a crest, their name on a plaque, where progress is kept, and the Endless top
 * three each beside a crown. Laid out in the card's own mockup pixels, so it scales to any box; used by Profile and
 * the match details in landscape.
 */
export function drawPlayerCard(
    ctx: CanvasRenderingContext2D,
    card: PlayerCard,
    box: readonly number[],
    t: number,
): void {
    const [bx, by, bw, bh] = box;
    const [cx0, cy0, cw, ch] = MOCK.card;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(bw / cw, bh / ch);
    ctx.translate(-cx0, -cy0);
    const cx = cx0 + cw / 2;
    // The card: violet glass in a gold frame.
    const x = cx0 + 14,
        y = cy0 + 36,
        w = cw - 28,
        h = ch - 50,
        r = 70;
    const body = ctx.createLinearGradient(0, y, 0, y + h);
    body.addColorStop(0, '#2e1658');
    body.addColorStop(0.5, '#1a0b36');
    body.addColorStop(1, '#241048');
    ctx.fillStyle = body;
    roundRect(ctx, x, y, w, h, r);
    ctx.fill();
    goldRoundFrame(ctx, x, y, w, h, r, 16);
    // The fairy's window, under the crest.
    const fy = FAIRIES[0];
    const ix = x + 40,
        iy = y + 50,
        iw = w - 80,
        ih = 640,
        ir = 44;
    ctx.save();
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.clip();
    const bg = ctx.createRadialGradient(cx, iy + ih * 0.45, 30, cx, iy + ih * 0.45, 700);
    bg.addColorStop(0, fy.color);
    bg.addColorStop(0.55, shade(fy.color, 0.35));
    bg.addColorStop(1, '#0d0a24');
    ctx.fillStyle = bg;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 7; i++) sparkle(ctx, ix + ((i * 290 + t * 70) % iw), iy + ((i * 190) % ih), 10 + (i % 3) * 5);
    const p = fy.portrait;
    if (p && p.img.complete && p.img.naturalWidth) {
        const [sx, sy, sw, sh] = p.panel;
        const k = Math.max(iw / sw, ih / sh);
        ctx.drawImage(p.img, sx, sy, sw, sh, cx - (sw * k) / 2, iy, sw * k, sh * k);
    } else drawFairy(ctx, fy, cx, iy + ih * 0.5 + Math.sin(t * 2.2) * 14, 22, t, 0, false);
    ctx.strokeStyle = 'rgba(20,6,30,0.45)';
    ctx.lineWidth = 12;
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = goldGradient(ctx, iy, iy + ih);
    ctx.lineWidth = 6;
    roundRect(ctx, ix, iy, iw, ih, ir);
    ctx.stroke();
    frameCrest(ctx, cx, y + 8, t);
    namePlaque(ctx, card.name, ix + 10, iy + ih - 60, iw - 20, 120, 54);
    // Where progress is kept.
    ctx.textAlign = 'center';
    ctx.font = `italic 600 34px ${FONT}`;
    ctx.fillStyle = '#efe6ff';
    const ty = iy + ih + 120;
    ctx.fillText(
        card.synced ? 'Progress is saved on the game server.' : 'Progress is saved in this browser.',
        cx,
        ty,
        w - 80,
    );
    ctx.fillText('Sign in with Google: coming soon', cx, ty + 44, w - 80);
    // A starred divider, then the Endless top three under their heading between sprigs of laurel.
    const dy = ty + 92;
    const rule = ctx.createLinearGradient(x + 60, 0, x + w - 60, 0);
    rule.addColorStop(0, 'rgba(255,212,92,0)');
    rule.addColorStop(0.5, 'rgba(255,212,92,0.95)');
    rule.addColorStop(1, 'rgba(255,212,92,0)');
    ctx.fillStyle = rule;
    ctx.fillRect(x + 60, dy - 2, w - 120, 4);
    ctx.fillStyle = '#ffe9a8';
    sparkle(ctx, cx, dy, 18);
    const hy = dy + 80;
    arcadeText(ctx, 'ENDLESS TOP 3', cx, hy, 50, ['#fff7d8', '#ffd98a', '#e0a040'], 'center', w - 260);
    ctx.font = `50px ${ARCADE}`;
    const hw = Math.min(w - 260, ctx.measureText('ENDLESS TOP 3').width);
    for (const dir of [-1, 1]) {
        ctx.save();
        ctx.translate(cx + dir * (hw / 2 + 40), hy - 18);
        ctx.scale(7, 7);
        laurel(ctx, 0, 0, 4, dir);
        ctx.restore();
    }
    const top = card.leaders.slice(0, 3);
    const rows0 = hy + 34;
    for (let i = 0; i < 3; i++) {
        const ry = rows0 + i * 88,
            e = top[i],
            mine = e?.playerId === card.me;
        ctx.fillStyle = mine ? 'rgba(255,212,92,0.14)' : 'rgba(10,4,26,0.55)';
        roundRect(ctx, x + 40, ry, w - 80, 72, 36);
        ctx.fill();
        ctx.strokeStyle = mine ? 'rgba(255,212,92,0.7)' : 'rgba(190,140,255,0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
        rankCrown(ctx, i, x + 100, ry + 36);
        if (!e) continue;
        ctx.textAlign = 'left';
        ctx.font = `800 42px ${SANS}`;
        ctx.fillStyle = mine ? '#ffe27a' : '#ffffff';
        ctx.fillText(e.name, x + 160, ry + 51, w - 420);
        ctx.textAlign = 'right';
        ctx.fillText(clock(e.seconds), x + w - 76, ry + 51);
    }
    if (!top.length) {
        ctx.textAlign = 'center';
        ctx.font = `italic 600 34px ${FONT}`;
        ctx.fillStyle = 'rgba(214,204,250,0.85)';
        ctx.fillText(
            card.synced ? 'No runs yet: set the first!' : 'Shown when the server is reached',
            cx + 30,
            rows0 + 88 + 49,
            w - 220,
        );
    }
    ctx.restore();
}

/** A crown for place `i` (0 gold, 1 silver, 2 bronze) centred on (x, y), with the place's number on it. */
function rankCrown(ctx: CanvasRenderingContext2D, i: number, x: number, y: number): void {
    const tones = [
        ['#fff4c0', '#f2b53a', '#a8600e'],
        ['#ffffff', '#c8cfe0', '#6a7290'],
        ['#ffd8b0', '#d08a4a', '#7a3e14'],
    ][i];
    ctx.save();
    ctx.translate(x, y);
    const g = ctx.createLinearGradient(0, -30, 0, 26);
    g.addColorStop(0, tones[0]);
    g.addColorStop(0.5, tones[1]);
    g.addColorStop(1, tones[2]);
    ctx.beginPath();
    ctx.moveTo(-34, 24);
    ctx.lineTo(-38, -18);
    ctx.lineTo(-17, -2);
    ctx.lineTo(0, -30);
    ctx.lineTo(17, -2);
    ctx.lineTo(38, -18);
    ctx.lineTo(34, 24);
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#2a1006';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.fillStyle = g;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.font = `30px ${ARCADE}`;
    ctx.fillStyle = '#2a1006';
    ctx.fillText(String(i + 1), 0, 20);
    ctx.restore();
}

/** A dark capsule with a gold edge and `text` in gold, over (x, y, w, h). */
function capsule(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number): void {
    ctx.fillStyle = '#12082a';
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = goldGradient(ctx, y, y + h);
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = `800 ${h * 0.44}px ${SANS}`;
    ctx.fillStyle = '#ffe27a';
    ctx.fillText(text, x + w / 2, y + h * 0.64, w - 30);
}

/**
 * A record tile's icon in a round orb `r` across centred on (x, y) (no orb when `r` is 0): a trophy, a chain, a flame,
 * a crown, a butterfly, a cup, a stopwatch or a flag, shaded in gold, silver, fire or pink.
 */
function tileIcon(ctx: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, t: number): void {
    if (r) {
        const orb = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        orb.addColorStop(0, '#4a2a86');
        orb.addColorStop(1, '#12082a');
        ctx.fillStyle = orb;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(214,170,255,0.55)';
        ctx.lineWidth = 4;
        ctx.stroke();
    }
    const k = r ? r * 0.62 : 30;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    /** A gold (or other) gradient down the icon. */
    const tone = (a: string, b: string, c: string) => {
        const g = ctx.createLinearGradient(0, -1, 0, 1);
        g.addColorStop(0, a);
        g.addColorStop(0.5, b);
        g.addColorStop(1, c);
        return g;
    };
    const gold = tone('#fff4c0', '#f6c03a', '#b8640c');
    ctx.strokeStyle = '#2a1006';
    ctx.lineWidth = 0.12;
    if (kind === 'trophy' || kind === 'cup') {
        ctx.beginPath();
        ctx.moveTo(-0.6, -0.85);
        ctx.lineTo(0.6, -0.85);
        ctx.quadraticCurveTo(0.62, 0.15, 0, 0.3);
        ctx.quadraticCurveTo(-0.62, 0.15, -0.6, -0.85);
        ctx.closePath();
        ctx.fillStyle = gold;
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = gold;
        ctx.lineWidth = 0.14;
        for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.arc(
                d * 0.66,
                -0.5,
                0.26,
                d < 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
                d < 0 ? Math.PI * 1.5 : Math.PI * 0.5,
            );
            ctx.stroke();
        }
        ctx.fillStyle = gold;
        ctx.fillRect(-0.12, 0.28, 0.24, 0.32);
        roundRect(ctx, -0.48, 0.58, 0.96, 0.26, 0.06);
        ctx.fill();
        if (kind === 'cup') {
            ctx.fillStyle = '#fff7d8';
            sparkle(ctx, 0, -0.35, 0.22);
        }
    } else if (kind === 'chain') {
        for (const [dx, dy] of [
            [-0.3, 0.3],
            [0.3, -0.3],
        ]) {
            ctx.save();
            ctx.translate(dx, dy);
            ctx.rotate(-Math.PI / 4);
            ctx.strokeStyle = '#2a1006';
            ctx.lineWidth = 0.34;
            roundRect(ctx, -0.55, -0.27, 1.1, 0.54, 0.27);
            ctx.stroke();
            ctx.strokeStyle = tone('#ffffff', '#c8cfe0', '#6a7290');
            ctx.lineWidth = 0.2;
            ctx.stroke();
            ctx.restore();
        }
    } else if (kind === 'flame') {
        const flick = 1 + 0.05 * Math.sin(t * 9);
        ctx.scale(1, flick);
        ctx.beginPath();
        ctx.moveTo(0, -1);
        ctx.bezierCurveTo(0.9, -0.2, 0.75, 0.9, 0, 0.9);
        ctx.bezierCurveTo(-0.75, 0.9, -0.9, -0.1, -0.35, -0.5);
        ctx.quadraticCurveTo(-0.2, -0.1, 0, -1);
        ctx.fillStyle = tone('#ffb04a', '#ff6a1c', '#c8280a');
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(0, -0.25);
        ctx.bezierCurveTo(0.45, 0.2, 0.4, 0.85, 0, 0.85);
        ctx.bezierCurveTo(-0.4, 0.85, -0.45, 0.25, 0, -0.25);
        ctx.fillStyle = tone('#fffbe0', '#ffe27a', '#ffb02e');
        ctx.fill();
    } else if (kind === 'crown') {
        ctx.beginPath();
        ctx.moveTo(-0.8, 0.6);
        ctx.lineTo(-0.9, -0.5);
        ctx.lineTo(-0.42, -0.05);
        ctx.lineTo(0, -0.75);
        ctx.lineTo(0.42, -0.05);
        ctx.lineTo(0.9, -0.5);
        ctx.lineTo(0.8, 0.6);
        ctx.closePath();
        ctx.fillStyle = gold;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ff5a8a';
        ctx.beginPath();
        ctx.arc(0, 0.25, 0.13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7ad8ff';
        for (const d of [-0.45, 0.45]) {
            ctx.beginPath();
            ctx.arc(d, 0.3, 0.09, 0, Math.PI * 2);
            ctx.fill();
        }
    } else if (kind === 'wings') {
        const pink = tone('#ffe0ff', '#e88aff', '#9a4ae0');
        ctx.fillStyle = pink;
        for (const d of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(d * 0.48, -0.32, 0.5, 0.36, d * -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.ellipse(d * 0.36, 0.42, 0.32, 0.26, d * 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, -0.07, -0.55, 0.14, 1.1, 0.07);
        ctx.fill();
    } else if (kind === 'clock') {
        ctx.fillStyle = tone('#ffffff', '#e8e0ff', '#a898d8');
        roundRect(ctx, -0.16, -1.05, 0.32, 0.22, 0.06);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 0.1, 0.82, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#1a0b36';
        ctx.beginPath();
        ctx.arc(0, 0.1, 0.64, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.12;
        const a = t * 1.2;
        ctx.beginPath();
        ctx.moveTo(0, 0.1);
        ctx.lineTo(0, -0.38);
        ctx.moveTo(0, 0.1);
        ctx.lineTo(Math.sin(a) * 0.5, 0.1 - Math.cos(a) * 0.5);
        ctx.stroke();
    } else {
        // A flag on a pole, rippling.
        ctx.fillStyle = gold;
        roundRect(ctx, -0.62, -0.95, 0.14, 1.9, 0.07);
        ctx.fill();
        const w = 0.08 * Math.sin(t * 4);
        ctx.beginPath();
        ctx.moveTo(-0.5, -0.9);
        ctx.quadraticCurveTo(0.05, -0.9 - w * 3, 0.75, -0.7 + w);
        ctx.lineTo(0.75, 0.05 + w);
        ctx.quadraticCurveTo(0.05, -0.15 - w * 3, -0.5, -0.1);
        ctx.closePath();
        ctx.fillStyle = tone('#ffb0d8', '#ff5a8a', '#b0204a');
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

/** Whether the painted player card can be drawn (the Profile's pieces have loaded). */
export const playerCardReady = (): boolean => KIT.ready();

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
