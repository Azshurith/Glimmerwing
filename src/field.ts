import * as C from './config';
import { Fairy, fairyById } from './characters';
import { rollWave } from './waves';
import {
  StarFlight,
  Attack, Bullet, Burst, Controls, CritterKind, Crow, Puff, Moth, Outgoing,
  Particle, Player, Popup, Rng, Shot,
} from './types';

interface ChainInfo { pops: number; live: number; x: number; y: number; charged: boolean; reverses: number; bossSent: boolean }

const attackRadius = (a: Attack) =>
  a.kind === 'bramble' ? C.BRAMBLE_RADIUS : a.kind === 'comet' ? C.COMET_RADIUS : a.kind === 'imp' ? C.IMP_RADIUS : C.STAR_RADIUS;

const dist2 = (ax: number, ay: number, bx: number, by: number) =>
  (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/**
 * One side of the duel. Fields never touch each other directly: anything
 * aimed at the opponent goes into `outbox`, and the Game delivers it.
 */
export class Field {
  player: Player;
  shots: Shot[] = [];
  puffs: Puff[] = [];
  bursts: Burst[] = [];
  attacks: Attack[] = [];
  bullets: Bullet[] = [];
  particles: Particle[] = [];
  popups: Popup[] = [];
  moth: Moth | null = null;
  crows: Crow[] = [];
  private crowsWoken = 0;
  private crowReturns: { at: number; level: number }[] = [];
  outbox: Outgoing[] = [];
  /** Power gauge, 0 to GAUGE_MAX: three levels of GAUGE_LEVEL each. */
  gauge = C.GAUGE_START;
  /** Seconds of Fever left. */
  fever = 0;
  /** Seconds until the next moonseed formation; the warning shows near the end. */
  nextMoonseed = C.MOONSEED_FIRST;
  /** Freeze time after a moonseed breaks; the Game pauses both fields while it runs. */
  hitstop = 0;
  /** Seconds left on the current petal bloom's sweep, and its centre. */
  bloom = 0;
  bloomAt = { x: 0, y: 0 };
  /** Stats this round, read by the Game for unlocks. */
  bestChain = 0;
  fevers = 0;
  time = 0;
  shake = 0;

  private waveRng: Rng;
  private fxRng: Rng;
  /** Counts down to the next wave once the current one is gone. */
  private spawnT = 1.2;
  private waveId = 0;
  private waveT = 0;
  private surged = false;
  private chains = new Map<number, ChainInfo>();
  private nextChain = 1;

  /** `crowFirst`: the Hollow Crow wakes in this meadow (exactly one of the two). */
  constructor(seed: number, readonly fairy: Fairy, private roundIndex = 0, private crowFirst = false) {
    // Both fields get the same wave seed, so the swarms are identical and fair.
    this.waveRng = new Rng(seed);
    this.fxRng = new Rng(seed ^ 0x9e3779b9);
    this.player = {
      x: C.FIELD_W / 2, y: C.FIELD_H - 34, hull: C.MAX_HULL,
      invuln: 0, cooldown: 0, hold: 0, charge: 0, over: 0, wasFiring: false, wasBlooming: false, blooms: C.BLOOMS_PER_ROUND,
    };
  }

  get alive(): boolean { return this.player.hull > 0; }

  /** 0 to 3: how far a charge can go right now. */
  get gaugeLevel(): number { return Math.min(3, Math.floor(this.gauge / C.GAUGE_LEVEL + 1e-6)); }

  /**
   * How fast the meadow runs right now. It climbs through each round and
   * starts higher in each later round of a match. Both meadows share it.
   */
  get tempo(): number {
    const ramp = 1 + C.TEMPO_RAMP * Math.min(1, this.time / C.TEMPO_RAMP_TIME);
    return Math.min(C.TEMPO_MAX, ramp * (1 + C.TEMPO_PER_ROUND * this.roundIndex));
  }

  update(dt: number, input: Controls): void {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.fever = Math.max(0, this.fever - dt);
    // Everything that comes at you runs on the tempo; your fairy and shots
    // get half the boost so you can keep up without it feeling floaty.
    const tempo = this.tempo;
    const world = dt * tempo;
    const own = dt * (1 + (tempo - 1) * 0.5);
    // Sudden death speeds the critters up on top of the tempo.
    if (!this.surged && this.time >= C.SURGE_TIME) {
      this.surged = true;
      this.popup(C.FIELD_W / 2, 70, 'The meadow quickens');
      this.shake = 3;
    }
    const critters = world * (this.surged ? C.SURGE_SPEED : 1);
    if (this.alive) this.updatePlayer(own, input);
    this.spawnWaves(critters);
    this.updateShots(own);
    this.updatePuffs(critters);
    this.updateAttacks(world);
    this.updateMoth(world);
    this.updateBullets(world);
    this.updateCrows(world);
    this.updateBursts(dt);
    this.updateBloom(dt);
    this.checkPlayerHits();
    this.updateFx(dt);
    this.cleanup();
  }

  // ---- incoming from the opponent ----------------------------------------

  receive(o: Outgoing): void {
    if (o.kind === 'imp') {
      // The rival's Extra Attack: small critters that fly the sender's pattern.
      const sender = fairyById(o.fairy ?? 'pip');
      const flight = sender.extra.flight, sp = C.IMP_SPEED;
      const x = Math.min(C.FIELD_W - 12, Math.max(12, o.fromX));
      let vx = 0, vy = sp, seekT = 0;
      if (flight === 'seeker') { vy = 0; seekT = C.SEEK_TIME + this.fxRng.range(0, 0.4); }
      if (flight === 'slant') { const d = x < C.FIELD_W / 2 ? 1 : -1; vx = d * sp * 0.8; vy = sp * 0.8; }
      if (flight === 'zig') seekT = this.fxRng.range(0.3, 0.7); // time to the first turn
      this.attacks.push({
        x, y: -12, vx, vy, flight, seekT, plunge: sp * 1.8, kind: 'imp', level: 1, hp: C.IMP_HP,
        spin: this.fxRng.range(0, Math.PI * 2), dead: false, color: sender.color,
      });
      return;
    }
    if (o.kind === 'crow') {
      this.crowsWoken = 1;
      this.crowReturns.push({ at: this.time + (o.delay ?? 0), level: o.level });
      return;
    }
    if (o.kind === 'moth') {
      if (!this.moth) {
        const sender = fairyById(o.fairy ?? 'pip');
        this.moth = { x: C.FIELD_W / 2, y: -40, hp: C.MOTH_HP, t: 0, fireT: 0, dead: false, guardian: sender.guardian, wing: sender.wing, angle: 0, stage: 'wander', stageT: 0 };
        this.popup(C.FIELD_W / 2, 90, `${sender.guardian.name} incoming`);
      }
      return;
    }
    // Attacks drop in at the same spot they were sent from, mirrored into this meadow.
    const x = Math.min(C.FIELD_W - 12, Math.max(12, o.fromX));
    const speed = o.kind === 'bramble' ? 42 : o.kind === 'comet' ? C.COMET_SPEED : 70 + o.level * 32;
    let vx = o.kind === 'bramble' ? (this.player.x - x) * 0.2 : 0, vy = speed;
    // Stars come in three flights; tougher (batted-back) stars lean toward the trickier ones.
    let flight: StarFlight = 'drop';
    if (o.kind === 'star') {
      const roll = this.fxRng.next(), bias = (o.level - 1) * 0.1;
      if (roll < C.SEEKER_CHANCE + bias) flight = 'seeker';
      else if (roll < C.SEEKER_CHANCE + C.SLANT_CHANCE + bias * 2) flight = 'slant';
    }
    if (flight === 'slant') {
      // Angle across the meadow, toward the far side from where it enters.
      const dir = x < C.FIELD_W / 2 ? 1 : -1;
      const ang = this.fxRng.range(0.35, 0.6);
      vx = dir * Math.sin(ang) * speed * 1.1; vy = Math.cos(ang) * speed;
    }
    if (flight === 'seeker') { vx = 0; vy = 0; }
    this.attacks.push({
      x, y: -12,
      vx, vy,
      flight, seekT: flight === 'seeker' ? C.SEEK_TIME : 0, plunge: speed * 1.2,
      kind: o.kind, level: o.level,
      hp: o.kind === 'bramble' ? C.BRAMBLE_HP : o.kind === 'comet' ? Infinity : C.starHp(o.level),
      spin: this.fxRng.range(0, Math.PI * 2), dead: false,
    });
  }

  // ---- player ----------------------------------------------------------------

  private updatePlayer(dt: number, input: Controls): void {
    const p = this.player;
    let dx = 0, dy = 0;
    if (input.target) {
      const tx = input.target.x - p.x, ty = input.target.y - p.y;
      const d = Math.hypot(tx, ty);
      if (d > 2) { dx = tx / d; dy = ty / d; }
    } else {
      dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      if (dx && dy) { dx *= Math.SQRT1_2; dy *= Math.SQRT1_2; }
    }
    const slow = p.charge > 0 ? 0.75 : 1;
    p.x = Math.min(C.FIELD_W - 10, Math.max(10, p.x + dx * C.PLAYER_SPEED * this.fairy.speed * slow * dt));
    p.y = Math.min(C.FIELD_H - 14, Math.max(C.FIELD_H * 0.45, p.y + dy * C.PLAYER_SPEED * this.fairy.speed * slow * dt));
    p.invuln = Math.max(0, p.invuln - dt);
    p.cooldown = Math.max(0, p.cooldown - dt);

    // Petal bloom: once per press, if you have one left.
    if (input.bloom && !p.wasBlooming && p.blooms > 0 && this.bloom <= 0) {
      p.blooms--;
      this.bloom = C.BLOOM_TIME;
      this.bloomAt = { x: p.x, y: p.y };
      p.invuln = Math.max(p.invuln, C.BLOOM_INVULN);
      p.charge = 0; p.over = 0; p.hold = 0;
      this.shake = 4;
      this.popup(p.x, p.y - 24, this.fairy.bomb.name);
    }
    p.wasBlooming = !!input.bloom;

    // Tap to shoot; hold to charge a pulse torpedo, release to launch it.
    if (input.fire) {
      if (!p.wasFiring && p.cooldown <= 0) this.volley(C.FIRE_COOLDOWN);
      p.hold += dt;
      // Charge climbs a level per CHARGE_TIME, but only as high as the power gauge allows.
      const cap = this.gaugeLevel;
      if (p.hold > C.HOLD_BEFORE_CHARGE && cap >= 1) p.charge = Math.min(cap, p.charge + dt / (C.CHARGE_TIME * this.fairy.charge));
      p.over = p.charge > 1 ? (p.charge - 1) / 2 : 0;
    } else {
      if (p.wasFiring && p.charge >= 1) this.releaseCharge(Math.floor(p.charge + 1e-6));
      p.hold = 0;
      p.charge = 0;
      p.over = 0;
      // Autofire: a steady stream of plain shots, no charging.
      if (input.auto && p.cooldown <= 0) this.volley(C.AUTO_FIRE_COOLDOWN);
    }
    p.wasFiring = input.fire;
  }

  /** One plain shot. Fever only makes you fire faster; the pattern never changes. */
  private volley(cooldown: number): void {
    const p = this.player;
    this.shots.push({ x: p.x, y: p.y - 10, vx: 0, charged: false, dead: false });
    p.cooldown = cooldown / (this.fever > 0 ? C.FEVER_FIRE_RATE : 1);
  }

  /**
   * Every fairy's charge shot is her own (Twinkle Star Sprites style). All of
   * them pierce: the first critter each one hits starts a chain, the rest are
   * cleared without one.
   */
  private fireChargeShot(): void {
    const p = this.player, style = this.fairy.chargeStyle;
    const shot = (dx: number, vx: number, r: number, sp: number, dmg: number, life?: number) =>
      this.shots.push({ x: p.x + dx, y: p.y - 12, vx, charged: true, dead: false, r, sp, dmg, life, style });
    switch (style) {
      case 'orb': shot(0, 0, 10, 0.75, 6); break;                       // a steady ball of light
      case 'thorn': shot(0, 0, 14, 0.55, 8); break;                     // slow, fat and heavy
      case 'needles': for (const vx of [-70, 0, 70]) shot(0, vx, 5, 1.15, 3); break; // a fast fan of three
      case 'twin': shot(-9, 0, 7, 0.9, 4); shot(9, 0, 7, 0.9, 4); break; // two side by side
      case 'flare': for (const vx of [-180, -90, 0, 90, 180]) shot(0, vx, 9, 0.8, 3, 0.32); break; // short-range cone
      case 'crescent': shot(0, 0, 24, 0.6, 6); break;                   // a wide sweeping arc
    }
  }

  /** Let go of a charge: the torpedo always, plus an Extra Attack at level 2 or the guardian at level 3. */
  private releaseCharge(level: number): void {
    const p = this.player;
    this.fireChargeShot();
    this.popup(p.x, p.y - 14, this.fairy.chargeName);
    this.shake = 3;
    if (level === 2) {
      this.gauge -= C.EXTRA_COST * C.GAUGE_LEVEL;
      const ex = this.fairy.extra;
      for (let i = 0; i < ex.count; i++) {
        const fromX = C.FIELD_W * (i + 1) / (ex.count + 1);
        this.outbox.push({ kind: 'imp', level: 1, fromX, fromY: p.y, fairy: this.fairy.id });
      }
      this.popup(p.x, p.y - 26, ex.name);
      this.spray(p.x, p.y - 10, 14, this.fairy.color);
    } else if (level >= 3) {
      this.gauge -= C.BOSS_COST * C.GAUGE_LEVEL;
      this.sendGuardian('Boss');
      this.spray(p.x, p.y - 10, 24, this.fairy.guardian.color);
      this.shake = 5;
    }
  }

  // ---- swarms ------------------------------------------------------------------

  get moonseedWarning(): boolean {
    return this.nextMoonseed > 0 && this.nextMoonseed - this.time < C.MOONSEED_WARNING;
  }

  private spawnWaves(dt: number): void {
    // Formation flow: the next wave waits until every member of the current one
    // has been popped or has left the meadow, then follows after a short beat.
    this.waveT += dt;
    const holding = this.waveId > 0 && this.waveT < C.WAVE_MAX_WAIT &&
      this.puffs.some(j => j.wave === this.waveId && !j.dead);
    if (holding) { this.spawnT = C.WAVE_GAP; return; }
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    // Both meadows draw the same sequence of waves from the shared seed; a faster
    // clearer just meets them sooner. The moonseed rides the first wave after its time.
    const withMoonseed = this.time >= this.nextMoonseed;
    if (withMoonseed) this.nextMoonseed += C.MOONSEED_EVERY;
    const r = this.waveRng;
    const pressure = Math.min(1, this.time / 90);
    this.waveId++;
    this.waveT = 0;
    const w = rollWave(r, pressure);
    const firstNew = this.puffs.length;
    const n = w.count;
    const size = w.big ? 1.5 : 1;
    if (w.path === 'rise') this.popup(w.side < 0 ? 50 : C.FIELD_W - 50, C.FIELD_H - 70, 'From below');

    for (let i = 0; i < n; i++) {
      let x = w.cx, y = -14;
      const spread = size;
      switch (w.path) {
        case 'arc': { const a = Math.PI * (i / Math.max(1, n - 1)); x = w.cx + Math.cos(a) * 40 * spread; y = -14 - Math.sin(a) * 26 * spread; break; }
        case 'string': x = w.cx - 50 + i * (100 / n); y = -14 - i * 12 * spread; break;
        case 'ring': { const a = (Math.PI * 2 * i) / n; x = w.cx + Math.cos(a) * 26 * spread; y = -40 + Math.sin(a) * 22 * spread; break; }
        case 'leader':
          if (i > 0) { const a = (Math.PI * 2 * (i - 1)) / (n - 1); x = w.cx + Math.cos(a) * 17; y = -40 + Math.sin(a) * 17; }
          else y = -40;
          break;
      }
      const phase = (i * 1.7 + w.cx) % 6.28;
      let vx = ((i * 37) % 16) - 8, vy = w.speed, shell = w.bubble ? 1 : 0;
      if (w.kind === 'beetle') { vx = w.side * 34; vy = w.speed * 1.35; shell = 2; }
      if (w.kind === 'spinner') { vx = 0; vy = w.speed * 0.9; }
      let path: Puff['path'];
      switch (w.path) {
        case 'swoop': path = { type: 'swoop', t: 0, delay: i * 0.32 * size, dir: w.side, ox: 0, oy: 0 }; break;
        case 'sweep': path = { type: 'sweep', t: 0, delay: i * 0.42 * size, dir: w.side, ox: 0, oy: w.lane }; break;
        case 'column': path = { type: 'column', t: 0, delay: Math.floor(i / 2) * 0.55, dir: i % 2 ? 1 : -1, ox: w.cx, oy: 0 }; break;
        case 'rise': path = { type: 'rise', t: 0, delay: 0.9 + i * 0.4, dir: w.side, ox: 0, oy: 0 }; break;
      }
      if (path) { x = -100; y = -100; vx = 0; }
      const hp = w.hp[i];
      this.puffs.push({ kind: w.kind, x, y, baseX: x, vx, vy, phase, dead: false, hp, maxHp: hp, shell, path, size, wave: this.waveId });
    }
    if (withMoonseed) {
      const m = this.puffs[firstNew + Math.floor((this.puffs.length - firstNew) / 2)];
      if (m) { m.moonseed = true; m.shell = 0; }
    }
  }


  /** Formation paths: each member follows the same route, a beat behind the one ahead. */
  private followPath(j: Puff, dt: number): void {
    const P = j.path!;
    P.t += dt;
    const tt = P.t - P.delay;
    if (tt < 0) { j.x = -100; j.y = -100; return; } // still waiting off-screen
    const W = C.FIELD_W;
    if (P.type === 'swoop') {
      // Enter from a top corner, dive to mid-meadow and curl back up and out.
      const T = 7, k = tt / T;
      j.x = (P.dir > 0 ? -10 : W + 10) + P.dir * (W + 20) * k;
      j.y = -14 + 4 * 175 * k * (1 - k);
      if (k > 1) j.dead = true;
    } else if (P.type === 'sweep') {
      // A line crossing the meadow, sinking slowly.
      j.x = (P.dir > 0 ? -12 : W + 12) + P.dir * 48 * tt;
      j.y = P.oy + 6 * tt;
      if (j.x < -20 || j.x > W + 20) j.dead = true;
    } else if (P.type === 'rise') {
      // The sneaky one: climbs up from a bottom corner, across the fairy's level, and out the top.
      const T = 6, k = tt / T;
      j.x = (P.dir < 0 ? 14 : W - 14) - P.dir * (W * 0.55) * k + Math.sin(k * Math.PI * 2) * 12;
      j.y = C.FIELD_H + 14 - (C.FIELD_H + 40) * k;
      if (k > 1) j.dead = true;
    } else {
      // Two columns dropping in pairs, squeezing together as they fall.
      j.x = P.ox + P.dir * (8 + 24 * Math.max(0, 1 - tt / 3.5));
      j.y = -14 + 42 * tt;
      if (j.y > C.FIELD_H + 20) j.dead = true;
    }
  }

  private updatePuffs(dt: number): void {
    for (const j of this.puffs) {
      j.phase += dt * 3;
      if (j.path) { this.followPath(j, dt); continue; }
      if (j.kind === 'beetle') {
        // Beetles cut straight diagonals and ricochet off the meadow walls.
        j.x += j.vx * dt; j.y += j.vy * dt;
      } else if (j.kind === 'spinner') {
        // Maple-seed spinners corkscrew down around their starting line.
        j.y += j.vy * dt;
        j.x = j.baseX + Math.sin(j.phase * 0.9) * 34;
      } else {
        j.x += (j.vx + Math.sin(j.phase) * 14) * dt;
        j.y += j.vy * (0.75 + 0.25 * Math.sin(j.phase * 0.5)) * dt;
      }
      if (j.kind !== 'spinner' && (j.x < 10 || j.x > C.FIELD_W - 10)) { j.vx *= -1; j.x = Math.min(C.FIELD_W - 10, Math.max(10, j.x)); }
      if (j.y > C.FIELD_H + 20) j.dead = true;
    }
  }

  // ---- shots & chains -------------------------------------------------------------

  private updateShots(dt: number): void {
    for (const s of this.shots) {
      s.y -= C.SHOT_SPEED * (s.sp ?? (s.charged ? 0.75 : 1)) * dt;
      s.x += s.vx * dt;
      if (s.life !== undefined) { s.life -= dt; if (s.life <= 0) { s.dead = true; continue; } }
      if (s.y < -10 || s.x < -10 || s.x > C.FIELD_W + 10) { s.dead = true; continue; }
      const hitR = s.r ?? (s.charged ? 10 : 3);
      const power = s.dmg ?? (s.charged ? 6 : 1);

      for (const j of this.puffs) {
        if (j.dead || dist2(s.x, s.y, j.x, j.y) >= (C.PUFF_RADIUS * j.size + hitR) ** 2) continue;
        if (j.moonseed) { s.dead = true; this.spray(s.x, s.y, 3, '#cfe9ff'); break; }
        if (s.charged && s.popped) {
          // Past its first hit, a torpedo ploughs on and clears what it touches,
          // but those pops don't burst or count toward a chain.
          j.dead = true;
          this.spray(j.x, j.y, 6, '#fff6d8');
          continue;
        }
        // Plain shots stop at the first critter; a torpedo carries on.
        if (s.charged) s.popped = true; else s.dead = true;
        if (j.shell > 0) { j.shell -= s.charged ? 2 : 1; this.spray(s.x, s.y, 4, '#d9f1ff'); break; }
        if (!s.charged && j.hp > 1) { j.hp--; this.spray(s.x, s.y, 3, '#fff6d8'); break; }
        this.popPuff(j, this.newChain(j.x, j.y, s.charged), s.charged);
        break;
      }
      if (s.dead) continue;

      for (const a of this.attacks) {
        const r = attackRadius(a);
        if (!a.dead && dist2(s.x, s.y, a.x, a.y) < (r + hitR) ** 2) {
          s.dead = true;
          if (a.kind === 'comet') { this.spray(s.x, s.y, 2, '#ffb3c8'); break; }
          this.hitAttack(a, s.charged ? Math.max(1, Math.round(power / 2)) : 1, null);
          break;
        }
      }
      if (s.dead) continue;

      for (const c of this.crows) {
        if (c.hp > 0 && dist2(s.x, s.y, c.x, c.y) < (C.CROW_RADIUS + hitR + 2) ** 2) {
          s.dead = true;
          c.hp -= s.charged ? Math.max(1, Math.round(power * 2 / 3)) : 1;
          this.spray(s.x, s.y, 2, '#ff9fb8');
          if (c.hp <= 0) {
            this.spray(c.x, c.y, 20, '#ff9fb8');
            this.popup(c.x, c.y, 'Crow driven off');
            // It comes back sooner and faster, in the rival's meadow.
            this.outbox.push({
              kind: 'crow', level: c.level + 1, fromX: c.x, fromY: c.y,
              delay: Math.max(C.CROW_RETURN_MIN, C.CROW_RETURN - (c.level - 1) * 1.5),
            });
          }
          break;
        }
      }
      if (s.dead) continue;

      const L = this.moth;
      if (L && !L.dead && Math.abs(s.x - L.x) < 34 && Math.abs(s.y - L.y) < 16) {
        s.dead = true;
        this.damageMoth(power, s.x, s.y);
      }
    }
  }

  private newChain(x: number, y: number, charged: boolean): number {
    const id = this.nextChain++;
    this.chains.set(id, { pops: 0, live: 0, x, y, charged, reverses: 0, bossSent: false });
    return id;
  }

  private addBurst(x: number, y: number, chainId: number, maxR: number): void {
    this.bursts.push({ x, y, maxR, age: 0, chainId, hits: new Set() });
    const c = this.chains.get(chainId);
    if (c) c.live++;
  }

  private popPuff(j: Puff, chainId: number, big: boolean): void {
    j.dead = true;
    const c = this.chains.get(chainId);
    if (c) { c.pops++; c.x = j.x; c.y = j.y; }
    const sizeK = 1 + (j.maxHp - 1) * 0.12 + (j.kind === 'beetle' ? 0.25 : 0) + (j.size - 1) * 0.8;
    this.addBurst(j.x, j.y, chainId, (big ? C.CHARGED_BURST_RADIUS : C.BURST_RADIUS) * this.fairy.burst * sizeK);
    this.spray(j.x, j.y, 8, '#fff6d8');
  }

  /** Hitting an incoming attack. Spores bounce back at a higher level. */
  private hitAttack(a: Attack, dmg: number, chainId: number | null): void {
    a.hp -= dmg;
    if (a.hp > 0) { this.spray(a.x, a.y, 3, a.kind === 'imp' ? a.color ?? '#fff' : a.kind === 'star' ? '#ffe27a' : '#b98ae0'); return; }
    a.dead = true;
    // Extra Attack critters just pop: nothing to bat back.
    if (a.kind === 'imp') {
      this.spray(a.x, a.y, 10, a.color ?? '#fff');
      this.gauge = Math.min(C.GAUGE_MAX, this.gauge + 2);
      return;
    }
    // Countering doesn't add to the chain count; the counter itself is the reward.
    const id = chainId ?? this.newChain(a.x, a.y, false);
    if (a.kind === 'bramble') {
      this.addBurst(a.x, a.y, id, C.CHARGED_BURST_RADIUS);
      this.spray(a.x, a.y, 16, '#b98ae0');
      this.gauge = Math.min(C.GAUGE_MAX, this.gauge + 4);
    } else {
      this.addBurst(a.x, a.y, id, C.BURST_RADIUS);
      this.spray(a.x, a.y, 6, '#ffe27a');
      if (a.level < 2) {
        // A plain star goes back as a flashing reverse star, tougher.
        const lvl = Math.min(C.MAX_STAR_LEVEL, 2 + this.fairy.counterBoost);
        this.outbox.push({ kind: 'star', level: lvl, fromX: a.x, fromY: a.y });
        this.popup(a.x, a.y - 10, 'Reverse');
      } else {
        // Breaking a reverse star turns it into one of your Extra Attack critters.
        this.outbox.push({ kind: 'imp', level: 1, fromX: a.x, fromY: a.y, fairy: this.fairy.id });
        this.popup(a.x, a.y - 10, this.fairy.extra.name);
        // Three or more reverse stars broken in one chain summon your guardian.
        const c = this.chains.get(id);
        if (c && ++c.reverses >= C.BOSS_CHAIN_REVERSES && !c.bossSent) {
          c.bossSent = true;
          this.sendGuardian('Reverse chain');
        }
      }
    }
  }

  private updateBursts(dt: number): void {
    for (const b of this.bursts) {
      b.age += dt;
      const r = b.maxR * Math.min(1, b.age / (C.BURST_LIFE * 0.6));
      for (const j of this.puffs) {
        if (!j.dead && dist2(b.x, b.y, j.x, j.y) < (r + C.PUFF_RADIUS * 0.6 * j.size) ** 2) {
          if (j.shell > 0) {
            if (!b.hits.has(j)) { b.hits.add(j); j.shell = 0; this.spray(j.x, j.y, 6, '#d9f1ff'); }
            continue;
          }
          if (j.moonseed) this.breakMoonseed(j);
          this.popPuff(j, b.chainId, false);
        }
      }
      for (const a of this.attacks) {
        if (!a.dead && (a.kind === 'star' || a.kind === 'imp') && !b.hits.has(a) && dist2(b.x, b.y, a.x, a.y) < r * r) {
          b.hits.add(a);
          this.hitAttack(a, 1, b.chainId);
        }
      }
      const L = this.moth;
      if (L && !L.dead && b.age < dt * 1.5 && Math.abs(b.x - L.x) < 40 + b.maxR && Math.abs(b.y - L.y) < 20 + b.maxR) {
        this.damageMoth(2, b.x, b.y);
      }
    }
    // Resolve finished bursts and close out chains with nothing left alive.
    for (const b of this.bursts) {
      if (b.age >= C.BURST_LIFE) {
        const c = this.chains.get(b.chainId);
        if (c) {
          c.live--;
          if (c.live <= 0) { this.resolveChain(c); this.chains.delete(b.chainId); }
        }
      }
    }
    this.bursts = this.bursts.filter(b => b.age < C.BURST_LIFE);
  }

  private resolveChain(c: ChainInfo): void {
    const n = c.pops;
    if (n <= 0) return;
    this.bestChain = Math.max(this.bestChain, n);
    this.gauge = Math.min(C.GAUGE_MAX, this.gauge + ((n - 1) * 2 + (c.charged ? 2 : 0)) * (this.fever > 0 ? 2 : 1));
    if (n >= 2) this.popup(c.x, c.y, `${n} chain`);
    const inFever = this.fever > 0;
    if (n >= 3 || (inFever && n >= 2)) {
      // During Fever every pop after the first sends a star (a 5-chain sends 4).
      const stars = inFever ? Math.min(C.FEVER_STAR_CAP, n - 1) : Math.min(3, Math.floor((n - 1) / 2));
      // Fan a volley out around the chain's last pop so the stars don't stack.
      for (let i = 0; i < stars; i++) {
        const off = (i - (stars - 1) / 2) * 16;
        this.outbox.push({ kind: 'star', level: 1, fromX: c.x + off, fromY: c.y });
      }
      if (n >= 7) this.outbox.push({ kind: 'bramble', level: 1, fromX: c.x, fromY: c.y });
    }
    // A full gauge no longer fires itself: charge to level 3 to send the guardian.
  }

  /**
   * Breaking a moonseed with a pollen burst starts Fever after a short freeze.
   * Shots alone just bounce off it.
   */
  private breakMoonseed(m: Puff): void {
    this.hitstop = C.HITSTOP;
    this.spray(m.x, m.y, 30, '#cfe9ff');
    this.startFever();
  }

  /**
   * Fever: for a few seconds you fire a spread, a dense drift of puffs rushes
   * in to chain off, every chain sends extra stars, and the moth gauge fills
   * twice as fast.
   */
  private startFever(): void {
    this.fever = C.FEVER_TIME * this.fairy.feverTime;
    this.fevers++;
    this.popup(C.FIELD_W / 2, C.FIELD_H / 2 - 20, 'Fever');
    this.shake = 4;
    const r = this.fxRng;
    const cx = r.range(70, C.FIELD_W - 70);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        this.puffs.push({
          x: cx + (col - 2) * 20 + (row % 2) * 10, y: -16 - row * 18,
          vx: 0, vy: 55, phase: r.range(0, 6.28), dead: false, hp: 1,
          kind: 'puff', shell: 0, maxHp: 1, size: 1, baseX: cx + (col - 2) * 20 + (row % 2) * 10,
        });
      }
    }
  }

  // ---- attacks, moth, bullets -------------------------------------------------

  private updateAttacks(dt: number): void {
    for (const a of this.attacks) {
      a.spin += dt * (a.kind === 'bramble' ? 1.5 : 4 + a.level);
      if (a.flight === 'zig') {
        // Right-angle turns: fall, dart sideways, fall again.
        a.seekT -= dt;
        if (a.seekT <= 0) {
          a.seekT = this.fxRng.range(0.35, 0.8);
          if (a.vx === 0) { a.vx = (this.player.x < a.x ? -1 : 1) * C.IMP_SPEED * 1.1; a.vy = 0; }
          else { a.vx = 0; a.vy = C.IMP_SPEED; }
        }
      }
      if (a.flight === 'seeker' && a.seekT > 0) {
        // Line up: ease into the top of the meadow while sliding over the fairy.
        a.seekT -= dt;
        a.y += (26 - a.y) * Math.min(1, dt * 6);
        const gap = this.player.x - a.x;
        a.x += Math.sign(gap) * Math.min(Math.abs(gap), C.SEEK_SLIDE * dt);
        if (a.seekT <= 0) { a.vx = 0; a.vy = a.plunge; }
        continue;
      }
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.x < 8 || a.x > C.FIELD_W - 8) a.vx *= -1;
      if (a.y > C.FIELD_H + 20) a.dead = true;
    }
  }

  /**
   * Guardians run three stages: wander in and shadow the fairy, lock in place
   * and attack, then sink out through the bottom of the meadow.
   */
  private updateMoth(dt: number): void {
    const L = this.moth;
    if (!L) return;
    L.t += dt;
    L.stageT += dt;
    if (L.stage === 'wander') {
      L.y += (62 - L.y) * Math.min(1, dt * 1.8);
      L.x += (this.player.x - L.x) * Math.min(1, dt * 1.4);
      if (L.stageT >= C.GUARDIAN_WANDER) { L.stage = 'attack'; L.stageT = 0; L.fireT = 0.5; }
    } else if (L.stage === 'attack') {
      L.fireT -= dt;
      if (L.fireT <= 0 && this.alive) this.guardianFire(L);
      if (L.stageT >= C.GUARDIAN_ATTACK) { L.stage = 'exit'; L.stageT = 0; }
    } else {
      L.y += (30 + L.stageT * 25) * dt;
      L.x = Math.min(C.FIELD_W - 20, Math.max(20, L.x + Math.sin(L.stageT * 2) * 40 * dt));
      if (L.y > C.FIELD_H + 40) this.moth = null;
    }
  }


  /**
   * A petal bloom sweeps outward from where it was set off. It clears bullets,
   * stars, brambles and comets, pops small fry (two hits or fewer) without
   * starting a chain or sending anything, and stings a guardian. Shells,
   * moonseeds and crows shrug it off.
   */
  private updateBloom(dt: number): void {
    if (this.bloom <= 0) return;
    this.bloom = Math.max(0, this.bloom - dt);
    const k = 1 - this.bloom / C.BLOOM_TIME;
    const R = 30 + 330 * k;
    const { x, y } = this.bloomAt;
    const inside = (px: number, py: number) => dist2(x, y, px, py) < R * R;
    for (const b of this.bullets) if (!b.dead && inside(b.x, b.y)) { b.dead = true; this.spray(b.x, b.y, 2, '#ffd1e6'); }
    for (const a of this.attacks) if (!a.dead && inside(a.x, a.y)) { a.dead = true; this.spray(a.x, a.y, 4, '#ffd1e6'); }
    for (const j of this.puffs) {
      if (!j.dead && !j.moonseed && j.shell <= 0 && j.hp <= 2 && j.x > -50 && inside(j.x, j.y)) {
        j.dead = true; this.spray(j.x, j.y, 5, '#ffd1e6');
      }
    }
    const L = this.moth;
    if (L && !L.dead && this.bloom + dt >= C.BLOOM_TIME * 0.5 && this.bloom < C.BLOOM_TIME * 0.5 && inside(L.x, L.y)) {
      this.damageMoth(8, L.x, L.y);
    }
  }

  /** Breaking several incoming stars in quick succession rallies your guardian. */
  private sendGuardian(how: string): void {
    this.outbox.push({ kind: 'moth', level: 1, fromX: C.FIELD_W / 2, fromY: C.FIELD_H / 2, fairy: this.fairy.id });
    this.popup(C.FIELD_W / 2, C.FIELD_H / 2, how ? `${how}: ${this.fairy.guardian.name} sent` : `${this.fairy.guardian.name} sent`);
  }

  /** Each fairy's guardian has its own firing pattern. */
  private guardianFire(L: Moth): void {
    const shoot = (ang: number, speed: number) =>
      this.bullets.push({ x: L.x, y: L.y + 8, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, dead: false });
    const aim = Math.atan2(this.player.y - L.y, this.player.x - L.x);
    switch (L.guardian.pattern) {
      case 'aimed': // three-way aimed fan
        L.fireT = 1.3;
        for (const off of [-0.3, 0, 0.3]) shoot(aim + off, 110);
        break;
      case 'ring': // slow eight-way ring
        L.fireT = 2;
        for (let i = 0; i < 8; i++) shoot(L.angle + (Math.PI * 2 * i) / 8, 70);
        L.angle += 0.2;
        break;
      case 'rapid': // quick single aimed shots
        L.fireT = 0.45;
        shoot(aim, 150);
        break;
      case 'rain': // petals dropping straight down across the meadow
        L.fireT = 0.3;
        this.bullets.push({ x: 12 + this.fxRng.next() * (C.FIELD_W - 24), y: L.y, vx: 0, vy: 95, dead: false });
        break;
      case 'spiral': // a turning three-armed spiral
        L.fireT = 0.22;
        L.angle += 0.38;
        for (let i = 0; i < 3; i++) shoot(L.angle + (Math.PI * 2 * i) / 3, 85);
        break;
      case 'sweep': // a five-way fan that sweeps side to side
        L.fireT = 0.9;
        { const centre = Math.PI / 2 + Math.sin(L.t * 1.4) * 0.7;
          for (let i = -2; i <= 2; i++) shoot(centre + i * 0.2, 100); }
        break;
    }
  }

  private damageMoth(dmg: number, x: number, y: number): void {
    const L = this.moth;
    if (!L) return;
    L.hp -= dmg;
    this.spray(x, y, 3, '#ffcf8a');
    if (L.hp <= 0) {
      const id = this.newChain(L.x, L.y, true);
      this.addBurst(L.x, L.y, id, 70);
      this.spray(L.x, L.y, 40, '#ffcf8a');
      this.popup(L.x, L.y, `${L.guardian.name} banished`);
      this.shake = 8;
      this.moth = null;
    }
  }

  /** Both meadows see the warning: the crow is about to wake in one of them. */
  get crowWarning(): boolean {
    return !this.crowsWoken && C.CROW_TIME - this.time < C.CROW_WARNING;
  }

  private addCrow(level: number, msg: string): void {
    this.crows.push({
      x: C.FIELD_W / 2, y: -20, vx: 0, vy: 0, state: 'climb', t: 0, seed: this.time, hp: C.CROW_HP,
      level, speed: C.CROW_SPEED + (level - 1) * C.CROW_SPEED_STEP,
      stay: Math.max(C.CROW_STAY_MIN, C.CROW_STAY - (level - 1)),
    });
    this.popup(C.FIELD_W / 2, 80, msg);
  }

  /**
   * Sudden death. One Hollow Crow per round wakes in one meadow, circles and
   * dives at the fairy, then crosses into the other meadow; back and forth
   * until the round ends. Drive it off and it reappears in the rival's
   * meadow, sooner and faster each time.
   */
  private updateCrows(dt: number): void {
    if (!this.crowsWoken && this.time >= C.CROW_TIME) {
      this.crowsWoken = 1;
      if (this.crowFirst) this.addCrow(1, 'A hollow crow wakes');
      else this.popup(C.FIELD_W / 2, 80, 'A crow wakes next door');
    }
    for (const ret of this.crowReturns) {
      if (this.time >= ret.at) this.addCrow(ret.level, ret.level > 1 ? 'The crow returns, faster' : 'The crow crosses over');
    }
    this.crowReturns = this.crowReturns.filter(r => this.time < r.at);
    const p = this.player;
    for (const c of this.crows) {
      c.t += dt;
      c.stay -= dt;
      // Done hunting here: finish any dive, then fly out the top and into the other meadow.
      if (c.stay <= 0 && c.state !== 'dive' && c.state !== 'leave') { c.state = 'leave'; c.t = 0; }
      if (c.state === 'leave') {
        c.vx = 0; c.vy = -150;
        c.y += c.vy * dt;
        if (c.y < -24) {
          this.outbox.push({ kind: 'crow', level: c.level, fromX: c.x, fromY: 0 });
          c.hp = 0;
        }
        continue;
      }
      if (c.state === 'circle') {
        const tx = C.FIELD_W / 2 + Math.cos(c.t * 1.3 + c.seed) * 80;
        const ty = 50 + Math.sin(c.t * 2.1 + c.seed) * 20;
        c.x += (tx - c.x) * Math.min(1, dt * 3); c.y += (ty - c.y) * Math.min(1, dt * 3);
        if (c.t > 3.2) {
          c.state = 'dive'; c.t = 0;
          const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
          const sp = c.speed;
          c.vx = ((p.x - c.x) / d) * sp; c.vy = ((p.y - c.y) / d) * sp;
        }
      } else if (c.state === 'dive') {
        c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.y > C.FIELD_H - 10 || c.t > 2.2) { c.state = 'climb'; c.t = 0; }
      } else {
        c.y += (40 - c.y) * Math.min(1, dt * 2.5);
        if (c.t > 1.2) { c.state = 'circle'; c.t = 0; }
      }
      c.x = Math.min(C.FIELD_W - 8, Math.max(8, c.x));
    }
    this.crows = this.crows.filter(c => c.hp > 0);
  }

  private updateBullets(dt: number): void {
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y > C.FIELD_H + 8 || b.x < -8 || b.x > C.FIELD_W + 8) b.dead = true;
    }
  }

  private checkPlayerHits(): void {
    const p = this.player;
    if (!this.alive || p.invuln > 0) return;
    const pr = C.PLAYER_RADIUS * this.fairy.hitbox;
    const hit = (x: number, y: number, r: number) => dist2(p.x, p.y, x, y) < (r + pr) ** 2;
    let struck = false;
    for (const j of this.puffs) if (!j.dead && !j.moonseed && hit(j.x, j.y, C.PUFF_RADIUS * 0.8 * j.size)) { j.dead = true; struck = true; }
    for (const a of this.attacks) {
      const r = attackRadius(a);
      if (!a.dead && hit(a.x, a.y, r * 0.8)) { a.dead = true; struck = true; }
    }
    for (const b of this.bullets) if (!b.dead && hit(b.x, b.y, 3)) { b.dead = true; struck = true; }
    for (const c of this.crows) if (hit(c.x, c.y, C.CROW_RADIUS * 0.8)) struck = true;
    const L = this.moth;
    if (L && Math.abs(p.x - L.x) < 30 && Math.abs(p.y - L.y) < 14) struck = true;
    if (struck) {
      p.hull--;
      p.invuln = C.INVULN_TIME;
      p.charge = 0;
      p.over = 0;
      this.shake = 6;
      this.spray(p.x, p.y, 20, '#ffffff');
    }
  }

  // ---- effects ------------------------------------------------------------------------

  private spray(x: number, y: number, n: number, color: string): void {
    for (let i = 0; i < n; i++) {
      const a = this.fxRng.range(0, Math.PI * 2), s = this.fxRng.range(20, 90);
      const life = this.fxRng.range(0.3, 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size: this.fxRng.range(1, 2.5), color });
    }
  }

  private popup(x: number, y: number, text: string): void {
    this.popups.push({ x, y, text, age: 0 });
  }

  private updateFx(dt: number): void {
    for (const pt of this.particles) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.94; pt.vy = pt.vy * 0.94 - 12 * dt;
      pt.life -= dt;
    }
    for (const pu of this.popups) { pu.age += dt; pu.y -= 18 * dt; }
  }

  private cleanup(): void {
    this.shots = this.shots.filter(s => !s.dead);
    this.puffs = this.puffs.filter(j => !j.dead);
    this.attacks = this.attacks.filter(a => !a.dead);
    this.bullets = this.bullets.filter(b => !b.dead);
    this.particles = this.particles.filter(p => p.life > 0);
    this.popups = this.popups.filter(p => p.age < 1.1);
  }

  // ---- online: snapshots of this meadow for the rival's screen -----------------

  /** Everything the renderer needs to draw this meadow, as plain data. */
  snapshot(): FieldSnapshot {
    const strip = <T extends object>(o: T, ...drop: string[]) => {
      const c = { ...o } as Record<string, unknown>;
      for (const k of drop) delete c[k];
      return c;
    };
    return {
      t: this.time, ri: this.roundIndex, ns: this.nextMoonseed, cw: this.crowsWoken,
      g: this.gauge, fv: this.fever, sh: this.shake, bl: this.bloom, ba: this.bloomAt,
      bc: this.bestChain,
      p: this.player,
      s: this.shots,
      pf: this.puffs.map(j => strip(j, 'path', 'baseX')),
      bu: this.bursts.map(b => strip(b, 'hits', 'chainId')),
      at: this.attacks,
      bt: this.bullets,
      m: this.moth,
      cr: this.crows,
      pu: this.popups,
    };
  }

  /** Mirror a snapshot sent by the rival. New pollen bursts get a spray of particles. */
  applySnapshot(s: FieldSnapshot): void {
    this.time = s.t; this.roundIndex = s.ri; this.nextMoonseed = s.ns; this.crowsWoken = s.cw;
    this.gauge = s.g; this.fever = s.fv; this.shake = s.sh; this.bloom = s.bl; this.bloomAt = s.ba;
    this.bestChain = s.bc;
    this.player = s.p as Player;
    this.shots = s.s as Shot[];
    this.puffs = s.pf as unknown as Puff[];
    this.bursts = (s.bu as unknown as Burst[]).map(b => ({ ...b, chainId: 0, hits: new Set<object>() }));
    this.attacks = s.at as Attack[];
    this.bullets = s.bt as Bullet[];
    this.moth = s.m as Moth | null;
    this.crows = s.cr as Crow[];
    this.popups = s.pu as Popup[];
    // A burst that's new since the last snapshot gets the same spray it had at home.
    for (const b of this.bursts) if (b.age <= C.SNAP_EVERY * C.STEP + 1e-3) this.spray(b.x, b.y, 8, '#ffe9a8');
  }

  /** Between snapshots, keep the mirror moving so it doesn't stutter. */
  drift(dt: number): void {
    this.time += dt;
    const tempo = this.tempo, world = dt * tempo, own = dt * (1 + (tempo - 1) * 0.5);
    this.shake = Math.max(0, this.shake - dt * 30);
    for (const s of this.shots) { s.y -= C.SHOT_SPEED * (s.sp ?? (s.charged ? 0.75 : 1)) * own; s.x += s.vx * own; }
    for (const a of this.attacks) { a.x += a.vx * world; a.y += a.vy * world; }
    for (const b of this.bullets) { b.x += b.vx * world; b.y += b.vy * world; }
    for (const c of this.crows) { c.x += c.vx * world; c.y += c.vy * world; }
    for (const b of this.bursts) b.age += dt;
    this.bursts = this.bursts.filter(b => b.age < C.BURST_LIFE);
    this.updateFx(dt);
    this.particles = this.particles.filter(p => p.life > 0);
    this.popups = this.popups.filter(p => p.age < 1.1);
  }
}

export interface FieldSnapshot {
  t: number; ri: number; ns: number; cw: number;
  g: number; fv: number; sh: number; bl: number; ba: { x: number; y: number };
  bc: number;
  p: unknown; s: unknown[]; pf: unknown[]; bu: unknown[]; at: unknown[]; bt: unknown[];
  m: unknown; cr: unknown[]; pu: unknown[];
}
