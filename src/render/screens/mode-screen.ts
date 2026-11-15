// The main menu (Play, Characters, Maps, Profile, Settings) and Play's choice of modes: a screen of cards.
import * as C from '@/core/config';
import type { Layout, ModeMenu, ModeView, TitleAction } from '@/types';
import { Backdrop } from '@/render/backdrop';
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
        { action: 'maps', label: 'MAPS', sub: 'Stages, formations and monsters', color: '#8ff0a0' },
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

/** How many cards to a row: the whole menu in one row on a landscape screen, one card per row on a phone. */
export const modeColumns = (layout: Layout, menu: ModeMenu = 'play') => (layout === 'wide' ? MENUS[menu].length : 1);

/**
 * Card size and spacing for each layout, in its design units: tall cards side by side on a landscape screen, and
 * full-width buttons stacked down a phone. Every card in every menu is the same size, so the menus look alike.
 */
const GRID = {
    wide: { w: 88, h: 214, gap: 9, y0: 50, W: C.VIEW_W },
    tall: { w: 236, h: 70, gap: 10, y0: 62, W: C.TALL_W },
} as const;

/** Where a menu's cards sit in a layout's design units (the tall layout as designed, before fitting). */
function designCards(menu: ModeMenu, layout: Layout, dy = 0): ModeCard[] {
    const g = GRID[layout],
        n = MENUS[menu].length;
    if (layout === 'wide') {
        const x0 = (g.W - (n * g.w + (n - 1) * g.gap)) / 2;
        return MENUS[menu].map((m, i) => ({ ...m, x: x0 + i * (g.w + g.gap), y: g.y0, w: g.w, h: g.h }));
    }
    const x0 = (g.W - g.w) / 2;
    return MENUS[menu].map((m, i) => ({ ...m, x: x0, y: g.y0 + dy + i * (g.h + g.gap), w: g.w, h: g.h }));
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

    /**
     * One card, the same for every choice: a framed panel with its emblem on a round badge in its colour, its name
     * and a line about it, and a stripe of its colour along the edge. Tall cards stack the three; a phone's
     * wide buttons put the badge on the left and the words beside it. The chosen card lifts and glows.
     */
    private card(c: ModeCard, on: boolean, t: number): void {
        const ctx = this.ctx;
        const row = c.w > c.h * 2;
        const lift = on && !c.disabled ? -2 + Math.sin(t * 4) * (row ? 0.5 : 1) : 0;
        const x = c.x + (row && on && !c.disabled ? 2 : 0),
            y = c.y + lift;
        const r = 10;
        ctx.save();
        if (c.disabled) {
            ctx.filter = 'grayscale(1)';
            ctx.globalAlpha = on ? 0.8 : 0.55;
        }
        // Panel, with a glow in its colour when chosen.
        ctx.save();
        if (on) {
            ctx.shadowColor = c.color;
            ctx.shadowBlur = 14 + 4 * Math.sin(t * 6);
        }
        const g = ctx.createLinearGradient(0, y, 0, y + c.h);
        g.addColorStop(0, on ? 'rgba(56,34,110,0.97)' : 'rgba(32,22,72,0.92)');
        g.addColorStop(1, on ? 'rgba(22,12,52,0.97)' : 'rgba(12,8,32,0.94)');
        ctx.fillStyle = g;
        roundRect(ctx, x, y, c.w, c.h, r);
        ctx.fill();
        ctx.restore();
        ctx.save();
        roundRect(ctx, x, y, c.w, c.h, r);
        ctx.clip();
        // A soft wash of its colour behind the badge, and its stripe along the bottom (or the left on a phone).
        const bx = row ? x + 38 : x + c.w / 2,
            by = row ? y + c.h / 2 : y + 72;
        const wash = ctx.createRadialGradient(bx, by, 4, bx, by, row ? 70 : 80);
        wash.addColorStop(0, hexA(c.color, on ? 0.3 : 0.14));
        wash.addColorStop(1, hexA(c.color, 0));
        ctx.fillStyle = wash;
        ctx.fillRect(x, y, c.w, c.h);
        ctx.fillStyle = hexA(c.color, on ? 1 : 0.7);
        if (row) ctx.fillRect(x, y, 4, c.h);
        else ctx.fillRect(x, y + c.h - 4, c.w, 4);
        // A sheen across the top.
        const sh = ctx.createLinearGradient(0, y, 0, y + 18);
        sh.addColorStop(0, 'rgba(255,255,255,0.12)');
        sh.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sh;
        ctx.fillRect(x, y, c.w, 18);
        ctx.restore();
        ctx.strokeStyle = on ? c.color : 'rgba(201,162,74,0.55)';
        ctx.lineWidth = on ? 2 : 1;
        roundRect(ctx, x + 0.5, y + 0.5, c.w - 1, c.h - 1, r);
        ctx.stroke();
        // The badge and its emblem.
        const br = row ? 24 : 30;
        this.badge(c, bx, by, br, on, t);
        this.emblem(c, bx, by, br / 34, t, on);
        // Name and line.
        if (row) {
            ctx.textAlign = 'left';
            ctx.font = `${on ? 13 : 12}px ${ARCADE}`;
            ctx.fillStyle = on ? '#fff7c2' : '#fff3c9';
            ctx.fillText(c.label, x + 74, y + 32, c.w - 100);
            ctx.font = `italic 600 8.5px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.85)';
            ctx.fillText(c.sub, x + 74, y + 48, c.w - 100);
            // A chevron at the right edge.
            ctx.strokeStyle = on ? c.color : 'rgba(203,188,245,0.5)';
            ctx.lineWidth = 2;
            const cx = x + c.w - 16 + (on ? Math.sin(t * 6) * 1.5 : 0);
            ctx.beginPath();
            ctx.moveTo(cx - 4, y + c.h / 2 - 7);
            ctx.lineTo(cx + 3, y + c.h / 2);
            ctx.lineTo(cx - 4, y + c.h / 2 + 7);
            ctx.stroke();
        } else {
            ctx.textAlign = 'center';
            ctx.font = `${on ? 11 : 10}px ${ARCADE}`;
            ctx.fillStyle = on ? '#fff7c2' : '#fff3c9';
            ctx.fillText(c.label, x + c.w / 2, y + 136, c.w - 8);
            // A short rule, then the line about it, wrapped to the card.
            ctx.fillStyle = hexA(c.color, 0.6);
            ctx.fillRect(x + c.w / 2 - 12, y + 144, 24, 1.5);
            ctx.font = `italic 600 8px ${FONT}`;
            ctx.fillStyle = 'rgba(203,188,245,0.85)';
            wrap(ctx, c.sub, c.w - 14).forEach((line, i) => ctx.fillText(line, x + c.w / 2, y + 160 + i * 11));
        }
        if (c.disabled) {
            // A "coming soon" ribbon across the top corner, trimmed to the card.
            ctx.save();
            roundRect(ctx, x, y, c.w, c.h, r);
            ctx.clip();
            ctx.translate(x + c.w - 18, y + 14);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = '#444';
            ctx.fillRect(-34, -6, 68, 12);
            ctx.textAlign = 'center';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = '#ddd';
            ctx.fillText('SOON', 0, 2.5);
            ctx.restore();
        }
        ctx.restore();
    }

    /** The round badge an emblem sits on: a disc in the card's colour with a gold ring, brighter when chosen. */
    private badge(c: ModeCard, x: number, y: number, r: number, on: boolean, t: number): void {
        const ctx = this.ctx;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 2, x, y, r);
        g.addColorStop(0, hexA(c.color, on ? 0.75 : 0.5));
        g.addColorStop(0.7, hexA(c.color, on ? 0.35 : 0.22));
        g.addColorStop(1, 'rgba(20,12,48,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = on ? '#ffd86b' : 'rgba(201,162,74,0.8)';
        ctx.lineWidth = on ? 2 + Math.sin(t * 6) * 0.3 : 1.5;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, r - 4, Math.PI * 1.1, Math.PI * 1.65);
        ctx.stroke();
    }

    /** The picture at the top of a card, centred on (x, y), at scale `k`. */
    private emblem(c: ModeCard, x: number, y: number, k: number, t: number, on: boolean): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(k, k);
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Every emblem is a simple line picture in cream, so the badges read as one set.
        const ink = '#fff6dc';
        ctx.strokeStyle = ink;
        ctx.fillStyle = ink;
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
                // A little robot face with an antenna.
                ctx.beginPath();
                roundRect(ctx, -15, -10 + bob, 30, 24, 6);
                ctx.globalAlpha = 0.25;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(0, -10 + bob);
                ctx.lineTo(0, -17 + bob);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, -19 + bob, 2.5, 0, Math.PI * 2);
                ctx.fill();
                const blink = Math.sin(t * 2.3) > 0.95 ? 0.6 : 4;
                ctx.fillRect(-9, -2 + bob, 5, blink);
                ctx.fillRect(4, -2 + bob, 5, blink);
                ctx.fillRect(-6, 7 + bob, 12, 2);
                ctx.fillRect(-19, -2 + bob, 4, 8);
                ctx.fillRect(15, -2 + bob, 4, 8);
                break;
            }
            case 'versus': {
                // Two crossed wands with star tips.
                for (const sgn of [-1, 1]) {
                    ctx.save();
                    ctx.rotate(sgn * 0.75 + (on ? sgn * Math.sin(t * 4) * 0.06 : 0));
                    ctx.beginPath();
                    ctx.moveTo(0, 18);
                    ctx.lineTo(0, -8);
                    ctx.stroke();
                    star(ctx, 0, -13, 7, 3.2);
                    ctx.fill();
                    ctx.restore();
                }
                break;
            }
            case 'play': {
                // A play triangle with stars circling it.
                ctx.beginPath();
                ctx.moveTo(-8, -14);
                ctx.lineTo(14, 0);
                ctx.lineTo(-8, 14);
                ctx.closePath();
                ctx.globalAlpha = 0.3;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                for (let i = 0; i < 3; i++) {
                    const a = t * 1.4 + (i * Math.PI * 2) / 3;
                    sparkle(ctx, Math.cos(a) * 21, Math.sin(a) * 21, 2 + Math.sin(t * 4 + i) * 0.8);
                }
                break;
            }
            case 'characters': {
                // A fairy: head, body and two pairs of wings.
                ctx.save();
                ctx.translate(0, bob);
                for (const sgn of [-1, 1]) {
                    ctx.beginPath();
                    ctx.ellipse(sgn * 11, -4, 9, 6, sgn * -0.5, 0, Math.PI * 2);
                    ctx.globalAlpha = 0.25;
                    ctx.fill();
                    ctx.globalAlpha = 1;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.ellipse(sgn * 8, 8, 6, 4, sgn * 0.5, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.beginPath();
                ctx.arc(0, -12, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(0, -6);
                ctx.lineTo(-4, 14);
                ctx.lineTo(4, 14);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
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
            case 'maps': {
                // A folded map with a dotted route to a pin, bobbing.
                ctx.beginPath();
                ctx.moveTo(-18, -12);
                ctx.lineTo(-6, -16);
                ctx.lineTo(6, -12);
                ctx.lineTo(18, -16);
                ctx.lineTo(18, 12);
                ctx.lineTo(6, 16);
                ctx.lineTo(-6, 12);
                ctx.lineTo(-18, 16);
                ctx.closePath();
                ctx.globalAlpha = 0.22;
                ctx.fill();
                ctx.globalAlpha = 1;
                ctx.stroke();
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(-6, -16);
                ctx.lineTo(-6, 12);
                ctx.moveTo(6, -12);
                ctx.lineTo(6, 16);
                ctx.stroke();
                ctx.setLineDash([2, 2]);
                ctx.beginPath();
                ctx.moveTo(-13, 9);
                ctx.quadraticCurveTo(-2, 8, 0, -1);
                ctx.quadraticCurveTo(3, -7, 10, -5);
                ctx.stroke();
                ctx.setLineDash([]);
                const py = -9 + Math.sin(t * 3) * (on ? 2 : 0.6);
                ctx.lineWidth = 1.6;
                ctx.beginPath();
                ctx.arc(10, py - 4, 4, Math.PI * 0.85, Math.PI * 0.15);
                ctx.lineTo(10, py + 4);
                ctx.closePath();
                ctx.stroke();
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

/** Trace a five-pointed star of outer radius `r` and inner radius `ri` centred on (x, y). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, ri: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
            d = i % 2 ? ri : r;
        ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
}

/** Split `text` into lines no wider than `w` in the current font (at most three). */
function wrap(ctx: CanvasRenderingContext2D, text: string, w: number): string[] {
    const words = text.split(' '),
        lines: string[] = [];
    let cur = '';
    for (const word of words) {
        const next = cur ? `${cur} ${word}` : word;
        if (cur && ctx.measureText(next).width > w) {
            lines.push(cur);
            cur = word;
        } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 3);
}
