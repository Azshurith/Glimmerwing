import * as C from '@/core/config';
import type { Controls } from '@/types';
import type { Field } from './field';

/**
 * The CPU pilot. It lines up under its target and dodges sideways, like a
 * player would, and it also moves forward and back: it drifts between a
 * forward stance and the bottom of the meadow, backs off diagonally while
 * dodging, and hops forward out of the way of things rising from below.
 */
export class CpuPilot {
    private t = 0;
    private chargeMode = 0;
    private decideT = 0;
    private aimX = C.FIELD_W / 2;
    private homeY = C.FIELD_H - 34;
    private stanceT = 0;
    private strafe = 0;
    /** True while lining up a shot on a falling star, when we must stay exact. */
    private onStar = false;

    constructor(private reaction = 0.12) {}

    /** Hold fire long enough to reach `level` (the field caps it at the gauge level). */
    private charge(f: Field, level: number): void {
        if (f.gaugeLevel < 1) return;
        this.chargeMode = C.HOLD_BEFORE_CHARGE + C.CHARGE_TIME * f.fairy.charge * level + 0.05;
    }

    /** Decide this frame's controls for the CPU's fairy from the state of its meadow. */
    think(f: Field, dt: number): Controls {
        this.t += dt;
        const p = f.player;
        const out: Controls = { left: false, right: false, up: false, down: false, fire: false };
        const bottom = C.FIELD_H - 22;
        const forward = C.FIELD_H * 0.56;

        const threats: { x: number; y: number; r: number; rising: boolean }[] = [
            ...f.puffs
                .filter(j => !j.moonseed && j.x > -50)
                .map(j => ({ x: j.x, y: j.y, r: C.PUFF_RADIUS * j.size, rising: j.path?.type === 'rise' })),
            ...f.attacks.map(a => ({
                x: a.x,
                y: a.y,
                r: a.kind === 'bramble' ? C.BRAMBLE_RADIUS : C.STAR_RADIUS + (a.kind === 'comet' ? 6 : 0),
                rising: false,
            })),
            ...f.crows.map(c => ({ x: c.x, y: c.y, r: C.CROW_RADIUS + 8, rising: c.vy < 0 })),
            ...(f.moth ? [{ x: f.moth.x, y: f.moth.y, r: 34, rising: false }] : []),
            ...f.bullets.map(b => ({ x: b.x, y: b.y, r: 4, rising: b.vy < 0 })),
        ];

        // Sideways dodge: anything in our lane just above (or level with) us.
        // Also note things coming up from below, which we dodge by moving forward.
        let dodge = 0,
            fromBelow = false,
            overhead = 0,
            urgent = false;
        // A seeker about to plunge from right above us: get moving before it drops.
        for (const a of f.attacks) {
            if (a.flight === 'seeker' && a.seekT > 0 && a.seekT < 0.25 && Math.abs(a.x - p.x) < C.STAR_RADIUS + 16) {
                dodge += a.x < p.x ? 1 : -1;
                urgent = true;
            }
        }
        for (const th of threats) {
            const dy = p.y - th.y; // positive when the threat is above us
            const inLane = Math.abs(th.x - p.x) < th.r + 14;
            if (inLane && dy > -40 && dy < 60) {
                dodge += th.x < p.x ? 1 : -1;
                if (dy < 35) urgent = true;
            }
            if (inLane && dy > 0 && dy < 70) overhead++;
            if (th.rising && Math.abs(th.x - p.x) < th.r + 22 && dy < 0 && dy > -70) fromBelow = true;
        }

        // Re-pick a target a few times a second, not every frame, so it feels human.
        this.decideT -= dt;
        if (this.decideT <= 0) {
            this.decideT = this.reaction + Math.random() * 0.1;
            const star = f.attacks.filter(a => a.kind === 'star').sort((a, b) => b.y - a.y)[0];
            const seed = f.puffs.find(q => q.moonseed && q.y > 20);
            const pool = f.puffs.filter(q => !q.moonseed && q.x > -50);
            // With a moonseed on screen, pop the puff nearest it so the burst catches it.
            const puff = seed
                ? pool.sort(
                      (a, b) => Math.hypot(a.x - seed.x, a.y - seed.y) - Math.hypot(b.x - seed.x, b.y - seed.y),
                  )[0]
                : pool.sort((a, b) => b.y - a.y)[0];
            const target = star && star.y > 40 ? star : puff;
            // Stars are narrow, so line up exactly; for critters a small offset looks more natural.
            this.aimX = target ? target.x + (target === star ? 0 : this.strafe) : C.FIELD_W / 2;
            this.onStar = !!star && target === star;

            // Every couple of seconds choose a new height: further forward when
            // the meadow is quiet, back at the bottom when it's busy.
            this.stanceT -= this.decideT;
            if (this.stanceT <= 0) {
                this.stanceT = 0.7 + Math.random() * 1.1;
                this.strafe = (Math.random() - 0.5) * 14;
                const busy = threats.filter(th => th.y > C.FIELD_H * 0.4).length;
                const lean = busy > 8 ? 1 : busy > 4 ? 0.5 + Math.random() * 0.5 : Math.random() * 0.8;
                this.homeY = forward + (bottom - forward) * lean;
            }
            // Edge closer to a critter that's sinking low, so bursts land sooner.
            if (target && target !== star && target.y > C.FIELD_H * 0.35)
                this.homeY = Math.max(forward, Math.min(bottom, target.y + 90));
            // Working on a falling star: hang back to get more time to break it.
            if (target === star && star) this.homeY = bottom;

            // Occasionally charge into a dense cluster.
            if (this.chargeMode <= 0 && puff) {
                const near = f.puffs.filter(j => Math.hypot(j.x - puff.x, j.y - puff.y) < 50).length;
                if (near >= 5 && Math.random() < 0.5)
                    this.charge(f, f.gaugeLevel >= 3 ? 3 : f.gaugeLevel === 2 && Math.random() < 0.5 ? 2 : 1);
            }
            // Sitting on a full gauge: go for the guardian before long.
            if (this.chargeMode <= 0 && f.gaugeLevel >= 3 && Math.random() < dt * 0.4) this.charge(f, 3);
        }

        const close = threats.filter(th => Math.hypot(th.x - p.x, th.y - p.y) < 40).length;
        if (p.blooms > 0 && p.invuln <= 0 && (close >= 3 || (close >= 2 && p.hull <= 4))) out.bloom = true;

        // A gentle figure-of-eight weave around the chosen spot, so it never sits still.
        // (Held perfectly still on the line while shooting at a star, since stars are narrow.)
        const weaveX = this.onStar ? this.aimX : this.aimX + Math.sin(this.t * 1.7) * 10;
        const weaveY = this.onStar ? this.homeY : this.homeY + Math.sin(this.t * 3.4) * 16;

        // Sideways.
        if (dodge !== 0) {
            let dir = dodge > 0 ? 1 : -1;
            if (p.x < 20) dir = 1;
            else if (p.x > C.FIELD_W - 20) dir = -1;
            out.right = dir > 0;
            out.left = dir < 0;
        } else if (Math.abs(weaveX - p.x) > 4) {
            out.right = weaveX > p.x;
            out.left = weaveX < p.x;
        }

        // Forward and back.
        if (fromBelow) {
            out.up = true; // hop forward out of a rising wave
        } else if (dodge === 0 && overhead > 0) {
            if (p.y < bottom - 4) out.down = true; // something above but not on us yet: back off
        } else if (dodge !== 0 && !urgent) {
            if (p.y < bottom - 4) out.down = true; // time to spare: dodge with a diagonal retreat
        } else if (p.y > Math.min(bottom, weaveY) + 4) {
            out.up = true; // advance to the chosen height
        } else if (p.y < Math.min(bottom, weaveY) - 4) {
            out.down = true;
        }

        if (this.chargeMode > 0) {
            this.chargeMode -= dt;
            out.fire = this.chargeMode > 0; // releasing on the last frame fires the torpedo
        } else {
            out.fire = Math.floor(this.t * 8) % 2 === 0;
        }
        return out;
    }
}
