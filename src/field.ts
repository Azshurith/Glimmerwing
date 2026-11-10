import * as C from './config';
import { Fairy, fairyById } from './characters';
import { rollWave } from './waves';
import {
  Attack, Bullet, Burst, Controls, CritterKind, Crow, Puff, Moth, Outgoing,
  Particle, Player, Popup, Rng, Shot,
} from './types';

interface ChainInfo { pops: number; live: number; x: number; y: number; charged: boolean }

const attackRadius = (a: Attack) =>
  a.kind === 'bramble' ? C.BRAMBLE_RADIUS : a.kind === 'comet' ? C.COMET_RADIUS : C.STAR_RADIUS;

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
  private reflections: number[] = [];
  private rallyReady = 0;
  private crowReturns: { at: number; speed: number }[] = [];
  outbox: Outgoing[] = [];
  gauge = 0;
  /** Seconds of Fever left. */
  fever = 0;
  /** Seconds until the next moonseed formation; the warning shows near the end. */
  nextMoonseed = C.MOONSEED_FIRST;
  /** Freeze time after a moonseed breaks; the Game pauses both fields while it runs. */
  hitstop = 0;
  /** Stats this round, read by the Game for unlocks. */
  bestChain = 0;
  fevers = 0;
  time = 0;
  shake = 0;

  private waveRng: Rng;
  private fxRng: Rng;
  private spawnT = 1.2;
  private chains = new Map<number, ChainInfo>();
  private nextChain = 1;

  constructor(seed: number, readonly fairy: Fairy, private roundIndex = 0) {
    // Both fields get the same wave seed, so the swarms are identical and fair.
    this.waveRng = new Rng(seed);
    this.fxRng = new Rng(seed ^ 0x9e3779b9);
    this.player = {
      x: C.FIELD_W / 2, y: C.FIELD_H - 34, hull: C.MAX_HULL,
      invuln: 0, cooldown: 0, hold: 0, charge: 0, over: 0, wasFiring: false,
    };
  }

  get alive(): boolean { return this.player.hull > 0; }

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
    if (this.alive) this.updatePlayer(own, input);
    this.spawnWaves(world);
    this.updateShots(own);
    this.updatePuffs(world);
    this.updateAttacks(world);
    this.updateMoth(world);
    this.updateBullets(world);
    this.updateCrows(world);
    this.updateBursts(dt);
    this.checkPlayerHits();
    this.updateFx(dt);
    this.cleanup();
  }

  // ---- incoming from the opponent ----------------------------------------

  receive(o: Outgoing): void {
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
    // Stars drop straight down trailing sparks; only brambles drift sideways.
    const speed = o.kind === 'bramble' ? 42 : o.kind === 'comet' ? C.COMET_SPEED : 70 + o.level * 32;
    const vx = o.kind === 'bramble' ? (this.player.x - x) * 0.2 : 0;
    this.attacks.push({
      x, y: -12,
      vx, vy: speed,
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

    // Tap to shoot; hold to charge a pulse torpedo, release to launch it.
    if (input.fire) {
      if (!p.wasFiring && p.cooldown <= 0) {
        this.shots.push({ x: p.x, y: p.y - 10, vx: 0, charged: false, dead: false });
        if (this.fever > 0) {
          const spread = this.fairy.feverSpread === 5 ? [-150, -75, 75, 150] : [-90, 90];
          for (const vx of spread) this.shots.push({ x: p.x + Math.sign(vx) * 4, y: p.y - 8, vx, charged: false, dead: false });
        }
        p.cooldown = C.FIRE_COOLDOWN * (this.fever > 0 ? 0.5 : 1);
      }
      p.hold += dt;
      if (p.hold > C.HOLD_BEFORE_CHARGE) p.charge = Math.min(1, p.charge + dt / (C.CHARGE_TIME * this.fairy.charge));
      // Keep holding past a full charge to overcharge, if you have half a gauge to spend.
      if (p.charge >= 1 && this.gauge >= C.GAUGE_MAX * C.OVERCHARGE_COST) p.over = Math.min(1, p.over + dt / C.OVERCHARGE_TIME);
    } else {
      if (p.wasFiring && p.over >= 1) {
        this.gauge -= C.GAUGE_MAX * C.OVERCHARGE_COST;
        this.sendGuardian('Overcharge');
        this.spray(p.x, p.y - 10, 24, this.fairy.guardian.color);
        this.shake = 5;
      } else if (p.wasFiring && p.charge >= 1) {
        this.shots.push({ x: p.x, y: p.y - 12, vx: 0, charged: true, dead: false });
        this.shake = 3;
      }
      p.hold = 0;
      p.charge = 0;
      p.over = 0;
    }
    p.wasFiring = input.fire;
  }

  // ---- swarms ------------------------------------------------------------------

  get moonseedWarning(): boolean {
    return this.nextMoonseed > 0 && this.nextMoonseed - this.time < C.MOONSEED_WARNING;
  }

  private spawnWaves(dt: number): void {
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    // The schedule only depends on time, so both meadows get a moonseed in the same formation.
    const withMoonseed = this.time >= this.nextMoonseed;
    if (withMoonseed) this.nextMoonseed += C.MOONSEED_EVERY;
    const r = this.waveRng;
    const pressure = Math.min(1, this.time / 90);
    this.spawnT = r.range(2.4, 3.4) - pressure * 1.1;
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
      this.puffs.push({ kind: w.kind, x, y, baseX: x, vx, vy, phase, dead: false, hp, maxHp: hp, shell, path, size });
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
      s.y -= C.SHOT_SPEED * (s.charged ? 0.75 : 1) * dt;
      s.x += s.vx * dt;
      if (s.y < -10 || s.x < -10 || s.x > C.FIELD_W + 10) { s.dead = true; continue; }
      const hitR = s.charged ? 10 : 3;

      for (const j of this.puffs) {
        if (!j.dead && dist2(s.x, s.y, j.x, j.y) < (C.PUFF_RADIUS * j.size + hitR) ** 2) {
          s.dead = true;
          if (j.moonseed) { this.spray(s.x, s.y, 3, '#cfe9ff'); break; }
          if (j.shell > 0) { j.shell -= s.charged ? 2 : 1; this.spray(s.x, s.y, 4, '#d9f1ff'); break; }
          if (!s.charged && j.hp > 1) { j.hp--; this.spray(s.x, s.y, 3, '#fff6d8'); break; }
          this.popPuff(j, this.newChain(j.x, j.y, s.charged), s.charged);
          break;
        }
      }
      if (s.dead) continue;

      for (const a of this.attacks) {
        const r = attackRadius(a);
        if (!a.dead && dist2(s.x, s.y, a.x, a.y) < (r + hitR) ** 2) {
          s.dead = true;
          if (a.kind === 'comet') { this.spray(s.x, s.y, 2, '#ffb3c8'); break; }
          this.hitAttack(a, s.charged ? 3 : 1, null);
          break;
        }
      }
      if (s.dead) continue;

      for (const c of this.crows) {
        if (c.hp > 0 && dist2(s.x, s.y, c.x, c.y) < (C.CROW_RADIUS + hitR + 2) ** 2) {
          s.dead = true;
          c.hp -= s.charged ? 4 : 1;
          this.spray(s.x, s.y, 2, '#ff9fb8');
          if (c.hp <= 0) {
            this.spray(c.x, c.y, 20, '#ff9fb8');
            this.popup(c.x, c.y, 'Crow driven off');
            this.crowReturns.push({ at: this.time + C.CROW_RETURN, speed: c.speed * 1.25 });
          }
          break;
        }
      }
      if (s.dead) continue;

      const L = this.moth;
      if (L && !L.dead && Math.abs(s.x - L.x) < 34 && Math.abs(s.y - L.y) < 16) {
        s.dead = true;
        this.damageMoth(s.charged ? 6 : 1, s.x, s.y);
      }
    }
  }

  private newChain(x: number, y: number, charged: boolean): number {
    const id = this.nextChain++;
    this.chains.set(id, { pops: 0, live: 0, x, y, charged });
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
    if (a.hp > 0) { this.spray(a.x, a.y, 3, a.kind === 'star' ? '#ffe27a' : '#b98ae0'); return; }
    a.dead = true;
    // Countering doesn't add to the chain count; the counter itself is the reward.
    const id = chainId ?? this.newChain(a.x, a.y, false);
    if (a.kind === 'bramble') {
      this.addBurst(a.x, a.y, id, C.CHARGED_BURST_RADIUS);
      this.spray(a.x, a.y, 16, '#b98ae0');
      this.gauge = Math.min(C.GAUGE_MAX, this.gauge + 4);
    } else {
      this.addBurst(a.x, a.y, id, C.BURST_RADIUS);
      this.spray(a.x, a.y, 6, '#ffe27a');
      if (a.level < C.MAX_STAR_LEVEL) {
        const lvl = Math.min(C.MAX_STAR_LEVEL, a.level + 1 + this.fairy.counterBoost);
        this.outbox.push({ kind: 'star', level: lvl, fromX: a.x, fromY: a.y });
        this.popup(a.x, a.y - 10, 'Counter');
        this.noteReflection();
      } else {
        // Breaking a fully-powered star hurls an unbreakable comet back.
        this.outbox.push({ kind: 'comet', level: a.level, fromX: a.x, fromY: a.y });
        this.popup(a.x, a.y - 10, 'Comet');
        this.noteReflection();
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
        if (!a.dead && a.kind === 'star' && !b.hits.has(a) && dist2(b.x, b.y, a.x, a.y) < r * r) {
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
    if (this.gauge >= C.GAUGE_MAX) {
      this.gauge = 0;
      this.sendGuardian('');
    }
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


  /** Breaking several incoming stars in quick succession rallies your guardian. */
  private noteReflection(): void {
    this.reflections.push(this.time);
    this.reflections = this.reflections.filter(t => this.time - t <= C.RALLY_WINDOW);
    if (this.reflections.length >= C.RALLY_COUNT && this.time >= this.rallyReady) {
      this.reflections = [];
      this.rallyReady = this.time + C.RALLY_COOLDOWN;
      this.sendGuardian('Rally');
    }
  }

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

  get crowWarning(): boolean {
    const next = C.CROW_TIMES[this.crowsWoken];
    return next !== undefined && next - this.time < C.CROW_WARNING;
  }

  /**
   * Sudden death. Crows wake on a fixed clock in both meadows, can't be hurt,
   * circle overhead and dive at the fairy every few seconds.
   */
  private updateCrows(dt: number): void {
    const next = C.CROW_TIMES[this.crowsWoken];
    if (next !== undefined && this.time >= next) {
      this.crowsWoken++;
      this.crows.push({ x: this.crowsWoken % 2 ? -12 : C.FIELD_W + 12, y: 40, vx: 0, vy: 0, state: 'circle', t: 0, seed: this.crowsWoken * 1.7, hp: C.CROW_HP, speed: 170 + this.crowsWoken * 20 });
      this.popup(C.FIELD_W / 2, 80, 'A hollow crow wakes');
    }
    // Driven-off crows come back after a while, a little faster each time.
    for (const ret of this.crowReturns) {
      if (this.time >= ret.at) {
        this.crows.push({ x: C.FIELD_W / 2, y: -20, vx: 0, vy: 0, state: 'climb', t: 0, seed: ret.at, hp: C.CROW_HP, speed: ret.speed });
        this.popup(C.FIELD_W / 2, 80, 'The crow returns');
      }
    }
    this.crowReturns = this.crowReturns.filter(r => this.time < r.at);
    const p = this.player;
    for (const c of this.crows) {
      c.t += dt;
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
}
