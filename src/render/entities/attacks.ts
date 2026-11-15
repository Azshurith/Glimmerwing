/* Attacks sent from the rival's meadow: fireballs, brambles, comets and Extra Attack critters. */
import * as C from '@/core/config';

import { PALETTE } from '@/render/theme';

/** Fireball colours: [outer flame, inner flame, core] by state. */
const FIRE: Record<'p1' | 'p2' | 'fever', [string, string, string]> = {
    p1: ['#ff6a1a', '#ffb347', '#fff1c4'],
    p2: ['#9b4dff', '#d29bff', '#f6e8ff'],
    fever: ['#ffd21a', '#fff27a', '#ffffff'],
};

/** How a fireball looks: orange as sent ('p1'), purple shot back once ('p2'), Fever yellow, or flashing. */
export type FireLook = 'p1' | 'p2' | 'fever' | 'reverse';

/**
 * The look of a fireball shot back `reflects` times, the same on both sides: orange as it's sent (Fever yellow
 * in Fever), purple once it's been shot back, and flashing every colour once it's been shot back again.
 */
export function fireLook(reflects: number, fever?: boolean): FireLook {
    return reflects >= 2 ? 'reverse' : reflects === 1 ? 'p2' : fever ? 'fever' : 'p1';
}

/** Glow sprites are painted at this many pixels per meadow unit; a soft glow needs no more. */
const GLOW_RES = 3;
/** A Reverse fireball's cycling glow is cached in hue steps this many degrees apart. */
const GLOW_HUE_STEP = 15;
/** Cached glow sprites by colour and size. */
const glows = new Map<string, HTMLCanvasElement>();

/** A new offscreen canvas of `w` by `h` pixels, and its context. */
function offscreen(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    return [c, c.getContext('2d')!];
}

/**
 * Fills the centred disc of radius `reach` with a soft glow in `color`: an alpha falloff, then
 * tinted (a gradient straight to transparent would darken on the way).
 */
function paintGlow(g: CanvasRenderingContext2D, cx: number, cy: number, reach: number, color: string): void {
    g.save();
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, reach);
    grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(cx - reach, cy - reach, reach * 2, reach * 2);
    g.restore();
}

/**
 * The soft glow behind a fireball of radius `r` in `color`, painted once and reused: it stands
 * in for the canvas shadow the flames used to cast, reaching about as far out.
 */
function fireGlow(color: string, r: number, size: number): HTMLCanvasElement {
    const key = `${color}|${r.toFixed(1)}`;
    let c = glows.get(key);
    if (c) return c;
    const px = (r * 1.35 + 4 + size) * GLOW_RES;
    const [cv, g] = offscreen(px * 2, px * 2);
    paintGlow(g, cv.width / 2, cv.height / 2, cv.width / 2, color);
    glows.set(key, cv);
    return cv;
}

/** Flame tongues around a fireball: five, flickering out of step. */
const TONGUES = 5;

/**
 * A fireball's flame tongues at the origin, streaming toward angle `ang`: two layers (outer
 * colour, then a shorter inner one), each one path and one fill. `stretch` (0 to 1) lengthens
 * them with speed and `flick(i)` gives each tongue's flicker (0.5 to 1).
 */
function paintFlames(
    ctx: CanvasRenderingContext2D,
    r: number,
    ang: number,
    stretch: number,
    flick: (i: number) => number,
    outer: string,
    inner: string,
): void {
    for (let layer = 0; layer < 2; layer++) {
        ctx.fillStyle = layer ? inner : outer;
        const k = layer ? 0.62 : 1;
        ctx.beginPath();
        for (let i = 0; i < TONGUES; i++) {
            const spread = (i - (TONGUES - 1) / 2) * 0.32;
            const len = r * (1.5 + stretch * 1.2) * flick(i) * k;
            const a = ang + spread;
            const tipx = Math.cos(a) * (r * 0.55 + len),
                tipy = Math.sin(a) * (r * 0.55 + len);
            const nx = -Math.sin(a) * r * 0.42 * k,
                ny = Math.cos(a) * r * 0.42 * k;
            ctx.moveTo(nx, ny);
            ctx.quadraticCurveTo(tipx * 0.55 + nx * 0.6, tipy * 0.55 + ny * 0.6, tipx, tipy);
            ctx.quadraticCurveTo(tipx * 0.55 - nx * 0.6, tipy * 0.55 - ny * 0.6, -nx, -ny);
            ctx.closePath();
        }
        ctx.fill();
    }
}

/**
 * A fireball's ball at the origin: the flame-coloured disc, its shaded core (dimmer and smaller
 * the more of it `hurt` says has been shot away) and its little face, as on the TSS fireballs.
 */
function paintBall(
    ctx: CanvasRenderingContext2D,
    r: number,
    hurt: number,
    outer: string,
    inner: string,
    core: string,
    faceLine: number,
): void {
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    const g = ctx.createRadialGradient(-r * 0.25, -r * 0.3, 0, 0, 0, r);
    g.addColorStop(0, core);
    g.addColorStop(0.55, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.globalAlpha = 1 - hurt * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, r * (0.9 - hurt * 0.2), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(60,20,10,0.85)';
    const ey = -r * 0.1,
        ex = r * 0.3;
    ctx.beginPath();
    ctx.ellipse(-ex, ey, r * 0.1, r * 0.17, 0, 0, Math.PI * 2);
    ctx.ellipse(ex, ey, r * 0.1, r * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,20,10,0.75)';
    ctx.lineWidth = faceLine;
    ctx.beginPath();
    ctx.arc(0, r * 0.22, r * 0.18, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
}

/*
 * Sprites. A fireball that isn't a Reverse is drawn from two cached images: its glow and flames,
 * painted streaming straight up and turned to its flight, and its ball and face, upright. Both are
 * painted for a fireball of radius 1 and scaled, so one set serves every size. The flicker is cut
 * into FLICKER_FRAMES poses and the speed stretch into two; a fireball costs two image draws, where
 * painting it live was a glow, four flame fills, two ball fills and the face, which a screenful in
 * Fever couldn't afford.
 */
/** Sprite pixels per unit of fireball radius. */
const SPRITE_PX = 36;
/** Flicker poses painted, and the two speed stretches. */
const FLICKER_FRAMES = 5;
const STRETCHES = [0.15, 0.85];
/** The flame sprite's extent in radii: either side, above the ball's centre and below it. */
const FLAME_SIDE = 1.9,
    FLAME_UP = 3.2,
    FLAME_DOWN = 1.8;
/** The ball sprite's half-width in radii, and how many steps of hurt are painted. */
const BALL_HALF = 1.05;
const HURT_STEPS = 4;
/** Painted sprites by look, pose and stretch (flames) or look and hurt (balls). */
const flameSprites = new Map<string, HTMLCanvasElement>();
const ballSprites = new Map<string, HTMLCanvasElement>();

/** The colours of a look: [outer, inner, core]; `flash` is a Fever fireball's other half of its flash. */
function fireColours(look: Exclude<FireLook, 'reverse'>, flash: boolean): [string, string, string] {
    const [outer, inner, core] = FIRE[look];
    return look === 'fever' && flash ? [inner, '#ffffff', core] : [outer, inner, core];
}

/** The glow-and-flames sprite for a look, flicker pose and stretch, pointing up. */
function flameSprite(
    look: Exclude<FireLook, 'reverse'>,
    flash: boolean,
    pose: number,
    stretch: number,
): HTMLCanvasElement {
    const key = `${look}${flash ? '*' : ''}|${pose}|${stretch}`;
    let c = flameSprites.get(key);
    if (c) return c;
    const [outer, inner] = fireColours(look, flash);
    const [cv, g] = offscreen(FLAME_SIDE * 2 * SPRITE_PX, (FLAME_UP + FLAME_DOWN) * SPRITE_PX);
    const cx = FLAME_SIDE * SPRITE_PX,
        cy = FLAME_UP * SPRITE_PX;
    paintGlow(g, cx, cy, 1.75 * SPRITE_PX, outer);
    g.translate(cx, cy);
    const phase = (pose / FLICKER_FRAMES) * Math.PI * 2;
    paintFlames(
        g,
        SPRITE_PX,
        -Math.PI / 2,
        STRETCHES[stretch],
        i => 0.75 + 0.25 * Math.sin(phase + i * 1.9),
        outer,
        inner,
    );
    flameSprites.set(key, cv);
    return cv;
}

/** The ball-and-face sprite for a look and step of hurt. */
function ballSprite(look: Exclude<FireLook, 'reverse'>, flash: boolean, hurtStep: number): HTMLCanvasElement {
    const key = `${look}${flash ? '*' : ''}|${hurtStep}`;
    let c = ballSprites.get(key);
    if (c) return c;
    const [outer, inner, core] = fireColours(look, flash);
    const [cv, g] = offscreen(BALL_HALF * 2 * SPRITE_PX, BALL_HALF * 2 * SPRITE_PX);
    g.translate(cv.width / 2, cv.height / 2);
    paintBall(g, SPRITE_PX, hurtStep / HURT_STEPS, outer, inner, core, SPRITE_PX * 0.1);
    ballSprites.set(key, cv);
    return cv;
}

/**
 * A fireball (TSS Normal or Reverse Attack): a glowing core with a little face, wrapped in flickering
 * flame tongues that stream back along its flight. `size` 1 to 4 scales it; `hurt` (0 to 1) is how much
 * of it has been shot away, shown as a dimmer, smaller core. Fever ones flash yellow, and Reverse ones
 * cycle through colours so they can't be mistaken.
 */
export function drawFireball(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    t: number,
    spin: number,
    vx: number,
    vy: number,
    size: number,
    look: FireLook,
    hurt: number,
): void {
    if (look === 'reverse') return drawReverseFireball(ctx, x, y, t, spin, vx, vy, size, hurt);
    const r = C.fireballRadius(size);
    const flash = look === 'fever' && Math.floor(t * 14) % 2 === 0;
    // Flames stream away from the direction of travel (straight up while it's barely moving).
    const sp = Math.hypot(vx, vy);
    const ang = sp > 30 ? Math.atan2(-vy, -vx) : -Math.PI / 2;
    const cycle = (t * 22 + spin * 3) / (Math.PI * 2);
    const pose = (((Math.floor(cycle * FLICKER_FRAMES) % FLICKER_FRAMES) + FLICKER_FRAMES) % FLICKER_FRAMES) | 0;
    const flames = flameSprite(look, flash, pose, sp >= 100 ? 1 : 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.drawImage(flames, -FLAME_SIDE * r, -FLAME_UP * r, FLAME_SIDE * 2 * r, (FLAME_UP + FLAME_DOWN) * r);
    ctx.restore();
    const pulse = r * (1 + Math.sin(t * 9 + spin) * 0.05) * BALL_HALF;
    const ball = ballSprite(look, flash, Math.round(Math.max(0, Math.min(1, hurt)) * HURT_STEPS));
    ctx.drawImage(ball, x - pulse, y - pulse, pulse * 2, pulse * 2);
}

/**
 * A Reverse fireball, painted live since its colours cycle without end: the cached glow for its
 * hue step, its flames, its ball and face, and a flashing ring so it reads at a glance.
 */
function drawReverseFireball(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    t: number,
    spin: number,
    vx: number,
    vy: number,
    size: number,
    hurt: number,
): void {
    const r = C.fireballRadius(size);
    const h = (t * 900 + spin * 60) % 360;
    const outer = `hsl(${h}, 100%, 58%)`;
    const inner = `hsl(${(h + 120) % 360}, 100%, 72%)`;
    const sp = Math.hypot(vx, vy);
    const ang = sp > 30 ? Math.atan2(-vy, -vx) : -Math.PI / 2;
    ctx.save();
    ctx.translate(x, y);
    const glow = fireGlow(`hsl(${Math.round(h / GLOW_HUE_STEP) * GLOW_HUE_STEP}, 100%, 58%)`, r, size);
    const gw = glow.width / GLOW_RES;
    ctx.drawImage(glow, -gw / 2, -gw / 2, gw, gw);
    const flick = (i: number) => 0.75 + 0.25 * Math.sin(t * 22 + i * 1.9 + spin * 3);
    paintFlames(ctx, r, ang, Math.min(1, sp / 200), flick, outer, inner);
    ctx.scale(1 + Math.sin(t * 9 + spin) * 0.05, 1 + Math.sin(t * 9 + spin) * 0.05);
    paintBall(ctx, r, hurt, outer, inner, '#ffffff', Math.max(0.8, r * 0.09));
    ctx.strokeStyle = Math.floor(t * 12) % 2 ? 'rgba(190,120,255,0.95)' : 'rgba(120,255,160,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/**
 * A Reverse fireball's glowing trail: its recent positions (x, y pairs, oldest first) drawn as a tapering,
 * colour-cycling streak, so it bends with the path the Reverse is retracing.
 */
export function drawReverseTrail(ctx: CanvasRenderingContext2D, tail: number[], t: number, size: number): void {
    const n = tail.length / 2;
    if (n < 2) return;
    const r = C.fireballRadius(size);
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
        const k = i / (n - 1);
        ctx.strokeStyle = `hsla(${(t * 900 + i * 28) % 360}, 100%, 65%, ${0.15 + k * 0.55})`;
        ctx.lineWidth = r * (0.4 + k * 1.1);
        ctx.beginPath();
        ctx.moveTo(tail[(i - 1) * 2], tail[(i - 1) * 2 + 1]);
        ctx.lineTo(tail[i * 2], tail[i * 2 + 1]);
        ctx.stroke();
    }
    ctx.restore();
}

/** The flash as a fireball breaks and turns into a Reverse: a white burst and a widening ring. `k` runs 1 to 0. */
export function drawFireFlash(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, size: number): void {
    const r = C.fireballRadius(size);
    ctx.save();
    ctx.globalAlpha = k;
    const glow = fireGlow('#ffffff', r, size);
    const gw = glow.width / GLOW_RES;
    ctx.drawImage(glow, x - gw / 2, y - gw / 2, gw, gw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, r * (1 + (1 - k) * 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * k + 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r + (1 - k) * 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/** A fireball taking a shot that didn't break it: a brief white flash over it. `k` runs 1 to 0. */
export function drawFireHit(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, size: number): void {
    ctx.save();
    ctx.globalAlpha = 0.75 * k;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, C.fireballRadius(size) * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** A thorny bramble ball. */
export function drawBramble(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.strokeStyle = PALETTE.bramble;
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, C.BRAMBLE_RADIUS, C.BRAMBLE_RADIUS * 0.45, (Math.PI * i) / 3, 0, Math.PI * 2);
        ctx.stroke();
    }
    ctx.fillStyle = '#e7c9ff';
    for (let i = 0; i < 9; i++) {
        const a = (Math.PI * 2 * i) / 9;
        ctx.save();
        ctx.rotate(a);
        ctx.translate(C.BRAMBLE_RADIUS * 0.9, 0);
        ctx.beginPath();
        ctx.moveTo(0, -1.5);
        ctx.lineTo(4, 0);
        ctx.lineTo(0, 1.5);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();
}
/** An unbreakable comet: a hot pink core with a long straight tail. */
export function drawComet(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const len = 60;
    const g = ctx.createLinearGradient(x, y - len, x, y);
    g.addColorStop(0, 'rgba(255,111,156,0)');
    g.addColorStop(1, 'rgba(255,190,210,0.95)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 1, y - len);
    ctx.lineTo(x + 1, y - len);
    ctx.lineTo(x + 6, y);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ff6f9c';
    ctx.shadowBlur = 14 + Math.sin(t * 30) * 4;
    ctx.beginPath();
    ctx.arc(x, y, C.COMET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}
/** An Extra Attack critter, drawn in the sender's colour and her critter's look. */
export function drawImp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    t: number,
    lining: boolean,
    look: string,
    vx: number,
    vy: number,
): void {
    ctx.save();
    if (lining) {
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x, C.FIELD_H);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }
    ctx.translate(x, y);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    const eyes = (dy = -1) => {
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#1a1033';
        ctx.fillRect(-1.8, dy, 1.2, 1.2);
        ctx.fillRect(0.6, dy, 1.2, 1.2);
    };
    const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 14));
    switch (look) {
        case 'burr': {
            // A spiky seed burr, rolling.
            ctx.rotate(t * 3);
            ctx.shadowBlur = 6;
            ctx.beginPath();
            for (let i = 0; i < 18; i++) {
                const a = (Math.PI * 2 * i) / 18,
                    r = i % 2 ? 4 : 7.5;
                ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            ctx.rotate(-t * 3);
            eyes(-1);
            break;
        }
        case 'glimmer': {
            // A spinning crystal.
            const w = 3 + 2.5 * Math.abs(Math.cos(t * 6));
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(w, 0);
            ctx.lineTo(0, 7);
            ctx.lineTo(-w, 0);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.moveTo(0, -5);
            ctx.lineTo(w * 0.4, -1);
            ctx.lineTo(0, 1);
            ctx.closePath();
            ctx.fill();
            break;
        }
        case 'dart': {
            // A petal pointing where it's flying.
            ctx.rotate(Math.atan2(vy, vx) - Math.PI / 2);
            ctx.shadowBlur = 6;
            ctx.beginPath();
            ctx.moveTo(0, 8);
            ctx.quadraticCurveTo(6, 0, 0, -7);
            ctx.quadraticCurveTo(-6, 0, 0, 8);
            ctx.fill();
            ctx.globalAlpha = 0.5;
            ctx.beginPath();
            ctx.moveTo(0, -7);
            ctx.lineTo(0, -13);
            ctx.lineWidth = 1.2;
            ctx.stroke();
            break;
        }
        case 'cinder': {
            // A flickering ember.
            const fl = 1 + 0.25 * Math.sin(t * 30);
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.moveTo(0, -9 * fl);
            ctx.quadraticCurveTo(6, -1, 0, 5);
            ctx.quadraticCurveTo(-6, -1, 0, -9 * fl);
            ctx.fill();
            ctx.fillStyle = '#fff3c4';
            ctx.beginPath();
            ctx.arc(0, 1, 2.2, 0, Math.PI * 2);
            ctx.fill();
            break;
        }
        case 'moth': {
            // A dusk moth: broad flapping wings, dark body.
            ctx.globalAlpha = 0.85;
            for (const s of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(0, -1);
                ctx.quadraticCurveTo(s * 11 * flap, -9, s * 10 * flap, 2);
                ctx.quadraticCurveTo(s * 6 * flap, 6, 0, 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#2a1846';
            ctx.beginPath();
            ctx.ellipse(0, 0, 2, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = color;
            ctx.fillRect(-1.6, -2, 1.1, 1.1);
            ctx.fillRect(0.5, -2, 1.1, 1.1);
            break;
        }
        default: {
            // A hearth spark: glowing body, fluttering wings, little rays.
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.ellipse(-5, -1, 5 * flap, 3, -0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(5, -1, 5 * flap, 3, 0.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(0, 0, 3.6, 0, Math.PI * 2);
            ctx.fill();
            eyes();
        }
    }
    ctx.restore();
}
