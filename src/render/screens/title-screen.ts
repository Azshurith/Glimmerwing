import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Layout, Mode, TitleView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { drawSprite } from '@/render/sprites';
import { ARCADE, FONT } from '@/render/theme';

/** A title menu entry and its tap target, in view units. */
interface TitleButton {
    mode: Mode;
    label: string;
    sub: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

const MENU: { mode: Mode; label: string; sub: string }[] = [
    { mode: 'cpu', label: 'VS CPU', sub: 'Battle the computer' },
    { mode: 'versus', label: '2 PLAYERS', sub: 'Share a keyboard, pads or a tablet' },
    { mode: 'online', label: 'ONLINE', sub: 'Find a rival or invite a friend' },
];
const WIDE_BUTTONS: TitleButton[] = MENU.map((b, i) => ({ ...b, x: 290, y: 106 + i * 44, w: 192, h: 36 }));
/** In the tall layout the menu stacks under the hero and the logo, shifted down `dy` on longer screens. */
function tallButtons(dy: number): TitleButton[] {
    return MENU.map((b, i) => ({ ...b, x: 40, y: 346 + dy + i * 50, w: 192, h: 40 }));
}

/** How far the tall title's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** The title menu, top to bottom, for a layout and view height; also the tap targets (view units). */
export function titleButtons(layout: Layout, h: number = C.TALL_H): TitleButton[] {
    return layout === 'tall' ? tallButtons(tallShift(h)) : WIDE_BUTTONS;
}

const LOGO_X = 386;
/** Where the tall layout puts things: the hero's height, the logo, the call to action. */
const TALL = { heroH: 290, logoY: 300, ctaY: 514 } as const;

/** The title screen: hero art, logo, menu and footer. */
export class TitleScreen {
    private backdrop: Backdrop;
    /** The hero portrait, pre-faded into the scene on its right and bottom edges. */
    private hero: HTMLCanvasElement | null = null;
    private motes: { x: number; y: number; s: number; p: number }[] = [];

    constructor(private ctx: CanvasRenderingContext2D) {
        this.backdrop = new Backdrop(ctx);
        for (let i = 0; i < 24; i++)
            this.motes.push({
                x: Math.random() * 260,
                y: Math.random() * C.VIEW_H,
                s: 0.5 + Math.random(),
                p: Math.random() * 6,
            });
    }

    /** Draw the whole screen, side by side (wide) or stacked for a portrait screen (tall). */
    draw(v: TitleView, t: number, layout: Layout = 'wide', h: number = C.TALL_H): void {
        if (layout === 'tall') {
            const W = C.TALL_W,
                dy = tallShift(h);
            this.backdrop.draw(t, W / 2, 170 + dy, W, h);
            this.ctx.save();
            this.ctx.translate(0, dy);
            this.heroArtTall(t);
            this.logo(t, W / 2, TALL.logoY, 24);
            this.ctx.restore();
            this.menu(v, t, tallButtons(dy));
            this.footer(v, t, W / 2, TALL.ctaY + dy, W, h);
            return;
        }
        this.backdrop.draw(t, 150, 170);
        this.heroArt(t);
        this.logo(t);
        this.menu(v, t, WIDE_BUTTONS);
        this.footer(v, t);
    }

    /** The tall layout's hero: the portrait centred across the top, glitter around her. */
    private heroArtTall(t: number): void {
        const ctx = this.ctx;
        const hero = this.heroCanvas();
        const H = TALL.heroH;
        if (hero) {
            const w = (hero.width / hero.height) * H;
            // Her left edge isn't faded, so keep it off-screen; the right edge fades into the scene.
            ctx.drawImage(hero, -14 + Math.sin(t * 0.5) * 3, Math.sin(t * 0.7) * 2, w, H);
        } else {
            const pip = FAIRIES[0];
            if (pip.sprite)
                drawSprite(
                    ctx,
                    pip.sprite,
                    { anim: 'idle', frame: Math.floor(t * 6) % 4, alpha: 1 },
                    C.TALL_W / 2,
                    160 + Math.sin(t * 2) * 4,
                    2.6,
                );
        }
        ctx.fillStyle = '#ffe7a0';
        for (const m of this.motes) {
            const y = (m.y - t * 14 * m.s + H * 10) % H;
            ctx.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 2 + m.p));
            sparkle(ctx, m.x + Math.sin(t + m.p) * 6, y, 1.5 + m.s * 1.5);
        }
        ctx.globalAlpha = 1;
    }

    // ---- hero art -------------------------------------------------------------------

    /** Draw the hero portrait on the left. */
    private heroArt(t: number): void {
        const ctx = this.ctx;
        const hero = this.heroCanvas();
        const H = C.VIEW_H + 8;
        if (hero) {
            const w = (hero.width / hero.height) * H;
            // A slow breathing drift, like an attract screen.
            ctx.drawImage(hero, -18 + Math.sin(t * 0.5) * 3, -4 + Math.sin(t * 0.7) * 2, w, H);
        } else {
            // No portrait art: her in-game sprite, large.
            const pip = FAIRIES[0];
            if (pip.sprite)
                drawSprite(
                    ctx,
                    pip.sprite,
                    { anim: 'idle', frame: Math.floor(t * 6) % 4, alpha: 1 },
                    130,
                    170 + Math.sin(t * 2) * 4,
                    2.6,
                );
        }
        // Glitter rising off the portrait.
        ctx.fillStyle = '#ffe7a0';
        for (const m of this.motes) {
            const y = (m.y - t * 14 * m.s + C.VIEW_H * 10) % C.VIEW_H;
            ctx.globalAlpha = 0.25 + 0.45 * Math.abs(Math.sin(t * 2 + m.p));
            sparkle(ctx, m.x + Math.sin(t + m.p) * 6, y, 1.5 + m.s * 1.5);
        }
        ctx.globalAlpha = 1;
    }

    /** The hero portrait faded into the scene, built once the image has loaded. */
    private heroCanvas(): HTMLCanvasElement | null {
        if (this.hero) return this.hero;
        const p = FAIRIES[0].portrait;
        if (!p || !p.img.complete || !p.img.naturalWidth) return null;
        const [sx, sy, sw, sh] = p.panel;
        const c = document.createElement('canvas');
        c.width = sw;
        c.height = sh;
        const g = c.getContext('2d')!;
        g.drawImage(p.img, sx, sy, sw, sh, 0, 0, sw, sh);
        // Fade the right and bottom edges to nothing, so she stands in the scene rather than in a box.
        g.globalCompositeOperation = 'destination-in';
        const fx = g.createLinearGradient(0, 0, sw, 0);
        fx.addColorStop(0, 'rgba(0,0,0,1)');
        fx.addColorStop(0.62, 'rgba(0,0,0,1)');
        fx.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fx;
        g.fillRect(0, 0, sw, sh);
        const fy = g.createLinearGradient(0, 0, 0, sh);
        fy.addColorStop(0, 'rgba(0,0,0,1)');
        fy.addColorStop(0.78, 'rgba(0,0,0,1)');
        fy.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = fy;
        g.fillRect(0, 0, sw, sh);
        this.hero = c;
        return c;
    }

    // ---- logo -----------------------------------------------------------------------

    /** Draw the GLIMMERWING logo centred on `cx` (size 30 in the wide layout). */
    private logo(t: number, cx = LOGO_X, y0 = 58, size = 30): void {
        const ctx = this.ctx;
        const lx = cx,
            k30 = size / 30;
        const y = y0 + Math.sin(t * 1.6) * 1.5;
        ctx.save();
        ctx.shadowColor = 'rgba(255,190,90,0.55)';
        ctx.shadowBlur = 18;
        arcadeText(ctx, 'GLIMMERWING', lx, y, size, ['#fffbe0', '#ffd45c', '#ff8a2e'], 'center', 214 * k30);
        ctx.restore();
        // A shine sweeping across the letters every few seconds.
        const k = ((t * 0.45) % 1.8) - 0.4;
        if (k > -0.2 && k < 1.2) {
            ctx.save();
            ctx.font = `${size}px ${ARCADE}`;
            ctx.textAlign = 'center';
            const x0 = lx - 107 * k30,
                x1 = lx + 107 * k30;
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            const c = Math.min(0.98, Math.max(0.02, k));
            g.addColorStop(Math.max(0, c - 0.08), 'rgba(255,255,255,0)');
            g.addColorStop(c, 'rgba(255,255,255,0.85)');
            g.addColorStop(Math.min(1, c + 0.08), 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = g;
            ctx.fillText('GLIMMERWING', lx, y, 214 * k30);
            ctx.restore();
        }
        // Twinkles at the logo's corners.
        ctx.fillStyle = '#fff6c8';
        for (const [dx, dy, ph] of [
            [-112, -24, 0],
            [110, -6, 2.1],
            [96, -30, 4.2],
        ] as const) {
            const s = Math.max(0, Math.sin(t * 2.4 + ph));
            if (s > 0.05) sparkle(ctx, lx + dx * k30, y + dy * k30, 2 + 4 * s);
        }
        // Strapline between gold rules.
        ctx.font = `8px ${ARCADE}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e6d6ff';
        ctx.fillText('A MEADOW VERSUS SHOOTER', lx, y + 22);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(lx - 104 * k30, y + 19, 30 * k30, 1);
        ctx.fillRect(lx + 74 * k30, y + 19, 30 * k30, 1);
    }

    // ---- menu -----------------------------------------------------------------------

    /** Draw the menu buttons, highlighting the selected one. */
    private menu(v: TitleView, t: number, buttons: TitleButton[]): void {
        const ctx = this.ctx;
        buttons.forEach((b, i) => {
            const on = i === v.index;
            const x = b.x - (on ? 8 : 0);
            const bar = slanted(x, b.y, b.w, b.h, 10);
            ctx.save();
            if (on) {
                ctx.shadowColor = '#ffb43c';
                ctx.shadowBlur = 14 + 4 * Math.sin(t * 6);
                const g = ctx.createLinearGradient(x, 0, x + b.w, 0);
                g.addColorStop(0, '#fff0a8');
                g.addColorStop(0.5, '#ffd45c');
                g.addColorStop(1, '#ff9a2e');
                ctx.fillStyle = g;
            } else {
                ctx.fillStyle = 'rgba(20,12,48,0.82)';
            }
            bar(ctx);
            ctx.fill();
            ctx.restore();
            ctx.strokeStyle = on ? '#fffbe0' : 'rgba(201,162,74,0.7)';
            ctx.lineWidth = on ? 1.6 : 1;
            bar(ctx);
            ctx.stroke();
            // Number tag for keys, on the bar's left.
            if (!v.touch) {
                ctx.font = `9px ${ARCADE}`;
                ctx.textAlign = 'center';
                ctx.fillStyle = on ? 'rgba(42,15,46,0.55)' : 'rgba(201,188,245,0.45)';
                ctx.fillText(String(i + 1), x + b.w - 14, b.y + b.h / 2 + 4);
            }
            ctx.textAlign = 'left';
            ctx.font = `${on ? 15 : 13}px ${ARCADE}`;
            ctx.fillStyle = on ? '#2a0f2e' : '#fff3c9';
            ctx.fillText(b.label, x + 18, b.y + 18);
            ctx.font = `italic 600 8.5px ${FONT}`;
            ctx.fillStyle = on ? 'rgba(70,25,20,0.85)' : 'rgba(203,188,245,0.7)';
            ctx.fillText(b.sub, x + 16, b.y + 30, b.w - 34);
            // Bouncing pointer.
            if (on) {
                const ax = x - 10 + Math.sin(t * 9) * 2.5,
                    ay = b.y + b.h / 2;
                ctx.fillStyle = '#ffd45c';
                ctx.strokeStyle = '#2a0f2e';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax - 9, ay - 7);
                ctx.lineTo(ax - 9, ay + 7);
                ctx.closePath();
                ctx.stroke();
                ctx.fill();
            }
        });
    }

    // ---- footer ---------------------------------------------------------------------

    /** Draw the blinking call to action, the controls line and this browser's record. */
    private footer(v: TitleView, t: number, cx = LOGO_X, ctaY = 254, W: number = C.VIEW_W, H: number = C.VIEW_H): void {
        const ctx = this.ctx;
        const tall = W !== C.VIEW_W;
        // Blinking call to action.
        const blink = Math.floor(t * 2.2) % 2 === 0;
        if (blink)
            arcadeText(
                ctx,
                v.touch ? 'TAP A MODE TO PLAY' : 'PRESS START',
                cx,
                ctaY,
                tall ? 11 : 13,
                ['#ffffff', '#fff3a0', '#ffb43c'],
                'center',
            );
        if (!v.touch) {
            ctx.font = `7px ${ARCADE}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            ctx.fillText('UP / DOWN CHOOSE  ·  ENTER OR Z PLAYS  ·  1 2 3 QUICK START', cx, ctaY + 16, W - 16);
        }
        // Bottom bar with this browser's record.
        const g = ctx.createLinearGradient(0, H - 20, 0, H);
        g.addColorStop(0, 'rgba(10,6,28,0.6)');
        g.addColorStop(1, 'rgba(10,6,28,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(0, H - 20, W, 20);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(0, H - 20, W, 1);
        ctx.font = `${tall ? 6.5 : 8}px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.textAlign = 'center';
        const stats = [`FAIRIES  ${v.unlocked}/${v.total}`, `WINS  ${v.wins}`, `BEST CHAIN  ${v.bestChain}`];
        stats.forEach((s, i) => ctx.fillText(s, W * (0.18 + i * 0.32), H - 7));
    }
}
