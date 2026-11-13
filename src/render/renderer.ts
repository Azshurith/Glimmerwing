import * as C from '@/core/config';
import type { Field } from '@/game/field';
import type {
    BannerView,
    ConsoleView,
    HudTag,
    ModeView,
    ProfileView,
    RosterView,
    Layer,
    Layout,
    Outgoing,
    Placement,
    SelectView,
    TitleView,
    WingShape,
} from '@/types';

import {
    drawImp,
    drawBramble,
    drawComet,
    drawFireball,
    drawFireFlash,
    drawFireHit,
    drawReverseTrail,
    fireLook,
} from './entities/attacks';
import { drawBomb } from './entities/bombs';
import { drawCrow, drawGuardian } from './entities/bosses';
import { drawBeetle, drawMoonseed, drawPuff, drawSpinner } from './entities/critters';
import { drawChargeRing, drawChargeShot, drawFairy } from './entities/fairy';
import { Hud } from './hud';
import { ModeScreen } from './screens/mode-screen';
import { ProfileScreen } from './screens/profile-screen';
import { RosterScreen } from './screens/roster-screen';
import { drawCrescentIcon } from './icons';
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
    private modeScreen: ModeScreen;
    private rosterScreen: RosterScreen;
    private profileScreen: ProfileScreen;
    /** HUD, console, popups and banners for a match. */
    private hudLayer: Hud;
    /** The layout this frame uses; Game picks it each frame. */
    layout: Layout = 'wide';
    /** Whether the screen is taller than wide; the page keeps this up to date. */
    portrait = false;
    /** The tall view's height, fitted by the page to the screen's shape (TALL_H_MIN to TALL_H_MAX). */
    tallH: number = C.TALL_H;
    /** Where the tall view's top band (rival's meadow and console) sits and how much it shrinks; Game sets it. */
    tallBand: Placement = { x: 0, y: 0, s: 1 };

    /**
     * The meadow width that would make the side-by-side view fill the screen, worked out by the page from a
     * landscape screen's shape (FIELD_W_BASE on an upright or narrower one); Game plays a local round at it.
     */
    fieldWidthToFill: number = C.FIELD_W_BASE;

    /** The title and select screens' view width on a landscape screen, fitted by the page to its shape. */
    menuW: number = C.VIEW_W;
    /** Whether a menu (title or select) is showing; Game sets it each frame. */
    inMenu = false;

    /** Width of the view in view units, for the current layout. */
    get viewW(): number {
        return this.layout === 'tall' ? C.TALL_W : this.inMenu ? Math.max(C.VIEW_W, this.menuW) : C.VIEW_W;
    }
    /** How far a widened menu sits in from the left edge (its sky and bars reach out over that much each side). */
    get viewX(): number {
        return this.layout === 'tall' ? 0 : (this.viewW - C.VIEW_W) / 2;
    }
    /** Height of the view in view units, for the current layout. */
    get viewH(): number {
        return this.layout === 'tall' ? this.tallH : C.VIEW_H;
    }

    constructor(private canvas: HTMLCanvasElement) {
        this.ctx = canvas.getContext('2d')!;
        this.selectScreen = new SelectScreen(this.ctx);
        this.titleScreen = new TitleScreen(this.ctx);
        this.modeScreen = new ModeScreen(this.ctx);
        this.rosterScreen = new RosterScreen(this.ctx);
        this.profileScreen = new ProfileScreen(this.ctx);
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
        const w = this.viewW,
            h = this.viewH;
        ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
        ctx.fillStyle = '#100b24';
        ctx.fillRect(0, 0, w, h);
        // A widened menu is drawn in its usual units, centred.
        ctx.translate(this.viewX, 0);
        this.hudLayer.setView(w - 2 * this.viewX, h);
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
            const y = ((((m.y * C.FIELD_H) / C.FIELD_H_BASE - time * 6 * m.s) % C.FIELD_H) + C.FIELD_H) % C.FIELD_H;
            // Spread across however wide the meadow is this round.
            const x = (m.x * C.FIELD_W) / C.FIELD_W_BASE + Math.sin(time * 0.8 + m.p) * 6;
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

    /**
     * Draw one meadow at (`ox`, `oy`) and `scale` (the tall layout shows the rival's at half size):
     * sky, critters, shots, bursts, attacks, bosses, the fairy and its HUD.
     */
    field(f: Field, ox: number, wins: number, time: number, tag: HudTag, oy = 0, scale = 1): void {
        const ctx = this.ctx;
        const color = f.fairy.color;
        ctx.save();
        const sx = f.shake ? (Math.random() - 0.5) * f.shake : 0;
        const sy = f.shake ? (Math.random() - 0.5) * f.shake : 0;
        ctx.translate(ox + sx * scale, oy + sy * scale);
        ctx.scale(scale, scale);
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
            if (p.moonseed) drawMoonseed(ctx, p.x, p.y, time);
            else if (p.kind === 'beetle') drawBeetle(ctx, p.x, p.y, p.vx, p.hp, p.shell);
            else if (p.kind === 'spinner') drawSpinner(ctx, p.x, p.y, p.phase);
            else drawPuff(ctx, p.x, p.y, p.phase, p.hp, p.size, p.shell);
        }
        if (f.moonseedWarning)
            this.hudLayer.cue('Moonseed rising', '#cfe9ff', time, 52, (x, y) => drawCrescentIcon(ctx, x, y));
        if (f.hitstop > 0) {
            ctx.fillStyle = `rgba(220,240,255,${f.hitstop})`;
            ctx.fillRect(0, 0, C.FIELD_W, C.FIELD_H);
        }
        for (const a of f.attacks) {
            if (a.kind === 'bramble') drawBramble(ctx, a.x, a.y, a.spin);
            else if (a.kind === 'comet') drawComet(ctx, a.x, a.y, time);
            else if (a.kind === 'imp')
                drawImp(
                    ctx,
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
                // Fireballs: orange as sent, purple shot back once, flashing shot back again (fireLook).
                const size = a.size ?? 1;
                const look = fireLook(a.reflects ?? (a.level >= 2 ? 1 : 0), a.fever);
                const full = C.fireballHp(size);
                const hurt = Number.isFinite(a.hp) ? Math.max(0, Math.min(1, 1 - a.hp / full)) : 0;
                if (a.tail && look === 'reverse') drawReverseTrail(ctx, a.tail, time, size);
                drawFireball(ctx, a.x, a.y, time, a.spin, a.vx, a.vy, size, look, hurt);
                if (a.flash) drawFireFlash(ctx, a.x, a.y, a.flash / C.FIREBALL_FLASH, size);
                if (a.hitT) drawFireHit(ctx, a.x, a.y, a.hitT / C.FIREBALL_HIT_FLASH, size);
            }
        }
        for (const c of f.crows)
            drawCrow(
                ctx,
                c.x,
                c.y,
                c.state === 'dive' ? Math.atan2(c.vy, c.vx) - Math.PI / 2 : 0,
                time,
                c.hp / C.CROW_HP,
            );
        if (f.crowWarning) this.hudLayer.cue('A crow stirs', '#ff9fb8', time, 76);
        // A reeling guardian blinks and shudders.
        if (f.moth && !(f.moth.stun > 0 && Math.floor(time * 24) % 2 === 0))
            drawGuardian(
                ctx,
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
                drawChargeShot(ctx, s.x, s.y, s.vx, s.r ?? 10, s.style ?? 'orb', s.life, time);
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
                if (drawn) drawChargeRing(ctx, f.fairy, p.x, p.y, 1, Math.min(1, p.charge));
                else drawFairy(ctx, f.fairy, p.x, p.y, 1, time, Math.min(1, p.charge));
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

        if (f.bloom > 0) drawBomb(ctx, f, time);
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

        this.hudLayer.meadow(f, wins, time, tag);
        ctx.restore();
    }

    /** Draw an attack in flight between the meadows as a glowing dot. */
    /**
     * A fireball between the meadows, drawn as itself (at the scale `s` of the meadows it's between) so a
     * Reverse visibly carries on from the meadow it left into the one it's heading for. `clip` keeps it inside
     * a rectangle of the view (a fireball rising out of its sender's meadow).
     */
    transitFireball(
        x: number,
        y: number,
        s: number,
        time: number,
        vx: number,
        vy: number,
        o: Outgoing,
        clip?: { x: number; y: number; w: number; h: number },
    ): void {
        const ctx = this.ctx;
        ctx.save();
        if (clip) {
            ctx.beginPath();
            ctx.rect(clip.x, clip.y, clip.w, clip.h);
            ctx.clip();
        }
        ctx.translate(x, y);
        ctx.scale(s, s);
        const look = fireLook(o.reflects ?? (o.level >= 2 ? 1 : 0), o.fever);
        drawFireball(ctx, 0, 0, time, o.fromX, vx, vy, o.size ?? 1, look, 0);
        ctx.restore();
    }

    /** Debug overlay: a dashed path through view points, with a dot where it ends. */
    debugPath(pts: { x: number; y: number }[], color: string): void {
        if (pts.length < 2) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const end = pts[pts.length - 1];
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** Something else between the meadows: a glowing dot in its colour. */
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
        if (this.layout === 'tall') {
            const b = C.TALL_CONSOLE;
            const band = this.tallBand;
            this.ctx.save();
            this.ctx.translate(band.x, band.y);
            this.ctx.scale(band.s, band.s);
            this.hudLayer.consoleCompact(v, time, b.x, b.y, b.w, b.h);
            this.ctx.restore();
            return;
        }
        this.hudLayer.console(v, time);
    }

    /** The slim top bar standing in for the rival's meadow and console when it's hidden (tall layout only). */
    soloBar(v: ConsoleView, rival: Field, tag: HudTag, time: number): void {
        this.hudLayer.soloBar(v, rival, tag, time, C.TALL_W, C.TALL_SOLO_BAR);
    }

    /** A full-width arcade banner (round start, round over, match over, pause). */
    banner(v: BannerView): void {
        this.hudLayer.banner(v);
    }

    /** The arcade title screen (see title-screen.ts). */
    title(v: TitleView, time: number): void {
        this.titleScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The mode menu (see mode-screen.ts). */
    modes(v: ModeView, time: number): void {
        this.modeScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The Characters screen (see roster-screen.ts). */
    roster(v: RosterView, time: number): void {
        this.rosterScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The Profile screen (see profile-screen.ts). */
    profile(v: ProfileView, time: number): void {
        this.profileScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The arcade character-select screen (see select-screen.ts). */
    select(v: SelectView, time: number): void {
        this.selectScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }
}
