import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Mode, TitleView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { drawSprite } from '@/render/sprites';
import { ARCADE, FONT } from '@/render/theme';

/** The title menu, top to bottom; also the tap targets (view units). */
export const TITLE_BUTTONS: {
    mode: Mode;
    label: string;
    sub: string;
    x: number;
    y: number;
    w: number;
    h: number;
}[] = [
    { mode: 'cpu', label: 'VS CPU', sub: 'Battle the computer' },
    { mode: 'versus', label: '2 PLAYERS', sub: 'Share a keyboard, pads or a tablet' },
    { mode: 'online', label: 'ONLINE', sub: 'Find a rival or invite a friend' },
].map((b, i) => ({ ...b, mode: b.mode as Mode, x: 290, y: 106 + i * 44, w: 192, h: 36 }));

const LOGO_X = 386;

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

    /** Draw the whole screen. */
    draw(v: TitleView, t: number): void {
        this.backdrop.draw(t, 150, 170);
        this.heroArt(t);
        this.logo(t);
        this.menu(v, t);
        this.footer(v, t);
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

    /** Draw the GLIMMERWING logo. */
    private logo(t: number): void {
        const ctx = this.ctx;
        const y = 58 + Math.sin(t * 1.6) * 1.5;
        ctx.save();
        ctx.shadowColor = 'rgba(255,190,90,0.55)';
        ctx.shadowBlur = 18;
        arcadeText(ctx, 'GLIMMERWING', LOGO_X, y, 30, ['#fffbe0', '#ffd45c', '#ff8a2e'], 'center', 214);
        ctx.restore();
        // A shine sweeping across the letters every few seconds.
        const k = ((t * 0.45) % 1.8) - 0.4;
        if (k > -0.2 && k < 1.2) {
            ctx.save();
            ctx.font = `30px ${ARCADE}`;
            ctx.textAlign = 'center';
            const x0 = LOGO_X - 107,
                x1 = LOGO_X + 107;
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            const c = Math.min(0.98, Math.max(0.02, k));
            g.addColorStop(Math.max(0, c - 0.08), 'rgba(255,255,255,0)');
            g.addColorStop(c, 'rgba(255,255,255,0.85)');
            g.addColorStop(Math.min(1, c + 0.08), 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = g;
            ctx.fillText('GLIMMERWING', LOGO_X, y, 214);
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
            if (s > 0.05) sparkle(ctx, LOGO_X + dx, y + dy, 2 + 4 * s);
        }
        // Strapline between gold rules.
        ctx.font = `8px ${ARCADE}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#e6d6ff';
        ctx.fillText('A MEADOW VERSUS SHOOTER', LOGO_X, y + 22);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(LOGO_X - 104, y + 19, 30, 1);
        ctx.fillRect(LOGO_X + 74, y + 19, 30, 1);
    }

    // ---- menu -----------------------------------------------------------------------

    /** Draw the menu buttons, highlighting the selected one. */
    private menu(v: TitleView, t: number): void {
        const ctx = this.ctx;
        TITLE_BUTTONS.forEach((b, i) => {
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
    private footer(v: TitleView, t: number): void {
        const ctx = this.ctx;
        // Blinking call to action.
        const blink = Math.floor(t * 2.2) % 2 === 0;
        if (blink)
            arcadeText(
                ctx,
                v.touch ? 'TAP A MODE TO PLAY' : 'PRESS START',
                LOGO_X,
                254,
                13,
                ['#ffffff', '#fff3a0', '#ffb43c'],
                'center',
            );
        if (!v.touch) {
            ctx.font = `7px ${ARCADE}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            ctx.fillText('UP / DOWN CHOOSE  ·  ENTER OR Z PLAYS  ·  1 2 3 QUICK START', LOGO_X, 270);
        }
        // Bottom bar with this browser's record.
        const g = ctx.createLinearGradient(0, C.VIEW_H - 20, 0, C.VIEW_H);
        g.addColorStop(0, 'rgba(10,6,28,0.6)');
        g.addColorStop(1, 'rgba(10,6,28,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(0, C.VIEW_H - 20, C.VIEW_W, 20);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(0, C.VIEW_H - 20, C.VIEW_W, 1);
        ctx.font = `8px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.textAlign = 'center';
        const stats = [`FAIRIES  ${v.unlocked}/${v.total}`, `WINS  ${v.wins}`, `BEST CHAIN  ${v.bestChain}`];
        stats.forEach((s, i) => ctx.fillText(s, C.VIEW_W * (0.2 + i * 0.3), C.VIEW_H - 7));
    }
}
