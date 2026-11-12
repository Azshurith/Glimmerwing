import * as C from '../core/config';
import type { Field } from '../game/field';
import type { BannerView, ConsoleView, Fairy, HudTag, Layer, SelectView, TitleView, WingShape } from '../types';
import { Hud } from './hud';
import { SelectScreen } from './screens/select-screen';
import { TitleScreen } from './screens/title-screen';
import { drawSprite, PlayerAnimator } from './sprites';
import { PALETTE } from './theme';

/** Draws the game onto the canvas from read-only game state; the simulation never draws. */
export class Renderer {
    private ctx: CanvasRenderingContext2D;
    private motes: { x: number; y: number; s: number; p: number }[] = [];
    /** Per-meadow animation state for sprite characters; a new round's Field starts fresh (and revives). */
    private anims = new WeakMap<Field, PlayerAnimator>();
    private selectScreen: SelectScreen;
    private titleScreen: TitleScreen;
    /** HUD, console, popups and banners for a match. */
    private hudLayer: Hud;

    constructor(private canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d')!;
        this.selectScreen = new SelectScreen(this.ctx, (...a) => this.fairy(...a));
        this.titleScreen = new TitleScreen(this.ctx);
        this.hudLayer = new Hud(this.ctx);
        for (let i = 0; i < 26; i++) {
            this.motes.push({
                x: Math.random() * C.FIELD_W,
                y: Math.random() * C.FIELD_H,
                s: 0.5 + Math.random(),
                p: Math.random() * 6,
            });
        }
    }

    /** Match the canvas's pixel size to its size on screen. */
    resize(): void {
        const rect = this.canvas.getBoundingClientRect();
        // Sharp on high-density screens, but capped so phones and 4K monitors don't fill
        // more pixels than they can redraw at 60fps.
        const dpr = Math.min(window.devicePixelRatio || 1, 3, 2400 / Math.max(1, rect.width));
        this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
        this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    }

    /** Start a frame: scale to the fixed view and clear it. */
    begin(): void {
        const { ctx, canvas } = this;
        ctx.setTransform(canvas.width / C.VIEW_W, 0, 0, canvas.height / C.VIEW_H, 0, 0);
        ctx.fillStyle = '#100b24';
        ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }

    /** Paint a meadow's sky and drifting motes. */
    private sky(time: number): void {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, C.FIELD_H);
        g.addColorStop(0, PALETTE.skyTop);
        g.addColorStop(1, PALETTE.skyBottom);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
        // Drifting fireflies in the background.
        for (const m of this.motes) {
            const y = (m.y - time * 6 * m.s + C.FIELD_H * 10) % C.FIELD_H;
            const x = m.x + Math.sin(time * 0.8 + m.p) * 6;
            ctx.globalAlpha = 0.25 + 0.25 * Math.sin(time * 2 + m.p);
            ctx.fillStyle = '#e9ff9a';
            ctx.beginPath();
            ctx.arc(x, y, m.s, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Meadow grass along the bottom.
        ctx.fillStyle = PALETTE.grass;
        ctx.beginPath();
        ctx.moveTo(0, C.FIELD_H);
        for (let x = 0; x <= C.FIELD_W; x += 6) {
            const h = 10 + ((x * 37) % 11) + Math.sin(time * 1.5 + x * 0.2) * 1.5;
            ctx.lineTo(x, C.FIELD_H - h);
            ctx.lineTo(x + 3, C.FIELD_H - 6);
        }
        ctx.lineTo(C.FIELD_W, C.FIELD_H);
        ctx.fill();
    }

    /** Draw one meadow at x offset `ox`: sky, critters, shots, bursts, attacks, bosses, the fairy and its HUD. */
    field(f: Field, ox: number, wins: number, time: number, tag: HudTag): void {
        const ctx = this.ctx;
        const color = f.fairy.color;
        ctx.save();
        const sx = f.shake ? (Math.random() - 0.5) * f.shake : 0;
        const sy = f.shake ? (Math.random() - 0.5) * f.shake : 0;
        ctx.translate(ox + sx, sy);
        ctx.beginPath();
        ctx.rect(0, 0, C.FIELD_W, C.FIELD_H);
        ctx.clip();
        this.sky(time);

        if (f.fever > 0) {
            ctx.fillStyle = `rgba(255,170,120,${0.08 + 0.05 * Math.sin(time * 10)})`;
            ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
        }

        // Pollen bursts.
        for (const b of f.bursts) {
            const k = b.age / C.BURST_LIFE;
            const r = b.maxR * Math.min(1, b.age / (C.BURST_LIFE * 0.6));
            ctx.globalAlpha = 1 - k;
            ctx.strokeStyle = '#ffe9a8';
            ctx.lineWidth = 2.5 * (1 - k) + 0.8;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = (1 - k) * 0.16;
            ctx.fillStyle = '#ffe9a8';
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (const p of f.puffs) {
            if (p.moonseed) this.moonseed(p.x, p.y, time);
            else if (p.kind === 'beetle') this.beetle(p.x, p.y, p.vx, p.hp, p.shell);
            else if (p.kind === 'spinner') this.spinner(p.x, p.y, p.phase);
            else this.puff(p.x, p.y, p.phase, p.hp, p.size, p.shell);
        }
        if (f.moonseedWarning)
            this.hudLayer.cue('Moonseed rising', '#cfe9ff', time, 52, (x, y) => this.crescentIcon(x, y));
        if (f.hitstop > 0) {
            ctx.fillStyle = `rgba(220,240,255,${f.hitstop})`;
            ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
        }
        for (const a of f.attacks) {
            if (a.kind === 'bramble') this.bramble(a.x, a.y, a.spin);
            else if (a.kind === 'comet') this.comet(a.x, a.y, time);
            else if (a.kind === 'imp')
                this.imp(
                    a.x,
                    a.y,
                    a.color ?? '#ffffff',
                    time + a.spin,
                    a.flight === 'seeker' && a.seekT > 0,
                    a.look ?? 'spark',
                    a.vx,
                    a.vy,
                );
            else {
                this.star(a.x, a.y, a.spin, a.level, a.hp, a.vx, a.vy, a.flight === 'seeker' && a.seekT > 0);
                // Reverse stars flash purple and green: break one and it becomes your Extra Attack.
                if (a.level >= 2) {
                    const purple = Math.floor(time * 12) % 2 === 0;
                    ctx.strokeStyle = purple ? 'rgba(190,120,255,0.95)' : 'rgba(120,255,160,0.95)';
                    ctx.lineWidth = 2;
                    ctx.shadowColor = ctx.strokeStyle;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(a.x, a.y, C.STAR_RADIUS + 4, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            }
        }
        for (const c of f.crows)
            this.crow(c.x, c.y, c.state === 'dive' ? Math.atan2(c.vy, c.vx) - Math.PI / 2 : 0, time, c.hp / C.CROW_HP);
        if (f.crowWarning) this.hudLayer.cue('A crow stirs', '#ff9fb8', time, 76);
        // A reeling guardian blinks and shudders.
        if (f.moth && !(f.moth.stun > 0 && Math.floor(time * 24) % 2 === 0))
            this.guardian(
                f.moth.x +
                    ((f.moth.stage === 'attack' && f.moth.stageT < 0.6) || f.moth.stun > 0
                        ? Math.sin(time * 90) * 2
                        : 0),
                f.moth.y,
                f.moth.t,
                f.moth.hp / C.MOTH_HP,
                f.moth.guardian.color,
                f.moth.wing as WingShape,
            );

        ctx.fillStyle = '#ff7aa8';
        for (const b of f.bullets) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const s of f.shots) {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            if (s.charged) {
                ctx.shadowBlur = 14;
                this.chargeShot(s.x, s.y, s.vx, s.r ?? 10, s.style ?? 'orb', s.life, time);
            } else {
                ctx.shadowBlur = 4;
                ctx.beginPath();
                ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;
        }

        // Sprite characters animate from what's visible here (position, life, stun); knockouts too.
        const sprite = f.fairy.sprite;
        let anim: PlayerAnimator | undefined;
        let layers: Layer[] = [];
        if (sprite) {
            anim = this.anims.get(f);
            if (!anim) {
                anim = new PlayerAnimator(sprite);
                this.anims.set(f, anim);
            }
            const p = f.player;
            layers = anim.update(time, p.x, p.y, p.hull, p.stun > 0);
            if (!f.alive) for (const l of layers) drawSprite(ctx, sprite, l, p.x, p.y);
        }

        if (f.alive) {
            const p = f.player;
            // The hit animation is the feedback while it plays; the blink takes over after.
            const blink = p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 && !anim?.hitPlaying(time);
            // Impaired (after a stun): dimmed and flickering.
            if (p.impair > 0) ctx.globalAlpha = 0.55 + 0.2 * Math.sin(time * 20);
            if (!blink) {
                const drawn = sprite && layers.length > 0 && layers.every(l => drawSprite(ctx, sprite, l, p.x, p.y));
                if (drawn) this.chargeRing(f.fairy, p.x, p.y, 1, Math.min(1, p.charge));
                else this.fairy(f.fairy, p.x, p.y, 1, time, Math.min(1, p.charge));
            }
            ctx.globalAlpha = 1;
            if (p.stun > 0) {
                // Stunned: little stars circling her head.
                ctx.fillStyle = '#fff3a8';
                for (let i = 0; i < 3; i++) {
                    const a = time * 8 + (Math.PI * 2 * i) / 3;
                    const sx = p.x + Math.cos(a) * 10,
                        sy = p.y - 14 + Math.sin(a) * 3;
                    ctx.beginPath();
                    for (let k = 0; k < 10; k++) {
                        const rr = k % 2 ? 1.2 : 3,
                            aa = (Math.PI * k) / 5;
                        ctx.lineTo(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
                    }
                    ctx.closePath();
                    ctx.fill();
                }
            }
            if (!blink && p.over > 0) {
                ctx.strokeStyle = f.fairy.guardian.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.9;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.over);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        if (f.bloom > 0) this.bombFx(f, time);
        if (f.slow > 0) {
            ctx.fillStyle = `rgba(168,231,127,${0.07 * Math.min(1, f.slow)})`;
            ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
        }

        for (const pt of f.particles) {
            ctx.globalAlpha = pt.life / pt.max;
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, pt.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        for (const pu of f.popups) this.hudLayer.popup(pu.text, pu.x, pu.y, pu.age);

        this.hudLayer.meadow(
            f,
            wins,
            time,
            tag,
            (x, y, c) => this.heart(x, y, c),
            (x, y, c) => this.blossom(x, y, c),
        );
        ctx.restore();
    }

    /** A fairy's bomb, drawn by style while it sweeps. */
    private bombFx(f: Field, time: number): void {
        const ctx = this.ctx;
        const bomb = f.fairy.bomb;
        const k = 1 - f.bloom / bomb.time;
        const { x: ox, y: oy } = f.bloomAt;
        const W = C.FIELD_W,
            H = C.FIELD_H;
        ctx.save();
        ctx.fillStyle = bomb.color;
        ctx.strokeStyle = bomb.color;
        const ring = (cx: number, cy: number, R: number, n: number, spin: number) => {
            for (let i = 0; i < n; i++) {
                const a = (Math.PI * 2 * i) / n + spin;
                ctx.save();
                ctx.translate(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
                ctx.rotate(a);
                this.bombPiece(bomb.shape, k);
                ctx.restore();
            }
        };
        switch (bomb.style) {
            case 'dash': {
                if (k < 0.65) {
                    const head = (k / 0.65) * (W + 40) - 20;
                    ctx.globalAlpha = 0.16;
                    ctx.fillRect(0, oy - 70, Math.max(0, head), 140);
                    ctx.globalAlpha = 0.9;
                    for (let wx = head - 10; wx > -10; wx -= 26) {
                        const r = 6 + 6 * Math.abs(Math.sin(wx * 0.3 + time * 20));
                        ctx.beginPath();
                        ctx.arc(wx, oy + Math.sin(wx * 0.17) * 30, r, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(head, oy, 9, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.globalAlpha = 1 - (k - 0.65) / 0.35;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, W, H);
                }
                break;
            }
            case 'blast': {
                const R = 30 + 400 * k;
                ctx.globalAlpha = (1 - k) * 0.25;
                ctx.beginPath();
                ctx.arc(ox, oy, R, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1 - k;
                ctx.lineWidth = 6 * (1 - k) + 1;
                ctx.stroke();
                ring(ox, oy, R, 28, k * 2);
                ctx.globalAlpha = (1 - k) * 0.8;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(ox, oy, 40 * (1 - k), 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'vortex': {
                const cx = W / 2,
                    cy = H / 2,
                    R = 30 + 260 * k,
                    turned = Math.min((Math.PI * 2) / 3, k * Math.PI * 2.4);
                ctx.globalAlpha = 0.12 * (1 - k) + 0.05;
                ctx.beginPath();
                ctx.arc(cx, cy, R, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 0.85 * (1 - k * 0.6);
                for (let arm = 0; arm < 3; arm++) {
                    const base = (Math.PI * 2 * arm) / 3 - Math.PI;
                    for (let t = 0; t <= 1; t += 0.06) {
                        const a = base + turned * t + time * 2,
                            rr = R * t;
                        ctx.save();
                        ctx.translate(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
                        ctx.rotate(a);
                        this.bombPiece(bomb.shape, k);
                        ctx.restore();
                    }
                }
                break;
            }
            case 'fan': {
                const R = 40 + 360 * k;
                ctx.globalAlpha = 0.14 * (1 - k) + 0.04;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.arc(ox, oy, R, -Math.PI / 2 - 1.13, -Math.PI / 2 + 1.13);
                ctx.closePath();
                ctx.fill();
                ctx.globalAlpha = 1 - k * 0.5;
                for (let i = 0; i < 13; i++) {
                    const a = -Math.PI / 2 - 1.13 + (2.26 * i) / 12;
                    for (const rr of [R, R * 0.66, R * 0.33]) {
                        ctx.save();
                        ctx.translate(ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
                        ctx.rotate(a + time * 6);
                        this.bombPiece(bomb.shape, k);
                        ctx.restore();
                    }
                }
                break;
            }
            case 'beam': {
                const beam = -Math.PI + k * Math.PI;
                ctx.globalAlpha = 0.12;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.arc(ox, oy, 420, -Math.PI, beam);
                ctx.closePath();
                ctx.fill();
                const ex = ox + Math.cos(beam) * 420,
                    ey = oy + Math.sin(beam) * 420;
                ctx.globalAlpha = 1;
                ctx.lineCap = 'round';
                ctx.shadowColor = bomb.color;
                ctx.shadowBlur = 16;
                ctx.lineWidth = 12;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(ox, oy);
                ctx.lineTo(ex, ey);
                ctx.stroke();
                ctx.lineCap = 'butt';
                break;
            }
            case 'hole': {
                const cx = W / 2,
                    cy = C.HOLE_Y;
                if (k < 0.5) {
                    const r = 16 + 10 * k + Math.sin(time * 20) * 2;
                    ctx.globalAlpha = 0.35;
                    ring(cx, cy, 40 - 50 * k, 12, -time * 6);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#0a0518';
                    ctx.shadowColor = bomb.color;
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.stroke();
                } else {
                    const q = (k - 0.5) / 0.5,
                        R = 26 + q * 380;
                    ctx.globalAlpha = (1 - q) * 0.35;
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, W, H);
                    ctx.globalAlpha = 1 - q;
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = bomb.color;
                    ctx.shadowColor = '#ffffff';
                    ctx.shadowBlur = 10;
                    for (let i = 0; i < 10; i++) {
                        let a = (Math.PI * 2 * i) / 10 + i * 0.7,
                            px = cx,
                            py = cy;
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                        for (let s = 1; s <= 6; s++) {
                            a += Math.sin(i * 13.1 + s * 7.7 + Math.floor(time * 30)) * 0.5;
                            px = cx + Math.cos(a) * ((R * s) / 6);
                            py = cy + Math.sin(a) * ((R * s) / 6);
                            ctx.lineTo(px, py);
                        }
                        ctx.stroke();
                    }
                }
                break;
            }
        }
        ctx.restore();
    }

    /** One piece of a bomb's ring, drawn at the origin, pointing outward. */
    private bombPiece(shape: string, k: number): void {
        const ctx = this.ctx;
        ctx.beginPath();
        switch (shape) {
            case 'leaf':
                ctx.moveTo(-7, 0);
                ctx.quadraticCurveTo(0, -5, 7, 0);
                ctx.quadraticCurveTo(0, 5, -7, 0);
                break;
            case 'shard':
                ctx.moveTo(-6, 0);
                ctx.lineTo(0, -2.5);
                ctx.lineTo(8, 0);
                ctx.lineTo(0, 2.5);
                ctx.closePath();
                break;
            case 'heart':
                ctx.arc(-1.5, -1.6, 2.2, 0, Math.PI * 2);
                ctx.arc(-1.5, 1.6, 2.2, 0, Math.PI * 2);
                ctx.moveTo(-1, -3.5);
                ctx.lineTo(5, 0);
                ctx.lineTo(-1, 3.5);
                break;
            case 'ember':
                ctx.arc(0, 0, 2.5 + 2 * (1 - k), 0, Math.PI * 2);
                break;
            case 'moon':
                ctx.arc(0, 0, 5, -Math.PI / 2, Math.PI / 2);
                ctx.arc(-2, 0, 4, Math.PI / 2, -Math.PI / 2, true);
                break;
            default:
                ctx.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    /** A fairy's charge shot, by style. */
    private chargeShot(
        x: number,
        y: number,
        vx: number,
        r: number,
        style: string,
        life: number | undefined,
        t: number,
    ): void {
        const ctx = this.ctx;
        switch (style) {
            case 'needles': {
                const a = Math.atan2(-1, vx / 500);
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(a + Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(0, -9);
                ctx.lineTo(2.2, 3);
                ctx.lineTo(-2.2, 3);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                break;
            }
            case 'thorn':
                ctx.beginPath();
                for (let i = 0; i < 16; i++) {
                    const a = (Math.PI * 2 * i) / 16 + t * 3,
                        rr = i % 2 ? r * 0.45 : r * 0.75;
                    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
                }
                ctx.closePath();
                ctx.fill();
                break;
            case 'flare':
                ctx.globalAlpha = Math.max(0.2, Math.min(1, (life ?? 0.3) / 0.25));
                ctx.beginPath();
                ctx.arc(x, y, r * 0.75, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
                break;
            case 'crescent':
                ctx.lineWidth = 4;
                ctx.strokeStyle = ctx.fillStyle;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.arc(x, y + r * 0.7, r, Math.PI * 1.15, Math.PI * 1.85);
                ctx.stroke();
                ctx.lineCap = 'butt';
                break;
            case 'twin':
                ctx.beginPath();
                ctx.ellipse(x, y, r * 0.55, r * 0.95, 0, 0, Math.PI * 2);
                ctx.fill();
                break;
            default:
                ctx.beginPath();
                ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
                ctx.fill();
        }
    }

    /** An Extra Attack critter, drawn in the sender's colour and her critter's look. */
    private imp(
        x: number,
        y: number,
        color: string,
        t: number,
        lining: boolean,
        look: string,
        vx: number,
        vy: number,
    ): void {
        const ctx = this.ctx;
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

    /** Little five-petal flower used for the bloom stock. */
    private blossom(x: number, y: number, color: string): void {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        for (let i = 0; i < 5; i++) {
            const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
            ctx.beginPath();
            ctx.arc(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /** Draw a heart for the HUD. */
    private heart(x: number, y: number, color: string): void {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y + 3.5);
        ctx.bezierCurveTo(x - 6, y - 0.5, x - 3, y - 5, x, y - 2);
        ctx.bezierCurveTo(x + 3, y - 5, x + 6, y - 0.5, x, y + 3.5);
        ctx.fill();
    }

    /** Draws an original fairy: glow, wings by shape, little body and head. */
    fairy(fy: Fairy, x: number, y: number, scale: number, t: number, charge = 0, silhouette = false): void {
        const ctx = this.ctx;
        if (fy.sprite) {
            // Sprite characters hover in place on cards; locked ones show as a dark shape.
            const a = fy.sprite.anims.idle;
            ctx.save();
            if (silhouette) ctx.filter = 'brightness(0) opacity(0.85)';
            const drawn = drawSprite(
                ctx,
                fy.sprite,
                { anim: 'idle', frame: Math.floor(t * a.fps) % a.count, alpha: 1 },
                x,
                y + 8 * scale,
                scale * 0.75,
            );
            ctx.restore();
            if (drawn) {
                if (charge > 0) this.chargeRing(fy, x, y, scale, charge);
                return;
            }
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        if (!silhouette) {
            const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
            glow.addColorStop(0, fy.color + 'aa');
            glow.addColorStop(1, fy.color + '00');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();
        }
        const flap = 0.55 + 0.45 * Math.abs(Math.sin(t * 18));
        ctx.fillStyle = silhouette ? 'rgba(10,8,25,0.85)' : 'rgba(255,255,255,0.55)';
        ctx.strokeStyle = silhouette ? 'rgba(246,240,255,0.25)' : fy.color;
        ctx.lineWidth = 0.8;
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.scale(side * flap, 1);
            this.wing(fy.wing);
            ctx.restore();
        }
        // Body and head.
        ctx.fillStyle = silhouette ? '#0a0819' : fy.accent;
        ctx.beginPath();
        ctx.ellipse(0, 3, 2.6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = silhouette ? '#0a0819' : '#ffe9dc';
        ctx.beginPath();
        ctx.arc(0, -4, 3.2, 0, Math.PI * 2);
        ctx.fill();
        if (!silhouette) {
            ctx.fillStyle = fy.color;
            ctx.beginPath();
            ctx.arc(0, -5.2, 3.4, Math.PI, 0);
            ctx.fill();
        }
        ctx.restore();
        if (charge > 0) this.chargeRing(fy, x, y, scale, charge);
    }

    /** Draw the charge ring around a fairy. */
    private chargeRing(fy: Fairy, x: number, y: number, scale: number, charge: number): void {
        if (charge <= 0) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.strokeStyle = charge >= 1 ? '#ffffff' : fy.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha *= 0.85;
        ctx.beginPath();
        ctx.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
        ctx.stroke();
        ctx.restore();
    }

    /** Trace one wing of the given shape, in wing-local coordinates. */
    private wing(shape: WingShape): void {
        const ctx = this.ctx;
        ctx.beginPath();
        switch (shape) {
            case 'round':
                ctx.ellipse(6, -3, 6, 5, -0.4, 0, Math.PI * 2);
                ctx.moveTo(10, 4);
                ctx.ellipse(5, 4, 4, 3, 0.4, 0, Math.PI * 2);
                break;
            case 'pointed':
                ctx.moveTo(1, -1);
                ctx.lineTo(13, -9);
                ctx.lineTo(7, 1);
                ctx.lineTo(11, 7);
                ctx.closePath();
                break;
            case 'leaf':
                ctx.moveTo(1, 0);
                ctx.quadraticCurveTo(8, -12, 13, -4);
                ctx.quadraticCurveTo(8, 2, 1, 0);
                ctx.moveTo(1, 2);
                ctx.quadraticCurveTo(7, 2, 9, 8);
                ctx.quadraticCurveTo(3, 7, 1, 2);
                break;
            case 'long':
                ctx.ellipse(8, -1, 9, 2.6, -0.25, 0, Math.PI * 2);
                ctx.moveTo(14, 5);
                ctx.ellipse(7, 4, 7, 2, 0.25, 0, Math.PI * 2);
                break;
            case 'crescent':
                ctx.moveTo(1, -2);
                ctx.quadraticCurveTo(14, -12, 12, 4);
                ctx.quadraticCurveTo(9, -4, 1, 2);
                break;
            case 'moth':
                ctx.moveTo(1, -1);
                ctx.lineTo(12, -8);
                ctx.quadraticCurveTo(15, -2, 10, 2);
                ctx.quadraticCurveTo(12, 8, 6, 9);
                ctx.lineTo(1, 3);
                break;
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    /**
     * A dandelion seed puff. Seed-tip colour shows the shots it takes:
     * red 1, yellow 2, green 3, blue 4, purple 5. Big puffs are drawn larger,
     * and a dew bubble is drawn around bubbled ones.
     */
    private puff(x: number, y: number, phase: number, hp: number, size: number, bubble: number): void {
        const ctx = this.ctx;
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
        ctx.restore();
    }

    /** The moonseed: a pale orb with a crescent, ringed by a slow pulse. */
    private moonseed(x: number, y: number, t: number): void {
        const ctx = this.ctx;
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

    /** An unbreakable comet: a hot pink core with a long straight tail. */
    private comet(x: number, y: number, t: number): void {
        const ctx = this.ctx;
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

    /** The hollow crow: a dark silhouette with ember eyes. */
    private crow(x: number, y: number, angle: number, t: number, hp: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        const flap = Math.sin(t * 12) * 5;
        ctx.fillStyle = '#0b0718';
        ctx.strokeStyle = 'rgba(255,159,184,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.quadraticCurveTo(-10, -8 + flap, -20, -2 + flap);
        ctx.quadraticCurveTo(-10, 0, -5, 4);
        ctx.lineTo(0, 10);
        ctx.lineTo(5, 4);
        ctx.quadraticCurveTo(10, 0, 20, -2 + flap);
        ctx.quadraticCurveTo(10, -8 + flap, 0, -6);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -6, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff9fb8';
        ctx.beginPath();
        ctx.arc(-1.8, -6.5, 1, 0, Math.PI * 2);
        ctx.arc(1.8, -6.5, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (hp < 1) {
            ctx.fillStyle = 'rgba(246,240,255,0.2)';
            ctx.fillRect(x - 12, y - 18, 24, 2);
            ctx.fillStyle = '#ff9fb8';
            ctx.fillRect(x - 12, y - 18, 24 * Math.max(0, hp), 2);
        }
    }

    /** The little crescent moon on the moonseed warning. */
    private crescentIcon(x: number, y: number): void {
        const ctx = this.ctx;
        ctx.fillStyle = '#cfe9ff';
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#140a26';
        ctx.beginPath();
        ctx.arc(x + 2.5, y - 1.5, 4.2, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * A falling star with a straight spark trail. Its colour shows how many
     * hits it still needs, and it shrinks a little with each hit.
     */
    private star(
        x: number,
        y: number,
        spin: number,
        level: number,
        hp: number,
        vx: number,
        vy: number,
        lining: boolean,
    ): void {
        const ctx = this.ctx;
        const [r, g, b] = STAR_COLORS[Math.min(STAR_COLORS.length - 1, Math.max(0, hp - 1))];
        const size = C.STAR_RADIUS * (0.8 + hp * 0.12);
        if (lining) {
            // A seeker lining up: a pulsing halo and a faint line showing where it will fall.
            ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 5]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, C.FIELD_H);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.strokeStyle = `rgba(${r},${g},${b},0.7)`;
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(x, y, size + 4 + Math.sin(spin * 4) * 2, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            // Spark trail pointing back along the direction of travel.
            const len = 18 + level * 10;
            const sp = Math.hypot(vx, vy) || 1;
            const ux = vx / sp,
                uy = vy / sp;
            const tx = x - ux * len,
                ty = y - uy * len;
            const tg = ctx.createLinearGradient(tx, ty, x, y);
            tg.addColorStop(0, `rgba(${r},${g},${b},0)`);
            tg.addColorStop(0.6, `rgba(${r},${g},${b},0.5)`);
            tg.addColorStop(1, `rgba(${r},${g},${b},0.95)`);
            ctx.fillStyle = tg;
            const nx = -uy,
                ny = ux; // perpendicular, for the trail's width
            ctx.beginPath();
            ctx.moveTo(tx + nx * 0.5, ty + ny * 0.5);
            ctx.lineTo(tx - nx * 0.5, ty - ny * 0.5);
            ctx.lineTo(x - nx * 4.5, y - ny * 4.5);
            ctx.lineTo(x + nx * 4.5, y + ny * 4.5);
            ctx.closePath();
            ctx.fill();
        }
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(spin);
        const col = `rgb(${r},${g},${b})`;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6 + level * 3;
        ctx.fillStyle = col;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
            const rad = i % 2 ? size * 0.45 : size;
            const a = (Math.PI * i) / 5 - Math.PI / 2;
            ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
        }
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** A thorny bramble ball. */
    private bramble(x: number, y: number, spin: number): void {
        const ctx = this.ctx;
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

    /** A guardian: a giant spirit in the sending fairy's wing shape and colour, with a lantern core. */
    private guardian(x: number, y: number, t: number, hp: number, color: string, wing: WingShape): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(x, y);
        const glow = ctx.createRadialGradient(0, 2, 2, 0, 2, 38);
        glow.addColorStop(0, color + '88');
        glow.addColorStop(1, color + '00');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 2, 38, 0, Math.PI * 2);
        ctx.fill();
        const flap = 0.6 + 0.4 * Math.abs(Math.sin(t * 4));
        ctx.fillStyle = color + '55';
        ctx.strokeStyle = color;
        ctx.lineWidth = 0.6;
        for (const side of [-1, 1]) {
            ctx.save();
            ctx.scale(side * flap * 2.6, 2.6);
            this.wing(wing);
            ctx.restore();
        }
        ctx.fillStyle = '#2a1d3f';
        ctx.beginPath();
        ctx.ellipse(0, 2, 4.5, 12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, -2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(246,240,255,0.2)';
        ctx.fillRect(-25, -30, 50, 3);
        ctx.fillStyle = color;
        ctx.fillRect(-25, -30, 50 * Math.max(0, hp), 3);
        ctx.restore();
    }

    /** A shelled beetle. The glossy dome is its shell; the dot colour is the body's hits. */
    private beetle(x: number, y: number, vx: number, hp: number, shell: number): void {
        const ctx = this.ctx;
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
    private spinner(x: number, y: number, phase: number): void {
        const ctx = this.ctx;
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

    /** Draw an attack in flight between the meadows as a glowing dot. */
    transit(x: number, y: number, color: string): void {
        const ctx = this.ctx;
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    /** The console between the two meadows: round, VS, the shared speed meter. */
    console(v: ConsoleView, time: number): void {
        this.hudLayer.console(v, time);
    }

    /** A full-width arcade banner (round start, round over, match over, pause). */
    banner(v: BannerView): void {
        this.hudLayer.banner(v);
    }

    /** The arcade title screen (see title-screen.ts). */
    title(v: TitleView, time: number): void {
        this.titleScreen.draw(v, time);
    }

    /** The arcade character-select screen (see select-screen.ts). */
    select(v: SelectView, time: number): void {
        this.selectScreen.draw(v, time);
    }
}

/** Puff seed-tip colour by shots needed, as in Twinkle Star Sprites: red 1, yellow 2, green 3, blue 4, purple 5. */
const PUFF_COLORS = ['#ff7a7a', '#ffe066', '#7be38a', '#6fb2ff', '#c38cff'];

/** Star colour by hits remaining: 1 pale, 2 gold, 3 orange, 4 rose. */
const STAR_COLORS: [number, number, number][] = [
    [235, 245, 255],
    [255, 214, 92],
    [255, 145, 64],
    [255, 84, 128],
];
