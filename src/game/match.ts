// One round of a match, both meadows and everything between them: shared by the game, which plays it, and the
// server, which plays a replay of it again to check its result. Nothing here draws, reads input or keeps time of
// its own: each step is given its length and both meadows' controls.
import * as C from '@/core/config';
import { Rng } from '@/core/rng';
import { stageFor } from '@/data/stages';
import type { Controls, Fairy, Outgoing, RoundMode, Transit } from '@/types';
import { CpuPilot } from './ai';
import { Field } from './field';
import { curveLength, enterAt, pathLength, shiftCurve } from './fireball-path';

/**
 * Seconds an attack is in flight between the meadows, once any `stagger` is over: a Reverse crossing the screen
 * takes as long as the stretch of its curve between the meadows needs at its speed; any other fireball flies its
 * route (normalRoute) to the rival's near wall at its transit speed; everything else takes TRANSIT_TIME, an Extra
 * Attack less (SPEED_EXTRA).
 */
export const flightTime = (o: Outgoing) => {
    if (o.kind === 'star' && o.curve) {
        const k0 = o.k ?? 0;
        const kIn = enterAt(shiftCurve(o.curve, o.side ?? 1), k0);
        return Math.max(0.05, curveLength(o.curve, k0, kIn) / Math.max(40, o.speed ?? C.FIREBALL_FALL_SPEED));
    }
    if (o.kind === 'star') return pathLength(o.route ?? [{ x: o.fromX, y: o.fromY }]) / riseSpeed(o);
    return C.TRANSIT_TIME / (o.kind === 'imp' ? C.SPEED_EXTRA : C.SPEED_NORMAL);
};

/** Seconds from an attack leaving one meadow to arriving in the other: its `stagger`, then its flight. */
export const transitTime = (o: Outgoing) => (o.stagger ?? 0) + flightTime(o);

/** How fast a Normal fireball flies its route between the meadows (and then on into the rival's). */
export const riseSpeed = (o: Outgoing) =>
    C.fireballTransitSpeed(o.reflects ?? (o.level >= 2 ? 1 : 0), o.boost ?? 1) *
    (o.fever && o.level < 2 ? (o.pace ?? 1) : 1);

/**
 * Endless has no rival beside you, so its attacks come from above: a fireball drops in straight down from the top
 * of the meadow (over the fairy, a volley spread either side) instead of flying in from a side wall.
 */
function fromAbove(o: Outgoing): Outgoing {
    if (o.kind !== 'star' || o.level >= 2) return o;
    const { enter: _e, route: _r, curve: _c, ...rest } = o;
    return { ...rest, aim: o.aim ?? 0 };
}

/**
 * A round: two meadows built from one seed (so their waves match), the attacks flying between them, the CPU
 * pilot that flies the second meadow against the CPU and in Endless, and Endless's director. The meadow size is
 * whatever `C.FIELD_W`/`C.FIELD_H` are when it's made. Each playing step is `frozen` (a moonseed break holds both
 * meadows), else `share`, then the controls (`cpuControls` for the CPU), then `advance`.
 */
export class RoundSim {
    readonly fields: [Field, Field];
    transits: Transit[] = [];
    /** The CPU's pilot, deciding from numbers seeded by the round, so a replay of it plays out the same. */
    readonly cpu: CpuPilot;
    /** Endless: how long the run has lasted, the guardians sent and when the next one comes. */
    endlessT = 0;
    endlessBosses = 0;
    endlessNextBoss: number = C.ENDLESS_FIRST_BOSS;
    /** Endless: picks which of the hidden meadow's attacks get through. */
    private endlessRng: Rng;

    constructor(
        readonly mode: RoundMode,
        seed: number,
        fairies: readonly [Fairy, Fairy],
        roundIndex: number,
        map: string,
        /** Whether the Hollow Crow wakes in the first meadow (else the second). */
        crowFirst: boolean,
    ) {
        this.fields = [
            new Field(seed, fairies[0], roundIndex, crowFirst),
            new Field(seed, fairies[1], roundIndex, !crowFirst),
        ];
        // The second meadow's rival is to its left, so its countered fireballs arc off that way.
        this.fields[1].rivalSide = -1;
        for (const f of this.fields) f.mapId = map;
        this.endlessRng = new Rng(seed ^ 0x5bd1e995);
        // The CPU is sharper further along the trophy road.
        this.cpu = new CpuPilot(stageFor(map).cpuReaction, seed ^ 0x2545f491);
    }

    /** A moonseed break freezes both meadows for a beat: count it down. True while frozen (the step ends there). */
    frozen(dt: number): boolean {
        const hs = Math.max(this.fields[0].hitstop, this.fields[1].hitstop);
        if (hs <= 0) return false;
        for (const f of this.fields) f.hitstop = Math.max(0, f.hitstop - dt);
        return true;
    }

    /** Each meadow learns where its rival's fairy is (fireballs aim at it). */
    share(): void {
        const [a, b] = this.fields;
        a.rivalFairy = { x: b.player.x, y: b.player.y };
        b.rivalFairy = { x: a.player.x, y: a.player.y };
    }

    /** The CPU's controls for the second meadow this step. */
    cpuControls(dt: number): Controls {
        return this.cpu.think(this.fields[1], dt);
    }

    /** One playing step: both meadows move on, then Endless's director, then the attacks between the meadows. */
    advance(dt: number, c0: Controls, c1: Controls): void {
        this.fields[0].update(dt, c0);
        this.fields[1].update(dt, c1);
        if (this.mode === 'endless') this.directEndless(dt);
        this.fields.forEach((f, i) => {
            for (const o of f.outbox) {
                // Fireballs wear their sender's colour: orange for player 1, purple for player 2.
                o.tint ??= i === 0 ? 'p1' : 'p2';
                this.transits.push({ o, from: i as 0 | 1, t: 0 });
            }
            f.outbox = [];
        });
        for (const tr of this.transits) {
            // A fireball flies on the tempo (and sudden death) between the meadows too, as it does in them.
            tr.t += tr.o.kind === 'star' ? dt * this.fields[tr.from].attackPace : dt;
            if (tr.t >= transitTime(tr.o))
                this.fields[1 - tr.from].receive(this.mode === 'endless' ? fromAbove(tr.o) : tr.o);
        }
        this.transits = this.transits.filter(tr => tr.t < transitTime(tr.o));
    }

    /** Which fairies are down. */
    get dead(): [boolean, boolean] {
        return [!this.fields[0].alive, !this.fields[1].alive];
    }

    /**
     * Endless mode's director. The hidden meadow is flown by the CPU and can't be beaten (its hearts refill), so
     * its chains keep raining attacks on you; your own attacks go nowhere. On top of that it sends guardians on a
     * schedule that tightens as the run goes on, and the waves and tempo build as in any round.
     */
    private directEndless(dt: number): void {
        this.endlessT += dt;
        const ghost = this.fields[1];
        ghost.player.hull = C.MAX_HULL;
        // Nothing of yours reaches it: a run is about surviving, not knocking anyone out.
        this.fields[0].outbox = [];
        // A short grace at the start while you find your feet, then its attacks get through more and more often:
        // a share at first, all of them a few minutes in. Its guardians always come.
        const share =
            this.endlessT < C.ENDLESS_GRACE
                ? 0
                : Math.min(1, C.ENDLESS_SHARE_START + (this.endlessT - C.ENDLESS_GRACE) / C.ENDLESS_SHARE_RAMP);
        ghost.outbox = ghost.outbox.filter(o => o.kind === 'moth' || this.endlessRng.next() < share);
        if (this.endlessT >= this.endlessNextBoss) {
            ghost.summonGuardian();
            this.endlessBosses++;
            this.endlessNextBoss += Math.max(C.ENDLESS_BOSS_MIN, C.ENDLESS_BOSS_EVERY - this.endlessBosses * 3);
        }
    }
}
