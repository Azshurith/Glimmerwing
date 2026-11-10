import * as C from './config';
import { Field } from './field';
import { Controls } from './types';

/** A simple CPU pilot: dodge what's close, line up under the lowest puff, tap fire. */
export class CpuPilot {
  private t = 0;
  private chargeMode = 0;
  private decideT = 0;
  private aimX = C.FIELD_W / 2;

  constructor(private reaction = 0.12) {}

  think(f: Field, dt: number): Controls {
    this.t += dt;
    const p = f.player;
    const out: Controls = { left: false, right: false, up: false, down: false, fire: false };

    // Threat check: anything falling toward us in a narrow window.
    let dodge = 0;
    const threats: { x: number; y: number; r: number }[] = [
      ...f.puffs.filter(j => !j.moonseed && j.x > -50).map(j => ({ x: j.x, y: j.y, r: C.PUFF_RADIUS * j.size })),
      ...f.attacks.map(a => ({ x: a.x, y: a.y, r: a.kind === 'bramble' ? C.BRAMBLE_RADIUS : C.STAR_RADIUS + (a.kind === 'comet' ? 6 : 0) })),
      ...f.crows.map(c => ({ x: c.x, y: c.y, r: C.CROW_RADIUS + 8 })),
      ...(f.moth ? [{ x: f.moth.x, y: f.moth.y, r: 34 }] : []),
      ...f.bullets.map(b => ({ x: b.x, y: b.y, r: 4 })),
    ];
    for (const th of threats) {
      const dy = p.y - th.y;
      if (dy > -40 && dy < 60 && Math.abs(th.x - p.x) < th.r + 14) {
        dodge += th.x < p.x ? 1 : -1;
      }
    }

    // Re-pick a target a few times a second, not every frame, so it feels human.
    this.decideT -= dt;
    if (this.decideT <= 0) {
      this.decideT = this.reaction + Math.random() * 0.1;
      const star = f.attacks.filter(a => a.kind === 'star').sort((a, b) => b.y - a.y)[0];
      const seed = f.puffs.find(p => p.moonseed && p.y > 20);
      const pool = f.puffs.filter(p => !p.moonseed && p.x > -50);
      // With a moonseed on screen, pop the puff nearest it so the burst catches it.
      const puff = seed
        ? pool.sort((a, b) => Math.hypot(a.x - seed.x, a.y - seed.y) - Math.hypot(b.x - seed.x, b.y - seed.y))[0]
        : pool.sort((a, b) => b.y - a.y)[0];
      const target = star && star.y > 40 ? star : puff;
      this.aimX = target ? target.x : C.FIELD_W / 2;

      // Occasionally charge into a dense cluster.
      if (this.chargeMode <= 0 && puff) {
        const near = f.puffs.filter(j => Math.hypot(j.x - puff.x, j.y - puff.y) < 50).length;
        if (near >= 5 && Math.random() < 0.5) this.chargeMode = C.HOLD_BEFORE_CHARGE + C.CHARGE_TIME + 0.05;
      }
    }

    if (dodge !== 0) {
      out.right = dodge > 0; out.left = dodge < 0;
    } else if (Math.abs(this.aimX - p.x) > 4) {
      out.right = this.aimX > p.x; out.left = this.aimX < p.x;
    }
    const homeY = C.FIELD_H - 34;
    if (p.y < homeY - 6) out.down = true;

    if (this.chargeMode > 0) {
      this.chargeMode -= dt;
      out.fire = this.chargeMode > 0; // releasing on the last frame fires the torpedo
    } else {
      out.fire = Math.floor(this.t * 8) % 2 === 0;
    }
    return out;
  }
}
