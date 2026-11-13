import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Layout, TitleAction, TitleStage, TitleView } from '@/types';
import { Backdrop } from '@/render/backdrop';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { drawSprite } from '@/render/sprites';
import { tallMenuFit } from './menu-fit';
import { ARCADE, FONT } from '@/render/theme';

/** A title menu entry and its tap target, in view units. */
interface TitleButton {
    action: TitleAction;
    label: string;
    sub: string;
    /** Shown greyed out, and picking it does nothing yet. */
    disabled?: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** A menu entry before it's placed. */
type Entry = Omit<TitleButton, 'x' | 'y' | 'w' | 'h'>;

/** Each title screen's entries: the opening screen's sign-in choices, and the mode menu. */
const MENUS: Record<TitleStage, Entry[]> = {
    start: [
        { action: 'google', label: 'SIGN IN WITH GOOGLE', sub: 'Coming soon', disabled: true },
        { action: 'guest', label: 'PLAY AS GUEST', sub: 'Progress is saved in this browser' },
    ],
    modes: [
        { action: 'story', label: 'STORY MODE', sub: 'Coming soon', disabled: true },
        { action: 'cpu', label: 'VS CPU', sub: 'Battle the computer' },
        { action: 'versus', label: '2 PLAYERS', sub: 'Share a keyboard, pads or a tablet' },
        { action: 'online', label: 'ONLINE PLAY', sub: 'Find a rival or invite a friend' },
        { action: 'settings', label: 'SETTINGS', sub: 'Screen and play options' },
        { action: 'guide', label: 'HOW TO PLAY', sub: 'Rules, controls and fairies' },
    ],
};
/** Where the entries sit in the wide layout: two roomy bars to start, then the mode menu's six compact ones. */
function wideButtons(stage: TitleStage): TitleButton[] {
    return stage === 'start'
        ? MENUS.start.map((b, i) => ({ ...b, x: 290, y: 132 + i * 44, w: 192, h: 36 }))
        : MENUS.modes.map((b, i) => ({ ...b, x: 290, y: 90 + i * 33, w: 192, h: 28 }));
}
/** In the tall layout the menu stacks under the hero and the logo, shifted down `dy` on longer screens. */
function tallButtons(stage: TitleStage, dy: number): TitleButton[] {
    return stage === 'start'
        ? MENUS.start.map((b, i) => ({ ...b, x: 40, y: 360 + dy + i * 50, w: 192, h: 40 }))
        : MENUS.modes.map((b, i) => ({ ...b, x: 40, y: 326 + dy + i * 34, w: 192, h: 30 }));
}

/** How far the tall title's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** A title screen's menu, top to bottom, for a layout and view height; also the tap targets (view units). */
export function titleButtons(stage: TitleStage, layout: Layout, h: number = C.TALL_H): TitleButton[] {
    if (layout !== 'tall') return wideButtons(stage);
    const f = tallMenuFit(h);
    return tallButtons(stage, tallShift(f.h)).map(b => ({
        ...b,
        x: f.x + b.x * f.s,
        y: b.y * f.s,
        w: b.w * f.s,
        h: b.h * f.s,
    }));
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
    /** How far past each side edge full-width art reaches this frame (see menu-fit.ts). */
    private bleed = 0;

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

    /**
     * Draw the whole screen, side by side (wide) or stacked for a portrait screen (tall). `bleed` is how far a
     * widened landscape view reaches past each side of the usual one.
     */
    draw(v: TitleView, t: number, layout: Layout = 'wide', h: number = C.TALL_H, bleed = 0): void {
        if (layout === 'tall') {
            const W = C.TALL_W,
                f = tallMenuFit(h),
                dy = tallShift(f.h);
            this.backdrop.draw(t, W / 2, (170 + dy) * f.s, W, h);
            const ctx = this.ctx;
            this.bleed = f.bleed;
            ctx.save();
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            ctx.save();
            ctx.translate(0, dy);
            this.heroArtTall(t);
            this.logo(t, W / 2, TALL.logoY, 24);
            ctx.restore();
            this.menu(v, t, tallButtons(v.stage, dy));
            this.footer(v, t, W / 2, TALL.ctaY + dy, W, f.h);
            ctx.restore();
            this.bleed = 0;
            return;
        }
        // A widened landscape view: the sky and the footer bar reach `bleed` past each side, and the hero stays
        // against the left edge of the screen.
        this.bleed = bleed;
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(-bleed, 0);
        this.backdrop.draw(t, 150 + bleed, 170, C.VIEW_W + 2 * bleed, C.VIEW_H);
        ctx.restore();
        this.heroArt(t);
        this.logo(t);
        this.menu(v, t, wideButtons(v.stage));
        this.footer(v, t);
        this.bleed = 0;
    }

    /** The tall layout's hero: the portrait centred across the top, glitter around her. */
    private heroArtTall(t: number): void {
        const ctx = this.ctx;
        const hero = this.heroCanvas();
        const H = TALL.heroH;
        if (hero) {
            const w = (hero.width / hero.height) * H;
            // Her left edge isn't faded, so keep it off-screen; the right edge fades into the scene.
            ctx.drawImage(hero, -14 - this.bleed + Math.sin(t * 0.5) * 3, Math.sin(t * 0.7) * 2, w, H);
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
            ctx.drawImage(hero, -18 - this.bleed + Math.sin(t * 0.5) * 3, -4 + Math.sin(t * 0.7) * 2, w, H);
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
        if (k >= 0 && k <= 1) {
            ctx.save();
            ctx.font = `${size}px ${ARCADE}`;
            ctx.textAlign = 'center';
            // Sweep across the letters as they're actually drawn: the text can come out narrower than its
            // 214-unit cap, and a band clamped to the cap's ends would stall over the last letters and vanish.
            const w = Math.min(214 * k30, ctx.measureText('GLIMMERWING').width),
                band = w * 0.09;
            const px = lx - w / 2 - band + k * (w + 2 * band);
            const g = ctx.createLinearGradient(px - band, 0, px + band, 0);
            g.addColorStop(0, 'rgba(255,255,255,0)');
            g.addColorStop(0.5, 'rgba(255,255,255,0.85)');
            g.addColorStop(1, 'rgba(255,255,255,0)');
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
            const compact = b.h < 34;
            const x = b.x - (on ? 8 : 0);
            const bar = slanted(x, b.y, b.w, b.h, compact ? 8 : 10);
            ctx.save();
            // Not ready yet: greyed out, whether or not the cursor is on it.
            if (b.disabled) {
                ctx.filter = 'grayscale(1)';
                ctx.globalAlpha = on ? 0.75 : 0.5;
            }
            ctx.save();
            if (on) {
                ctx.shadowColor = b.disabled ? '#9a9a9a' : '#ffb43c';
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
            // Number tag for keys, on the bar's right.
            if (!v.touch) {
                ctx.font = `${compact ? 8 : 9}px ${ARCADE}`;
                ctx.textAlign = 'center';
                ctx.fillStyle = on ? 'rgba(42,15,46,0.55)' : 'rgba(201,188,245,0.45)';
                ctx.fillText(String(i + 1), x + b.w - 14, b.y + b.h / 2 + 4);
            }
            ctx.textAlign = 'left';
            if (compact) {
                // One line: the label, with the description small beside it on the bar.
                ctx.font = `${on ? 12 : 11}px ${ARCADE}`;
                ctx.fillStyle = on ? '#2a0f2e' : '#fff3c9';
                ctx.fillText(b.label, x + 16, b.y + b.h / 2 + 2);
                ctx.font = `italic 600 7.5px ${FONT}`;
                ctx.fillStyle = on ? 'rgba(70,25,20,0.85)' : 'rgba(203,188,245,0.7)';
                ctx.fillText(b.sub, x + 16, b.y + b.h - 4, b.w - 40);
            } else {
                ctx.font = `${on ? 15 : 13}px ${ARCADE}`;
                ctx.fillStyle = on ? '#2a0f2e' : '#fff3c9';
                ctx.fillText(b.label, x + 18, b.y + 18, b.w - 36);
                ctx.font = `italic 600 8.5px ${FONT}`;
                ctx.fillStyle = on ? 'rgba(70,25,20,0.85)' : 'rgba(203,188,245,0.7)';
                ctx.fillText(b.sub, x + 16, b.y + 30, b.w - 34);
            }
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
            ctx.restore();
        });
    }

    // ---- footer ---------------------------------------------------------------------

    /** Draw the blinking call to action, the controls line and this browser's record. */
    private footer(v: TitleView, t: number, cx = LOGO_X, ctaY = 254, W: number = C.VIEW_W, H: number = C.VIEW_H): void {
        const ctx = this.ctx;
        const tall = W !== C.VIEW_W;
        // Blinking call to action on the opening screen; the mode menu has no room for one.
        const blink = Math.floor(t * 2.2) % 2 === 0;
        if (blink && v.stage === 'start')
            arcadeText(
                ctx,
                v.touch ? 'TAP TO PLAY' : 'PRESS START',
                cx,
                ctaY,
                tall ? 11 : 13,
                ['#ffffff', '#fff3a0', '#ffb43c'],
                'center',
            );
        if (!v.touch && (v.stage === 'start' || !tall)) {
            ctx.font = `7px ${ARCADE}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(203,188,245,0.75)';
            const keys =
                v.stage === 'start'
                    ? 'UP / DOWN CHOOSE  ·  ENTER OR Z PICKS'
                    : 'UP / DOWN CHOOSE  ·  ENTER OR Z PICKS  ·  ESC BACK';
            ctx.fillText(keys, cx, v.stage === 'start' ? ctaY + 16 : H - 26, W - 16);
        }
        // Bottom bar with this browser's record.
        const g = ctx.createLinearGradient(0, H - 20, 0, H);
        g.addColorStop(0, 'rgba(10,6,28,0.6)');
        g.addColorStop(1, 'rgba(10,6,28,0.95)');
        ctx.fillStyle = g;
        ctx.fillRect(-this.bleed, H - 20, W + 2 * this.bleed, 20);
        ctx.fillStyle = '#c9a24a';
        ctx.fillRect(-this.bleed, H - 20, W + 2 * this.bleed, 1);
        ctx.font = `${tall ? 6.5 : 8}px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.textAlign = 'center';
        const stats = [`FAIRIES  ${v.unlocked}/${v.total}`, `WINS  ${v.wins}`, `BEST CHAIN  ${v.bestChain}`];
        stats.forEach((s, i) => ctx.fillText(s, W * (0.18 + i * 0.32), H - 7));
    }
}
