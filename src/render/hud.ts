import * as C from '@/core/config';
import type { Field } from '@/game/field';
import type { BannerView, ConsoleView, EndlessView, HighlightKind, HudTag, ReplayPanelView } from '@/types';
import { arcadeText, shade, slanted, sparkle } from './draw';
import { drawFairy } from './entities/fairy';
import { drawBlossom, drawHeart } from './icons';
import { shine } from './screens/kit';
import { gloss, goldEdge, sweptWing } from './screens/lobby-screen';
import { frameCrest } from './screens/roster-screen';
import { ARCADE } from './theme';

/** Gauge segment colours by level: green, gold, then hot orange for MAX. */
const LEVEL_COLORS = ['#8ff0a0', '#ffd45c', '#ff8a5b'];
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

    /**
     * Draw one meadow's HUD strip (hearts, bombs, gauge and wins) in that meadow's coordinates, `W` wide (wider
     * than the meadow when an Endless replay's HUD reaches out to the screen's edges).
     */
    meadow(f: Field, wins: number, time: number, tag: HudTag, W: number = C.FIELD_W): void {
        const ctx = this.ctx;

        // Top plate: violet glass in a gold edge, its lower corners cut away.
        const plate = () => {
            ctx.beginPath();
            ctx.moveTo(1, 1);
            ctx.lineTo(W - 1, 1);
            ctx.lineTo(W - 1, 14);
            ctx.lineTo(W - 7, 20);
            ctx.lineTo(7, 20);
            ctx.lineTo(1, 14);
            ctx.closePath();
        };
        const top = ctx.createLinearGradient(0, 1, 0, 20);
        top.addColorStop(0, 'rgba(52,24,112,0.94)');
        top.addColorStop(1, 'rgba(18,8,46,0.94)');
        ctx.fillStyle = top;
        plate();
        ctx.fill();
        gloss(ctx, plate, 1, 1, W - 2, 19);
        goldEdge(ctx, plate, 1, 20, undefined, 1);
        shine(ctx, plate, 1, 1, W - 2, 19, time, tag.label.length * 0.7, 7);

        // Her face in a gold ring, standing out over the plate's left end.
        hudFace(ctx, f, 12, 11, 9.5);

        // Hearts (life is kept in half-hearts) and bombs.
        const hx = 30;
        for (let i = 0; i < C.MAX_HULL / 2; i++) {
            const x = hx + i * 11.5;
            const have = f.player.hull - i * 2;
            drawHeart(ctx, x, 10, 'rgba(246,240,255,0.16)');
            if (have >= 2) goldHeart(ctx, x, 10);
            else if (have === 1) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x - 7, 0, 7, 20);
                ctx.clip();
                goldHeart(ctx, x, 10);
                ctx.restore();
            }
        }
        const bx0 = hx + (C.MAX_HULL / 2) * 11.5 + 3;
        for (let i = 0; i < C.BLOOMS_PER_ROUND; i++)
            drawBlossom(ctx, bx0 + i * 11, 10, i < f.player.blooms ? '#ffcf4a' : 'rgba(246,240,255,0.15)');

        // Right side, right to left: round stars, player badge, name.
        for (let i = 0; i < C.ROUNDS_TO_WIN; i++) {
            const x = W - 11 - i * 12;
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
            ctx.strokeStyle = won ? '#fff6c8' : 'rgba(220,200,255,0.6)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
        }
        ctx.font = `8px ${ARCADE}`;
        const bw = ctx.measureText(tag.label).width + 10;
        const bx = W - 11 - C.ROUNDS_TO_WIN * 12 - bw;
        const badge = slanted(bx, 4, bw, 12, 3);
        const bg = ctx.createLinearGradient(0, 4, 0, 16);
        bg.addColorStop(0, tag.color);
        bg.addColorStop(1, shade(tag.color, 0.7));
        ctx.fillStyle = bg;
        badge(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 0.6;
        badge(ctx);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText(tag.label, bx + bw / 2, 13.2);
        ctx.textAlign = 'right';
        ctx.font = `9px ${ARCADE}`;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#1a0a30';
        ctx.lineWidth = 2;
        const nameMax = Math.max(20, bx - 4 - (bx0 + C.BLOOMS_PER_ROUND * 11 + 2));
        ctx.strokeText(f.fairy.name.toUpperCase(), bx - 4, 13.5, nameMax);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(f.fairy.name.toUpperCase(), bx - 4, 13.5, nameMax);

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
            ctx.fillRect(8, 20, (W - 16) * k, 2);
            ctx.restore();
        }

        this.gauge(f, time, W);
    }

    /** Power gauge: three slanted segments filling in turn, with a level tag. MAX pulses so the rival sees it. */
    private gauge(f: Field, time: number, W: number): void {
        const ctx = this.ctx;
        const H = C.FIELD_H;
        // Bottom plate: violet glass in a gold edge, its upper corners cut away.
        const plate = () => {
            ctx.beginPath();
            ctx.moveTo(7, H - 15);
            ctx.lineTo(W - 7, H - 15);
            ctx.lineTo(W - 1, H - 9);
            ctx.lineTo(W - 1, H - 1);
            ctx.lineTo(1, H - 1);
            ctx.lineTo(1, H - 9);
            ctx.closePath();
        };
        const bg = ctx.createLinearGradient(0, H - 15, 0, H);
        bg.addColorStop(0, 'rgba(52,24,112,0.92)');
        bg.addColorStop(1, 'rgba(18,8,46,0.94)');
        ctx.fillStyle = bg;
        plate();
        ctx.fill();
        goldEdge(ctx, plate, H - 15, H, undefined, 1);

        const lv = Math.min(3, Math.floor(f.gauge / C.GAUGE_LEVEL + 1e-6));
        const full = lv >= 3;
        const x0 = 32,
            y = H - 11,
            sh = 6.5,
            gap = 4;
        const segW = (W - x0 - 10 - gap * 2) / 3;
        for (let i = 0; i < 3; i++) {
            const sx = x0 + i * (segW + gap);
            const seg = slanted(sx, y, segW, sh, 3);
            ctx.fillStyle = 'rgba(8,4,22,0.95)';
            seg(ctx);
            ctx.fill();
            const fill = Math.max(0, Math.min(1, f.gauge / C.GAUGE_LEVEL - i));
            if (fill > 0) {
                const c = full ? f.fairy.guardian.color : LEVEL_COLORS[i];
                ctx.save();
                seg(ctx);
                ctx.clip();
                const g = ctx.createLinearGradient(0, y, 0, y + sh);
                g.addColorStop(0, '#ffffff');
                g.addColorStop(0.35, c);
                g.addColorStop(1, shade(c, 0.6));
                ctx.fillStyle = g;
                ctx.globalAlpha = full ? 0.75 + 0.25 * Math.sin(time * 8) : fill < 1 ? 0.75 : 1;
                ctx.fillRect(sx, y, segW * fill, sh);
                ctx.restore();
            }
            ctx.strokeStyle = fill >= 1 ? 'rgba(255,246,200,0.85)' : 'rgba(201,162,74,0.7)';
            ctx.lineWidth = 0.7;
            seg(ctx);
            ctx.stroke();
        }
        const label = full ? 'MAX' : `LV${lv}`;
        ctx.textAlign = 'left';
        ctx.save();
        if (full) {
            ctx.shadowColor = f.fairy.guardian.color;
            ctx.shadowBlur = 6 + 4 * Math.sin(time * 8);
        }
        arcadeText(
            ctx,
            label,
            7,
            H - 4,
            8,
            full
                ? ['#ffffff', f.fairy.guardian.color, shade(f.fairy.guardian.color, 0.7)]
                : ['#fffbe0', '#ffd45c', '#e88a1c'],
            'left',
        );
        ctx.restore();
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
        g.addColorStop(0, '#120830');
        g.addColorStop(0.5, '#2c1460');
        g.addColorStop(1, '#120830');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, H);
        // Gold rails on both edges, each a dark line and a gold one.
        const rail = ctx.createLinearGradient(0, 0, 0, H);
        rail.addColorStop(0, '#fff0b0');
        rail.addColorStop(0.5, '#e0a83e');
        rail.addColorStop(1, '#fff0b0');
        for (const rx of [x + 1, x + w - 1]) {
            ctx.fillStyle = '#1a0a10';
            ctx.fillRect(rx - 1.2, 0, 2.4, H);
            ctx.fillStyle = rail;
            ctx.fillRect(rx - 0.7, 0, 1.4, H);
        }
        ctx.fillStyle = 'rgba(200,150,255,0.35)';
        ctx.fillRect(x + 3, 0, 0.5, H);
        ctx.fillRect(x + w - 3.5, 0, 0.5, H);
        // A thin gold frame round the whole screen, so both meadows and the console read as one cabinet.
        ctx.strokeStyle = 'rgba(224,168,62,0.85)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, C.VIEW_W - 1, H - 1);
        // Violet gems at the console's ends.
        gemDiamond(ctx, cx, 6, 5, time);
        gemDiamond(ctx, cx, H - 6, 5, time + 1.5);

        // Round number. The top of the console stays clear: on touchscreens the pause
        // and fullscreen-exit buttons sit there.
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffe7a0';
        sparkle(ctx, cx, 86, 2 + Math.max(0, Math.sin(time * 2.5)) * 1.5);
        arcadeText(ctx, 'RD', cx, 101, 7, ['#ffffff', '#f2eaff', '#cbbcf5'], 'center');
        arcadeText(ctx, String(v.round), cx, 120, 16, ['#fffbe0', '#ffd45c', '#e88a1c'], 'center');

        // A winged crest with a violet gem below the round.
        sweptWing(ctx, cx - 4, 146, 20, -1);
        sweptWing(ctx, cx + 4, 146, 20, 1);
        ctx.save();
        ctx.translate(cx, 144);
        ctx.scale(0.13, 0.13);
        frameCrest(ctx, 0, 0, time);
        ctx.restore();

        // Speed meter: the shared tempo, filling from the bottom and running hot.
        const mTop = 192,
            mBot = H - 36,
            mw = 8;
        const k = Math.max(0, Math.min(1, (v.tempo - 1) / (C.TEMPO_MAX - 1)));
        ctx.fillStyle = 'rgba(8,4,22,0.95)';
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
        const meter = () => {
            ctx.beginPath();
            ctx.rect(cx - mw / 2, mTop, mw, mBot - mTop);
        };
        goldEdge(ctx, meter, mTop, mBot, undefined, 0.8);
        ctx.fillStyle = '#ffe7a0';
        sparkle(ctx, cx, mTop - 12, 2.2);
        sparkle(ctx, cx, mBot + 14, 2.2);
        ctx.font = `5.5px ${ARCADE}`;
        ctx.fillStyle = k > 0.66 ? '#ff8a5b' : '#fff3c9';
        ctx.fillText('SPD', cx, mBot + 8);
        ctx.fillText(`${v.tempo.toFixed(1)}`, cx, mTop - 3);
        if (v.ping !== undefined) {
            ctx.font = `5px ${ARCADE}`;
            ctx.fillStyle = v.ping > 150 ? '#ff8a5b' : 'rgba(203,188,245,0.8)';
            ctx.fillText(`${v.ping}`, cx, H - 15);
            ctx.fillText('MS', cx, H - 9);
        }
    }

    /**
     * Endless mode's readout on the lone, full-width meadow (landscape): two see-through cards over its left and
     * right edges, so the scenery shows through. The time and the best run on the left; the guardians, the time to
     * the next and the speed on the right.
     */
    endlessSides(v: EndlessView, time: number, w: number): void {
        const ctx = this.ctx;
        const cw = 84,
            y = 38,
            ch = 128;
        const card = (x: number) => {
            ctx.fillStyle = 'rgba(14,9,36,0.45)';
            ctx.fillRect(x, y, cw, ch);
            ctx.strokeStyle = 'rgba(201,162,74,0.55)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
        };
        const label = (text: string, x: number, ly: number) => {
            ctx.textAlign = 'center';
            ctx.font = `6.5px ${ARCADE}`;
            ctx.fillStyle = '#e4dcff';
            ctx.fillText(text, x, ly);
        };
        // Left: the run.
        const lx = 8,
            L = lx + cw / 2;
        card(lx);
        arcadeText(ctx, 'ENDLESS', L, y + 16, 10, ['#ffffff', '#ffd2a8', '#ff8a5c'], 'center');
        label('TIME', L, y + 36);
        arcadeText(ctx, clock(v.time), L, y + 60, 20, ['#ffffff', '#ffe08a', '#ff9a2e'], 'center');
        label('BEST', L, y + 84);
        const record = v.best > 0 && v.time > v.best;
        arcadeText(
            ctx,
            clock(Math.max(v.best, v.time)),
            L,
            y + 102,
            12,
            record ? ['#ffffff', '#ffb6e0', '#ff5aa8'] : ['#ffffff', '#d8ccff', '#9a86e8'],
            'center',
        );
        if (record) {
            ctx.font = `6px ${ARCADE}`;
            ctx.fillStyle = `rgba(255,154,200,${0.6 + 0.4 * Math.sin(time * 6)})`;
            ctx.fillText('NEW RECORD', L, y + 118);
        }
        // Right: the guardians and the speed.
        const rx = w - 8 - cw,
            R = rx + cw / 2,
            bw = cw - 18,
            bx = R - bw / 2;
        card(rx);
        label('GUARDIANS', R, y + 14);
        arcadeText(ctx, String(v.bosses), R, y + 40, 20, ['#ffffff', '#ffd2a8', '#ff8a5c'], 'center');
        label('NEXT IN', R, y + 60);
        const soon = v.nextBoss < 5;
        ctx.fillStyle = 'rgba(246,240,255,0.15)';
        ctx.fillRect(bx, y + 66, bw, 5);
        ctx.fillStyle = soon ? `rgba(255,${90 + Math.round(60 * Math.sin(time * 12))},110,1)` : '#ffd45c';
        ctx.fillRect(bx, y + 66, bw * Math.min(1, v.nextBoss / C.ENDLESS_BOSS_EVERY), 5);
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`${Math.ceil(v.nextBoss)}s`, R, y + 82);
        label('SPEED', R, y + 102);
        const k = Math.max(0, Math.min(1, (v.tempo - 1) / (C.TEMPO_MAX - 1)));
        ctx.fillStyle = 'rgba(246,240,255,0.15)';
        ctx.fillRect(bx, y + 108, bw, 5);
        ctx.fillStyle = k > 0.7 ? `rgba(255,${120 + Math.round(60 * Math.sin(time * 10))},90,1)` : '#8ff0a0';
        ctx.fillRect(bx, y + 108, bw * k, 5);
    }

    /** Endless mode's slim top bar in the tall layout: time survived, best run and the next guardian. */
    endlessBar(v: EndlessView, time: number, w: number, h: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1c1240');
        g.addColorStop(1, '#0b0720');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(201,162,74,0.8)';
        ctx.fillRect(0, h - 1, w, 1);
        const cy = h / 2;
        ctx.textAlign = 'left';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('TIME', 8, cy + 2);
        arcadeText(ctx, clock(v.time), 34, cy + 5, 12, ['#ffffff', '#ffe08a', '#ff9a2e'], 'left');
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText(`BEST ${clock(Math.max(v.best, v.time))}`, 94, cy + 2);
        // The next guardian: a count of those sent, and the seconds until the next, red when it's close.
        ctx.textAlign = 'right';
        const soon = v.nextBoss < 5;
        ctx.fillStyle = soon ? `rgba(255,${90 + Math.round(60 * Math.sin(time * 12))},110,1)` : '#ffd45c';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillText(`BOSS ${Math.ceil(v.nextBoss)}s`, w - 8, cy + 3);
        ctx.fillStyle = '#cbbcf5';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillText(`x${v.bosses}`, w - 64, cy + 2);
    }

    /**
     * The slim bar across the top of the tall view when the rival's meadow is hidden (Settings): the round on the
     * left, the shared speed in the middle, and the rival's badge and hearts on the right.
     */
    soloBar(v: ConsoleView, rival: Field, tag: HudTag, time: number, w: number, h: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#1c1240');
        g.addColorStop(1, '#0b0720');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(201,162,74,0.8)';
        ctx.fillRect(0, h - 1, w, 1);
        const cy = h / 2;
        ctx.textAlign = 'left';
        ctx.font = `6px ${ARCADE}`;
        ctx.fillStyle = '#cbbcf5';
        ctx.fillText('ROUND', 8, cy + 2);
        arcadeText(ctx, String(v.round), 40, cy + 5, 12, ['#ffffff', '#ffe08a', '#ff9a2e'], 'left');
        // Speed: the shared tempo as a short bar that runs hot.
        const k = Math.max(0, Math.min(1, (v.tempo - 1) / (C.TEMPO_MAX - 1)));
        const bx = 62,
            bw = 46;
        ctx.fillStyle = 'rgba(246,240,255,0.12)';
        ctx.fillRect(bx, cy - 2, bw, 4);
        ctx.fillStyle = k > 0.7 ? `rgba(255,${120 + Math.round(60 * Math.sin(time * 10))},90,1)` : '#8ff0a0';
        ctx.fillRect(bx, cy - 2, bw * k, 4);
        // The rival: badge, then hearts (life is kept in half-hearts).
        const hearts = C.MAX_HULL / 2;
        const hx = w - 8 - (hearts - 1) * 11;
        for (let i = 0; i < hearts; i++) {
            const x = hx + i * 11;
            const have = rival.player.hull - i * 2;
            drawHeart(ctx, x, cy, 'rgba(246,240,255,0.16)');
            if (have >= 2) drawHeart(ctx, x, cy, tag.color);
            else if (have === 1) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x - 7, 0, 7, h);
                ctx.clip();
                drawHeart(ctx, x, cy, tag.color);
                ctx.restore();
            }
        }
        ctx.textAlign = 'right';
        ctx.font = `7px ${ARCADE}`;
        ctx.fillStyle = tag.color;
        ctx.fillText(tag.label, hx - 10, cy + 3);
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

        // The band sweeps open from the centre: deep violet, gold-ruled, with a magenta glow along its edges and
        // light swooping across it.
        const open = Math.min(1, age / 0.18);
        const bandH = (v.extra ? 92 : 76) * (0.2 + 0.8 * easeOut(open));
        const y0 = cy - bandH / 2,
            y1 = cy + bandH / 2;
        const band = ctx.createLinearGradient(0, y0, 0, y1);
        band.addColorStop(0, 'rgba(58,20,120,0.95)');
        band.addColorStop(0.5, 'rgba(24,8,58,0.97)');
        band.addColorStop(1, 'rgba(58,20,120,0.95)');
        ctx.fillStyle = band;
        ctx.fillRect(0, y0, W, bandH);
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, W, bandH);
        ctx.clip();
        // Swoops of light, drifting slowly.
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const d = Math.sin(age * 0.8 + i * 2) * 10;
            ctx.strokeStyle = i === 1 ? 'rgba(255,140,240,0.22)' : 'rgba(170,110,255,0.25)';
            ctx.lineWidth = 2.5 - i * 0.6;
            ctx.beginPath();
            ctx.moveTo(-20, y1 - 4 - i * 6);
            ctx.bezierCurveTo(W * 0.25, y0 + 6 + d, W * 0.4, y1 - 8, W * 0.5, cy + i * 4);
            ctx.bezierCurveTo(W * 0.6, y1 - 8, W * 0.75, y0 + 6 - d, W + 20, y1 - 4 - i * 6);
            ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,240,200,0.05)';
        for (let i = 0; i < 4; i++) {
            const sx = ((age * 160 + i * 150) % (W + 120)) - 60;
            slanted(sx, y0, 40, bandH, 20)(ctx);
            ctx.fill();
        }
        ctx.restore();
        for (const ey of [y0, y1]) {
            const glow = ctx.createLinearGradient(0, ey - 5, 0, ey + 5);
            glow.addColorStop(0, 'rgba(255,90,230,0)');
            glow.addColorStop(0.5, 'rgba(255,110,240,0.55)');
            glow.addColorStop(1, 'rgba(255,90,230,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, ey - 5, W, 10);
            ctx.fillStyle = '#ffd36a';
            ctx.fillRect(0, ey - 0.7, W, 1.4);
            ctx.fillStyle = 'rgba(255,240,255,0.9)';
            ctx.fillRect(W * 0.2, ey - 0.3, W * 0.6, 0.6);
        }
        if (open < 1) return;

        // Title punches in big, then settles: leaning gold lettering between two gold wings.
        const tAge = age - 0.18;
        const s = tAge < 0.16 ? 1.8 - (tAge / 0.16) * 0.8 : 1 + 0.03 * Math.sin(age * 6);
        const tone = v.tone ?? 'gold';
        const stops: [string, string, string] =
            tone === 'pink'
                ? ['#ffffff', '#ffd1dc', '#ff3d6e']
                : tone === 'blue'
                  ? ['#ffffff', '#bfe8ff', '#4fb8ff']
                  : ['#fffbe0', '#ffd45c', '#ff8a2e'];
        const size = v.size ?? 30;
        const ty = cy + (v.sub || v.extra ? -6 : size * 0.36);
        const text = v.title.toUpperCase();
        ctx.font = `${size}px ${ARCADE}`;
        const tw = Math.min(W - 40, ctx.measureText(text).width);
        ctx.save();
        ctx.translate(W / 2, ty);
        ctx.scale(s, s);
        ctx.globalAlpha = Math.min(1, tAge / 0.1 + 0.2);
        if (tw + size * 3.4 < W) {
            const wy = -size * 0.42,
                wl = size * 1.15;
            sweptWing(ctx, -tw / 2 - size * 0.2, wy, wl, -1);
            sweptWing(ctx, tw / 2 + size * 0.2, wy, wl, 1);
        }
        ctx.transform(1, 0, -0.18, 1, 0, 0);
        ctx.shadowColor = tone === 'pink' ? '#ff6b8a' : tone === 'blue' ? '#4fb8ff' : '#ffb43c';
        ctx.shadowBlur = 14;
        arcadeText(ctx, text, 0, 0, size, stops, 'center', W - 40);
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

    /**
     * The replay's controls minimised: a small tab at the bottom with a play mark, REPLAY, the speed and the time
     * (a tap or H brings the panel back), and a thin line along the bottom edge showing how far it's played.
     */
    private replayMini(v: ReplayPanelView, tab: Box, time: number): void {
        const ctx = this.ctx;
        const W = this.viewW,
            H = this.viewH;
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(0, H - 2, W, 2);
        ctx.fillStyle = '#ffd45c';
        ctx.fillRect(0, H - 2, W * Math.min(1, v.len > 0 ? v.pos / v.len : 0), 2);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(14,8,36,0.85)';
        slanted(tab.x, tab.y, tab.w, tab.h, 3)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.globalAlpha = v.paused ? 1 : 0.65 + 0.35 * Math.sin(time * 4);
        ctx.fillStyle = '#ff6b8a';
        const mx = tab.x + 7,
            my = tab.y + tab.h / 2;
        ctx.beginPath();
        ctx.moveTo(mx, my - 3.5);
        ctx.lineTo(mx + 5, my);
        ctx.lineTo(mx, my + 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = `6px ${ARCADE}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe27a';
        const label = `${v.speed > 1 ? `${v.speed}× ` : ''}${clock(v.pos)}`;
        ctx.fillText(label, mx + 9, my + 2.5, tab.w - 26);
        // A chevron pointing up: the panel opens again.
        ctx.strokeStyle = '#e8e0ff';
        ctx.lineWidth = 1.3;
        const cx = tab.x + tab.w - 9;
        ctx.beginPath();
        ctx.moveTo(cx - 3.5, my + 1.5);
        ctx.lineTo(cx, my - 2);
        ctx.lineTo(cx + 3.5, my + 1.5);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * The replay's controls along the bottom of the view: a dark plate with REPLAY and the speed, a round picker
     * and the time on its top line, and the timeline under them, with ticks where rounds begin, a marker for
     * each highlight and a knob that can be dragged; a hint line under it all.
     */
    replayPanel(v: ReplayPanelView, time: number): void {
        const ctx = this.ctx;
        const L = replayPanelLayout(this.viewW, this.viewH, v.rounds.length);
        const { panel: P, bar: B } = L;
        if (v.mini) {
            this.replayMini(v, L.tab, time);
            return;
        }
        ctx.save();
        ctx.fillStyle = 'rgba(14,8,36,0.82)';
        slanted(P.x, P.y, P.w, P.h, 5)(ctx);
        ctx.fill();
        ctx.strokeStyle = 'rgba(201,162,74,0.75)';
        ctx.lineWidth = 1;
        ctx.stroke();
        // Top line: a play (or pause) mark, REPLAY and the speed.
        const ty = P.y + 12;
        const mx = P.x + 12;
        ctx.fillStyle = '#ff6b8a';
        ctx.globalAlpha = v.paused ? 1 : 0.65 + 0.35 * Math.sin(time * 4);
        if (v.paused) {
            ctx.fillRect(mx, ty - 7, 2, 7);
            ctx.fillRect(mx + 4, ty - 7, 2, 7);
        } else {
            ctx.beginPath();
            ctx.moveTo(mx, ty - 7.5);
            ctx.lineTo(mx + 6, ty - 3.5);
            ctx.lineTo(mx, ty + 0.5);
            ctx.closePath();
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = `7px ${ARCADE}`;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#ffe27a';
        ctx.fillText(v.speed > 1 ? `REPLAY ${v.speed}×` : 'REPLAY', mx + 10, ty);
        // The round picker: one chip a round, the playing one lit.
        L.chips.forEach((c, i) => {
            const on = i === v.round;
            ctx.fillStyle = on ? '#ffd45c' : 'rgba(60,40,110,0.9)';
            slanted(c.x, c.y, c.w, c.h, 2)(ctx);
            ctx.fill();
            ctx.strokeStyle = on ? '#fff3c9' : 'rgba(201,162,74,0.6)';
            ctx.stroke();
            ctx.fillStyle = on ? '#140a26' : '#e8e0ff';
            ctx.textAlign = 'center';
            ctx.font = `6px ${ARCADE}`;
            ctx.fillText(L.chips.length > 1 ? `R${i + 1}` : 'RUN', c.x + c.w / 2, c.y + c.h - 3);
        });
        // The time, or while dragging the time under the knob.
        const shown = v.scrub !== null ? v.scrub * v.len : v.pos;
        ctx.textAlign = 'right';
        ctx.font = `6.5px ${ARCADE}`;
        ctx.fillStyle = v.scrub !== null ? '#ffe27a' : '#e8e0ff';
        ctx.fillText(`${clock(shown)} / ${clock(v.len)}`, L.hide.x - 5, ty);
        // The minimise button: a bar under a chevron pointing down.
        const hb = L.hide;
        ctx.strokeStyle = 'rgba(201,162,74,0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(hb.x + 0.5, hb.y + 0.5, hb.w - 1, hb.h - 1);
        ctx.strokeStyle = '#e8e0ff';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(hb.x + 4, hb.y + 4);
        ctx.lineTo(hb.x + hb.w / 2, hb.y + hb.h - 4.5);
        ctx.lineTo(hb.x + hb.w - 4, hb.y + 4);
        ctx.stroke();
        // The timeline: the track, the part played, round ticks and highlights.
        const k = Math.min(1, v.len > 0 ? v.pos / v.len : 0);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fillRect(B.x, B.y, B.w, B.h);
        const fill = ctx.createLinearGradient(B.x, 0, B.x + B.w, 0);
        fill.addColorStop(0, '#ff9a2e');
        fill.addColorStop(1, '#ffd45c');
        ctx.fillStyle = fill;
        ctx.fillRect(B.x, B.y, B.w * k, B.h);
        ctx.fillStyle = 'rgba(255,243,201,0.85)';
        for (const r of v.rounds.slice(1)) ctx.fillRect(B.x + B.w * r - 0.5, B.y - 3, 1, B.h + 6);
        for (const h of v.highlights) {
            const x = B.x + B.w * h.x,
                y = h.side === 0 ? B.y - 4 : B.y + B.h + 4;
            ctx.fillStyle = HIGHLIGHT_COLOR[h.kind];
            ctx.beginPath();
            ctx.moveTo(x, y - 2.6);
            ctx.lineTo(x + 2.2, y);
            ctx.lineTo(x, y + 2.6);
            ctx.lineTo(x - 2.2, y);
            ctx.closePath();
            ctx.fill();
        }
        // The knob, and over it while dragging the highlight it would land on.
        const kx = B.x + B.w * (v.scrub ?? k);
        ctx.fillStyle = '#fff3c9';
        ctx.strokeStyle = '#140a26';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(kx, B.y + B.h / 2, v.scrub !== null ? 4.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (v.label) {
            ctx.font = `6px ${ARCADE}`;
            ctx.textAlign = 'center';
            const w = ctx.measureText(v.label).width + 10;
            const lx = Math.max(P.x + w / 2, Math.min(P.x + P.w - w / 2, kx));
            ctx.fillStyle = 'rgba(14,8,36,0.92)';
            ctx.fillRect(lx - w / 2, P.y - 14, w, 11);
            ctx.fillStyle = '#ffe27a';
            ctx.fillText(v.label, lx, P.y - 6);
        }
        for (const b of L.buttons) this.replayButton(b, v);
        ctx.restore();
    }

    /** One of the replay panel's buttons: a small framed key with its picture (or the speed, on the last). */
    private replayButton(b: Box & { action: ReplayButton }, v: ReplayPanelView): void {
        const ctx = this.ctx;
        const main = b.action === 'pause';
        ctx.fillStyle = main ? 'rgba(255,212,92,0.95)' : 'rgba(60,40,110,0.95)';
        slanted(b.x, b.y, b.w, b.h, 3)(ctx);
        ctx.fill();
        ctx.strokeStyle = main ? '#fff3c9' : 'rgba(201,162,74,0.7)';
        ctx.lineWidth = 1;
        ctx.stroke();
        const ink = main ? '#140a26' : '#f2ecff';
        ctx.fillStyle = ink;
        const cx = b.x + b.w / 2,
            cy = b.y + b.h / 2;
        /** A small triangle pointing left (-1) or right (1), its tip at x. */
        const tri = (x: number, dir: number, r = 3.4) => {
            ctx.beginPath();
            ctx.moveTo(x, cy);
            ctx.lineTo(x - dir * r * 1.3, cy - r);
            ctx.lineTo(x - dir * r * 1.3, cy + r);
            ctx.closePath();
            ctx.fill();
        };
        /** A small diamond: a highlight's marker. */
        const diamond = (x: number) => {
            ctx.fillStyle = '#ffe27a';
            ctx.beginPath();
            ctx.moveTo(x, cy - 3.5);
            ctx.lineTo(x + 2.8, cy);
            ctx.lineTo(x, cy + 3.5);
            ctx.lineTo(x - 2.8, cy);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = ink;
        };
        switch (b.action) {
            case 'pause':
                if (v.paused) tri(cx + 4, 1, 4);
                else {
                    ctx.fillRect(cx - 4, cy - 4, 3, 8);
                    ctx.fillRect(cx + 1, cy - 4, 3, 8);
                }
                break;
            case 'back':
                tri(cx - 4, -1);
                tri(cx + 1, -1);
                break;
            case 'forward':
                tri(cx + 4, 1);
                tri(cx - 1, 1);
                break;
            case 'prev':
                tri(cx - 2, -1);
                diamond(cx + 5);
                break;
            case 'next':
                diamond(cx - 5);
                tri(cx + 2, 1);
                break;
            case 'speed':
                ctx.font = `6.5px ${ARCADE}`;
                ctx.textAlign = 'center';
                ctx.fillText(`${v.speed}×`, cx, cy + 2.5);
                break;
        }
    }
}

/** Each kind of highlight's colour on the replay timeline. */
export const HIGHLIGHT_COLOR: Record<HighlightKind, string> = {
    chain: '#ff9a2e',
    fever: '#ffe27a',
    extra: '#ff6bd5',
    guardian: '#ff4d5a',
    bomb: '#7fd8ff',
    ko: '#ffffff',
};

/** The replay panel's buttons, left to right. */
const REPLAY_BUTTONS = ['prev', 'back', 'pause', 'forward', 'next', 'speed'] as const;
/** What a replay panel button does. */
type ReplayButton = (typeof REPLAY_BUTTONS)[number];

/** A box in view units. */
type Box = { x: number; y: number; w: number; h: number };

/**
 * Where the replay panel's parts sit in a view `W` × `H`: the plate, the timeline's track (and the taller strip a
 * tap or drag on it counts in) and a chip for each of `rounds` rounds. Shared by the drawing and the game's taps.
 */
export function replayPanelLayout(W: number, H: number, rounds: number) {
    const wide = W > 320;
    const pw = wide ? Math.min(380, W * 0.62) : W - 14;
    const ph = 58;
    const panel: Box = { x: (W - pw) / 2, y: H - ph - (wide ? 20 : 6), w: pw, h: ph };
    const bar: Box = { x: panel.x + 12, y: panel.y + 22, w: pw - 24, h: 4 };
    const barHit: Box = { x: bar.x - 6, y: bar.y - 10, w: bar.w + 12, h: 22 };
    const cw = 17,
        gap = 3,
        n = Math.max(1, rounds);
    const cx0 = panel.x + pw / 2 - (n * cw + (n - 1) * gap) / 2;
    const chips: Box[] = Array.from({ length: n }, (_, i) => ({
        x: cx0 + i * (cw + gap),
        y: panel.y + 4,
        w: cw,
        h: 11,
    }));
    // The minimise button at the top line's right end, and the tab the minimised panel shrinks to.
    const hide: Box = { x: panel.x + pw - 22, y: panel.y + 4, w: 13, h: 11 };
    const tab: Box = { x: W / 2 - 34, y: H - 17, w: 68, h: 12 };
    // The buttons along the bottom, so a touchscreen can do everything the keys do.
    const bw = 24,
        bgap = 5;
    const bx0 = panel.x + pw / 2 - (REPLAY_BUTTONS.length * bw + (REPLAY_BUTTONS.length - 1) * bgap) / 2;
    const buttons = REPLAY_BUTTONS.map((action, i) => ({
        action,
        x: bx0 + i * (bw + bgap),
        y: panel.y + 38,
        w: bw,
        h: 15,
    }));
    return { panel, bar, barHit, chips, hide, tab, buttons };
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

/** Seconds as m:ss. */
export function clock(t: number): string {
    const s = Math.floor(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A gold heart with a dark edge, as on the HUD's plate. */
function goldHeart(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.18, 1.18);
    drawHeart(ctx, 0, 0.3, '#5a2a08');
    ctx.restore();
    const g = ctx.createLinearGradient(0, y - 4, 0, y + 4);
    g.addColorStop(0, '#fff3b0');
    g.addColorStop(0.5, '#ffd23e');
    g.addColorStop(1, '#e88a10');
    drawHeart(ctx, x, y, g);
}

/** A meadow's fairy as a small round face in a gold ring: her portrait if it has loaded, else her in-game look. */
function hudFace(ctx: CanvasRenderingContext2D, f: Field, x: number, y: number, r: number): void {
    const fy = f.fairy;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 1, x, y, r);
    bg.addColorStop(0, fy.color);
    bg.addColorStop(1, shade(fy.color, 0.3));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();
    const p = fy.portrait;
    if (p && p.img.complete && p.img.naturalWidth > 0) {
        const [fx, fyy, fr] = p.face;
        ctx.drawImage(p.img, fx - fr, fyy - fr, fr * 2, fr * 2, x - r, y - r, r * 2, r * 2);
    } else drawFairy(ctx, fy, x, y + r * 0.15, (r * 2) / 33, 0);
    ctx.restore();
    const ring = () => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
    };
    goldEdge(ctx, ring, y - r, y + r, undefined, 1.3);
}

/** A small violet gem in a gold diamond setting, glinting now and then. */
function gemDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
    const d = (k: number) => {
        ctx.beginPath();
        ctx.moveTo(x, y - k * 1.3);
        ctx.lineTo(x + k, y);
        ctx.lineTo(x, y + k * 1.3);
        ctx.lineTo(x - k, y);
        ctx.closePath();
    };
    goldEdge(ctx, () => d(r), y - r * 1.3, y + r * 1.3, undefined, 1);
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, 0.3, x, y, r);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, '#e2c8ff');
    g.addColorStop(1, '#8a4ad8');
    ctx.fillStyle = g;
    d(r * 0.8);
    ctx.fill();
    const k = Math.max(0, Math.sin(t * 1.7));
    if (k > 0.6) {
        ctx.fillStyle = `rgba(255,255,255,${(k - 0.6) * 2})`;
        sparkle(ctx, x, y, r * 1.6);
    }
}
