import * as C from '@/core/config';
import { Rng } from '@/core/rng';
import { fairyById } from '@/data/characters';
import type {
    Attack,
    Bullet,
    Burst,
    Controls,
    Crow,
    Fairy,
    FieldSnapshot,
    Moth,
    Outgoing,
    Particle,
    Player,
    Popup,
    Puff,
    Sfx,
    Shot,
    StarFlight,
} from '@/types';
import { rollWave } from './waves';

/** How fast a slide row crosses the meadow, in units a second. */
const SLIDE_SPEED = 46;
/** How fast a file drops: brisk, as in TSS, where the column reaches the fairy in under two seconds. */
const fileSpeed = (speed: number) => 70 + (speed - 26) * 2.5;

/** Which bomb sound each bomb style plays (see Sound.play 'bomb'). */
const BOMB_SOUND: Record<string, number> = { dash: 0, blast: 1, vortex: 2, fan: 3, beam: 4, hole: 5 };

/**
 * Running tally for one chain of bursts: how many it popped, how many bursts are still live, and where it last popped.
 */
interface ChainInfo {
    pops: number;
    live: number;
    x: number;
    y: number;
    charged: boolean;
    reverses: number;
    bossSent: boolean;
}

/** Collision radius of an attack sent from the rival, by kind. */
const attackRadius = (a: Attack) =>
    a.kind === 'bramble'
        ? C.BRAMBLE_RADIUS
        : a.kind === 'comet'
          ? C.COMET_RADIUS
          : a.kind === 'imp'
            ? C.IMP_RADIUS
            : C.STAR_RADIUS;

/** Squared distance between two points (avoids a square root in hit tests). */
const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

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
    /** Sound events this step, drained and played by the Game. */
    sfx: { k: Sfx; p: number }[] = [];
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
    /** Set once the round is decided: the meadow keeps animating, but nothing can hurt the fairy. */
    settled = false;
    /** Seconds of Thornquake slowdown left. */
    slow = 0;
    private bombStungMoth = false;
    /** For boss clashes: when I last sent a guardian, and when the rival's arrived. */
    private bossSentAt = -99;
    private bossArrivedAt = -99;
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
    /** Whether the current wave lets the next one in before it's cleared (see WAVE_OVERLAP_AFTER). */
    private waveOverlap = false;
    private surged = false;
    private chains = new Map<number, ChainInfo>();
    private nextChain = 1;

    /** `crowFirst`: the Hollow Crow wakes in this meadow (exactly one of the two). */
    constructor(
        seed: number,
        readonly fairy: Fairy,
        private roundIndex = 0,
        private crowFirst = false,
    ) {
        // Both fields get the same wave seed, so the swarms are identical and fair.
        this.waveRng = new Rng(seed);
        this.fxRng = new Rng(seed ^ 0x9e3779b9);
        this.player = {
            x: C.FIELD_W / 2,
            y: C.FIELD_H - 34,
            hull: C.MAX_HULL,
            invuln: 0,
            stun: 0,
            impair: 0,
            zakoGrace: 0,
            mash: 0,
            stunAge: 0,
            cooldown: 0,
            hold: 0,
            charge: 0,
            over: 0,
            wasFiring: false,
            wasBlooming: false,
            blooms: C.BLOOMS_PER_ROUND,
        };
    }

    /** True while the fairy has hearts left. */
    get alive(): boolean {
        return this.player.hull > 0;
    }

    /** Queue a sound for `Game` to play; `p` picks a variant or pitch. */
    private snd(k: Sfx, p = 0): void {
        this.sfx.push({ k, p });
    }

    /** 0 to 3: how far a charge can go right now. */
    get gaugeLevel(): number {
        return Math.min(3, Math.floor(this.gauge / C.GAUGE_LEVEL + 1e-6));
    }

    /**
     * How fast the meadow runs right now. It climbs through each round and
     * starts higher in each later round of a match. Both meadows share it.
     */
    get tempo(): number {
        const ramp = 1 + C.TEMPO_RAMP * Math.min(1, this.time / C.TEMPO_RAMP_TIME);
        return Math.min(C.TEMPO_MAX, ramp * (1 + C.TEMPO_PER_ROUND * this.roundIndex));
    }

    /** Advance this meadow by one fixed step: the fairy, swarms, shots, chains, attacks, bosses and effects. */
    update(dt: number, input: Controls): void {
        this.time += dt;
        this.shake = Math.max(0, this.shake - dt * 30);
        this.fever = Math.max(0, this.fever - dt);
        // Everything that comes at you runs on the tempo; your fairy and shots
        // get half the boost so you can keep up without it feeling floaty.
        const tempo = this.tempo;
        // Thornquake slows everything coming at you (not your fairy or shots).
        this.slow = Math.max(0, this.slow - dt);
        const world = dt * tempo * (this.slow > 0 ? C.BOMB_SLOW : 1);
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

    /** Take something the rival sent (an attack, a boss, a heal) and bring it into this meadow. */
    receive(o: Outgoing): void {
        if (o.kind === 'heal') {
            // My rival got hit: I recover a little.
            if (this.alive && !this.settled && this.player.hull < C.MAX_HULL) {
                this.player.hull = Math.min(C.MAX_HULL, this.player.hull + o.level);
                this.popup(this.player.x, this.player.y - 22, o.level >= 2 ? '+1 heart' : '+½ heart');
                this.snd('heal');
                this.spray(this.player.x, this.player.y, 8, '#ff9db8');
            }
            return;
        }
        if (o.kind === 'imp') {
            // The rival's Extra Attack: small critters that fly the sender's pattern.
            const sender = fairyById(o.fairy ?? 'pip');
            const flight = sender.extra.flight,
                sp = C.IMP_SPEED;
            const x = Math.min(C.FIELD_W - 12, Math.max(12, o.fromX));
            let vx = 0,
                vy = sp,
                seekT = 0,
                y = -12,
                sx = x;
            if (flight === 'seeker') {
                vy = 0;
                seekT = C.SEEK_TIME + this.fxRng.range(0, 0.4);
            }
            if (flight === 'lateral') {
                // Comes in from a side wall near the fairy's height and bursts partway across.
                const fromLeft = this.fxRng.next() < 0.5;
                sx = fromLeft ? -12 : C.FIELD_W + 12;
                y = Math.min(C.FIELD_H - 30, Math.max(30, this.player.y + this.fxRng.range(-60, 10)));
                vx = (fromLeft ? 1 : -1) * C.LATERAL_SPEED;
                vy = 0;
                seekT = this.fxRng.range(1.0, 1.6); // fuse
            }
            if (flight === 'bounce') {
                vx = (this.fxRng.next() < 0.5 ? -1 : 1) * 50;
                vy = 20;
                seekT = C.BURR_HOP_EVERY;
            }
            if (flight === 'bat') {
                vy = sp * 0.7;
                seekT = C.BAT_WEAVE + this.fxRng.range(0, 0.4);
            }
            if (flight === 'slant') {
                const d = x < C.FIELD_W / 2 ? 1 : -1;
                vx = d * sp * 0.8;
                vy = sp * 0.8;
            }
            if (flight === 'zig') seekT = this.fxRng.range(0.3, 0.7); // time to the first turn
            if (flight === 'homing') {
                seekT = C.HOMING_TIME;
                vy = sp * 0.85;
            }
            this.attacks.push({
                x: sx,
                y,
                vx,
                vy,
                flight,
                seekT,
                plunge: sp * 1.8,
                kind: 'imp',
                level: 1,
                hp: 1,
                spin: this.fxRng.range(0, Math.PI * 2),
                dead: false,
                color: sender.color,
                look: sender.extra.look,
                t: 0,
            });
            return;
        }
        if (o.kind === 'crow') {
            this.crowsWoken = 1;
            this.crowReturns.push({ at: this.time + (o.delay ?? 0), level: o.level });
            return;
        }
        if (o.kind === 'clash') {
            // The rival's guardian clashed with mine: the one I sent them is gone too.
            if (this.moth) {
                this.clashFx();
                this.moth = null;
            }
            return;
        }
        if (o.kind === 'moth') {
            // Both players sent a boss at about the same time: they clash and cancel out.
            if (this.time - this.bossSentAt < C.BOSS_CLASH_WINDOW) {
                this.clashFx();
                this.outbox.push({ kind: 'clash', level: 1, fromX: C.FIELD_W / 2, fromY: 0 });
                return;
            }
            if (!this.moth) {
                this.bossArrivedAt = this.time;
                const sender = fairyById(o.fairy ?? 'pip');
                this.moth = {
                    x: C.FIELD_W / 2,
                    y: -40,
                    hp: C.MOTH_HP,
                    t: 0,
                    fireT: 0,
                    dead: false,
                    guardian: sender.guardian,
                    wing: sender.wing,
                    angle: this.fxRng.range(0, Math.PI * 2),
                    stage: 'enter',
                    stageT: 0,
                    dir: this.fxRng.next() < 0.5 ? 1 : -1,
                    hurt: 0,
                    stun: 0,
                    vx: 0,
                    rush: !!o.rush,
                    swoop: -1,
                    swoopIn: 1.8,
                    postX: 0,
                    postY: 0,
                    toX: 0,
                    toY: 0,
                    pattern: sender.guardian.pattern,
                    cycleT: 0,
                    cyclesLeft: 0,
                };
                this.popup(C.FIELD_W / 2, 90, `${sender.guardian.name} incoming`);
                this.snd('bossIn');
            }
            return;
        }
        // Attacks drop in at the same spot they were sent from, mirrored into this meadow.
        const x = Math.min(C.FIELD_W - 12, Math.max(12, o.fromX));
        const speed = o.kind === 'bramble' ? 42 : o.kind === 'comet' ? C.COMET_SPEED : 70 + o.level * 32;
        let vx = o.kind === 'bramble' ? (this.player.x - x) * 0.2 : 0,
            vy = speed;
        // Stars come in three flights; tougher (batted-back) stars lean toward the trickier ones.
        let flight: StarFlight = 'drop';
        if (o.kind === 'star') {
            const roll = this.fxRng.next(),
                bias = (o.level - 1) * 0.1;
            if (roll < C.SEEKER_CHANCE + bias) flight = 'seeker';
            else if (roll < C.SEEKER_CHANCE + C.SLANT_CHANCE + bias * 2) flight = 'slant';
        }
        if (flight === 'slant') {
            // Angle across the meadow, toward the far side from where it enters.
            const dir = x < C.FIELD_W / 2 ? 1 : -1;
            const ang = this.fxRng.range(0.35, 0.6);
            vx = dir * Math.sin(ang) * speed * 1.1;
            vy = Math.cos(ang) * speed;
        }
        if (flight === 'seeker') {
            vx = 0;
            vy = 0;
        }
        this.attacks.push({
            x,
            y: -12,
            vx,
            vy,
            flight,
            seekT: flight === 'seeker' ? C.SEEK_TIME : 0,
            plunge: speed * 1.2,
            kind: o.kind,
            level: o.level,
            hp: o.kind === 'bramble' ? C.BRAMBLE_HP : o.kind === 'comet' ? Infinity : C.starHp(o.level),
            spin: this.fxRng.range(0, Math.PI * 2),
            dead: false,
        });
    }

    // ---- player ----------------------------------------------------------------

    /** Move the fairy, count down her timers, and handle charging, firing, bombs and stuns. */
    private updatePlayer(dt: number, input: Controls): void {
        const p = this.player;
        p.invuln = Math.max(0, p.invuln - dt);
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.zakoGrace = Math.max(0, p.zakoGrace - dt);
        // Stunned after running into a critter: frozen, but mashing shakes it off sooner.
        if (p.stun > 0) {
            const mash =
                (input.left ? 1 : 0) |
                (input.right ? 2 : 0) |
                (input.up ? 4 : 0) |
                (input.down ? 8 : 0) |
                (input.fire ? 16 : 0) |
                (input.auto ? 32 : 0) |
                (input.bloom ? 64 : 0);
            p.stunAge += dt;
            // Mashing helps, but only down to the minimum.
            if (mash !== p.mash && mash !== 0) p.stun = Math.max(p.stun - C.MASH_STEP, C.STUN_MIN - p.stunAge);
            p.mash = mash;
            p.stun -= dt;
            if (p.stun <= 0) {
                p.stun = 0;
                p.impair = C.IMPAIR_TIME;
            }
            p.hold = 0;
            p.charge = 0;
            p.over = 0;
            p.wasFiring = input.fire;
            p.wasBlooming = !!input.bloom;
            return;
        }
        p.impair = Math.max(0, p.impair - dt);
        let dx = 0,
            dy = 0;
        if (input.target) {
            const tx = input.target.x - p.x,
                ty = input.target.y - p.y;
            const d = Math.hypot(tx, ty);
            if (d > 2) {
                dx = tx / d;
                dy = ty / d;
            }
        } else {
            dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
            dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
            if (dx && dy) {
                dx *= Math.SQRT1_2;
                dy *= Math.SQRT1_2;
            }
        }
        const slow = (p.charge > 0 ? 0.75 : 1) * (p.impair > 0 ? C.IMPAIR_SPEED : 1);
        p.x = Math.min(C.FIELD_W - 10, Math.max(10, p.x + dx * C.PLAYER_SPEED * this.fairy.speed * slow * dt));
        p.y = Math.min(
            C.FIELD_H - 14,
            Math.max(C.PLAYER_MIN_Y, p.y + dy * C.PLAYER_SPEED * this.fairy.speed * slow * dt),
        );

        // Petal bloom: once per press, if you have one left.
        if (input.bloom && !p.wasBlooming && p.blooms > 0 && this.bloom <= 0) {
            p.blooms--;
            const bomb = this.fairy.bomb;
            this.bloom = bomb.time;
            this.bloomAt = { x: p.x, y: p.y };
            this.bombStungMoth = false;
            p.invuln = Math.max(p.invuln, bomb.invuln);
            if (bomb.style === 'blast') this.slow = C.BOMB_SLOW_TIME;
            p.charge = 0;
            p.over = 0;
            p.hold = 0;
            this.shake = 4;
            this.popup(p.x, p.y - 24, this.fairy.bomb.name);
            this.snd('bomb', BOMB_SOUND[bomb.style]);
        }
        p.wasBlooming = !!input.bloom;

        // Tap to shoot; hold to charge a pulse torpedo, release to launch it.
        if (input.fire) {
            if (!p.wasFiring && p.cooldown <= 0) this.volley(C.FIRE_COOLDOWN);
            p.hold += dt;
            // Charge climbs a level per CHARGE_TIME, but only as high as the power gauge allows.
            const cap = this.gaugeLevel;
            const lvlBefore = Math.floor(p.charge + 1e-6);
            if (p.hold > C.HOLD_BEFORE_CHARGE && cap >= 1)
                p.charge = Math.min(
                    cap,
                    p.charge + (dt * (p.impair > 0 ? C.IMPAIR_CHARGE : 1)) / (C.CHARGE_TIME * this.fairy.charge),
                );
            p.over = p.charge > 1 ? (p.charge - 1) / 2 : 0;
            const lvlNow = Math.floor(p.charge + 1e-6);
            if (lvlNow > lvlBefore) this.snd('charge', lvlNow);
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
        this.snd('shot');
        p.cooldown = (cooldown / (this.fever > 0 ? C.FEVER_FIRE_RATE : 1)) * (p.impair > 0 ? C.IMPAIR_FIRE : 1);
    }

    /**
     * Every fairy's charge shot is her own (Twinkle Star Sprites style). All of
     * them pierce: the first critter each one hits starts a chain, the rest are
     * cleared without one.
     */
    private fireChargeShot(): void {
        const p = this.player,
            style = this.fairy.chargeStyle;
        const shot = (dx: number, vx: number, r: number, sp: number, dmg: number, life?: number) =>
            this.shots.push({ x: p.x + dx, y: p.y - 12, vx, charged: true, dead: false, r, sp, dmg, life, style });
        switch (style) {
            case 'orb':
                shot(0, 0, 10, 0.75, 6);
                break; // a steady ball of light
            case 'thorn':
                shot(0, 0, 14, 0.55, 8);
                break; // slow, fat and heavy
            case 'needles':
                for (const vx of [-70, 0, 70]) shot(0, vx, 5, 1.15, 3);
                break; // a fast fan of three
            case 'twin':
                shot(-9, 0, 7, 0.9, 4);
                shot(9, 0, 7, 0.9, 4);
                break; // two side by side
            case 'flare':
                for (const vx of [-180, -90, 0, 90, 180]) shot(0, vx, 9, 0.8, 3, 0.32);
                break; // short-range cone
            case 'crescent':
                shot(0, 0, 24, 0.6, 6);
                break; // a wide sweeping arc
        }
    }

    /** Let go of a charge: the torpedo always, plus an Extra Attack at level 2 or the guardian at level 3. */
    private releaseCharge(level: number): void {
        const p = this.player;
        this.fireChargeShot();
        this.popup(p.x, p.y - 14, this.fairy.chargeName);
        this.snd('release', level);
        if (level === 2) this.snd('extra');
        if (level >= 3) this.snd('boss');
        this.shake = 3;
        if (level === 2) {
            this.gauge -= C.EXTRA_COST * C.GAUGE_LEVEL;
            const ex = this.fairy.extra;
            for (let i = 0; i < ex.count; i++) {
                const fromX = (C.FIELD_W * (i + 1)) / (ex.count + 1);
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

    /** True just before a moonseed arrives, so the HUD can warn of it. */
    get moonseedWarning(): boolean {
        return this.nextMoonseed > 0 && this.nextMoonseed - this.time < C.MOONSEED_WARNING;
    }

    /** Spawn the next wave of critters once the current one is cleared or has waited long enough. */
    private spawnWaves(dt: number): void {
        // Formation flow: the next wave waits until every member of the current one
        // has been popped or has left the meadow, then follows after a short beat.
        this.waveT += dt;
        const wait = this.waveOverlap ? C.WAVE_OVERLAP_AFTER : C.WAVE_MAX_WAIT;
        const holding = this.waveId > 0 && this.waveT < wait && this.puffs.some(j => j.wave === this.waveId && !j.dead);
        if (holding) {
            this.spawnT = C.WAVE_GAP;
            return;
        }
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
        this.waveOverlap = w.overlap;
        const firstNew = this.puffs.length;
        const n = w.count;
        const size = w.big ? 1.5 : 1;
        if (w.path === 'rise') this.popup(w.side < 0 ? 50 : C.FIELD_W - 50, C.FIELD_H - 70, 'From below');

        for (let i = 0; i < n; i++) {
            let x = w.cx,
                y = -14;
            const spread = size;
            switch (w.path) {
                case 'arc': {
                    const a = Math.PI * (i / Math.max(1, n - 1));
                    x = w.cx + Math.cos(a) * 40 * spread;
                    y = -14 - Math.sin(a) * 26 * spread;
                    break;
                }
                case 'string':
                    x = w.cx - 50 + i * (100 / n);
                    y = -14 - i * 12 * spread;
                    break;
                case 'ring': {
                    const a = (Math.PI * 2 * i) / n;
                    x = w.cx + Math.cos(a) * 26 * spread;
                    y = -40 + Math.sin(a) * 22 * spread;
                    break;
                }
                case 'leader':
                    if (i > 0) {
                        const a = (Math.PI * 2 * (i - 1)) / (n - 1);
                        x = w.cx + Math.cos(a) * 17;
                        y = -40 + Math.sin(a) * 17;
                    } else y = -40;
                    break;
            }
            // A formation moves in lockstep (TSS): every member shares the wobble and the drift,
            // so the group keeps its even spacing and one burst can carry through it.
            const phase = w.cx % 6.28;
            let vx = ((w.cx * 37) % 16) - 8,
                vy = w.speed,
                shell = w.bubble ? 1 : 0;
            if (w.kind === 'beetle') {
                vx = w.side * 34;
                vy = w.speed * 1.35;
                shell = 2;
            }
            if (w.kind === 'spinner') {
                vx = 0;
                vy = w.speed * 0.9;
            }
            let path: Puff['path'];
            switch (w.path) {
                case 'swoop':
                    path = { type: 'swoop', t: 0, delay: i * 0.32 * size, dir: w.side, ox: 0, oy: 0 };
                    break;
                case 'sweep':
                    path = { type: 'sweep', t: 0, delay: i * 0.42 * size, dir: w.side, ox: 0, oy: w.lane };
                    break;
                case 'column':
                    path = {
                        type: 'column',
                        t: 0,
                        delay: Math.floor(i / 2) * 0.55,
                        dir: i % 2 ? 1 : -1,
                        ox: w.cx,
                        oy: 0,
                    };
                    break;
                case 'rise':
                    path = { type: 'rise', t: 0, delay: 0.9 + i * 0.4, dir: w.side, ox: 0, oy: 0 };
                    break;
                case 'file': {
                    // Single file down one lane, evenly spaced: each member a fixed beat behind the last.
                    const lane = Math.min(C.FIELD_W - 30, Math.max(30, w.cx));
                    const v = fileSpeed(w.speed);
                    path = { type: 'file', t: 0, delay: (i * C.FILE_SPACING * size) / v, dir: v, ox: lane, oy: 0 };
                    break;
                }
                case 'slide': {
                    // A row centred away from the side it slides toward, so it crosses the meadow.
                    const half = ((n - 1) * C.SLIDE_SPACING * size) / 2;
                    const lo = half + 16,
                        hi = C.FIELD_W - half - 16;
                    const centre = Math.min(
                        hi,
                        Math.max(lo, w.side > 0 ? lo + (w.cx - 50) * 0.3 : hi - (w.cx - 50) * 0.3),
                    );
                    const ox = centre - half + i * C.SLIDE_SPACING * size;
                    path = { type: 'slide', t: 0, delay: 0, dir: w.side, ox, oy: 50 + (w.lane - 36) * 0.6 };
                    break;
                }
            }
            if (path) {
                x = -100;
                y = -100;
                vx = 0;
            }
            const hp = w.hp[i];
            this.puffs.push({
                kind: w.kind,
                x,
                y,
                baseX: x,
                vx,
                vy,
                phase,
                dead: false,
                hp,
                maxHp: hp,
                shell,
                path,
                size,
                wave: this.waveId,
            });
        }
        if (withMoonseed) {
            const m = this.puffs[firstNew + Math.floor((this.puffs.length - firstNew) / 2)];
            if (m) {
                m.moonseed = true;
                m.shell = 0;
            }
        }
    }

    /** Formation paths: each member follows the same route, a beat behind the one ahead. */
    private followPath(j: Puff, dt: number): void {
        const P = j.path!;
        P.t += dt;
        const tt = P.t - P.delay;
        if (tt < 0) {
            j.x = -100;
            j.y = -100;
            return;
        } // still waiting off-screen
        const W = C.FIELD_W;
        if (P.type === 'swoop') {
            // Enter from a top corner, dive to mid-meadow and curl back up and out.
            const T = 7,
                k = tt / T;
            j.x = (P.dir > 0 ? -10 : W + 10) + P.dir * (W + 20) * k;
            j.y = -14 + 4 * 175 * k * (1 - k);
            if (k > 1) j.dead = true;
        } else if (P.type === 'sweep') {
            // A line crossing the meadow, sinking slowly.
            j.x = (P.dir > 0 ? -12 : W + 12) + P.dir * 48 * tt;
            j.y = P.oy + 6 * tt;
            if (j.x < -20 || j.x > W + 20) j.dead = true;
        } else if (P.type === 'file') {
            // Straight down at an even speed (P.dir holds the speed), out the bottom.
            j.x = P.ox;
            j.y = -14 + P.dir * tt;
            if (j.y > C.FIELD_H + 20) j.dead = true;
        } else if (P.type === 'slide') {
            // The row drops in together to its lane, then slides across in lockstep, sinking a little.
            const IN = 0.8;
            if (tt < IN) {
                const k = tt / IN;
                j.x = P.ox;
                j.y = -14 + (P.oy + 14) * (1 - (1 - k) * (1 - k));
            } else {
                const s = tt - IN;
                j.x = P.ox + P.dir * SLIDE_SPEED * s;
                j.y = P.oy + 5 * s;
                if (j.x < -20 || j.x > C.FIELD_W + 20) j.dead = true;
            }
        } else if (P.type === 'rise') {
            // The sneaky one: climbs up from a bottom corner, across the fairy's level, and out the top.
            const T = 6,
                k = tt / T;
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

    /** Move every critter along its formation path or drift. */
    private updatePuffs(dt: number): void {
        for (const j of this.puffs) {
            j.phase += dt * 3;
            if (j.path) {
                this.followPath(j, dt);
                continue;
            }
            if (j.kind === 'beetle') {
                // Beetles cut straight diagonals and ricochet off the meadow walls.
                j.x += j.vx * dt;
                j.y += j.vy * dt;
            } else if (j.kind === 'spinner') {
                // Maple-seed spinners corkscrew down around their starting line.
                j.y += j.vy * dt;
                j.x = j.baseX + Math.sin(j.phase * 0.9) * 34;
            } else {
                j.x += (j.vx + Math.sin(j.phase) * 14) * dt;
                j.y += j.vy * (0.75 + 0.25 * Math.sin(j.phase * 0.5)) * dt;
            }
            if (j.kind !== 'spinner' && (j.x < 10 || j.x > C.FIELD_W - 10)) {
                // Beetles ricochet alone; a drifting formation turns as one, so it keeps its spacing.
                const dir = j.x < 10 ? 1 : -1;
                if (j.kind === 'puff' && j.wave)
                    for (const o of this.puffs) {
                        if (o.wave === j.wave && !o.path && o.kind === 'puff') o.vx = dir * Math.abs(o.vx);
                    }
                else j.vx *= -1;
                j.x = Math.min(C.FIELD_W - 10, Math.max(10, j.x));
            }
            if (j.y > C.FIELD_H + 20) j.dead = true;
        }
    }

    // ---- shots & chains -------------------------------------------------------------

    /** Move the fairy's shots and start a chain where a shot hits a critter. */
    private updateShots(dt: number): void {
        for (const s of this.shots) {
            s.y -= C.SHOT_SPEED * (s.sp ?? (s.charged ? 0.75 : 1)) * dt;
            s.x += s.vx * dt;
            if (s.life !== undefined) {
                s.life -= dt;
                if (s.life <= 0) {
                    s.dead = true;
                    continue;
                }
            }
            if (s.y < -10 || s.x < -10 || s.x > C.FIELD_W + 10) {
                s.dead = true;
                continue;
            }
            const hitR = s.r ?? (s.charged ? 10 : 3);
            const power = s.dmg ?? (s.charged ? 6 : 1);

            for (const j of this.puffs) {
                if (j.dead || dist2(s.x, s.y, j.x, j.y) >= (C.PUFF_RADIUS * j.size + hitR) ** 2) continue;
                if (j.moonseed) {
                    s.dead = true;
                    this.spray(s.x, s.y, 3, '#cfe9ff');
                    break;
                }
                if (s.charged && s.popped) {
                    // Past its first hit, a torpedo ploughs on and clears what it touches,
                    // but those pops don't burst or count toward a chain.
                    j.dead = true;
                    this.spray(j.x, j.y, 6, '#fff6d8');
                    continue;
                }
                // Plain shots stop at the first critter; a torpedo carries on.
                if (s.charged) s.popped = true;
                else s.dead = true;
                if (j.shell > 0) {
                    j.shell -= s.charged ? 2 : 1;
                    this.spray(s.x, s.y, 4, '#d9f1ff');
                    break;
                }
                if (!s.charged && j.hp > 1) {
                    j.hp--;
                    this.spray(s.x, s.y, 3, '#fff6d8');
                    break;
                }
                this.popPuff(j, this.newChain(j.x, j.y, s.charged), s.charged);
                break;
            }
            if (s.dead) continue;

            for (const a of this.attacks) {
                const r = attackRadius(a);
                if (!a.dead && dist2(s.x, s.y, a.x, a.y) < (r + hitR) ** 2) {
                    s.dead = true;
                    // Extra Attack critters can't be shot down: shots fly straight through them.
                    if (a.kind === 'imp') continue;
                    if (a.kind === 'comet') {
                        this.spray(s.x, s.y, 2, '#ffb3c8');
                        break;
                    }
                    this.hitAttack(a, s.charged ? Math.max(1, Math.round(power / 2)) : 1, null);
                    break;
                }
            }
            if (s.dead) continue;

            for (const c of this.crows) {
                if (c.hp > 0 && dist2(s.x, s.y, c.x, c.y) < (C.CROW_RADIUS + hitR + 2) ** 2) {
                    s.dead = true;
                    c.hp -= s.charged ? Math.max(1, Math.round((power * 2) / 3)) : 1;
                    this.spray(s.x, s.y, 2, '#ff9fb8');
                    if (c.hp <= 0) {
                        this.spray(c.x, c.y, 20, '#ff9fb8');
                        this.popup(c.x, c.y, 'Crow driven off');
                        // It comes back sooner and faster, in the rival's meadow.
                        this.outbox.push({
                            kind: 'crow',
                            level: c.level + 1,
                            fromX: c.x,
                            fromY: c.y,
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

    /** Start a new chain at (x, y) and return its id. */
    private newChain(x: number, y: number, charged: boolean): number {
        const id = this.nextChain++;
        this.chains.set(id, { pops: 0, live: 0, x, y, charged, reverses: 0, bossSent: false });
        return id;
    }

    /** Add a burst that grows to `maxR` and belongs to the given chain. */
    private addBurst(x: number, y: number, chainId: number, maxR: number): void {
        this.bursts.push({ x, y, maxR, age: 0, chainId, hits: new Set() });
        const c = this.chains.get(chainId);
        if (c) c.live++;
    }

    /** Pop a critter as part of a chain, setting off a burst of its own. */
    private popPuff(j: Puff, chainId: number, big: boolean): void {
        j.dead = true;
        const c = this.chains.get(chainId);
        if (c) {
            c.pops++;
            c.x = j.x;
            c.y = j.y;
        }
        this.snd('pop', c ? c.pops : 1);
        const sizeK = 1 + (j.maxHp - 1) * 0.12 + (j.kind === 'beetle' ? 0.25 : 0) + (j.size - 1) * 0.8;
        this.addBurst(j.x, j.y, chainId, (big ? C.CHARGED_BURST_RADIUS : C.BURST_RADIUS) * this.fairy.burst * sizeK);
        this.spray(j.x, j.y, 8, '#fff6d8');
    }

    /** Hitting an incoming attack. Spores bounce back at a higher level. */
    private hitAttack(a: Attack, dmg: number, chainId: number | null): void {
        a.hp -= dmg;
        if (a.hp > 0) {
            this.spray(a.x, a.y, 3, a.kind === 'star' ? '#ffe27a' : '#b98ae0');
            return;
        }
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
            if (a.level < 2) {
                // A plain star goes back as a flashing reverse star, tougher.
                const lvl = Math.min(C.MAX_STAR_LEVEL, 2 + this.fairy.counterBoost);
                this.outbox.push({ kind: 'star', level: lvl, fromX: a.x, fromY: a.y });
                this.popup(a.x, a.y - 10, 'Reverse');
                this.snd('reverse');
            } else {
                // Breaking a reverse star turns it into one of your Extra Attack critters.
                this.outbox.push({ kind: 'imp', level: 1, fromX: a.x, fromY: a.y, fairy: this.fairy.id });
                this.popup(a.x, a.y - 10, this.fairy.extra.name);
                this.snd('extra');
                // Three or more reverse stars broken in one chain summon your guardian.
                const c = this.chains.get(id);
                if (c && ++c.reverses >= C.BOSS_CHAIN_REVERSES && !c.bossSent) {
                    c.bossSent = true;
                    this.sendGuardian('Reverse chain', true);
                }
            }
        }
    }

    /** Grow the bursts, pop whatever they touch, and settle each chain once its last burst fades. */
    private updateBursts(dt: number): void {
        for (const b of this.bursts) {
            b.age += dt;
            const r = b.maxR * Math.min(1, b.age / (C.BURST_LIFE * 0.6));
            for (const j of this.puffs) {
                if (!j.dead && dist2(b.x, b.y, j.x, j.y) < (r + C.PUFF_RADIUS * 0.6 * j.size) ** 2) {
                    if (j.shell > 0) {
                        if (!b.hits.has(j)) {
                            b.hits.add(j);
                            j.shell = 0;
                            this.spray(j.x, j.y, 6, '#d9f1ff');
                        }
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
            if (
                L &&
                !L.dead &&
                b.age < dt * 1.5 &&
                Math.abs(b.x - L.x) < 40 + b.maxR &&
                Math.abs(b.y - L.y) < 20 + b.maxR
            ) {
                this.damageMoth(2, b.x, b.y);
            }
        }
        // Resolve finished bursts and close out chains with nothing left alive.
        for (const b of this.bursts) {
            if (b.age >= C.BURST_LIFE) {
                const c = this.chains.get(b.chainId);
                if (c) {
                    c.live--;
                    if (c.live <= 0) {
                        this.resolveChain(c);
                        this.chains.delete(b.chainId);
                    }
                }
            }
        }
        this.bursts = this.bursts.filter(b => b.age < C.BURST_LIFE);
    }

    /** A finished chain: add to the gauge and Fever, and send the rival attacks to match its length. */
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
            this.snd('send', n);
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
        this.snd('shatter');
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
        this.snd('fever');
        this.shake = 4;
        const r = this.fxRng;
        const cx = r.range(70, C.FIELD_W - 70);
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 5; col++) {
                this.puffs.push({
                    x: cx + (col - 2) * 20 + (row % 2) * 10,
                    y: -16 - row * 18,
                    vx: 0,
                    vy: 55,
                    phase: r.range(0, 6.28),
                    dead: false,
                    hp: 1,
                    kind: 'puff',
                    shell: 0,
                    maxHp: 1,
                    size: 1,
                    baseX: cx + (col - 2) * 20 + (row % 2) * 10,
                });
            }
        }
    }

    // ---- attacks, moth, bullets -------------------------------------------------

    /** Move the attacks the rival sent, by their flight style, and let bursts reverse them back. */
    private updateAttacks(dt: number): void {
        for (const a of this.attacks) {
            a.spin += dt * (a.kind === 'bramble' ? 1.5 : 4 + a.level);
            if (a.flight === 'zig') {
                // Right-angle turns: fall, dart sideways, fall again.
                a.seekT -= dt;
                if (a.seekT <= 0) {
                    a.seekT = this.fxRng.range(0.35, 0.8);
                    if (a.vx === 0) {
                        a.vx = (this.player.x < a.x ? -1 : 1) * C.IMP_SPEED * 1.1;
                        a.vy = 0;
                    } else {
                        a.vx = 0;
                        a.vy = C.IMP_SPEED;
                    }
                }
            }
            if (a.flight === 'homing' && a.seekT > 0) {
                // Steer toward the fairy, but only so sharply, and give up after a while.
                a.seekT -= dt;
                const want = Math.atan2(this.player.y - a.y, this.player.x - a.x);
                const cur = Math.atan2(a.vy, a.vx);
                let turn = want - cur;
                while (turn > Math.PI) turn -= Math.PI * 2;
                while (turn < -Math.PI) turn += Math.PI * 2;
                const ang = cur + Math.max(-C.HOMING_TURN * dt, Math.min(C.HOMING_TURN * dt, turn));
                const sp = C.IMP_SPEED * 0.95;
                a.vx = Math.cos(ang) * sp;
                a.vy = Math.sin(ang) * sp;
                // Once it's level with the fairy it commits and keeps going.
                if (a.y > this.player.y - 16) a.seekT = 0;
                if (a.seekT <= 0 && a.vy < C.IMP_SPEED * 0.5) a.vy = C.IMP_SPEED * 0.8;
            }
            if (a.flight === 'lateral') {
                // Streak across with a little bob, then burst into a ring of sparks.
                a.t = (a.t ?? 0) + dt;
                a.x += a.vx * dt;
                a.y += Math.cos(a.t * 8) * 18 * dt;
                a.seekT -= dt;
                if (a.seekT <= 0) {
                    a.dead = true;
                    for (let i = 0; i < C.SPARK_BULLETS; i++) {
                        const ang = (Math.PI * 2 * i) / C.SPARK_BULLETS;
                        this.bullets.push({
                            x: a.x,
                            y: a.y,
                            vx: Math.cos(ang) * C.SPARK_SPEED,
                            vy: Math.sin(ang) * C.SPARK_SPEED,
                            dead: false,
                        });
                    }
                    this.spray(a.x, a.y, 14, a.color ?? '#ffd86b');
                }
                continue;
            }
            if (a.flight === 'bounce') {
                // Little hops under gravity: it rises a bit, falls further, and drifts down overall.
                a.vy += C.BURR_GRAVITY * dt;
                a.seekT -= dt;
                if (a.seekT <= 0) {
                    a.seekT = C.BURR_HOP_EVERY;
                    a.vy = -C.BURR_HOP;
                }
            }
            if (a.flight === 'bat') {
                // Weave down like a bat, then lock on to where the fairy is and dive straight there.
                a.t = (a.t ?? 0) + dt;
                if (a.seekT > 0) {
                    a.seekT -= dt;
                    a.vx = Math.cos(a.t * 4.5) * 100;
                    a.vy = C.IMP_SPEED * (0.55 + 0.3 * Math.max(0, Math.sin(a.t * 9)));
                    if (a.seekT <= 0) {
                        const d = Math.hypot(this.player.x - a.x, this.player.y - a.y) || 1;
                        a.vx = ((this.player.x - a.x) / d) * C.BAT_DIVE;
                        a.vy = ((this.player.y - a.y) / d) * C.BAT_DIVE;
                    }
                }
            }
            if (a.flight === 'seeker' && a.seekT > 0) {
                // Line up: ease into the top of the meadow while sliding over the fairy.
                a.seekT -= dt;
                a.y += (26 - a.y) * Math.min(1, dt * 6);
                const gap = this.player.x - a.x;
                a.x += Math.sign(gap) * Math.min(Math.abs(gap), C.SEEK_SLIDE * dt);
                if (a.seekT <= 0) {
                    a.vx = 0;
                    a.vy = a.plunge;
                }
                continue;
            }
            a.x += a.vx * dt;
            a.y += a.vy * dt;
            if (a.flight === 'bat' && a.seekT <= 0) {
                // A diving bat doesn't bounce off walls; it just leaves.
                if (a.x < -20 || a.x > C.FIELD_W + 20 || a.y < -30) a.dead = true;
            } else if (a.x < 8 || a.x > C.FIELD_W - 8) {
                a.vx = Math.abs(a.vx) * (a.x < 8 ? 1 : -1);
            }
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
        // Reeling: frozen in place and untouchable; the wander clock waits.
        if (L.stun > 0) {
            L.stun = Math.max(0, L.stun - dt);
            return;
        }
        L.stageT += dt;
        const cx = C.FIELD_W / 2,
            cy = 80;
        if (L.stage === 'enter') {
            // Rocket in to the top of the circle (a rush goes straight to its attack spot).
            const tx = L.rush ? this.player.x : cx + Math.cos(L.angle) * C.GUARDIAN_CIRCLE;
            const ty = L.rush ? 62 : cy + Math.sin(L.angle) * C.GUARDIAN_CIRCLE * 0.45;
            const k = Math.min(1, dt * 9);
            L.x += (tx - L.x) * k;
            L.y += (ty - L.y) * k;
            if (L.stageT >= C.GUARDIAN_ENTER) {
                L.stageT = 0;
                if (L.rush) {
                    L.stage = 'attack';
                    L.cyclesLeft =
                        C.GUARDIAN_CYCLES_MIN +
                        Math.floor(this.fxRng.next() * (C.GUARDIAN_CYCLES_MAX - C.GUARDIAN_CYCLES_MIN + 1));
                    this.nextCycle(L);
                    L.fireT = 0.3;
                } else L.stage = 'wander';
            }
        } else if (L.stage === 'wander') {
            // Float in a loop, clockwise or anticlockwise at random.
            L.angle += L.dir * C.GUARDIAN_SPIN * dt;
            const tx = cx + Math.cos(L.angle) * C.GUARDIAN_CIRCLE,
                ty = cy + Math.sin(L.angle) * C.GUARDIAN_CIRCLE * 0.45;
            const k = Math.min(1, dt * 5);
            L.x += (tx - L.x) * k;
            L.y += (ty - L.y) * k;
            if (L.stageT >= C.GUARDIAN_WANDER) {
                L.stage = 'attack';
                L.stageT = 0;
                L.cyclesLeft =
                    C.GUARDIAN_CYCLES_MIN +
                    Math.floor(this.fxRng.next() * (C.GUARDIAN_CYCLES_MAX - C.GUARDIAN_CYCLES_MIN + 1));
                this.nextCycle(L);
            }
        } else if (L.stage === 'attack') {
            if (L.swoop >= 0) {
                // Slide down near the fairy, hang there, then glide back up to the post.
                L.swoop += dt;
                const down = C.GUARDIAN_SWOOP_DOWN,
                    hold = down + C.GUARDIAN_SWOOP_HOLD,
                    back = hold + C.GUARDIAN_SWOOP_BACK;
                const ease = (k: number) => k * k * (3 - 2 * k);
                if (L.swoop < down) {
                    const k = ease(L.swoop / down);
                    L.x = L.postX + (L.toX - L.postX) * k;
                    L.y = L.postY + (L.toY - L.postY) * k;
                } else if (L.swoop < hold) {
                    L.x = L.toX;
                    L.y = L.toY;
                } else if (L.swoop < back) {
                    const k = ease((L.swoop - hold) / C.GUARDIAN_SWOOP_BACK);
                    L.x = L.toX + (L.postX - L.toX) * k;
                    L.y = L.toY + (L.postY - L.toY) * k;
                } else {
                    L.x = L.postX;
                    L.y = L.postY;
                    L.swoop = -1;
                    L.swoopIn = C.GUARDIAN_SWOOP_EVERY + this.fxRng.range(-0.5, 0.5);
                    L.fireT = 0.4;
                }
                return; // no firing mid-swoop, and it finishes the swoop before leaving
            }
            L.fireT -= dt;
            if (L.fireT <= 0 && this.alive) this.guardianFire(L);
            // Each cycle runs one attack; after the last, it leaves.
            L.cycleT -= dt;
            if (L.cycleT <= 0) {
                // Unless guardians are set to leave, it just rolls on to its next attack.
                if (C.GUARDIAN_LEAVES) L.cyclesLeft--;
                if (L.cyclesLeft > 0) this.nextCycle(L);
            }
            L.swoopIn -= dt;
            if (L.swoopIn <= 0 && this.alive && (L.cyclesLeft > 1 || L.cycleT > 1.5)) {
                L.swoop = 0;
                L.postX = L.x;
                L.postY = L.y;
                L.toX = Math.min(C.FIELD_W - 30, Math.max(30, this.player.x));
                L.toY = Math.max(L.y, Math.min(C.FIELD_H - 50, this.player.y - C.GUARDIAN_SWOOP_GAP));
                return;
            }
            if (L.cyclesLeft <= 0) {
                L.stage = 'exit';
                L.stageT = 0;
                // Head for whichever side it's nearer, unless shots push it the other way.
                L.vx = (L.x < cx ? -1 : 1) * (15 + this.fxRng.range(0, 15));
            }
        } else {
            // Drift down and off a side. Shots nudge it (see damageMoth).
            L.vx *= Math.pow(0.97, dt * 60);
            L.vx += Math.sign(L.vx || 1) * 20 * dt;
            L.x += L.vx * dt;
            L.y += (25 + L.stageT * 22) * dt;
            if (L.y > C.FIELD_H + 40 || L.x < -50 || L.x > C.FIELD_W + 50) this.moth = null;
        }
    }

    /**
     * Is a point inside the area a fairy's bomb has swept so far? `k` runs 0 to 1
     * over the bomb. Exported shape so the renderer and the field agree.
     */
    static bombCovers(style: string, k: number, ox: number, oy: number, px: number, py: number): boolean {
        const W = C.FIELD_W;
        switch (style) {
            case 'dash': {
                // A streak along her row from the left wall, then a full-field flash.
                if (k >= 0.65) return true;
                const head = (k / 0.65) * (W + 40) - 20;
                return Math.abs(py - oy) < 70 && px < head;
            }
            case 'blast': {
                const R = 30 + 400 * k;
                return dist2(ox, oy, px, py) < R * R;
            }
            case 'vortex': {
                // Three frost arms spiral out from the middle of the meadow.
                const cx = W / 2,
                    cy = C.FIELD_H / 2,
                    R = 30 + 260 * k;
                if (dist2(cx, cy, px, py) > R * R) return false;
                const turned = k * Math.PI * 2.4;
                const a = (Math.atan2(py - cy, px - cx) + Math.PI * 4) % ((Math.PI * 2) / 3);
                return a < turned || turned >= (Math.PI * 2) / 3;
            }
            case 'fan': {
                // A cone straight ahead of her, 65 degrees either side of up.
                const R = 40 + 360 * k;
                if (dist2(ox, oy, px, py) > R * R) return false;
                const a = Math.atan2(py - oy, px - ox) + Math.PI / 2;
                return Math.abs(a) < 1.13 || dist2(ox, oy, px, py) < 30 * 30;
            }
            case 'beam': {
                // A lance swinging from pointing left, up over her, to pointing right.
                const beam = -Math.PI + k * Math.PI;
                const a = Math.atan2(py - oy, px - ox);
                return (a <= beam + 0.06 && a >= -Math.PI) || dist2(ox, oy, px, py) < 24 * 24;
            }
            case 'hole': {
                // The hole swallows what reaches it, then bursts in lightning across the meadow.
                const cx = W / 2,
                    cy = C.HOLE_Y;
                const R = k < 0.5 ? 26 : 26 + ((k - 0.5) / 0.5) * 380;
                return dist2(cx, cy, px, py) < R * R;
            }
        }
        return false;
    }

    /**
     * A bomb clears bullets and incoming attacks, pops small fry (two hits or
     * fewer) without starting a chain or sending anything, and stings a
     * guardian once. Shells, moonseeds and crows shrug it off. Each fairy's
     * bomb covers the meadow in its own way (see Bomb in types).
     */
    private updateBloom(dt: number): void {
        if (this.bloom <= 0) return;
        const bomb = this.fairy.bomb;
        this.bloom = Math.max(0, this.bloom - dt);
        const k = 1 - this.bloom / bomb.time;
        const { x, y } = this.bloomAt;
        const col = bomb.color;
        if (bomb.style === 'hole' && k < 0.5) {
            // Duskfall drags bullets and attacks toward the hole first.
            const cx = C.FIELD_W / 2,
                cy = C.HOLE_Y;
            const pull = (o: { x: number; y: number }) => {
                const d = Math.hypot(cx - o.x, cy - o.y) || 1;
                const step = Math.min(d, C.HOLE_PULL * dt);
                o.x += ((cx - o.x) / d) * step;
                o.y += ((cy - o.y) / d) * step;
            };
            for (const b of this.bullets) pull(b);
            for (const a of this.attacks) pull(a);
        }
        const inside = (px: number, py: number) => Field.bombCovers(bomb.style, k, x, y, px, py);
        for (const b of this.bullets)
            if (!b.dead && inside(b.x, b.y)) {
                b.dead = true;
                this.spray(b.x, b.y, 2, col);
            }
        for (const a of this.attacks)
            if (!a.dead && inside(a.x, a.y)) {
                a.dead = true;
                this.spray(a.x, a.y, 4, col);
            }
        for (const j of this.puffs) {
            if (!j.dead && !j.moonseed && j.shell <= 0 && j.hp <= 2 && j.x > -50 && inside(j.x, j.y)) {
                j.dead = true;
                this.spray(j.x, j.y, 5, col);
            }
        }
        const L = this.moth;
        if (L && !L.dead && !this.bombStungMoth && inside(L.x, L.y)) {
            this.bombStungMoth = true;
            if (L.stage === 'attack') {
                // A bomb negates a guardian's attack and clears it off the meadow outright.
                this.spray(L.x, L.y, 40, col);
                this.popup(L.x, L.y, `${L.guardian.name} dispelled`);
                this.snd('banish');
                this.moth = null;
            } else {
                this.damageMoth(8, L.x, L.y);
            }
        }
    }

    /** Breaking several incoming stars in quick succession rallies your guardian. */
    private clashFx(): void {
        this.snd('clash');
        const L = this.moth;
        const x = L ? L.x : C.FIELD_W / 2,
            y = L ? L.y : 70;
        this.spray(x, y, 40, '#ffffff');
        this.popup(C.FIELD_W / 2, 70, 'Bosses clash!');
        this.shake = 6;
    }

    /** Start an attack cycle with a random pick from the guardian's repertoire. */
    private nextCycle(L: Moth): void {
        const list = L.guardian.patterns;
        L.pattern = list[Math.floor(this.fxRng.next() * list.length)];
        L.cycleT = C.GUARDIAN_CYCLE[L.pattern] ?? 2.5;
        L.fireT = 0.35;
    }

    /**
     * Send a guardian to the rival, unless a rival guardian just arrived here, in which case the two clash and cancel.
     */
    private sendGuardian(how: string, rush = false): void {
        // A rival's boss that just arrived and mine collide: both are cancelled.
        if (this.moth && this.time - this.bossArrivedAt < C.BOSS_CLASH_WINDOW) {
            this.clashFx();
            this.moth = null;
            return;
        }
        this.bossSentAt = this.time;
        this.outbox.push({
            kind: 'moth',
            level: 1,
            fromX: C.FIELD_W / 2,
            fromY: C.FIELD_H / 2,
            fairy: this.fairy.id,
            rush,
        });
        this.popup(
            C.FIELD_W / 2,
            C.FIELD_H / 2,
            how ? `${how}: ${this.fairy.guardian.name} sent` : `${this.fairy.guardian.name} sent`,
        );
    }

    /** Each fairy's guardian has its own firing pattern. */
    private guardianFire(L: Moth): void {
        const shoot = (ang: number, speed: number) =>
            this.bullets.push({
                x: L.x,
                y: L.y + 8,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed,
                dead: false,
            });
        const aim = Math.atan2(this.player.y - L.y, this.player.x - L.x);
        switch (L.pattern) {
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
                {
                    const centre = Math.PI / 2 + Math.sin(L.t * 1.4) * 0.7;
                    for (let i = -2; i <= 2; i++) shoot(centre + i * 0.2, 100);
                }
                break;
        }
    }

    /** Hurt this meadow's guardian, banishing it when its health runs out. */
    private damageMoth(dmg: number, x: number, y: number): void {
        const L = this.moth;
        if (!L) return;
        // Reeling guardians are untouchable.
        if (L.stun > 0) {
            this.spray(x, y, 1, '#ffffff');
            return;
        }
        L.hp -= dmg;
        this.spray(x, y, 3, '#ffcf8a');
        if (L.stage === 'wander' || L.stage === 'enter') {
            // Hit it hard enough while it wanders and it reels.
            L.hurt += dmg;
            if (L.hurt >= C.GUARDIAN_STUN_DMG && L.hp > 0) {
                L.hurt = 0;
                L.stun = C.GUARDIAN_STUN;
                this.popup(L.x, L.y - 18, 'Reeling');
                this.snd('reel');
            }
        } else if (L.stage === 'exit') {
            // Exiting guardians don't reel, but shots push them away from where they hit.
            L.vx += (L.x >= x ? 1 : -1) * C.GUARDIAN_NUDGE;
        }
        if (L.hp <= 0) {
            const id = this.newChain(L.x, L.y, true);
            this.addBurst(L.x, L.y, id, 70);
            this.spray(L.x, L.y, 40, '#ffcf8a');
            this.popup(L.x, L.y, `${L.guardian.name} banished`);
            this.snd('banish');
            this.shake = 8;
            this.moth = null;
        }
    }

    /** Both meadows see the warning: the crow is about to wake in one of them. */
    get crowWarning(): boolean {
        return !this.crowsWoken && C.CROW_TIME - this.time < C.CROW_WARNING;
    }

    /** Send in the Hollow Crow at the given level, with a banner message. */
    private addCrow(level: number, msg: string): void {
        this.crows.push({
            x: C.FIELD_W / 2,
            y: -20,
            vx: 0,
            vy: 0,
            state: 'climb',
            t: 0,
            seed: this.time,
            hp: C.CROW_HP,
            level,
            speed: C.CROW_SPEED + (level - 1) * C.CROW_SPEED_STEP,
            stay: Math.max(C.CROW_STAY_MIN, C.CROW_STAY - (level - 1)),
        });
        this.popup(C.FIELD_W / 2, 80, msg);
        this.snd('crow');
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
            if (this.time >= ret.at)
                this.addCrow(ret.level, ret.level > 1 ? 'The crow returns, faster' : 'The crow crosses over');
        }
        this.crowReturns = this.crowReturns.filter(r => this.time < r.at);
        const p = this.player;
        for (const c of this.crows) {
            c.t += dt;
            c.stay -= dt;
            // Done hunting here: finish any dive, then fly out the top and into the other meadow.
            if (c.stay <= 0 && c.state !== 'dive' && c.state !== 'leave') {
                c.state = 'leave';
                c.t = 0;
            }
            if (c.state === 'leave') {
                c.vx = 0;
                c.vy = -150;
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
                c.x += (tx - c.x) * Math.min(1, dt * 3);
                c.y += (ty - c.y) * Math.min(1, dt * 3);
                if (c.t > 3.2) {
                    c.state = 'dive';
                    c.t = 0;
                    const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
                    const sp = c.speed;
                    c.vx = ((p.x - c.x) / d) * sp;
                    c.vy = ((p.y - c.y) / d) * sp;
                }
            } else if (c.state === 'dive') {
                c.x += c.vx * dt;
                c.y += c.vy * dt;
                if (c.y > C.FIELD_H - 10 || c.t > 2.2) {
                    c.state = 'climb';
                    c.t = 0;
                }
            } else {
                c.y += (40 - c.y) * Math.min(1, dt * 2.5);
                if (c.t > 1.2) {
                    c.state = 'circle';
                    c.t = 0;
                }
            }
            c.x = Math.min(C.FIELD_W - 8, Math.max(8, c.x));
        }
        this.crows = this.crows.filter(c => c.hp > 0);
    }

    /** Move guardian and crow bullets and drop the ones that leave the meadow. */
    private updateBullets(dt: number): void {
        for (const b of this.bullets) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.y > C.FIELD_H + 8 || b.x < -8 || b.x > C.FIELD_W + 8) b.dead = true;
        }
    }

    /** Check the fairy against everything that can hurt or stun her this frame. */
    private checkPlayerHits(): void {
        const p = this.player;
        if (!this.alive || p.invuln > 0 || this.settled) return;
        const pr = C.PLAYER_RADIUS * this.fairy.hitbox;
        const hit = (x: number, y: number, r: number) => dist2(p.x, p.y, x, y) < (r + pr) ** 2;
        // Attacks from the rival (and guardians and their shots) hit hard; critters just stun.
        let struck = false;
        for (const a of this.attacks) {
            const r = attackRadius(a);
            if (!a.dead && hit(a.x, a.y, r * 0.8)) {
                a.dead = true;
                struck = true;
            }
        }
        for (const b of this.bullets)
            if (!b.dead && hit(b.x, b.y, 3)) {
                b.dead = true;
                struck = true;
            }
        // The hollow crow is the meadow's Death: its touch knocks you out on the spot.
        if (this.crows.some(c => c.hp > 0 && hit(c.x, c.y, C.CROW_RADIUS * 0.8))) {
            p.hull = 0;
            this.shake = 10;
            this.spray(p.x, p.y, 40, '#ff9fb8');
            this.popup(p.x, p.y - 20, 'Death’s touch');
            this.snd('death');
            return;
        }
        const L = this.moth;
        if (L && Math.abs(p.x - L.x) < 30 && Math.abs(p.y - L.y) < 14) struck = true;
        if (struck) {
            p.hull = Math.max(0, p.hull - C.ATTACK_DAMAGE);
            p.invuln = C.INVULN_TIME;
            p.charge = 0;
            p.over = 0;
            this.shake = 7;
            this.spray(p.x, p.y, 24, '#ffffff');
            this.outbox.push({ kind: 'heal', level: C.HEAL_ON_ATTACK, fromX: p.x, fromY: p.y });
            this.snd('hurt');
            return;
        }
        // Running into a critter: one heart, but never below half a heart; stunned, then impaired.
        if (p.stun > 0 || p.zakoGrace > 0) return;
        for (const j of this.puffs) {
            if (!j.dead && !j.moonseed && j.x > -50 && hit(j.x, j.y, C.PUFF_RADIUS * 0.8 * j.size)) {
                j.dead = true;
                this.spray(j.x, j.y, 8, '#fff6d8');
                p.hull = p.hull > C.ZAKO_DAMAGE ? p.hull - C.ZAKO_DAMAGE : Math.min(p.hull, 1);
                p.stun = C.STUN_TIME;
                p.stunAge = 0;
                p.zakoGrace = C.STUN_TIME + C.ZAKO_GRACE;
                p.charge = 0;
                p.over = 0;
                p.hold = 0;
                this.shake = 4;
                this.popup(p.x, p.y - 22, 'Stunned');
                this.snd('stun');
                this.outbox.push({ kind: 'heal', level: C.HEAL_ON_ZAKO, fromX: p.x, fromY: p.y });
                return;
            }
        }
    }

    // ---- effects ------------------------------------------------------------------------

    /** Throw `n` particles of the given colour out from (x, y). */
    private spray(x: number, y: number, n: number, color: string): void {
        for (let i = 0; i < n; i++) {
            const a = this.fxRng.range(0, Math.PI * 2),
                s = this.fxRng.range(20, 90);
            const life = this.fxRng.range(0.3, 0.7);
            this.particles.push({
                x,
                y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life,
                max: life,
                size: this.fxRng.range(1, 2.5),
                color,
            });
        }
    }

    /** Float a short text label up from (x, y). */
    private popup(x: number, y: number, text: string): void {
        this.popups.push({ x, y, text, age: 0 });
    }

    /** Move and age particles and popups. */
    private updateFx(dt: number): void {
        for (const pt of this.particles) {
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            pt.vx *= 0.94;
            pt.vy = pt.vy * 0.94 - 12 * dt;
            pt.life -= dt;
        }
        for (const pu of this.popups) {
            pu.age += dt;
            pu.y -= 18 * dt;
        }
    }

    /** Drop everything marked dead or expired. */
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
            t: this.time,
            ri: this.roundIndex,
            ns: this.nextMoonseed,
            cw: this.crowsWoken,
            g: this.gauge,
            fv: this.fever,
            sh: this.shake,
            bl: this.bloom,
            ba: this.bloomAt,
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
        this.time = s.t;
        this.roundIndex = s.ri;
        this.nextMoonseed = s.ns;
        this.crowsWoken = s.cw;
        this.gauge = s.g;
        this.fever = s.fv;
        this.shake = s.sh;
        this.bloom = s.bl;
        this.bloomAt = s.ba;
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
        const tempo = this.tempo,
            world = dt * tempo,
            own = dt * (1 + (tempo - 1) * 0.5);
        this.shake = Math.max(0, this.shake - dt * 30);
        for (const s of this.shots) {
            s.y -= C.SHOT_SPEED * (s.sp ?? (s.charged ? 0.75 : 1)) * own;
            s.x += s.vx * own;
        }
        for (const a of this.attacks) {
            a.x += a.vx * world;
            a.y += a.vy * world;
        }
        for (const b of this.bullets) {
            b.x += b.vx * world;
            b.y += b.vy * world;
        }
        for (const c of this.crows) {
            c.x += c.vx * world;
            c.y += c.vy * world;
        }
        for (const b of this.bursts) b.age += dt;
        this.bursts = this.bursts.filter(b => b.age < C.BURST_LIFE);
        this.updateFx(dt);
        this.particles = this.particles.filter(p => p.life > 0);
        this.popups = this.popups.filter(p => p.age < 1.1);
    }
}
