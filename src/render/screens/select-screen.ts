import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Layout, SelectSide, SelectView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted, sparkle } from '@/render/draw';
import { ARCADE, FONT } from '@/render/theme';

// Layout, in view units (504 x 320).
const PANEL_W = 160;
const PANEL_X = [8, C.VIEW_W - 8 - PANEL_W] as const;
const ART_Y = 34,
    ART_H = 168,
    SLANT = 10;
const MED_R = 21;
const MID_X = C.VIEW_W / 2;
const MED_COLS = 3;
const MED_DX = 50,
    MED_Y0 = 104,
    MED_DY = 50;

/** A side panel's size and place: the wide layout's, or the tall layout's narrower, compact one. */
interface PanelGeom {
    w: number;
    artY: number;
    artH: number;
    compact: boolean;
}
const WIDE_PANEL: PanelGeom = { w: PANEL_W, artY: ART_Y, artH: ART_H, compact: false };
const TALL_PANEL: PanelGeom = { w: 122, artY: 36, artH: 150, compact: true };
const TALL_PANEL_X = [6, C.TALL_W - 6 - 122] as const;

/** Where the centre column's pieces go in each layout. */
const CENTRE = {
    wide: {
        mid: MID_X,
        timeY: 42,
        vsX: MID_X,
        vsY: 236,
        vsSize: 34,
        hintY: 282,
        hintW: 230,
        headSize: 16,
        W: C.VIEW_W,
    },
    tall: {
        mid: C.TALL_W / 2,
        timeY: 290,
        vsX: C.TALL_W / 2,
        vsY: 106,
        vsSize: 22,
        hintY: 494,
        hintW: 250,
        headSize: 12,
        W: C.TALL_W,
    },
} as const;
/** The tall layout's roster: under the panels, a little bigger for fingers. */
const TALL_MED = { y0: 372, dx: 64, dy: 58, r: 24 } as const;

/** How far the tall select's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each roster medallion sits (centre), in roster order, for a layout and view height. */
export function medallionAt(
    i: number,
    layout: Layout = 'wide',
    h: number = C.TALL_H,
): { x: number; y: number; r: number } {
    const row = Math.floor(i / MED_COLS);
    const inRow = Math.min(MED_COLS, FAIRIES.length - row * MED_COLS);
    const col = i % MED_COLS;
    if (layout === 'tall')
        return {
            x: C.TALL_W / 2 + (col - (inRow - 1) / 2) * TALL_MED.dx,
            y: TALL_MED.y0 + tallShift(h) + row * TALL_MED.dy,
            r: TALL_MED.r,
        };
    return { x: MID_X + (col - (inRow - 1) / 2) * MED_DX, y: MED_Y0 + row * MED_DY, r: MED_R };
}
export const SELECT_COLS = MED_COLS;

/** The character select screen: both players' panels and the roster between them. */
export class SelectScreen {
    private backdrop: Backdrop;
    /** The layout of the frame being drawn, its height, and how far tall content is shifted down. */
    private layout: Layout = 'wide';
    private h: number = C.TALL_H;
    private dy = 0;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the whole screen, wide or (for a portrait screen) tall. */
    draw(v: SelectView, t: number, layout: Layout = 'wide', h: number = C.TALL_H): void {
        this.layout = layout;
        this.h = h;
        this.dy = layout === 'tall' ? tallShift(h) : 0;
        if (layout === 'tall') {
            this.backdrop.draw(t, C.TALL_W / 2, 150 + this.dy, C.TALL_W, h);
            const g = { ...TALL_PANEL, artY: TALL_PANEL.artY + this.dy };
            v.sides.forEach((s, i) => this.panel(s, TALL_PANEL_X[i], i === 1, t, g));
        } else {
            this.backdrop.draw(t);
            v.sides.forEach((s, i) => this.panel(s, PANEL_X[i], i === 1, t));
        }
        this.header(v.heading);
        this.centre(v, t);
    }

    // ---- header ----------------------------------------------------------------

    /** Draw the heading bar across the top. */
    private header(text: string): void {
        const ctx = this.ctx;
        const cg = CENTRE[this.layout];
        const g = ctx.createLinearGradient(0, 0, 0, 28);
        g.addColorStop(0, 'rgba(10,6,28,0.95)');
        g.addColorStop(1, 'rgba(10,6,28,0.6)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cg.W, 27);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(0, 27, cg.W, 1);
        ctx.fillStyle = 'rgba(255,230,160,0.25)';
        ctx.fillRect(0, 28, cg.W, 1);
        // On the tall screen the corners hold the back and exit buttons, so the heading keeps to the middle.
        arcadeText(ctx, text, cg.mid, 21, cg.headSize, ['#fff7c2', '#ffd45c', '#ff9a2e'], 'center', cg.W - 76);
    }

    // ---- side panels ------------------------------------------------------------

    /** Draw one player's side panel (portrait, name, stats), mirrored on the right. */
    private panel(s: SelectSide, x: number, mirror: boolean, t: number, g: PanelGeom = WIDE_PANEL): void {
        const ctx = this.ctx;
        const pw = g.w,
            ay = g.artY,
            ah = g.artH,
            cz = g.compact ? 0.8 : 1;
        // The CPU's panel spins through the roster until the match starts.
        const fy = s.cpu ? FAIRIES[Math.floor(t * 9) % FAIRIES.length] : s.fairy;
        const hidden = s.cpu === true || s.locked;
        const art = slanted(x, ay, pw, ah, mirror ? -SLANT : SLANT);

        // Art window: the fairy's colour glow, sparkles, then her portrait (or her in-game look, large).
        ctx.save();
        art(ctx);
        ctx.clip();
        const bg = ctx.createRadialGradient(x + pw / 2, ay + ah * 0.45, 8, x + pw / 2, ay + ah * 0.45, 130);
        bg.addColorStop(0, hidden ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, hidden ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(x - SLANT, ay, pw + SLANT * 2, ah);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++)
            sparkle(ctx, x + ((i * 53 + t * 14) % (pw + 20)) - 10, ay + ((i * 37) % ah), 2 + (i % 3));
        if (hidden) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            // Cover the window, keeping the crop's aspect.
            const k = Math.max((pw + SLANT * 2) / sw, ah / sh);
            const dw = sw * k,
                dh = sh * k;
            ctx.drawImage(p.img, sx, sy, sw, sh, x + pw / 2 - dw / 2, ay, dw, dh);
        } else {
            drawFairy(this.ctx, fy, x + pw / 2, ay + ah * 0.48 + Math.sin(t * 2.2) * 3, 4.2, t, 0, false);
        }
        ctx.filter = 'none';
        if (hidden) {
            arcadeText(ctx, '?', x + pw / 2, ay + ah * 0.62, 64 * cz, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        }
        // Floor shading so the nameplate sits on something.
        const fl = ctx.createLinearGradient(0, ay + ah - 50, 0, ay + ah);
        fl.addColorStop(0, 'rgba(8,5,24,0)');
        fl.addColorStop(1, 'rgba(8,5,24,0.85)');
        ctx.fillStyle = fl;
        ctx.fillRect(x - SLANT, ay + ah - 50, pw + SLANT * 2, 50);
        ctx.restore();

        // Frame: gold edge, inner dark line, a glow in the player's colour once chosen.
        ctx.save();
        if (s.done) {
            ctx.shadowColor = s.color;
            ctx.shadowBlur = 10 + 4 * Math.sin(t * 8);
        }
        ctx.strokeStyle = s.done ? s.color : '#d9b45a';
        ctx.lineWidth = 2;
        art(ctx);
        ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        slanted(x + 2, ay + 2, pw - 4, ah - 4, mirror ? -SLANT : SLANT)(ctx);
        ctx.stroke();

        // Player badge in the top corner.
        const bx = mirror ? x + pw - 6 : x + 6;
        ctx.font = `${13 * cz}px ${ARCADE}`;
        const bw = ctx.measureText(s.tag).width + 14;
        ctx.fillStyle = s.color;
        slanted(mirror ? bx - bw : bx, ay - 6, bw, 16, mirror ? -5 : 5)(ctx);
        ctx.fill();
        ctx.fillStyle = '#140a26';
        ctx.textAlign = 'center';
        ctx.fillText(s.tag, (mirror ? bx - bw : bx) + bw / 2, ay + 6);

        // Nameplate.
        const ny = ay + ah - 12;
        const plate = slanted(x - 2, ny, pw + 4, 24, mirror ? -8 : 8);
        const pg = ctx.createLinearGradient(x, 0, x + pw, 0);
        const c0 = hidden ? '#4a3f7a' : fy.color,
            c1 = hidden ? '#1d1840' : shade(fy.color, 0.3);
        pg.addColorStop(0, mirror ? c1 : c0);
        pg.addColorStop(1, mirror ? c0 : c1);
        ctx.fillStyle = pg;
        plate(ctx);
        ctx.fill();
        ctx.strokeStyle = '#fff3c9';
        ctx.lineWidth = 1.2;
        plate(ctx);
        ctx.stroke();
        const name = s.cpu ? '? ? ?' : s.locked ? 'LOCKED' : fy.name.toUpperCase();
        arcadeText(
            ctx,
            name,
            mirror ? x + pw - 12 : x + 12,
            ny + 18,
            (name.length > 9 ? 13 : 16) * cz,
            ['#ffffff', '#fff0c8', '#ffd27a'],
            mirror ? 'right' : 'left',
        );

        // Blurb and stats.
        let y = ny + 36 * cz;
        ctx.textAlign = mirror ? 'right' : 'left';
        const tx = mirror ? x + pw - 4 : x + 4;
        ctx.font = `italic 600 ${9 * cz}px ${FONT}`;
        ctx.fillStyle = s.locked ? '#ffe27a' : 'rgba(246,240,255,0.8)';
        ctx.fillText(s.cpu ? 'Chooses at random' : s.locked ? (s.fairy.unlock?.hint ?? '') : fy.blurb, tx, y, pw - 8);
        y += 8;
        const stats: [string, number][] = [
            ['SPEED', rate(fy.speed, 1.2)],
            ['BURST', rate(fy.burst, 1.3)],
            ['CHARGE', rate(1 / fy.charge, 2)],
            ['DODGE', rate(1 / fy.hitbox, 1 / 0.7)],
        ];
        for (const [label, n] of stats) {
            y += 11 * cz;
            ctx.font = `${8 * cz}px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.textAlign = 'left';
            ctx.fillText(label, x + 4, y);
            for (let k = 0; k < 5; k++) {
                const px = x + (g.compact ? 46 : 62) + k * (g.compact ? 14 : 18);
                const on = !hidden && k < n;
                ctx.fillStyle = on ? (k >= 4 ? '#ff8a5b' : k >= 3 ? '#ffd45c' : '#8ff0a0') : 'rgba(255,255,255,0.1)';
                slanted(px, y - 7 * cz, g.compact ? 11 : 15, 7 * cz, 3)(ctx);
                ctx.fill();
            }
        }
        y += 13 * cz;
        ctx.font = `italic 600 ${9 * cz}px ${FONT}`;
        ctx.fillStyle = 'rgba(246,240,255,0.65)';
        ctx.textAlign = 'left';
        ctx.fillText(hidden ? 'Bomb  ???' : `Bomb  ${fy.bomb.name}  ·  Shot  ${fy.chargeName}`, x + 4, y, pw - 8);

        // READY! stamp once chosen.
        if (s.done && !s.cpu) {
            ctx.save();
            ctx.translate(x + pw / 2, ay + ah * 0.74);
            ctx.rotate(mirror ? 0.18 : -0.18);
            const k = 1 + 0.04 * Math.sin(t * 9);
            ctx.scale(k * cz, k * cz);
            ctx.fillStyle = 'rgba(10,6,28,0.55)';
            ctx.fillRect(-62, -17, 124, 30);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = 2;
            ctx.strokeRect(-62, -17, 124, 30);
            arcadeText(ctx, 'READY!', 0, 7, 20, ['#ffffff', '#fff3a0', s.color], 'center');
            ctx.restore();
        }
    }

    // ---- centre column ----------------------------------------------------------

    /** Draw the centre column: timer, roster medallions and cursors. */
    private centre(v: SelectView, t: number): void {
        const ctx = this.ctx;
        const base = CENTRE[this.layout],
            dy = this.dy;
        const cg = { ...base, timeY: base.timeY + dy, vsY: base.vsY + dy, hintY: base.hintY + dy };
        // Timer.
        if (v.timer !== null) {
            ctx.textAlign = 'center';
            ctx.font = `8px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText('TIME', cg.mid, cg.timeY);
            const low = v.timer <= 5;
            const pulse = low ? 1 + 0.12 * Math.max(0, Math.sin(t * 12)) : 1;
            ctx.save();
            ctx.translate(cg.mid, cg.timeY + 24);
            ctx.scale(pulse, pulse);
            arcadeText(
                ctx,
                String(Math.max(0, v.timer)).padStart(2, '0'),
                0,
                0,
                24,
                low ? ['#ffffff', '#ff9a9a', '#ff3d5e'] : ['#ffffff', '#bfe8ff', '#4fb8ff'],
                'center',
            );
            ctx.restore();
        }

        // Roster medallions.
        v.cards.forEach((c, i) => {
            const m = medallionAt(i, this.layout, this.h);
            const hovered = v.cursors.some(cu => cu.index === i);
            const lift = hovered ? -2 : 0;
            ctx.save();
            ctx.beginPath();
            ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
            const g = ctx.createRadialGradient(m.x, m.y + lift - 6, 2, m.x, m.y + lift, m.r);
            g.addColorStop(0, c.locked ? '#3a3360' : c.fairy.color);
            g.addColorStop(1, c.locked ? '#120e2c' : shade(c.fairy.color, 0.3));
            ctx.fillStyle = g;
            ctx.fill();
            ctx.clip();
            const p = c.fairy.portrait;
            if (c.locked) {
                drawFairy(this.ctx, c.fairy, m.x, m.y + lift + 2, 1.15, t, 0, true);
            } else if (p && p.img.complete && p.img.naturalWidth) {
                const [fx, fy, fr] = p.face;
                ctx.drawImage(p.img, fx - fr, fy - fr, fr * 2, fr * 2, m.x - m.r, m.y + lift - m.r, m.r * 2, m.r * 2);
            } else {
                drawFairy(this.ctx, c.fairy, m.x, m.y + lift + 2, 1.15, t + i);
            }
            if (!hovered) {
                ctx.fillStyle = 'rgba(10,6,28,0.35)';
                ctx.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2);
            }
            ctx.restore();
            ctx.strokeStyle = hovered ? '#fff3c9' : '#a8894a';
            ctx.lineWidth = hovered ? 2 : 1.5;
            ctx.beginPath();
            ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
            ctx.stroke();
            if (c.locked) {
                ctx.font = `14px ${ARCADE}`;
                ctx.fillStyle = 'rgba(255,226,122,0.85)';
                ctx.textAlign = 'center';
                ctx.fillText('?', m.x, m.y + 5);
            }
        });

        // Cursors: a spinning dashed ring per player (solid once chosen), with a tag.
        v.cursors.forEach((cu, k) => {
            const m = medallionAt(cu.index, this.layout, this.h);
            const shared = v.cursors.length > 1 && v.cursors[0].index === v.cursors[1].index;
            const r = m.r + 4 + (shared && k === 1 ? 4 : 0);
            ctx.save();
            ctx.strokeStyle = cu.color;
            ctx.lineWidth = 2.5;
            ctx.shadowColor = cu.color;
            ctx.shadowBlur = 8;
            if (!cu.done) {
                ctx.setLineDash([7, 4]);
                ctx.lineDashOffset = (k ? 1 : -1) * t * 30;
            }
            ctx.beginPath();
            ctx.arc(m.x, m.y - 2, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
            // Tag above (P1) or below (P2) the medallion.
            ctx.font = `9px ${ARCADE}`;
            const w = ctx.measureText(cu.tag).width + 8;
            const ty = k === 0 ? m.y - r - 12 + Math.sin(t * 6) * 1.5 : m.y + r - 2 - Math.sin(t * 6) * 1.5;
            ctx.fillStyle = cu.color;
            slanted(m.x - w / 2, ty, w, 11, 3)(ctx);
            ctx.fill();
            ctx.fillStyle = '#140a26';
            ctx.textAlign = 'center';
            ctx.fillText(cu.tag, m.x, ty + 9);
        });

        // VS emblem.
        const vy = cg.vsY;
        ctx.save();
        ctx.translate(cg.vsX, vy);
        const vk = 1 + 0.05 * Math.sin(t * 3);
        ctx.scale(vk, vk);
        ctx.shadowColor = '#ff6b8a';
        ctx.shadowBlur = 16;
        arcadeText(ctx, 'VS', 0, cg.vsSize * 0.35, cg.vsSize, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
        ctx.restore();

        // Control hints.
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        v.hints.forEach((h, i) => {
            ctx.fillStyle =
                i === 0 ? `rgba(255,243,201,${0.55 + 0.45 * Math.abs(Math.sin(t * 3))})` : 'rgba(203,188,245,0.75)';
            ctx.fillText(h, cg.mid, cg.hintY + i * 11, cg.hintW);
        });
    }
}

// ---- helpers ------------------------------------------------------------------

/** Stat pips, 1 to 5, from a multiplier where `top` earns five. */
function rate(v: number, top: number): number {
    return Math.max(1, Math.min(5, Math.round(3 + ((v - 1) / (top - 1)) * 2)));
}
