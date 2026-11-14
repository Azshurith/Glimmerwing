// The main menu (Play, Characters, Profile, Settings) and Play's choice of modes: a screen of cards.
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Layout, ModeMenu, ModeView, TitleAction } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { drawFairy } from '@/render/entities/fairy';
import { arcadeText, sparkle } from '@/render/draw';
import { drawTopBar } from './top-bar';
import { ARCADE, FONT } from '@/render/theme';
import { tallMenuFit } from './menu-fit';

/** A mode card and its tap target, in view units. */
export interface ModeCard {
    action: TitleAction;
    label: string;
    sub: string;
    /** Its accent colour. */
    color: string;
    /** Shown in grey with a Coming soon ribbon; picking it does nothing yet. */
    disabled?: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** The cards of each menu, in reading order: the main menu, and Play's choice of modes. */
const MENUS: Record<ModeMenu, Omit<ModeCard, 'x' | 'y' | 'w' | 'h'>[]> = {
    main: [
        { action: 'play', label: 'PLAY', sub: 'Story, VS CPU, online or two players', color: '#ffd45c' },
        { action: 'characters', label: 'CHARACTERS', sub: 'Meet the fairies and their skills', color: '#ff9ac8' },
        { action: 'profile', label: 'PROFILE', sub: 'Your record and unlocks', color: '#8fd8ff' },
        { action: 'settings', label: 'SETTINGS', sub: 'Screen and play options', color: '#c9b8ff' },
    ],
    play: [
        { action: 'story', label: 'STORY MODE', sub: 'Coming soon', color: '#ff9ac8', disabled: true },
        { action: 'cpu', label: 'VS CPU', sub: 'Battle the computer', color: '#ffd45c' },
        { action: 'online', label: 'ONLINE PLAY', sub: 'Find a rival or invite a friend', color: '#8fd8ff' },
        { action: 'versus', label: '2 PLAYERS', sub: 'Share a keyboard, pads or a tablet', color: '#8ff0a0' },
    ],
};
/** Each menu's heading. */
const HEADINGS: Record<ModeMenu, string> = { main: 'MAIN MENU', play: 'PLAY' };

/** How many cards to a row: two, so a menu's four cards make a square. */
export const modeColumns = (_layout: Layout) => 2;

/** Card size and spacing for each layout, in its design units. */
const GRID = {
    wide: { w: 196, h: 112, gx: 14, gy: 14, y0: 44, W: C.VIEW_W },
    tall: { w: 118, h: 150, gx: 8, gy: 12, y0: 80, W: C.TALL_W },
} as const;

/** Where a menu's cards sit in a layout's design units (the tall layout as designed, before fitting). */
function designCards(menu: ModeMenu, layout: Layout, dy = 0): ModeCard[] {
    const g = GRID[layout],
        cols = modeColumns(layout);
    const x0 = (g.W - (cols * g.w + (cols - 1) * g.gx)) / 2;
    return MENUS[menu].map((m, i) => ({
        ...m,
        x: x0 + (i % cols) * (g.w + g.gx),
        y: g.y0 + dy + Math.floor(i / cols) * (g.h + g.gy),
        w: g.w,
        h: g.h,
    }));
}

/** How far the tall screen's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A menu's cards for a layout and view height, in view units: also the tap targets. */
export function modeCards(menu: ModeMenu, layout: Layout, h: number = C.TALL_H): ModeCard[] {
    if (layout !== 'tall') return designCards(menu, 'wide');
    const f = tallMenuFit(h);
    return designCards(menu, 'tall', tallShift(f.h)).map(c => ({
        ...c,
        x: f.x + c.x * f.s,
        y: c.y * f.s,
        w: c.w * f.s,
        h: c.h * f.s,
    }));
}

/** The mode menu screen: a heading bar, the mode cards, and a hint line. */
export class ModeScreen {
    private backdrop: Backdrop;

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
    }

    /** Draw the screen; `bleed` is how far a widened landscape view reaches past each side. */
    draw(v: ModeView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        const ctx = this.ctx;
        ctx.save();
        let W: number = C.VIEW_W,
            H: number = C.VIEW_H,
            dy = 0;
        if (layout === 'tall') {
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
            this.backdrop.draw(t, C.VIEW_W / 2 + bleed, 160, C.VIEW_W + 2 * bleed, C.VIEW_H);
            ctx.restore();
        }
        drawTopBar(this.ctx, HEADINGS[v.menu], W, bleed, layout === 'tall', 16);
        designCards(v.menu, layout, dy).forEach((c, i) => this.card(c, i === v.index, t));
        // Hint line along the bottom.
        ctx.textAlign = 'center';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = 'rgba(203,188,245,0.75)';
        const hint = v.touch ? 'TAP TO CHOOSE  ·  ◀ BACK' : 'ARROWS CHOOSE  ·  ENTER OR Z PICKS  ·  ESC BACK';
        ctx.fillText(hint, W / 2, layout === 'tall' ? H - 16 : H - 14, W - 16);
        ctx.restore();
    }

    /** One mode card: a framed panel with its emblem, name and a line about it. */
    private card(c: ModeCard, on: boolean, t: number): void {
        const ctx = this.ctx;
        const lift = on && !c.disabled ? -3 + Math.sin(t * 4) : 0;
        const x = c.x,
            y = c.y + lift;
        ctx.save();
        if (c.disabled) {
            ctx.filter = 'grayscale(1)';
            ctx.globalAlpha = on ? 0.8 : 0.55;
        }
        // Panel.
        ctx.save();
        if (on) {
            ctx.shadowColor = c.color;
            ctx.shadowBlur = 16 + 5 * Math.sin(t * 6);
        }
        const g = ctx.createLinearGradient(0, y, 0, y + c.h);
        g.addColorStop(0, on ? 'rgba(52,32,104,0.96)' : 'rgba(30,20,68,0.9)');
        g.addColorStop(1, 'rgba(12,8,32,0.95)');
        ctx.fillStyle = g;
        roundRect(ctx, x, y, c.w, c.h, 8);
        ctx.fill();
        ctx.restore();
        ctx.strokeStyle = on ? c.color : 'rgba(201,162,74,0.6)';
        ctx.lineWidth = on ? 2 : 1;
        roundRect(ctx, x + 0.5, y + 0.5, c.w - 1, c.h - 1, 8);
        ctx.stroke();
        // Emblem, in a soft glow of the card's colour.
        const ex = x + c.w / 2,
            ey = y + c.h * 0.38;
        const glow = ctx.createRadialGradient(ex, ey, 2, ex, ey, c.h * 0.36);
        glow.addColorStop(0, hexA(c.color, on ? 0.35 : 0.18));
        glow.addColorStop(1, hexA(c.color, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(x, y, c.w, c.h * 0.75);
        this.emblem(c, ex, ey, Math.min(c.w, c.h) / 112, t, on);
        // Name and line.
        ctx.textAlign = 'center';
        ctx.font = `${on ? 12 : 11}px ${ARCADE}`;
        ctx.fillStyle = on ? '#fff7c2' : '#fff3c9';
        ctx.fillText(c.label, ex, y + c.h - 22, c.w - 12);
        ctx.font = `italic 600 7.5px ${FONT}`;
        ctx.fillStyle = 'rgba(203,188,245,0.8)';
        ctx.fillText(c.sub, ex, y + c.h - 10, c.w - 14);
        if (c.disabled) {
            // A "coming soon" ribbon across the top corner, trimmed to the card.
            ctx.save();
            roundRect(ctx, x, y, c.w, c.h, 8);
            ctx.clip();
            ctx.translate(x + c.w - 22, y + 16);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#444';
            ctx.fillRect(-34, -6, 68, 12);
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#ddd';
            ctx.fillText('SOON', 0, 2.5);
            ctx.restore();
        }
        ctx.restore();
    }

    /** The picture at the top of a card, centred on (x, y), at scale `k`. */
    private emblem(c: ModeCard, x: number, y: number, k: number, t: number, on: boolean): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        ctx.lineWidth = 2;
        ctx.strokeStyle = c.color;
        ctx.fillStyle = c.color;
        const bob = on ? Math.sin(t * 3) * 1.5 : 0;
        switch (c.action) {
            case 'story': {
                // An open book.
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.quadraticCurveTo(-14, -18, -28, -14);
                ctx.lineTo(-28, 16);
                ctx.quadraticCurveTo(-14, 12, 0, 18);
                ctx.quadraticCurveTo(14, 12, 28, 16);
                ctx.lineTo(28, -14);
                ctx.quadraticCurveTo(14, -18, 0, -12);
                ctx.closePath();
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -12);
                ctx.lineTo(0, 18);
                ctx.stroke();
                break;
            }
            case 'cpu': {
                // Pip facing a little chip-faced rival.
                drawFairy(ctx, FAIRIES[0], -20, 4 + bob, 1.2, t);
                ctx.fillStyle = '#2a1d55';
                ctx.fillRect(10, -12, 24, 22);
                ctx.strokeRect(10, -12, 24, 22);
                ctx.fillStyle = c.color;
                ctx.fillRect(15, -5, 4, 4);
                ctx.fillRect(25, -5, 4, 4);
                ctx.fillRect(16, 3, 12, 2);
                for (let i = 0; i < 3; i++) {
                    ctx.fillRect(13 + i * 7, 10, 2, 4);
                    ctx.fillRect(13 + i * 7, -16, 2, 4);
                }
                break;
            }
            case 'versus': {
                // Two fairies, face to face.
                drawFairy(ctx, FAIRIES[0], -24, 4 + bob, 1.2, t);
                drawFairy(ctx, FAIRIES[2] ?? FAIRIES[1], 24, 4 - bob, 1.2, t + 0.5);
                arcadeText(ctx, 'VS', 0, 6, 9, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
                break;
            }
            case 'play': {
                // Pip with a burst of stars around her.
                drawFairy(ctx, FAIRIES[0], 0, 4 + bob, 1.3, t);
                ctx.fillStyle = '#fff6c8';
                for (let i = 0; i < 5; i++) {
                    const a = t * 1.5 + (i * Math.PI * 2) / 5;
                    sparkle(ctx, Math.cos(a) * 26, Math.sin(a) * 16 - 2, 2.5 + Math.sin(t * 4 + i) * 1);
                }
                break;
            }
            case 'characters': {
                // Three fairies side by side.
                drawFairy(ctx, FAIRIES[1], -26, 6 - bob, 1.05, t + 0.3);
                drawFairy(ctx, FAIRIES[2], 26, 6 - bob, 1.05, t + 0.6);
                drawFairy(ctx, FAIRIES[0], 0, 2 + bob, 1.25, t);
                break;
            }
            case 'profile': {
                // A badge with a star.
                ctx.beginPath();
                ctx.arc(0, -2, 16, 0, Math.PI * 2);
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(-10, 12);
                ctx.lineTo(-14, 26);
                ctx.lineTo(-4, 20);
                ctx.moveTo(10, 12);
                ctx.lineTo(14, 26);
                ctx.lineTo(4, 20);
                ctx.stroke();
                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const a = -Math.PI / 2 + (i * Math.PI) / 5,
                        r = i % 2 ? 4 : 9;
                    ctx.lineTo(Math.cos(a) * r, -2 + Math.sin(a) * r);
                }
                ctx.closePath();
                ctx.fill();
                break;
            }
            case 'online': {
                // A globe, slowly turning.
                ctx.beginPath();
                ctx.arc(0, 0, 18, 0, Math.PI * 2);
                ctx.globalAlpha = 0.2;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.lineWidth = 1.2;
                for (let i = 0; i < 3; i++) {
                    const w = Math.abs(Math.cos(t * 0.8 + (i * Math.PI) / 3)) * 18;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, w, 18, 0, 0, Math.PI * 2);
                    ctx.stroke();
                }
                for (const ly of [-9, 0, 9]) {
                    const r = Math.sqrt(18 * 18 - ly * ly);
                    ctx.beginPath();
                    ctx.moveTo(-r, ly);
                    ctx.lineTo(r, ly);
                    ctx.stroke();
                }
                break;
            }
            case 'settings': {
                // A gear, turning.
                ctx.rotate(t * (on ? 0.8 : 0.25));
                ctx.beginPath();
                for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * Math.PI * 2,
                        r = i % 2 ? 13 : 18;
                    ctx.lineTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r);
                    ctx.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r);
                }
                ctx.closePath();
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, 6, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'guide':
            default: {
                // A question mark in a bubble.
                ctx.beginPath();
                ctx.arc(0, 0, 18, 0, Math.PI * 2);
                ctx.globalAlpha = 0.2;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                arcadeText(ctx, '?', 0, 9 + bob, 22, ['#ffffff', '#ffe0c8', c.color], 'center');
                break;
            }
        }
        ctx.restore();
        if (on) {
            ctx.fillStyle = '#fff6c8';
            const s = Math.max(0, Math.sin(t * 2.4));
            sparkle(ctx, x + 28 * k, y - 18 * k, 1.5 + 3 * s);
        }
    }
}

/** Trace a rounded rectangle. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

/** A #rrggbb colour with alpha `a`. */
function hexA(hex: string, a: number): string {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
