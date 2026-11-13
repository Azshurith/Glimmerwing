// The Characters screen: browse the fairies, with each one's portrait, stats, skills and how to unlock her.
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Fairy, Layout, RosterView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, shade, slanted, sparkle } from '@/render/draw';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';

/** What each charge-shot style does. */
const SHOT_TEXT: Record<string, string> = {
    orb: 'A big glowing orb that bursts wide',
    thorn: 'A heavy thorn that bursts huge',
    needles: 'A fan of frost needles',
    twin: 'Two darts at once',
    flare: 'A fan of embers',
    crescent: 'A sweeping crescent',
};
/** What each bomb style does. */
const BOMB_TEXT: Record<string, string> = {
    dash: 'Streaks across her row, then a full-field flash',
    blast: 'A huge blast that also slows her meadow',
    vortex: 'Spirals out from the centre',
    fan: 'Covers a cone ahead; keeps her safe longest',
    beam: 'Sweeps a beam over everything above her',
    hole: 'A black hole drags hazards in, then bursts',
};
/** How each Extra Attack critter flies. */
const EXTRA_TEXT: Record<string, string> = {
    lateral: 'streak across, then burst into sparks',
    bounce: 'hop slowly down the meadow',
    slant: 'ricochet off the walls',
    homing: 'home in on the rival',
    zig: 'zig-zag down',
    bat: 'weave down, then dive',
};
/** How each guardian attacks. */
const GUARDIAN_TEXT: Record<string, string> = {
    aimed: 'fires straight at the rival',
    ring: 'spins out rings of shots',
    rain: 'rains shots down',
    rapid: 'fires in rapid bursts',
    spiral: 'spins out spirals',
    sweep: 'sweeps fans of shots',
};

/** A 1-5 rating for a stat, from its multiplier and the value that earns five. */
const rate = (v: number, max: number) => Math.max(1, Math.min(5, Math.round(1 + (4 * (v - 0.7)) / (max - 0.7))));

/** Where things go in each layout, in its design units. */
const LAYOUT = {
    wide: {
        W: C.VIEW_W,
        art: { x: 14, y: 40, w: 116, h: 206 },
        demo: { x: 340, y: 43, w: 150 },
        info: { x: 146, y: 52, w: 180 },
        rowY: 276,
        r: 14,
    },
    tall: {
        W: C.TALL_W,
        art: { x: 10, y: 36, w: 86, h: 200 },
        demo: { x: 104, y: 36, w: 150 },
        info: { x: 14, y: 258, w: 236 },
        rowY: 506,
        r: 15,
    },
} as const;

/**
 * The wide layout spread over a widened view: the portrait against the left edge (a little wider as the
 * view grows), the demo against the right edge, and her stats and skills in the space between (centred in it once it's wider than they need).
 */
function spread(bleed: number): { art: Box; demo: { x: number; y: number; w: number }; info: Box1 } {
    const L = LAYOUT.wide;
    const art = { ...L.art, x: L.art.x - bleed, w: L.art.w + Math.min(44, bleed * 0.3) };
    const demo = { ...L.demo, x: L.demo.x + bleed };
    const x = art.x + art.w + 16,
        room = demo.x - 14 - x,
        w = Math.min(360, room);
    return { art, demo, info: { x: x + (room - w) / 2, y: L.info.y, w } };
}

/** A box in design units. */
type Box = { x: number; y: number; w: number; h: number };
/** A column in design units: where it starts and how wide it is. */
type Box1 = { x: number; y: number; w: number };

/** Draws the live demo meadow at (`x`, `y`) and `scale`, in the screen's design units (see game/preview.ts). */
export type DemoDraw = (x: number, y: number, scale: number) => void;

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** Where each fairy's medallion sits along the bottom, in a layout's design units. */
function designMedallions(layout: Layout, dy = 0): { x: number; y: number; r: number }[] {
    const L = LAYOUT[layout],
        gap = L.r * 2 + 10;
    const x0 = L.W / 2 - ((FAIRIES.length - 1) * gap) / 2;
    return FAIRIES.map((_, i) => ({ x: x0 + i * gap, y: L.rowY + dy, r: L.r }));
}

/** The medallions in view units, for a layout and view height: the tap targets. */
export function rosterMedallions(layout: Layout, h: number = C.TALL_H): { x: number; y: number; r: number }[] {
    if (layout !== 'tall') return designMedallions('wide');
    const f = tallMenuFit(h);
    return designMedallions('tall', tallShift(f.h)).map(m => ({ x: f.x + m.x * f.s, y: m.y * f.s, r: m.r * f.s }));
}

/** The Characters screen. */
export class RosterScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: RosterView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0, demo?: DemoDraw): void {
        const ctx = this.ctx;
        ctx.save();
        let H: number = C.VIEW_H,
            dy = 0;
        if (layout === 'tall') {
            const f = tallMenuFit(h);
            this.backdrop.draw(t, C.TALL_W / 2, h * 0.4, C.TALL_W, h);
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            bleed = f.bleed;
            H = f.h;
            dy = tallShift(f.h);
        } else {
            ctx.save();
            ctx.translate(-bleed, 0);
            this.backdrop.draw(t, 90 + bleed, 150, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
        }
        const L = LAYOUT[layout];
        this.header(L.W, bleed);
        const fy = FAIRIES[v.index],
            locked = v.locked[v.index];
        ctx.save();
        ctx.translate(0, dy);
        const { art, demo: win, info } = layout === 'wide' ? spread(bleed) : L;
        this.art(fy, locked, art, t);
        this.demo(fy, locked, win, v.caption, demo);
        this.info(fy, locked, info, layout === 'tall', t);
        ctx.restore();
        designMedallions(layout, dy).forEach((m, i) => this.medallion(FAIRIES[i], v.locked[i], m, i === v.index, t));
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP A FAIRY  ·  ◀ BACK' : 'LEFT / RIGHT BROWSE  ·  ESC BACK';
        ctx.fillText(hint, L.W / 2, layout === 'tall' ? H - 14 : H - 10, L.W - 16);
        ctx.restore();
    }

    /** The heading bar across the top, reaching `bleed` past each side. */
    private header(W: number, bleed: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, 28);
        g.addColorStop(0, 'rgba(10,6,28,0.95)');
        g.addColorStop(1, 'rgba(10,6,28,0.6)');
        ctx.fillStyle = g;
        ctx.fillRect(-bleed, 0, W + 2 * bleed, 27);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(-bleed, 27, W + 2 * bleed, 1);
        arcadeText(ctx, 'CHARACTERS', W / 2, 21, 16, ['#fff7c2', '#ffd45c', '#ff9a2e'], 'center', W - 76);
    }

    /** The fairy's portrait (or her in-game look, large) in a framed window, with her name on a plate. */
    private art(fy: Fairy, locked: boolean, a: { x: number; y: number; w: number; h: number }, t: number): void {
        const ctx = this.ctx;
        const win = slanted(a.x, a.y, a.w, a.h, 10);
        ctx.save();
        win(ctx);
        ctx.clip();
        const bg = ctx.createRadialGradient(a.x + a.w / 2, a.y + a.h * 0.45, 8, a.x + a.w / 2, a.y + a.h * 0.45, 140);
        bg.addColorStop(0, locked ? '#3a3360' : fy.color);
        bg.addColorStop(0.55, locked ? '#1d1840' : shade(fy.color, 0.35));
        bg.addColorStop(1, '#0d0a24');
        ctx.fillStyle = bg;
        ctx.fillRect(a.x - 10, a.y, a.w + 20, a.h);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        for (let i = 0; i < 9; i++)
            sparkle(ctx, a.x + ((i * 53 + t * 14) % (a.w + 20)) - 10, a.y + ((i * 37) % a.h), 2 + (i % 3));
        if (locked) ctx.filter = 'brightness(0) opacity(0.8)';
        const p = fy.portrait;
        if (p && p.img.complete && p.img.naturalWidth) {
            const [sx, sy, sw, sh] = p.panel;
            const k = Math.max((a.w + 20) / sw, a.h / sh);
            ctx.drawImage(p.img, sx, sy, sw, sh, a.x + a.w / 2 - (sw * k) / 2, a.y, sw * k, sh * k);
        } else {
            drawFairy(ctx, fy, a.x + a.w / 2, a.y + a.h * 0.48 + Math.sin(t * 2.2) * 3, 4.2, t, 0, false);
        }
        ctx.filter = 'none';
        if (locked)
            arcadeText(ctx, '?', a.x + a.w / 2, a.y + a.h * 0.6, 60, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        const fl = ctx.createLinearGradient(0, a.y + a.h - 50, 0, a.y + a.h);
        fl.addColorStop(0, 'rgba(8,5,24,0)');
        fl.addColorStop(1, 'rgba(8,5,24,0.85)');
        ctx.fillStyle = fl;
        ctx.fillRect(a.x - 10, a.y + a.h - 50, a.w + 20, 50);
        ctx.restore();
        ctx.strokeStyle = locked ? '#8a7aa8' : fy.color;
        ctx.lineWidth = 2;
        win(ctx);
        ctx.stroke();
        // Nameplate.
        const ny = a.y + a.h - 14;
        const plate = slanted(a.x - 2, ny, a.w + 4, 24, 8);
        const pg = ctx.createLinearGradient(a.x, 0, a.x + a.w, 0);
        pg.addColorStop(0, locked ? '#4a3f7a' : fy.color);
        pg.addColorStop(1, locked ? '#1d1840' : shade(fy.color, 0.3));
        ctx.fillStyle = pg;
        plate(ctx);
        ctx.fill();
        ctx.strokeStyle = '#fff3c9';
        ctx.lineWidth = 1.2;
        plate(ctx);
        ctx.stroke();
        const name = locked ? 'LOCKED' : fy.name.toUpperCase();
        arcadeText(
            ctx,
            name,
            a.x + 10,
            ny + 18,
            name.length > 9 ? 12 : 15,
            ['#ffffff', '#fff0c8', '#ffd27a'],
            'left',
            a.w - 14,
        );
    }

    /**
     * The live demo window: her meadow, run by the real game code, with a caption saying which move she's
     * showing. A locked fairy's window stays dark.
     */
    private demo(
        fy: Fairy,
        locked: boolean,
        d: { x: number; y: number; w: number },
        caption: string,
        draw?: DemoDraw,
    ): void {
        const ctx = this.ctx;
        const s = d.w / C.FIELD_W_BASE,
            h = C.FIELD_H_BASE * s;
        ctx.save();
        ctx.beginPath();
        ctx.rect(d.x, d.y, d.w, h);
        ctx.clip();
        if (!locked && draw) draw(d.x, d.y, s);
        else {
            ctx.fillStyle = '#120d2c';
            ctx.fillRect(d.x, d.y, d.w, h);
            arcadeText(ctx, '?', d.x + d.w / 2, d.y + h * 0.55, 40, ['#ffffff', '#c9b8ff', '#7a5cff'], 'center');
        }
        if (!locked && caption) {
            // The caption, on a dark band along the bottom.
            const g = ctx.createLinearGradient(0, d.y + h - 30, 0, d.y + h);
            g.addColorStop(0, 'rgba(8,5,24,0)');
            g.addColorStop(1, 'rgba(8,5,24,0.9)');
            ctx.fillStyle = g;
            ctx.fillRect(d.x, d.y + h - 30, d.w, 30);
            ctx.textAlign = 'center';
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(caption.toUpperCase(), d.x + d.w / 2, d.y + h - 8, d.w - 10);
        }
        ctx.restore();
        ctx.strokeStyle = locked ? '#8a7aa8' : fy.color;
        ctx.lineWidth = 2;
        ctx.strokeRect(d.x, d.y, d.w, h);
    }

    /** Her blurb, stats and skills (or how to unlock her). */
    private info(
        fy: Fairy,
        locked: boolean,
        b: { x: number; y: number; w: number },
        compact: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        let y = b.y;
        ctx.textAlign = 'left';
        ctx.font = `italic 600 ${compact ? 9 : 10}px ${FONT}`;
        ctx.fillStyle = locked ? '#ffe27a' : 'rgba(246,240,255,0.9)';
        ctx.fillText(locked ? `To unlock: ${fy.unlock?.hint ?? ''}` : fy.blurb, b.x, y, b.w);
        // Stats, two to a row.
        const stats: [string, number][] = [
            ['SPEED', rate(fy.speed, 1.2)],
            ['BURST', rate(fy.burst, 1.3)],
            ['CHARGE', rate(1 / fy.charge, 2)],
            ['DODGE', rate(1 / fy.hitbox, 1 / 0.7)],
        ];
        const colW = Math.min(b.w / 2, 150),
            step = Math.min(compact ? 13 : 16, (colW - 46) / 5),
            bar = step - 3;
        stats.forEach(([label, n], i) => {
            const sx = b.x + (i % 2) * colW,
                sy = y + 16 + Math.floor(i / 2) * 13;
            ctx.font = `7px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(label, sx, sy);
            for (let k = 0; k < 5; k++) {
                const on = !locked && k < n;
                ctx.fillStyle = on ? (k >= 4 ? '#ff8a5b' : k >= 3 ? '#ffd45c' : '#8ff0a0') : 'rgba(255,255,255,0.1)';
                slanted(sx + 42 + k * step, sy - 6, bar, 6, 3)(ctx);
                ctx.fill();
            }
        });
        y += 16 + 2 * 13 + 4;
        // Skills.
        const skills: [string, string, string][] = locked
            ? [
                  ['SHOT', '???', ''],
                  ['BOMB', '???', ''],
                  ['EXTRA ATTACK', '???', ''],
                  ['GUARDIAN', '???', ''],
              ]
            : [
                  ['SHOT', fy.chargeName, SHOT_TEXT[fy.chargeStyle] ?? ''],
                  ['BOMB', fy.bomb.name, BOMB_TEXT[fy.bomb.style] ?? ''],
                  [
                      'EXTRA ATTACK',
                      fy.extra.name,
                      `${fy.extra.count} that ${EXTRA_TEXT[fy.extra.flight] ?? 'fly at the rival'}`,
                  ],
                  ['GUARDIAN', fy.guardian.name, GUARDIAN_TEXT[fy.guardian.pattern] ?? ''],
              ];
        const line = compact ? 38 : 34;
        skills.forEach(([kind, name, text], i) => {
            const sy = y + 10 + i * line;
            // A small chip in her colour, then the skill's kind, name and what it does.
            ctx.fillStyle = locked ? '#4a3f7a' : fy.color;
            slanted(b.x, sy - 8, 6, 10, 2)(ctx);
            ctx.fill();
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#cbbcf5';
            ctx.fillText(kind, b.x + 12, sy);
            ctx.font = `${compact ? 9 : 10}px ${ARCADE}`;
            ctx.fillStyle = '#fff3c9';
            ctx.fillText(name, b.x + 12, sy + 11, b.w - 12);
            if (text) {
                ctx.font = `italic 600 ${compact ? 8 : 8.5}px ${FONT}`;
                ctx.fillStyle = 'rgba(203,188,245,0.85)';
                ctx.fillText(text, b.x + 12, sy + 21, b.w - 12);
            }
        });
        if (!locked && fy.sprite === undefined) {
            // Her in-game look, small, beside her name.
            drawFairy(ctx, fy, b.x + b.w - 16, b.y - 4 + Math.sin(t * 2.4) * 2, 1.4, t);
        }
    }

    /** One medallion in the row along the bottom, ringed when it's the fairy in view. */
    private medallion(
        fy: Fairy,
        locked: boolean,
        m: { x: number; y: number; r: number },
        on: boolean,
        t: number,
    ): void {
        const ctx = this.ctx;
        const lift = on ? -2 + Math.sin(t * 4) : 0;
        ctx.save();
        const g = ctx.createRadialGradient(m.x, m.y + lift - 4, 2, m.x, m.y + lift, m.r);
        g.addColorStop(0, locked ? '#3a3360' : fy.color);
        g.addColorStop(1, locked ? '#141030' : shade(fy.color, 0.3));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(m.x, m.y + lift, m.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();
        if (locked) {
            ctx.font = `12px ${ARCADE}`;
            ctx.fillStyle = 'rgba(255,226,122,0.85)';
            ctx.textAlign = 'center';
            ctx.fillText('?', m.x, m.y + lift + 4);
        } else drawFairy(ctx, fy, m.x, m.y + lift + 2, 0.75, t);
        ctx.restore();
        ctx.strokeStyle = on ? '#fff3c9' : '#a8894a';
        ctx.lineWidth = on ? 2.2 : 1.2;
        if (on) {
            ctx.save();
            ctx.shadowColor = fy.color;
            ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.arc(m.x, m.y + lift, m.r + (on ? 2 : 0), 0, Math.PI * 2);
        ctx.stroke();
        if (on) ctx.restore();
    }
}
