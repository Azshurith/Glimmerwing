import type { Anim, Layer, SpriteSet } from '../types';

/**
 * Animation and drawing for sprite-sheet characters (sheets are defined in data/sprite-sets.ts).
 * Characters without a sprite set keep their code-drawn look (Renderer.fairy).
 */

// Tilt hysteresis, in field units per second of smoothed sideways speed (full speed is ~225).
const TILT_ON = 40,
    TILT_OFF = 15;
const MOVE_ON = 18;
const HIT_TIME = 6 / 12;
const REVIVE_TIME = 4 / 10;
const DEATH_BURST = 4 / 12; // flinch and flash before the sparkles scatter
const REMAINS_TIME = 1.6;

/**
 * Picks the player's animation from what the renderer can see (position, life, stun).
 * It reads state only, so movement, collision and shooting are untouched, and it works
 * the same for a mirrored online rival as for the local player.
 */
export class PlayerAnimator {
    constructor(private readonly s: SpriteSet) {}

    private lastT = -1;
    private px = 0;
    private py = 0;
    private vx = 0;
    private vy = 0;
    private hull = -1;
    private tilt: -1 | 0 | 1 = 0;
    private bornT = 0;
    private hitT = -99;
    private koT = -99;

    /** Advance the animation from the fairy's position and health and return the layers to draw this frame. */
    update(t: number, x: number, y: number, hull: number, stunned: boolean): Layer[] {
        if (this.lastT < 0) {
            this.lastT = t;
            this.bornT = t;
            this.px = x;
            this.py = y;
            this.hull = hull;
        }
        const dt = Math.min(0.1, Math.max(0, t - this.lastT));
        if (dt > 0) {
            const k = Math.min(1, dt * 14);
            this.vx += ((x - this.px) / dt - this.vx) * k;
            this.vy += ((y - this.py) / dt - this.vy) * k;
        }
        this.lastT = t;
        this.px = x;
        this.py = y;
        if (hull < this.hull) {
            if (hull <= 0) this.koT = t;
            else this.hitT = t;
        } else if (hull > 0 && this.hull <= 0) this.bornT = t; // back from a knockout
        this.hull = hull;

        if (this.vx < -TILT_ON) this.tilt = -1;
        else if (this.vx > TILT_ON) this.tilt = 1;
        else if (Math.abs(this.vx) < TILT_OFF) this.tilt = 0;

        const frame = (a: Anim, since: number, loop: boolean) => {
            const f = Math.floor(since * a.fps);
            return loop ? f % a.count : Math.min(a.count - 1, f);
        };
        const A = this.s.anims;

        if (hull <= 0) {
            const e = t - this.koT;
            // Flinch and flash, then the charred ghost fades while the sparkles scatter over it.
            if (e < DEATH_BURST) return [{ anim: 'death', frame: frame(A.death, e, false), alpha: 1 }];
            const r = e - DEATH_BURST;
            const layers: Layer[] = [];
            if (r < REMAINS_TIME)
                layers.push({
                    anim: 'remains',
                    frame: Math.min(3, Math.floor((r / REMAINS_TIME) * 4)),
                    alpha: 1 - 0.4 * (r / REMAINS_TIME),
                });
            const s = 4 + Math.floor(r * A.death.fps * 0.6);
            if (s < A.death.count) layers.push({ anim: 'death', frame: s, alpha: 1 });
            return layers;
        }
        const born = t - this.bornT;
        if (born < REVIVE_TIME) return [{ anim: 'revive', frame: frame(A.revive, born, false), alpha: 1 }];
        if (t - this.hitT < HIT_TIME) return [{ anim: 'hit', frame: frame(A.hit, t - this.hitT, false), alpha: 1 }];
        // A critter stun is a jolt, not a burn: shake through the plain hit frames.
        if (stunned) return [{ anim: 'hit', frame: [0, 1, 3, 4][Math.floor(t * 10) % 4], alpha: 1 }];
        if (this.tilt < 0) return [{ anim: 'tiltL', frame: frame(A.tiltL, t, true), alpha: 1 }];
        if (this.tilt > 0) return [{ anim: 'tiltR', frame: frame(A.tiltR, t, true), alpha: 1 }];
        const moving = Math.hypot(this.vx, this.vy) > MOVE_ON;
        return [{ anim: moving ? 'fly' : 'idle', frame: frame(moving ? A.fly : A.idle, t, true), alpha: 1 }];
    }

    /** True while a hit is playing, so the invulnerability blink doesn't hide it. */
    hitPlaying(t: number): boolean {
        return t - this.hitT < HIT_TIME;
    }
}

/** Draws one frame with nearest-neighbour sampling, its body point at (x, y). */
export function drawSprite(
    ctx: CanvasRenderingContext2D,
    s: SpriteSet,
    layer: Layer,
    x: number,
    y: number,
    scale = 1,
): boolean {
    if (!s.img.complete || !s.img.naturalWidth) return false;
    const a = s.anims[layer.anim];
    const k = s.scale * scale;
    const smooth = ctx.imageSmoothingEnabled;
    const alpha = ctx.globalAlpha;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = alpha * layer.alpha;
    ctx.drawImage(
        s.img,
        layer.frame * s.cw,
        a.row * s.ch,
        s.cw,
        s.ch,
        x - s.bodyX * k,
        y - s.bodyY * k,
        s.cw * k,
        s.ch * k,
    );
    ctx.imageSmoothingEnabled = smooth;
    ctx.globalAlpha = alpha;
    return true;
}
