import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Layout, TitleAction, TitleView } from '@/types';
import { arcadeText, slanted, sparkle } from '@/render/draw';
import { drawSprite } from '@/render/sprites';
import { tallMenuFit } from './menu-fit';
import { ARCADE, FONT, SANS } from '@/render/theme';
import { enter } from '@/render/transition';
import { shine } from './kit';
import { goldEdge, gloss, sweptWing } from './lobby-screen';
import { drawPadlock } from './map-screen';
import { goldGradient, ornateScreen, pointed } from './ornate';
import { frameCrest } from './roster-screen';

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

/** The title's choices: sign in (not ready yet), or play as a guest. */
const MENU: Omit<TitleButton, 'x' | 'y' | 'w' | 'h'>[] = [
    { action: 'google', label: 'SIGN IN WITH GOOGLE', sub: 'Coming soon', disabled: true },
    { action: 'guest', label: 'PLAY AS GUEST', sub: 'Progress is saved in this browser' },
];
const WIDE_BUTTONS: TitleButton[] = MENU.map((b, i) => ({ ...b, x: 284, y: 124 + i * 44, w: 204, h: 36 }));
/** In the tall layout the choices stack under the hero and the logo, shifted down `dy` on longer screens. */
function tallButtons(dy: number): TitleButton[] {
    return MENU.map((b, i) => ({ ...b, x: 40, y: 360 + dy + i * 50, w: 192, h: 40 }));
}

/** How far the tall title's content moves down to sit centred in a view `h` tall. */
const tallShift = (h: number) => Math.max(0, h - C.TALL_H) / 2;

/** The title's choices, top to bottom, for a layout and view height; also the tap targets (view units). */
export function titleButtons(layout: Layout, h: number = C.TALL_H): TitleButton[] {
    if (layout !== 'tall') return WIDE_BUTTONS;
    const f = tallMenuFit(h);
    return tallButtons(tallShift(f.h)).map(b => ({
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
    /** The hero portrait, pre-faded into the scene on its right and bottom edges. */
    private hero: HTMLCanvasElement | null = null;
    private motes: { x: number; y: number; s: number; p: number }[] = [];
    /** How far past each side edge full-width art reaches this frame (see menu-fit.ts). */
    private bleed = 0;

    constructor(private ctx: CanvasRenderingContext2D) {
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
            const ctx = this.ctx;
            enter(ctx, 'bg', () => ornateScreen(ctx, t, W, h, 0, '', true));
            this.bleed = f.bleed;
            ctx.save();
            ctx.translate(f.x, 0);
            ctx.scale(f.s, f.s);
            ctx.save();
            ctx.translate(0, dy);
            enter(ctx, 'panels', () => this.heroArtTall(t), { dx: 0, dy: 12 });
            enter(ctx, 'bar', () => this.logo(t, W / 2, TALL.logoY, 24));
            ctx.restore();
            enter(ctx, 'buttons', () => this.menu(v, t, tallButtons(dy)), { dy: 10 });
            enter(ctx, 'hint', () => this.footer(v, t, W / 2, TALL.ctaY + dy, W, f.h));
            ctx.restore();
            this.bleed = 0;
            return;
        }
        // A widened landscape view: the sky and the footer bar reach `bleed` past each side, and the hero stays
        // against the left edge of the screen.
        this.bleed = bleed;
        const ctx = this.ctx;
        enter(ctx, 'bg', () => ornateScreen(ctx, t, C.VIEW_W, C.VIEW_H, bleed, '', false));
        enter(ctx, 'panels', () => this.heroArt(t), { dx: -22 });
        enter(ctx, 'bar', () => this.logo(t));
        enter(ctx, 'buttons', () => this.menu(v, t, WIDE_BUTTONS), { dy: 10 });
        enter(ctx, 'hint', () => this.footer(v, t));
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

    /**
     * Draw the logo centred on `cx` with its title's baseline at `y0` (size 30 in the wide layout): the jewelled star
     * crest between two gold wings, GLIMMERWING in gold on a dark edge with gold scrolls either side and a light
     * sweeping across it, and the strapline on a gold-edged violet ribbon over a starred gold rule.
     */
    private logo(t: number, cx = LOGO_X, y0 = 66, size = 30): void {
        const ctx = this.ctx;
        const k = size / 30;
        const y = y0 + Math.sin(t * 1.6) * 1.2;
        // The crest between its wings.
        for (const dir of [-1, 1]) sweptWing(ctx, cx + dir * 9 * k, y - 38 * k, 30 * k, dir);
        ctx.save();
        ctx.translate(cx, y - 44 * k);
        ctx.scale(0.13 * k, 0.13 * k);
        frameCrest(ctx, 0, 0, t);
        ctx.restore();
        // The title: a dark edge, a light rim, then gold shading down.
        const fs = 34 * k,
            maxW = 226 * k;
        ctx.save();
        ctx.font = `${fs}px ${ARCADE}`;
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(255,170,60,0.55)';
        ctx.shadowBlur = 16;
        ctx.strokeStyle = '#2a0e04';
        ctx.lineWidth = fs * 0.24;
        ctx.strokeText('GLIMMERWING', cx, y, maxW);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#fff1c0';
        ctx.lineWidth = fs * 0.08;
        ctx.strokeText('GLIMMERWING', cx, y, maxW);
        const g = ctx.createLinearGradient(0, y - fs * 0.85, 0, y);
        g.addColorStop(0, '#fffbe0');
        g.addColorStop(0.45, '#ffd45c');
        g.addColorStop(1, '#d8740e');
        ctx.fillStyle = g;
        ctx.fillText('GLIMMERWING', cx, y, maxW);
        const w = Math.min(maxW, ctx.measureText('GLIMMERWING').width);
        ctx.restore();
        // A shine sweeping across the letters every few seconds.
        const s = ((t * 0.45) % 1.8) - 0.4;
        if (s >= 0 && s <= 1) {
            ctx.save();
            ctx.font = `${fs}px ${ARCADE}`;
            ctx.textAlign = 'center';
            const band = w * 0.09,
                px = cx - w / 2 - band + s * (w + 2 * band);
            const sg = ctx.createLinearGradient(px - band, 0, px + band, 0);
            sg.addColorStop(0, 'rgba(255,255,255,0)');
            sg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
            sg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = sg;
            ctx.fillText('GLIMMERWING', cx, y, maxW);
            ctx.restore();
        }
        // Gold scrolls curling off either end of the title.
        ctx.lineCap = 'round';
        for (const dir of [-1, 1]) {
            const x0 = cx + dir * (w / 2 + 4 * k);
            ctx.strokeStyle = goldGradient(ctx, y - 16 * k, y + 12 * k);
            ctx.lineWidth = 1.4 * k;
            ctx.beginPath();
            ctx.moveTo(x0, y + 8 * k);
            ctx.bezierCurveTo(
                x0 + dir * 14 * k,
                y + 10 * k,
                x0 + dir * 18 * k,
                y - 2 * k,
                x0 + dir * 10 * k,
                y - 6 * k,
            );
            ctx.bezierCurveTo(x0 + dir * 4 * k, y - 8 * k, x0 + dir * 3 * k, y - 1 * k, x0 + dir * 8 * k, y);
            ctx.stroke();
        }
        // Twinkles at the logo's corners.
        ctx.fillStyle = '#fff6c8';
        for (const [dx, dy, ph] of [
            [-118, -30, 0],
            [116, -10, 2.1],
            [100, -36, 4.2],
        ] as const) {
            const tw = Math.max(0, Math.sin(t * 2.4 + ph));
            if (tw > 0.05) sparkle(ctx, cx + dx * k, y + dy * k, 2 + 4 * tw);
        }
        // The strapline on its ribbon.
        const rw = 176 * k,
            rh = 17 * k,
            rx = cx - rw / 2,
            ry = y + 7 * k;
        const ribbon = () => pointed(ctx, rx, ry, rw, rh, 8 * k);
        const rg = ctx.createLinearGradient(0, ry, 0, ry + rh);
        rg.addColorStop(0, '#4a2486');
        rg.addColorStop(0.55, '#1c0c38');
        rg.addColorStop(1, '#2e1458');
        ctx.fillStyle = rg;
        ribbon();
        ctx.fill();
        gloss(ctx, ribbon, rx, ry, rw, rh);
        goldEdge(ctx, ribbon, ry, ry + rh, undefined, 1.2 * k);
        ctx.textAlign = 'center';
        ctx.font = `800 ${8.5 * k}px ${SANS}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText('A MEADOW VERSUS SHOOTER', cx, ry + rh / 2 + 3 * k, rw - 24 * k);
        // A gold rule with a star at its middle under the ribbon.
        const ly = ry + rh + 9 * k;
        for (const dir of [-1, 1]) {
            const rule = ctx.createLinearGradient(cx, 0, cx + dir * 60 * k, 0);
            rule.addColorStop(0, 'rgba(255,214,120,0.9)');
            rule.addColorStop(1, 'rgba(255,214,120,0)');
            ctx.fillStyle = rule;
            ctx.fillRect(Math.min(cx, cx + dir * 60 * k), ly - 0.4, 60 * k, 0.8);
        }
        ctx.fillStyle = '#ffe9a8';
        sparkle(ctx, cx, ly, 3.2 * k);
    }

    // ---- menu -----------------------------------------------------------------------

    /**
     * Draw the menu buttons: slanted plates in a gold edge, the one with the cursor bright gold, glowing, with a light
     * sweeping over it and a bouncing gold pointer beside it, the others deep violet; each with its icon (Google's G,
     * a gamepad), its name and a line under it, and a padlock on one that can't be picked yet.
     */
    private menu(v: TitleView, t: number, buttons: TitleButton[]): void {
        const ctx = this.ctx;
        buttons.forEach((b, i) => {
            const on = i === v.index,
                lit = on && !b.disabled;
            const x = b.x,
                cy = b.y + b.h / 2;
            const plate = () => slanted(x, b.y, b.w, b.h, 9)(ctx);
            ctx.save();
            if (on) {
                ctx.shadowColor = b.disabled ? 'rgba(200,170,255,0.7)' : '#ffb43c';
                ctx.shadowBlur = 16 + 5 * Math.sin(t * 5);
            }
            const g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
            if (lit) {
                g.addColorStop(0, '#fff8c0');
                g.addColorStop(0.45, '#ffd640');
                g.addColorStop(1, '#f0a010');
            } else {
                g.addColorStop(0, '#4a2486');
                g.addColorStop(0.55, '#1c0c38');
                g.addColorStop(1, '#2e1458');
            }
            ctx.fillStyle = g;
            plate();
            ctx.fill();
            ctx.restore();
            gloss(ctx, plate, x, b.y, b.w, b.h);
            goldEdge(ctx, plate, b.y, b.y + b.h, lit ? ['#ffffff', '#ffe9a0', '#d8900e'] : undefined, 1.6);
            ctx.strokeStyle = lit ? 'rgba(255,255,240,0.7)' : 'rgba(255,214,120,0.3)';
            ctx.lineWidth = 0.6;
            slanted(x + 3, b.y + 3, b.w - 6, b.h - 6, 7)(ctx);
            ctx.stroke();
            if (!b.disabled) shine(ctx, plate, x, b.y, b.w, b.h, t, i * 0.7, on ? 3 : 5);
            // Its icon, name and line.
            const ix = x + 24;
            if (b.action === 'google') googleG(ctx, ix, cy, 9);
            else gamepad(ctx, ix, cy, 11, lit ? '#2a0e1e' : '#f4ecff');
            ctx.textAlign = 'left';
            ctx.font = `${lit ? 12.5 : 11.5}px ${ARCADE}`;
            ctx.fillStyle = lit ? '#2a0e1e' : b.disabled ? '#d8cff0' : '#ffffff';
            ctx.fillText(b.label, x + 44, cy - 1, b.w - (b.disabled ? 80 : 60));
            ctx.font = `italic 600 8px ${FONT}`;
            ctx.fillStyle = lit ? 'rgba(60,20,30,0.9)' : 'rgba(214,204,250,0.85)';
            ctx.fillText(b.sub, x + 44, cy + 10, b.w - 60);
            if (b.disabled) drawPadlock(ctx, x + b.w - 24, cy, 13);
            else if (!v.touch) {
                ctx.font = `9px ${ARCADE}`;
                ctx.textAlign = 'center';
                ctx.fillStyle = lit ? 'rgba(60,20,30,0.45)' : 'rgba(201,188,245,0.45)';
                ctx.fillText(String(i + 1), x + b.w - 18, cy + 4);
            }
            // The bouncing pointer.
            if (on) {
                const ax = x - 7 + Math.sin(t * 9) * 2.5;
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(ax, cy);
                ctx.lineTo(ax - 9, cy - 7);
                ctx.lineTo(ax - 9, cy + 7);
                ctx.closePath();
                ctx.strokeStyle = '#2a0e04';
                ctx.lineWidth = 2.2;
                ctx.stroke();
                ctx.fillStyle = goldGradient(ctx, cy - 7, cy + 7);
                ctx.fill();
            }
        });
    }

    // ---- footer ---------------------------------------------------------------------

    /**
     * Draw the call to action between two gold wings, glowing softly, the controls line under it, and a sweep of gold
     * light along the foot of the screen.
     */
    private footer(v: TitleView, t: number, cx = LOGO_X, ctaY = 236, W: number = C.VIEW_W, H: number = C.VIEW_H): void {
        const ctx = this.ctx;
        const tall = W !== C.VIEW_W;
        const size = tall ? 13 : 16,
            text = v.touch ? 'TAP TO PLAY' : 'PRESS START';
        ctx.font = `${size}px ${ARCADE}`;
        const half = ctx.measureText(text).width / 2;
        const pulse = 0.75 + 0.25 * Math.sin(t * 3.5);
        ctx.save();
        ctx.globalAlpha = pulse;
        for (const dir of [-1, 1]) sweptWing(ctx, cx + dir * (half + 6), ctaY - size * 0.3, size * 1.5, dir);
        arcadeText(ctx, text, cx, ctaY, size, ['#fffbe0', '#ffd45c', '#ff9a2e'], 'center');
        ctx.restore();
        if (!v.touch) {
            ctx.font = `800 ${tall ? 6.5 : 7.5}px ${SANS}`;
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(230,220,255,0.85)';
            ctx.fillText('UP / DOWN CHOOSE   •   ENTER OR Z PICKS', cx, ctaY + 17, W - 16);
        }
        // The sweep of gold light along the foot, from under the hero across to the right.
        const x0 = -this.bleed,
            x1 = W + this.bleed,
            fy = H - 16;
        ctx.save();
        ctx.lineCap = 'round';
        for (const [w, a] of [
            [5, 0.18],
            [1.6, 0.9],
        ] as const) {
            const g = ctx.createLinearGradient(x0, 0, x1, 0);
            g.addColorStop(0, `rgba(255,214,120,${a * 0.2})`);
            g.addColorStop(0.35, `rgba(255,214,120,${a})`);
            g.addColorStop(0.7, `rgba(255,236,170,${a})`);
            g.addColorStop(1, `rgba(255,214,120,${a * 0.2})`);
            ctx.strokeStyle = g;
            ctx.lineWidth = w;
            ctx.beginPath();
            ctx.moveTo(x0, fy - 8);
            ctx.bezierCurveTo(x0 + (x1 - x0) * 0.3, fy + 10, x0 + (x1 - x0) * 0.55, fy - 16, x1, fy + 2);
            ctx.stroke();
        }
        ctx.restore();
        const k = (t * 0.12) % 1,
            sx = x0 + (x1 - x0) * k;
        ctx.fillStyle = `rgba(255,248,220,${0.6 + 0.4 * Math.sin(t * 4)})`;
        const sy = fy - 8 + Math.sin(k * Math.PI * 2.2) * 9 * (1 - Math.abs(0.5 - k));
        sparkle(ctx, sx, sy, 3);
    }
}

/** Google's G, `r` across, centred on (x, y), in its four colours on a white disc. */
function googleG(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.fill();
    const w = r * 0.42,
        rr = r - w / 2;
    ctx.lineWidth = w;
    for (const [a0, a1, c] of [
        [-0.25 * Math.PI, -0.78 * Math.PI, '#ea4335'],
        [-0.78 * Math.PI, -1.22 * Math.PI, '#fbbc05'],
        [-1.22 * Math.PI, -1.75 * Math.PI, '#34a853'],
        [0.25 * Math.PI, 0, '#4285f4'],
    ] as const) {
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.arc(x, y, rr, a0, a1, a0 > a1);
        ctx.stroke();
    }
    ctx.fillStyle = '#4285f4';
    ctx.fillRect(x, y - w / 2, r, w);
    ctx.restore();
}

/** A gamepad `s` wide centred on (x, y) in one colour: its body and grips, a cross pad on the left, buttons on the right. */
function gamepad(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ink: string): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 12, s / 12);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(8, -5);
    ctx.quadraticCurveTo(13, -5, 13, 2);
    ctx.quadraticCurveTo(13, 8, 9, 7);
    ctx.lineTo(5, 3);
    ctx.lineTo(-5, 3);
    ctx.lineTo(-9, 7);
    ctx.quadraticCurveTo(-13, 8, -13, 2);
    ctx.quadraticCurveTo(-13, -5, -8, -5);
    ctx.closePath();
    ctx.fill();
    // The cross pad and buttons, cut out of the body in a contrasting tone.
    ctx.fillStyle = ink === '#f4ecff' ? '#2a1458' : '#ffd640';
    ctx.fillRect(-8.5, -1.6, 6, 1.6);
    ctx.fillRect(-6.3, -3.8, 1.6, 6);
    for (const [bx, by] of [
        [5.5, -2.8],
        [8, -0.6],
    ] as const) {
        ctx.beginPath();
        ctx.arc(bx, by, 1.3, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
