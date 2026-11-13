import * as C from '@/core/config';
import type { Field } from '@/game/field';
import type { BannerView, ConsoleView, HudTag } from '@/types';
import { arcadeText, slanted, sparkle } from './draw';
import { drawBlossom, drawHeart } from './icons';
import { ARCADE } from './theme';

/** Gauge segment colours by level: green, gold, then hot orange for MAX. */
const LEVEL_COLORS = ['#8ff0a0', '#ffd45c', '#ff8a5b'];
const GOLD = '#c9a24a';
const INK = '#2a0f2e';

/**
 * The in-match arcade dressing: each meadow's HUD, the console between the
 * meadows, popups and warnings, and the full-width banners. Drawing only;
 * it reads game state and never changes it.
 */
export class Hud {
    /** Size of the current view, in view units (wide or tall layout). */
    private viewW = C.VIEW_W;
    private viewH = C.VIEW_H;

    constructor(private ctx: CanvasRenderingContext2D) {}

    /** Set the size of the view the banners span. */
    setView(w: number, h: number): void {
        this.viewW = w;
        this.viewH = h;
    }

    // ---- per-meadow HUD (drawn inside the meadow's translated, clipped space) ----------

    /** Draw one meadow's HUD strip (hearts, bombs, gauge and wins) in that meadow's coordinates. */
    meadow(f: Field, wins: number, time: number, tag: HudTag): void {
        const ctx = this.ctx;
        const W = C.FIELD_W;
        const color = f.fairy.color;

        // Top strip: dark glass with a gold rule.
        const top = ctx.createLinearGradient(0, 0, 0, 24);
        top.addColorStop(0, 'rgba(10,6,28,0.92)');
        top.addColorStop(0.75, 'rgba(10,6,28,0.6)');
        top.addColorStop(1, 'rgba(10,6,28,0)');
        ctx.fillStyle = top;
        ctx.fillRect(0, 0, W, 24);
        ctx.fillStyle = GOLD;
        ctx.globalAlpha = 0.75;
        ctx.fillRect(4, 19.5, W - 8, 0.8);
        ctx.globalAlpha = 1;

        // Hearts (life is kept in half-hearts) and bombs.
        for (let i = 0; i < C.MAX_HULL / 2; i++) {
            const x = 10 + i * 12;
            const have = f.player.hull - i * 2;
            drawHeart(ctx, x, 10, 'rgba(246,240,255,0.16)');
            if (have >= 2) drawHeart(ctx, x, 10, color);
            else if (have === 1) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x - 7, 0, 7, 20);
                ctx.clip();
                drawHeart(ctx, x, 10, color);
                ctx.restore();
            }
        }
        for (let i = 0; i < C.BLOOMS_PER_ROUND; i++)
            drawBlossom(ctx, 74 + i * 11, 10, i < f.player.blooms ? f.fairy.bomb.color : 'rgba(246,240,255,0.15)');

        // Right side, right to left: round stars, player badge, name.
        for (let i = 0; i < C.ROUNDS_TO_WIN; i++) {
            const x = W - 9 - i * 12;
            const won = i < wins;
            ctx.save();
            if (won) {
                ctx.shadowColor = '#ffd45c';
                ctx.shadowBlur = 6;
            }
            star(ctx, x, 10, 5, 2.2);
            ctx.fillStyle = won ? '#ffd45c' : 'rgba(10,6,28,0.6)';
            ctx.fill();
            ctx.restore();
            star(ctx, x, 10, 5, 2.2);
            ctx.strokeStyle = won ? '#fff6c8' : 'rgba(246,240,255,0.45)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }
        ctx.font = `8px ${ARCADE}`;
        const bw = ctx.measureText(tag.label).width + 9;
        const bx = W - 9 - C.ROUNDS_TO_WIN * 12 - bw;
        ctx.fillStyle = tag.color;
        slanted(bx, 4, bw, 11, 3)(ctx);
        ctx.fill();
        ctx.fillStyle = '#140a26';
        ctx.textAlign = 'center';
        ctx.fillText(tag.label, bx + bw / 2, 12.5);
        ctx.textAlign = 'right';
        ctx.font = `9px ${ARCADE}`;
        ctx.fillStyle = '#fff3c9';
        ctx.fillText(f.fairy.name.toUpperCase(), bx - 4, 13, bx - 100);

        // Fever: a hot bar under the strip.
        if (f.fever > 0) {
            const k = Math.min(1, f.fever / (C.FEVER_TIME * f.fairy.feverTime));
            const g = ctx.createLinearGradient(4, 0, W - 4, 0);
            g.addColorStop(0, '#ffe08a');
            g.addColorStop(1, '#ff6b3d');
            ctx.save();
            ctx.shadowColor = '#ff8a3d';
            ctx.shadowBlur = 6;
            ctx.fillStyle = g;
            ctx.fillRect(4, 19, (W - 8) * k, 2);
            ctx.restore();
        }

        this.gauge(f, time);
    }

    /** Power gauge: three slanted segments filling in turn, with a level tag. MAX pulses so the rival sees it. */
    private gauge(f: Field, time: number): void {
        const ctx = this.ctx;
        const W = C.FIELD_W,
            H = C.FIELD_H;
        const bottom = ctx.createLinearGradient(0, H - 18, 0, H);
        bottom.addColorStop(0, 'rgba(10,6,28,0)');
        bottom.addColorStop(1, 'rgba(10,6,28,0.85)');
        ctx.fillStyle = bottom;
        ctx.fillRect(0, H - 18, W, 18);

        const lv = Math.min(3, Math.floor(f.gauge / C.GAUGE_LEVEL + 1e-6));
        const full = lv >= 3;
        const x0 = 34,
            y = H - 10,
            gap = 3;
        const segW = (W - x0 - 8 - gap * 2) / 3;
        for (let i = 0; i < 3; i++) {
            const sx = x0 + i * (segW + gap);
            const seg = slanted(sx, y, segW, 6, 3);
            ctx.fillStyle = 'rgba(10,6,28,0.85)';
            seg(ctx);
            ctx.fill();
            const fill = Math.max(0, Math.min(1, f.gauge / C.GAUGE_LEVEL - i));
            if (fill > 0) {
                ctx.save();
                seg(ctx);
                ctx.clip();
                ctx.fillStyle = full ? f.fairy.guardian.color : LEVEL_COLORS[i];
                ctx.globalAlpha = full ? 0.75 + 0.25 * Math.sin(time * 8) : fill < 1 ? 0.7 : 1;
                ctx.fillRect(sx, y, segW * fill, 6);
                ctx.restore();
            }
            ctx.strokeStyle = fill >= 1 ? 'rgba(255,246,200,0.8)' : 'rgba(201,162,74,0.55)';
            ctx.lineWidth = 0.7;
            seg(ctx);
            ctx.stroke();
        }
        const label = full ? 'MAX' : `LV${lv}`;
        ctx.textAlign = 'left';
        ctx.font = `8px ${ARCADE}`;
        ctx.fillStyle = full ? f.fairy.guardian.color : lv === 0 ? 'rgba(246,240,255,0.4)' : LEVEL_COLORS[lv - 1];
        if (full) {
            ctx.save();
            ctx.shadowColor = f.fairy.guardian.color;
            ctx.shadowBlur = 6 + 4 * Math.sin(time * 8);
            ctx.fillText(label, 7, H - 4);
            ctx.restore();
        } else ctx.fillText(label, 7, H - 4);
    }

    /** Floating text in a meadow (chains, attacks, bombs): arcade lettering, fading as it rises. */
    popup(text: string, x: number, y: number, age: number): void {
        const ctx = this.ctx;
        const k = Math.max(0, 1 - age / 1.1);
        const pop = age < 0.12 ? 0.7 + (age / 0.12) * 0.3 : 1;
        ctx.save();
        ctx.globalAlpha = k;
        ctx.translate(Math.min(C.FIELD_W - 40, Math.max(40, x)), Math.max(32, y));
        ctx.scale(pop, pop);
        const chain = /^\d+ chain$/.test(text);
        arcadeText(
            ctx,
            text.toUpperCase(),
            0,
            0,
            chain ? 11 : 9,
            chain ? ['#ffffff', '#fff3a0', '#ffb43c'] : ['#ffffff', '#f2eaff', '#c9b8ff'],
            'center',
            C.FIELD_W - 20,
        );
        ctx.restore();
    }

    /** A blinking warning plate near the top of a meadow. `icon` draws to its left. */
    cue(text: string, color: string, t: number, y: number, icon?: (x: number, y: number) => void): void {
        const ctx = this.ctx;
        if (Math.floor(t * 4) % 2) return;
        const x = C.FIELD_W / 2;
        ctx.font = `9px ${ARCADE}`;
        const w = ctx.measureText(text.toUpperCase()).width + (icon ? 34 : 22);
        const plate = slanted(x - w / 2, y - 12, w, 17, 5);
        ctx.fillStyle = 'rgba(10,6,28,0.82)';
        plate(ctx);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        plate(ctx);
        ctx.stroke();
        if (icon) icon(x - w / 2 + 14, y - 4);
        ctx.textAlign = 'center';
        ctx.fillStyle = color;
        ctx.fillText(text.toUpperCase(), x + (icon ? 6 : 0), y);
    }

    // ---- console between the meadows --------------------------------------------------

    /** Draw the console between the meadows: the gold cabinet frame, round number and status. */
    console(v: ConsoleView, time: number): void {
        const ctx = this.ctx;
        const x = C.FIELD_W,
            w = C.GAP,
            H = C.VIEW_H,
            cx = x + w / 2;
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, '#0b0720');
        g.addColorStop(0.5, '#1c1240');
        g.addColorStop(1, '#0b0720');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, H);
        // Gold rails on both edges.
        ctx.fillStyle = GOLD;
        ctx.fillRect(x, 0, 1, H);
        ctx.fillRect(x + w - 1, 0, 1, H);
        ctx.fillStyle = 'rgba(255,230,160,0.25)';
        ctx.fillRect(x + 1.5, 0, 0.5, H);
        ctx.fillRect(x + w - 2, 0, 0.5, H);
        // A thin gold frame round the whole screen, so both meadows and the console read as one cabinet.
        ctx.strokeStyle = 'rgba(201,162,74,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, C.VIEW_W - 1, H - 1);

        // Round number. The top of the console stays clear: on touchscreens the pause
        // and fullscreen-exit buttons sit there.
        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('RD', cx, 98);
        arcadeText(ctx, String(v.round), cx, 116, 15, ['#ffffff', '#ffe08a', '#ff9a2e'], 'center');

        // Stacked VS with a glow.
        ctx.save();
        ctx.shadowColor = '#ff6b8a';
        ctx.shadowBlur = 8 + 3 * Math.sin(time * 3);
        arcadeText(ctx, 'V', cx, 146, 12, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
        arcadeText(ctx, 'S', cx, 160, 12, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
        ctx.restore();
        ctx.fillStyle = '#ffe7a0';
        sparkle(ctx, cx, 128, 2 + Math.max(0, Math.sin(time * 2.5)) * 2);
        sparkle(ctx, cx, 172, 2 + Math.max(0, Math.sin(time * 2.5 + 2)) * 2);

        // Speed meter: the shared tempo, filling from the bottom and running hot.
        const mTop = 192,
            mBot = H - 36,
            mw = 8;
        const k = Math.max(0, Math.min(1, (v.tempo - 1) / (C.TEMPO_MAX - 1)));
        ctx.fillStyle = 'rgba(10,6,28,0.9)';
        ctx.fillRect(cx - mw / 2, mTop, mw, mBot - mTop);
        const steps = 12;
        const stepH = (mBot - mTop) / steps;
        for (let i = 0; i < steps; i++) {
            const on = i < Math.round(k * steps);
            const hot = i / steps;
            ctx.fillStyle = on
                ? hot > 0.66
                    ? '#ff6b3d'
                    : hot > 0.33
                      ? '#ffd45c'
                      : '#8ff0a0'
                : 'rgba(246,240,255,0.08)';
            ctx.fillRect(cx - mw / 2 + 1.5, mBot - (i + 1) * stepH + 1, mw - 3, stepH - 1.5);
        }
        ctx.strokeStyle = 'rgba(201,162,74,0.6)';
        ctx.lineWidth = 0.7;
        ctx.strokeRect(cx - mw / 2, mTop, mw, mBot - mTop);
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = k > 0.66 ? '#ff8a5b' : '#cbbcf5';
        ctx.fillText('SPD', cx, mBot + 9);
        ctx.fillText(`${v.tempo.toFixed(1)}`, cx, mTop - 4);
        if (v.ping !== undefined) {
            ctx.font = `5px ${ARCADE}`;
            ctx.fillStyle = v.ping > 150 ? '#ff8a5b' : 'rgba(203,188,245,0.8)';
            ctx.fillText(`${v.ping}`, cx, H - 15);
            ctx.fillText('MS', cx, H - 9);
        }
    }

    /**
     * The tall layout's console, in the box beside the rival's half-size meadow:
     * round number, a VS mark, the shared speed as a bar, and the ping online.
     */
    consoleCompact(v: ConsoleView, time: number, x: number, y: number, w: number, h: number): void {
        const ctx = this.ctx;
        const cx = x + w / 2;
        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0, '#1c1240');
        g.addColorStop(1, '#0b0720');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(201,162,74,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

        ctx.textAlign = 'center';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('ROUND', cx, y + 16);
        arcadeText(ctx, String(v.round), cx, y + 40, 18, ['#ffffff', '#ffe08a', '#ff9a2e'], 'center');

        ctx.save();
        ctx.shadowColor = '#ff6b8a';
        ctx.shadowBlur = 8 + 3 * Math.sin(time * 3);
        arcadeText(ctx, 'VS', cx, y + 72, 14, ['#ffffff', '#ffd1dc', '#ff3d6e'], 'center');
        ctx.restore();
        ctx.fillStyle = '#ffe7a0';
        sparkle(ctx, cx - 26, y + 66, 2 + Math.max(0, Math.sin(time * 2.5)) * 2);
        sparkle(ctx, cx + 26, y + 66, 2 + Math.max(0, Math.sin(time * 2.5 + 2)) * 2);

        // Speed: the shared tempo as a horizontal bar that runs hot.
        const k = Math.max(0, Math.min(1, (v.tempo - 1) / (C.TEMPO_MAX - 1)));
        const bx = x + 12,
            bw = w - 24,
            by = y + 100,
            bh = 8,
            steps = 10;
        ctx.fillStyle = 'rgba(10,6,28,0.9)';
        ctx.fillRect(bx, by, bw, bh);
        for (let i = 0; i < steps; i++) {
            const on = i < Math.round(k * steps);
            const hot = i / steps;
            ctx.fillStyle = on
                ? hot > 0.66
                    ? '#ff6b3d'
                    : hot > 0.33
                      ? '#ffd45c'
                      : '#8ff0a0'
                : 'rgba(246,240,255,0.08)';
            ctx.fillRect(bx + 1 + (i * (bw - 2)) / steps, by + 1.5, (bw - 2) / steps - 1.5, bh - 3);
        }
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = k > 0.66 ? '#ff8a5b' : '#cbbcf5';
        ctx.fillText(`SPEED ${v.tempo.toFixed(1)}`, cx, by + 20);
        if (v.ping !== undefined) {
            ctx.font = `5.5px ${ARCADE}`;
            ctx.fillStyle = v.ping > 150 ? '#ff8a5b' : 'rgba(203,188,245,0.8)';
            ctx.fillText(`${v.ping} MS`, cx, y + h - 12);
        }
    }

    // ---- full-width banners ------------------------------------------------------------

    /**
     * A band across both meadows: a big title that punches in, a subtitle, and an
     * optional highlighted line (e.g. a newly unlocked fairy).
     */
    banner(v: BannerView): void {
        const ctx = this.ctx;
        const W = this.viewW,
            H = this.viewH,
            cy = H / 2;
        const age = v.age ?? 1;
        ctx.fillStyle = `rgba(10,6,28,${v.dim ?? 0.45})`;
        ctx.fillRect(0, 0, W, H);

        // The band sweeps open from the centre.
        const open = Math.min(1, age / 0.18);
        const bandH = (v.extra ? 92 : 74) * (0.2 + 0.8 * easeOut(open));
        const band = ctx.createLinearGradient(0, cy - bandH / 2, 0, cy + bandH / 2);
        band.addColorStop(0, 'rgba(29,15,69,0.92)');
        band.addColorStop(0.5, 'rgba(20,12,52,0.96)');
        band.addColorStop(1, 'rgba(8,22,44,0.92)');
        ctx.fillStyle = band;
        ctx.fillRect(0, cy - bandH / 2, W, bandH);
        ctx.fillStyle = GOLD;
        ctx.fillRect(0, cy - bandH / 2, W, 1.2);
        ctx.fillRect(0, cy + bandH / 2 - 1.2, W, 1.2);
        // Light streaks sliding along the band.
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, cy - bandH / 2, W, bandH);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,240,200,0.05)';
        for (let i = 0; i < 4; i++) {
            const sx = ((age * 160 + i * 150) % (W + 120)) - 60;
            slanted(sx, cy - bandH / 2, 40, bandH, 20)(ctx);
            ctx.fill();
        }
        ctx.restore();
        if (open < 1) return;

        // Title punches in big, then settles.
        const tAge = age - 0.18;
        const s = tAge < 0.16 ? 1.8 - (tAge / 0.16) * 0.8 : 1 + 0.03 * Math.sin(age * 6);
        const tone = v.tone ?? 'gold';
        const stops: [string, string, string] =
            tone === 'pink'
                ? ['#ffffff', '#ffd1dc', '#ff3d6e']
                : tone === 'blue'
                  ? ['#ffffff', '#bfe8ff', '#4fb8ff']
                  : ['#fffbe0', '#ffd45c', '#ff8a2e'];
        const ty = cy + (v.sub || v.extra ? -6 : 10);
        ctx.save();
        ctx.translate(W / 2, ty);
        ctx.scale(s, s);
        ctx.globalAlpha = Math.min(1, tAge / 0.1 + 0.2);
        ctx.shadowColor = tone === 'pink' ? '#ff6b8a' : tone === 'blue' ? '#4fb8ff' : '#ffb43c';
        ctx.shadowBlur = 14;
        arcadeText(ctx, v.title.toUpperCase(), 0, 0, v.size ?? 30, stops, 'center', W - 40);
        ctx.restore();
        if (v.sub) {
            ctx.textAlign = 'center';
            ctx.font = `9px ${ARCADE}`;
            ctx.fillStyle = v.blinkSub && Math.floor(age * 2.2) % 2 ? 'rgba(203,188,245,0.25)' : '#cbbcf5';
            ctx.fillText(v.sub.toUpperCase(), W / 2, ty + 20, W - 40);
        }
        if (v.extra) {
            const ey = ty + 36;
            ctx.font = `9px ${ARCADE}`;
            const ew = ctx.measureText(v.extra.toUpperCase()).width + 24;
            ctx.fillStyle = '#ffd45c';
            slanted(W / 2 - ew / 2, ey - 10, ew, 14, 4)(ctx);
            ctx.fill();
            ctx.fillStyle = INK;
            ctx.textAlign = 'center';
            ctx.fillText(v.extra.toUpperCase(), W / 2, ey, W - 60);
        }
    }
}

/** A five-point star path centred on (x, y). */
function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, inner: number): void {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? inner : r;
        const a = -Math.PI / 2 + (Math.PI * i) / 5;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
}

/** Ease-out curve: fast start, gentle finish. */
const easeOut = (k: number) => 1 - (1 - k) * (1 - k);
