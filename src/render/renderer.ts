import * as C from '@/core/config';
import type { Field } from '@/game/field';
import type {
    MapSelectView,
    MapsView,
    MonsterSheet,
    Puff,
    BannerView,
    ConsoleView,
    EndlessView,
    HudTag,
    LobbyView,
    ProfileView,
    ReplayPanelView,
    MatchInfoView,
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
import { drawBeetle, drawMonster, drawMoonseed, drawPuff, drawSpinner, monsterLook } from './entities/critters';
import { monstersFor } from '@/data/monsters';
import { drawChargeRing, drawChargeShot, drawFairy } from './entities/fairy';
import { mapById, mapForSeed } from '@/data/maps';
import { Hud } from './hud';
import { SkyScenery } from './scenery/scenery';
import { drawNight } from './screens/ornate';
import { ARCADE } from './theme';
import { MapScreen } from './screens/map-screen';
import { LobbyScreen } from './screens/lobby-screen';
import { ProfileScreen } from './screens/profile-screen';
import { MatchScreen } from './screens/match-screen';
import { SettingsScreen } from './screens/settings-screen';
import { RosterScreen } from './screens/roster-screen';
import { MapsScreen } from './screens/maps-screen';
import { drawCrescentIcon } from './icons';
import { SelectScreen } from './screens/select-screen';
import { TitleScreen } from './screens/title-screen';
import { drawSprite, PlayerAnimator } from './sprites';

/** Draws the game onto the canvas from read-only game state; the simulation never draws. */
export class Renderer {
    private ctx: CanvasRenderingContext2D;
    /** The endless floating-island sky behind every meadow (see scenery/scenery.ts). */
    private scenery = new SkyScenery();
    /** Per-meadow animation state for sprite characters; a new round's Field starts fresh (and revives). */
    private anims = new WeakMap<Field, PlayerAnimator>();
    private selectScreen: SelectScreen;
    private titleScreen: TitleScreen;
    private lobbyScreen: LobbyScreen;
    private rosterScreen: RosterScreen;
    private mapsScreen: MapsScreen;
    private settingsScreen: SettingsScreen;
    private mapScreen: MapScreen;
    /** The map select cards' scenery, each drawn into its own canvas (see mapSelect). */
    private mapCards: HTMLCanvasElement[] = [];
    private mapFrame = 0;
    private profileScreen: ProfileScreen;
    private matchScreen: MatchScreen;
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

    /** How wide a lone meadow must be to fill a landscape screen edge to edge (Endless), set by the page. */
    viewWidthToFill = C.VIEW_W;
    /**
     * Whether a round's view widens to fill the screen around meadows narrower than it (a replay recorded at
     * another width): the meadows stay centred and their scenery fills the bands either side. Game sets it.
     */
    fillRound = false;
    /**
     * How far a meadow's scenery and HUD reach out past it to the screen's edge (a round in meadows narrower than
     * this screen: a replay recorded at another width, or an online round): its scenery is painted out to the edge
     * as one picture and its bars span it, while play stays in the meadow. The left meadow reaches left and the
     * right one right. 0 otherwise. Game sets it.
     */
    meadowBleed = 0;
    /**
     * How far (screen units) the next meadow drawn paints its scenery above its top and below its foot: a wider
     * recording shrunk to fit an upright screen fills the room around it. Dimmed past a fine gold line, as the bleed
     * at its sides is. Game sets it for the one meadow and puts it back to 0.
     */
    riseTop = 0;
    riseBottom = 0;
    /**
     * How wide the round's content shows on screen when that's narrower than the view's own width (Endless's lone
     * meadow, scaled down under its top bar), so a filling view needn't be any wider than that; 0 otherwise.
     */
    roundW = 0;
    /** Width of the view in view units, for the current layout. */
    get viewW(): number {
        if (this.layout === 'tall') return C.TALL_W;
        if (this.inMenu) return Math.max(C.VIEW_W, this.menuW);
        return this.fillRound ? Math.max(this.roundW || C.VIEW_W, this.viewWidthToFill) : C.VIEW_W;
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
        this.lobbyScreen = new LobbyScreen(this.ctx);
        this.rosterScreen = new RosterScreen(this.ctx);
        this.mapsScreen = new MapsScreen(this.ctx);
        this.profileScreen = new ProfileScreen(this.ctx);
        this.matchScreen = new MatchScreen(this.ctx);
        this.settingsScreen = new SettingsScreen(this.ctx);
        this.mapScreen = new MapScreen(this.ctx);
        this.hudLayer = new Hud(this.ctx);
    }

    /** Resolution scale from AdaptiveResolution: below 1 the canvas draws fewer pixels to keep up. */
    resolution = 1;

    /** Match the canvas's pixel size to its size on screen (times `resolution`). */
    resize(): void {
        const rect = this.canvas.getBoundingClientRect();
        // Sharp on high-density screens, but capped so phones and 4K monitors don't fill
        // more pixels than they can redraw at 60fps.
        const dpr = Math.min(window.devicePixelRatio || 1, 3, 2400 / Math.max(1, rect.width)) * this.resolution;
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
        this.scenery.beginFrame();
        // A widened menu is drawn in its usual units, centred.
        ctx.translate(this.viewX, 0);
        this.hudLayer.setView(w - 2 * this.viewX, h);
    }

    /** One critter: as its map's monster where the map has a sheet, else in its code-drawn look. */
    private critter(
        ctx: CanvasRenderingContext2D,
        p: Puff,
        monsters: MonsterSheet | undefined,
        fieldTime: number,
        time: number,
    ): void {
        if (p.moonseed) return drawMoonseed(ctx, p.x, p.y, time);
        if (monsters) {
            const look = monsterLook(monsters, p.kind, p.x, p.y, p.size, p.maxHp, p.wave);
            if (drawMonster(ctx, monsters, look, p.x, p.y, p.phase, p.hp, p.size, p.shell, fieldTime)) return;
        }
        if (p.kind === 'beetle') drawBeetle(ctx, p.x, p.y, p.vx, p.hp, p.shell);
        else if (p.kind === 'spinner') drawSpinner(ctx, p.x, p.y, p.phase);
        else drawPuff(ctx, p.x, p.y, p.phase, p.hp, p.size, p.shell);
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
        // The bleed is in screen units; the meadow may be drawn a little smaller (Endless under its top bar).
        const bleed = this.layout === 'wide' ? this.meadowBleed / scale : 0;
        const outer = f.rivalSide < 0 ? 1 : 0;
        const bl = bleed > 0 && outer === 0 ? bleed : 0,
            br = bleed > 0 && outer === 1 ? bleed : 0;
        const map = mapById(f.mapId) ?? mapForSeed(f.sceneSeed);
        if (bleed > 0) {
            // A meadow reaching out to the screen's edge: its scenery painted as one wide picture behind it.
            ctx.save();
            ctx.beginPath();
            ctx.rect(-bl, 0, C.FIELD_W + bl + br, C.FIELD_H);
            ctx.clip();
            ctx.translate(-bl, 0);
            this.scenery.draw(ctx, f.sceneSeed, f.time, time, C.FIELD_W + bl + br, C.FIELD_H, map);
            ctx.restore();
            // Past the play area the scenery is only dressing: dimmed a little, with a fine gold line at the edge,
            // so it's plain where the fairy can fly.
            ctx.fillStyle = 'rgba(14,6,36,0.32)';
            if (bl > 0) ctx.fillRect(-bl, 0, bl, C.FIELD_H);
            if (br > 0) ctx.fillRect(C.FIELD_W, 0, br, C.FIELD_H);
            ctx.fillStyle = 'rgba(232,190,100,0.55)';
            if (bl > 0) ctx.fillRect(-0.75, 0, 0.75, C.FIELD_H);
            if (br > 0) ctx.fillRect(C.FIELD_W, 0, 0.75, C.FIELD_H);
        }
        const rt = this.layout === 'tall' ? this.riseTop / scale : 0,
            rb = this.layout === 'tall' ? this.riseBottom / scale : 0;
        if (rt > 0 || rb > 0) {
            // A shrunk wider recording: its scenery painted from the band down to the screen's foot as one picture.
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, -rt, C.FIELD_W, C.FIELD_H + rt + rb);
            ctx.clip();
            ctx.translate(0, -rt);
            this.scenery.draw(ctx, f.sceneSeed, f.time, time, C.FIELD_W, C.FIELD_H + rt + rb, map);
            ctx.restore();
            ctx.fillStyle = 'rgba(14,6,36,0.32)';
            if (rt > 0) ctx.fillRect(0, -rt, C.FIELD_W, rt);
            if (rb > 0) ctx.fillRect(0, C.FIELD_H, C.FIELD_W, rb);
            ctx.fillStyle = 'rgba(232,190,100,0.55)';
            if (rt > 0) ctx.fillRect(0, -0.75, C.FIELD_W, 0.75);
            if (rb > 0) ctx.fillRect(0, C.FIELD_H, C.FIELD_W, 0.75);
        }
        ctx.beginPath();
        ctx.rect(0, 0, C.FIELD_W, C.FIELD_H);
        ctx.clip();
        // The two meadows look into one world, the right-hand one (whose rival is to its left) GAP across from
        // the left-hand one, so the scenery runs on from one into the other behind the console.
        const side = f.rivalSide < 0 ? 1 : 0;
        if (bleed <= 0 && rt <= 0 && rb <= 0) this.scenery.draw(ctx, f.sceneSeed, f.time, time, C.FIELD_W, C.FIELD_H, map, side, C.GAP);

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

        const monsters = monstersFor(map.id);
        for (const p of f.puffs) this.critter(ctx, p, monsters, f.time, time);
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

        // Plain shots: a dot in a faint halo, all in two fills (a canvas shadow on each was slow).
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        for (const s of f.shots) {
            if (s.charged) continue;
            ctx.moveTo(s.x + 3.6, s.y);
            ctx.arc(s.x, s.y, 3.6, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        for (const s of f.shots) {
            if (s.charged) continue;
            ctx.moveTo(s.x + 2, s.y);
            ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        }
        ctx.fill();
        for (const s of f.shots) {
            if (!s.charged) continue;
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 14;
            drawChargeShot(ctx, s.x, s.y, s.vx, s.r ?? 10, s.style ?? 'orb', s.life, time);
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

        // A meadow wider than the tall view (a replay recorded on a wide screen, following its fairy) keeps its bars
        // on the part that's on screen.
        const v0 = this.layout === 'tall' ? Math.max(0, -ox / scale) : 0,
            v1 = this.layout === 'tall' ? Math.min(C.FIELD_W, (this.viewW - ox) / scale) : C.FIELD_W;
        if (bleed > 0) {
            // Its bars reach out to the screen's edges, past the meadow's clip.
            ctx.restore();
            ctx.save();
            ctx.translate(ox - bl * scale, oy);
            ctx.scale(scale, scale);
            this.hudLayer.meadow(f, wins, time, tag, C.FIELD_W + bl + br);
        } else if (v0 > 0.5 || v1 < C.FIELD_W - 0.5) {
            // Its bars stay at a live round's size across the screen however far the meadow is zoomed: the top plate
            // against its top edge and the charge bar against its foot, each drawn in its own half.
            ctx.restore();
            const hs = Math.min(scale, C.TALL_OWN_S),
                x = ox + v0 * scale,
                w = ((v1 - v0) * scale) / hs,
                mid = oy + (C.FIELD_H * scale) / 2;
            for (const [y, y0, y1] of [
                [oy, oy, mid],
                [oy + C.FIELD_H * (scale - hs), mid, oy + C.FIELD_H * scale],
            ]) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(x, y0, w * hs, y1 - y0);
                ctx.clip();
                ctx.translate(x, y);
                ctx.scale(hs, hs);
                this.hudLayer.meadow(f, wins, time, tag, w);
                ctx.restore();
            }
            ctx.save();
        } else this.hudLayer.meadow(f, wins, time, tag);
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

    /**
     * A hint, centred across the tall view at `y`, that turning the phone sideways shows a wider recording full size:
     * a dark capsule in a gold edge with a turning-arrows mark, fading by `alpha`.
     */
    rotateHint(y: number, alpha: number): void {
        const ctx = this.ctx;
        const text = 'TURN SIDEWAYS FOR THE FULL VIEW';
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.font = `7px ${ARCADE}`;
        const w = ctx.measureText(text).width + 30,
            h = 16,
            x = (C.TALL_W - w) / 2;
        ctx.fillStyle = 'rgba(20,10,46,0.85)';
        ctx.beginPath();
        ctx.roundRect(x, y - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(232,190,100,0.9)';
        ctx.lineWidth = 0.8;
        ctx.stroke();
        // Two arrows chasing round a circle.
        const cx = x + 11,
            r = 4;
        ctx.strokeStyle = '#ffe08a';
        ctx.lineWidth = 1;
        for (const a0 of [0.2, Math.PI + 0.2]) {
            ctx.beginPath();
            ctx.arc(cx, y, r, a0, a0 + 2.3);
            ctx.stroke();
            const ax = cx + r * Math.cos(a0 + 2.3),
                ay = y + r * Math.sin(a0 + 2.3);
            ctx.beginPath();
            ctx.moveTo(ax - 1.6, ay - 0.4);
            ctx.lineTo(ax, ay);
            ctx.lineTo(ax - 0.2, ay - 1.8);
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 20, y + 0.5);
        ctx.restore();
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
        // Side by side the meadows (and the console with them) are scaled to fill the view's height.
        const s = C.VIEW_H / C.FIELD_H,
            x = (C.VIEW_W * (1 - s)) / 2;
        this.ctx.save();
        this.ctx.translate(x, 0);
        this.ctx.scale(s, s);
        this.hudLayer.frameX = this.meadowBleed / s;
        this.hudLayer.console(v, time);
        this.ctx.restore();
    }

    /**
     * Endless mode's readout: on a phone a slim bar across the top. On a landscape screen the meadow stands in the
     * middle, filling the height, and the run's stats fill the screen either side of it on the castle night.
     */
    endless(v: EndlessView, time: number, at: Placement | null): void {
        if (this.layout === 'tall' || !at) {
            this.hudLayer.endlessBar(v, time, C.TALL_W, C.TALL_SOLO_BAR);
            return;
        }
        const ctx = this.ctx;
        // In view units: the screen runs from -x0 to C.VIEW_W + x0, the meadow from at.x to at.x + mw.
        const x0 = this.fillRound ? this.viewX : 0,
            mw = C.FIELD_W * at.s,
            H = C.VIEW_H;
        const left = { x: -x0, w: at.x + x0 },
            right = { x: at.x + mw, w: C.VIEW_W + x0 - at.x - mw };
        ctx.save();
        ctx.beginPath();
        ctx.rect(left.x, 0, left.w, H);
        ctx.rect(right.x, 0, right.w, H);
        ctx.clip();
        drawNight(ctx, time, -x0, C.VIEW_W + 2 * x0, H, {
            planet: { x: C.VIEW_W + x0 - 70, y: 60, r: 40 },
            horizon: H * 0.8,
        });
        ctx.fillStyle = 'rgba(14,6,36,0.45)';
        ctx.fillRect(-x0, 0, C.VIEW_W + 2 * x0, H);
        ctx.restore();
        // A gold line down each side of the meadow.
        ctx.fillStyle = 'rgba(232,190,100,0.85)';
        ctx.fillRect(at.x - 1, 0, 1, H);
        ctx.fillRect(at.x + mw, 0, 1, H);
        this.hudLayer.endlessStats(v, time, left.x, left.w, H, 'run');
        this.hudLayer.endlessStats(v, time, right.x, right.w, H, 'threat');
    }

    /** The slim top bar standing in for the rival's meadow and console when it's hidden (tall layout only). */
    soloBar(v: ConsoleView, rival: Field, tag: HudTag, time: number): void {
        this.hudLayer.soloBar(v, rival, tag, time, C.TALL_W, C.TALL_SOLO_BAR);
    }

    /** A full-width arcade banner (round start, round over, match over, pause). */
    banner(v: BannerView): void {
        // A round whose view is wider than its meadows: the banner spans the whole screen.
        const x = this.layout === 'wide' && this.fillRound ? this.viewX : 0;
        if (x <= 0) {
            this.hudLayer.banner(v);
            return;
        }
        this.ctx.save();
        this.ctx.translate(-x, 0);
        this.hudLayer.setView(this.viewW, this.viewH);
        this.hudLayer.banner(v);
        this.hudLayer.setView(this.viewW - 2 * x, this.viewH);
        this.ctx.restore();
    }

    /** The replay's controls along the bottom (see Hud.replayPanel). */
    replayPanel(v: ReplayPanelView, time: number): void {
        this.hudLayer.replayPanel(v, time);
    }

    /** The arcade title screen (see title-screen.ts). */
    title(v: TitleView, time: number): void {
        this.titleScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The lobby, the main menu, with the stage's scenery scrolling live on its island (see lobby-screen.ts). */
    lobby(v: LobbyView, time: number): void {
        const ctx = this.ctx;
        this.scenery.budget = 6;
        this.lobbyScreen.draw(v, time, this.layout, this.viewH, this.viewX, (map, x, y, w, h) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.translate(x, y);
            this.scenery.draw(ctx, 4242, time * 1.2, time, w, h, mapById(map) ?? undefined);
            ctx.restore();
        });
        this.scenery.budget = 2;
    }

    /** The Characters screen (see roster-screen.ts), with the live demo meadow of the fairy in view. */
    roster(v: RosterView, time: number, demo: Field | null = null): void {
        const tag = { label: 'DEMO', color: demo?.fairy.color ?? '#ffffff' };
        const draw = demo ? (x: number, y: number, s: number) => this.field(demo, x, 0, time, tag, y, s) : undefined;
        this.rosterScreen.draw(v, time, this.layout, this.viewH, this.viewX, draw);
    }

    /** The Maps screen, with its live demo meadow on the map in view (see maps-screen.ts). */
    maps(v: MapsView, time: number, demo: Field | null = null): void {
        const tag = { label: 'PREVIEW', color: '#8ff0a0' };
        const draw = demo ? (x: number, y: number, s: number) => this.field(demo, x, 0, time, tag, y, s) : undefined;
        this.mapsScreen.draw(v, time, this.layout, this.viewH, this.viewX, draw);
    }

    /** The Profile screen (see profile-screen.ts). */
    profile(v: ProfileView, time: number): void {
        const ctx = this.ctx;
        this.profileScreen.draw(v, time, this.layout, this.viewH, this.viewX, (map, x, y, w, h) => {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.translate(x, y);
            this.scenery.draw(ctx, 4242, 40, time, w, h, mapById(map) ?? undefined);
            ctx.restore();
        });
    }

    /** The match details screen (see match-screen.ts). */
    matchInfo(v: MatchInfoView, time: number): void {
        this.matchScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }

    /** The Settings screen's sky and heading bar; the settings are the page's panel (see settings-screen.ts). */
    settings(time: number): void {
        this.settingsScreen.draw(time, this.layout, this.viewH, this.viewX);
    }

    /** The map select screen, each card with its map's scenery scrolling live inside (see map-screen.ts). */
    mapSelect(v: MapSelectView, time: number): void {
        const ctx = this.ctx;
        this.mapFrame++;
        // Five cards fill in at once here, so the scenery may paint more sprites a frame than in a round.
        this.scenery.budget = 10;
        let card = 0;
        this.mapScreen.draw(v, time, this.layout, this.viewH, this.viewX, (map, x, y, w, h) => {
            // Each card's scenery is drawn into its own canvas, half the cards each frame, then copied in every
            // frame: smooth enough to read as live, at half the cost of five full sceneries a frame.
            const i = card++;
            const px = ctx.getTransform().a;
            let off = this.mapCards[i];
            const cw = Math.max(1, Math.round(w * px)),
                ch = Math.max(1, Math.round(h * px));
            const fresh = !off || off.width !== cw || off.height !== ch;
            if (fresh) {
                off = document.createElement('canvas');
                off.width = cw;
                off.height = ch;
                this.mapCards[i] = off;
            }
            if (fresh || (this.mapFrame + i) % 2 === 0) {
                const oc = off!.getContext('2d')!;
                const k = 0.62;
                oc.setTransform(px * k, 0, 0, px * k, 0, 0);
                this.scenery.draw(oc, 4242, time * 1.5, time, w / k, h / k, map);
            }
            ctx.drawImage(off!, x, y, w, h);
        });
        this.scenery.budget = 2;
    }

    /** The arcade character-select screen (see select-screen.ts). */
    select(v: SelectView, time: number): void {
        this.selectScreen.draw(v, time, this.layout, this.viewH, this.viewX);
    }
}
