// The Profile screen: who's playing (a guest, until sign-in exists) and this browser's record and unlocks.
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { mapById } from '@/data/maps';
import { STAGES } from '@/data/stages';
import { clock } from '@/render/hud';
import { drawTrophy } from '@/render/icons';
import type { Layout, ProfileView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

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
        // Player card: an avatar (Pip's face for now), the name, and the sign-in status.
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
        arcadeText(ctx, 'GUEST', cx, cy + (tall ? 64 : 70), 18, ['#ffffff', '#fff0c8', '#ffd27a'], 'center');
        ctx.font = `italic 600 9px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.85)';
        ctx.fillText('Progress is saved in this browser', cx, cy + (tall ? 80 : 86));
        ctx.fillText('Sign in with Google: coming soon', cx, cy + (tall ? 92 : 98));

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
            th = tall ? 38 : cols === 3 ? 44 : 38,
            x0 = tall ? (W - 2 * tw - 8) / 2 : regionX,
            y0 = tall ? 206 : 46;
        tiles.forEach(([label, value], i) => {
            const x = x0 + (i % cols) * (tw + 8),
                y = y0 + Math.floor(i / cols) * (th + 8);
            ctx.fillStyle = 'rgba(20,12,48,0.85)';
            ctx.fillRect(x, y, tw, th);
            ctx.strokeStyle = 'rgba(201,162,74,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
            ctx.textAlign = 'left';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(label, x + 8, y + 12);
            arcadeText(ctx, value, x + 8, y + 32, 16, ['#ffffff', '#ffe08a', '#ff9a2e'], 'left');
            if (label === 'TROPHIES') {
                drawTrophy(ctx, x + tw - 12, y + 10, 9);
                ctx.textAlign = 'right';
                ctx.font = `6px ${ARCADE}`;
                ctx.fillStyle = nextStage ? '#ffe27a' : '#cbbcf5';
                const name = nextStage ? (mapById(nextStage.mapId)?.name ?? '').toUpperCase() : '';
                ctx.fillText(nextStage ? `${name} AT ${nextStage.trophies}` : 'ALL STAGES', x + tw - 6, y + 31);
            }
        });

        // The roster: unlocked fairies in colour, locked ones as a ? with how to get them.
        const rows = Math.ceil(tiles.length / cols);
        const ry = y0 + rows * (th + 8) + (tall ? 34 : 40),
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
        ctx.translate(0, -dy);

        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        ctx.fillText(v.touch ? '◀ BACK' : 'ESC BACK', W / 2, tall ? H - 14 : H - 10);
        ctx.restore();
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

    /** A round avatar: Pip's portrait face if it's loaded, else her in-game look. */
    private avatar(x: number, y: number, r: number, t: number): void {
        const ctx = this.ctx;
        const fy = FAIRIES[0];
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
        } else drawFairy(ctx, fy, x, y + 4, 2.4, t);
        ctx.restore();
        ctx.strokeStyle = '#ffd45c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}
