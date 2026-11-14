/* The critters that drift through a meadow: puffs, beetles, spinners and the moonseed. */
import * as C from '@/core/config';
import type { CritterKind, MonsterKind, MonsterSheet } from '@/types';

/** Puff seed-tip colour by shots needed, as in Twinkle Star Sprites: red 1, yellow 2, green 3, blue 4, purple 5. */
const PUFF_COLORS = ['#ff7a7a', '#ffe066', '#7be38a', '#6fb2ff', '#c38cff'];
/**
 * A dandelion seed puff. Seed-tip colour shows the shots it takes:
 * red 1, yellow 2, green 3, blue 4, purple 5. Big puffs are drawn larger,
 * and a dew bubble is drawn around bubbled ones.
 */
export function drawPuff(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    phase: number,
    hp: number,
    size: number,
    bubble: number,
): void {
    const tip = PUFF_COLORS[Math.min(PUFF_COLORS.length - 1, hp - 1)];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(phase) * 0.3);
    ctx.strokeStyle = tip + 'bb';
    ctx.lineWidth = hp > 1 ? 1 : 0.7;
    const R = C.PUFF_RADIUS * size;
    const spokes = 10 + hp * 2 + (size > 1 ? 6 : 0);
    for (let i = 0; i < spokes; i++) {
        const a = (Math.PI * 2 * i) / spokes;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
        ctx.fillStyle = tip;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R, Math.sin(a) * R, 1.1 + hp * 0.25, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.fillStyle = '#d9c88f';
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    if (bubble > 0) {
        ctx.rotate(-Math.sin(phase) * 0.3);
        drawDewBubble(ctx, R);
    }
    ctx.restore();
}

/** The dew bubble around a bubbled critter, centred on the current origin. */
function drawDewBubble(ctx: CanvasRenderingContext2D, R: number): void {
    ctx.strokeStyle = 'rgba(200,236,255,0.75)';
    ctx.lineWidth = 1.2;
    ctx.fillStyle = 'rgba(200,236,255,0.12)';
    ctx.beginPath();
    ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.45, -R * 0.55, 2.6, 1.3, -0.6, 0, Math.PI * 2);
    ctx.fill();
}

/** Distance in from the top line or a side wall over which a monster plays its appear frames. */
const APPEAR_SPAN = 30;
/** A monster's cell is drawn this many puff radii across (the body fills about half of it). */
const MONSTER_CELL = 3.9;

/** A critter as drawn on a map with a monster sheet: which monster, and how far it has appeared. */
export interface MonsterLook {
    kind: MonsterKind;
    /** 0 just arriving at the edge of the meadow, 1 fully in. */
    appear: number;
}

/**
 * Which of a sheet's monsters a critter is (one kind per formation, big ones always the big
 * kind) and how far into its appear animation it is. It's worked out from what the renderer
 * sees, so it needs no state and looks the same on a mirrored online meadow; a monster leaving
 * through the top or a side plays its appearance backwards, sparkling away.
 */
export function monsterLook(
    s: MonsterSheet,
    critter: CritterKind,
    x: number,
    y: number,
    size: number,
    maxHp: number,
    wave = 0,
): MonsterLook {
    const pick = wave > 0 ? (wave * 7 + 3) >>> 0 : maxHp - 1;
    const kind =
        critter === 'beetle'
            ? s.shelled
            : critter === 'spinner'
              ? s.spinner
              : size > 1
                ? s.big
                : s.roster[pick % s.roster.length];
    const edge = Math.min(y - (C.CRITTER_TOP - APPEAR_SPAN), x, C.FIELD_W - x);
    return { kind, appear: Math.max(0, Math.min(1, edge / APPEAR_SPAN)) };
}

/**
 * A critter drawn as a map monster. Arriving it plays the sheet's appear frames (sparkle,
 * flash, glowing outline, filled outline, arriving) under the sparkle overlay; once in it
 * idles, now and then talking or beaming. A tougher one wears a gem in the puff colours,
 * so the shots it takes still read at a glance. Returns false while the sheet is loading.
 */
export function drawMonster(
    ctx: CanvasRenderingContext2D,
    s: MonsterSheet,
    look: MonsterLook,
    x: number,
    y: number,
    phase: number,
    hp: number,
    size: number,
    bubble: number,
    t: number,
): boolean {
    if (!s.img.complete || !s.img.naturalWidth) return false;
    const R = C.PUFF_RADIUS * size;
    const D = R * MONSTER_CELL;
    const k = look.appear;
    const seed = phase * 0.37 + x * 0.013;
    let frame: number;
    if (k < 1) frame = Math.min(4, Math.floor(k * 5));
    else {
        const c = (t * 0.45 + seed) % 5;
        frame = c < 0.35 ? 6 : c > 4.55 ? 7 : 5;
    }
    const bob = k >= 1 ? Math.sin(t * 3.2 + seed * 9) * 0.7 : 0;
    const tip = PUFF_COLORS[Math.min(PUFF_COLORS.length - 1, hp - 1)];
    ctx.save();
    ctx.translate(x, y);
    const cell = s.cell;
    ctx.drawImage(s.img, frame * cell, s.rows[look.kind] * cell, cell, cell, -D / 2, -D / 2 + bob, D, D);
    if (k < 1) {
        ctx.globalAlpha = 0.85;
        const o = Math.min(7, Math.floor(k * 8));
        ctx.drawImage(s.img, o * cell, s.overlay * cell, cell, cell, -D / 2, -D / 2, D, D);
        ctx.globalAlpha = 1;
    }
    // A tougher one wears a gem in the puff colour of the shots it still takes (a plain one takes one).
    if (hp > 1) {
        const gy = R * 0.95 + bob;
        ctx.globalAlpha = 0.4 + 0.6 * k;
        ctx.fillStyle = tip;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, gy - 2.6);
        ctx.lineTo(2.2, gy);
        ctx.lineTo(0, gy + 2.6);
        ctx.lineTo(-2.2, gy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
    }
    // Shells and dew bubbles: one ring per hit they still take.
    for (let i = 0; i < bubble; i++) drawDewBubble(ctx, R + i * 2.5);
    ctx.restore();
    return true;
}
/** A shelled beetle. The glossy dome is its shell; the dot colour is the body's hits. */
export function drawBeetle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    vx: number,
    hp: number,
    shell: number,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sign(vx) * 0.35);
    ctx.strokeStyle = '#3b2a1c';
    ctx.lineWidth = 1;
    for (const s of [-1, 1])
        for (const k of [-3, 0, 3]) {
            ctx.beginPath();
            ctx.moveTo(s * 4, k);
            ctx.lineTo(s * 9, k + 2);
            ctx.stroke();
        }
    ctx.fillStyle = hp > 1 ? '#5aa98a' : '#a8743f';
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 8.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3b2a1c';
    ctx.beginPath();
    ctx.arc(0, -8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3b2a1c';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 8);
    ctx.stroke();
    if (shell > 0) {
        ctx.strokeStyle = `rgba(217,241,255,${0.45 + shell * 0.25})`;
        ctx.lineWidth = 1.2 + shell * 0.4;
        ctx.fillStyle = 'rgba(217,241,255,0.14)';
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(-4, -5, 3, 1.5, -0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
/** A maple-seed spinner. */
export function drawSpinner(ctx: CanvasRenderingContext2D, x: number, y: number, phase: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(phase * 3);
    ctx.fillStyle = '#e8a35c';
    ctx.strokeStyle = '#a8612b';
    ctx.lineWidth = 0.8;
    for (const s of [0, Math.PI]) {
        ctx.save();
        ctx.rotate(s);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(4, -6, 12, -4);
        ctx.quadraticCurveTo(8, 1, 0, 0);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    ctx.fillStyle = '#7a4320';
    ctx.beginPath();
    ctx.arc(0, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
/** The moonseed: a pale orb with a crescent, ringed by a slow pulse. */
export function drawMoonseed(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    ctx.save();
    ctx.translate(x, y);
    const pulse = (t * 1.5) % 1;
    ctx.strokeStyle = `rgba(207,233,255,${1 - pulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 10 + pulse * 10, 0, Math.PI * 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(-3, -3, 1, 0, 0, 11);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#6fb7e8');
    ctx.fillStyle = g;
    ctx.shadowColor = '#9fd3ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#26406b';
    ctx.beginPath();
    ctx.arc(1, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9f6ff';
    ctx.beginPath();
    ctx.arc(3.5, -1.5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}
