// A match's numbers and graphs (Profile's match details): its replay played through once more, silently, with every
// meadow's sounds and sent attacks counted and each side's standing sampled every second. Nothing is drawn or
// saved; the meadow size the game is set to is put back afterwards.
import * as C from '@/core/config';
import { FAIRIES, fairyById } from '@/data/characters';
import type { HighlightKind, MatchStats, ReplayData, RoundMode, SideStats, StatSample } from '@/types';
import { RoundSim } from './match';
import { ReplayPlayer } from './replay';

/** How often each side's standing is sampled for the graphs (in playing steps): once a second. */
const SAMPLE_EVERY = Math.round(1 / C.STEP);

/** The longest replay played through (in steps), as the server's check: an hour. */
const MAX_STEPS = 60 * 60 * 60;

/** A side with nothing done yet. */
const freshSide = (): SideStats => ({
    roundsWon: 0,
    pops: 0,
    chains: 0,
    bestChain: 0,
    fireballs: 0,
    reverses: 0,
    extras: 0,
    guardians: 0,
    perfects: 0,
    fevers: 0,
    bombs: 0,
    hits: 0,
    stuns: 0,
});

/** Play a replay through and add up what each side did, sampling both every second for the graphs. */
export function matchStats(data: ReplayData): MatchStats {
    const keep = { w: C.FIELD_W, h: C.FIELD_H, single: C.VIEW_W === C.FIELD_W };
    try {
        return run(data);
    } finally {
        C.setFieldWidth(keep.w, keep.single);
        C.setFieldHeight(keep.h);
    }
}

/** The work of matchStats, which puts the meadow size back however this ends. */
function run(data: ReplayData): MatchStats {
    const player = new ReplayPlayer(data);
    // An online match plays back like two players on one screen: both meadows from the recording.
    const mode: RoundMode = data.mode === 'online' ? 'versus' : data.mode;
    const picks = [fairyById(data.fairies[0]) ?? FAIRIES[0], fairyById(data.fairies[1]) ?? FAIRIES[1]] as const;
    const sides: [SideStats, SideStats] = [freshSide(), freshSide()];
    const samples: StatSample[] = [];
    const events: MatchStats['events'] = [];
    const rounds: MatchStats['rounds'] = [];
    let exact = player.sameSim,
        total = 0;
    const attacks = (s: SideStats) => s.fireballs + s.extras + s.guardians;
    /** Note a moment for the graphs, one marker for a burst of the same thing. */
    const note = (side: 0 | 1, kind: HighlightKind) => {
        const t = total * C.STEP;
        if (!events.some(e => e.side === side && e.kind === kind && t - e.t < 2)) events.push({ t, side, kind });
    };
    /** Sample both sides' standing now. */
    const sample = (sim: RoundSim) => {
        const [a, b] = sim.fields;
        samples.push({
            t: total * C.STEP,
            hull: [a.player.hull, b.player.hull],
            pops: [sides[0].pops, sides[1].pops],
            attacks: [attacks(sides[0]), attacks(sides[1])],
        });
    };
    for (let ri = 0; ; ri++) {
        const seed = player.startRound(ri);
        if (seed === null) break;
        const r = data.rounds[ri];
        const start = total * C.STEP;
        let winner: -1 | 0 | 1 = -1;
        C.setFieldWidth(r.field.w, r.field.single);
        C.setFieldHeight(r.field.h);
        const sim = new RoundSim(
            mode,
            seed,
            picks,
            sides[0].roundsWon + sides[1].roundsWon,
            data.map,
            (seed & 1) === 0,
        );
        sample(sim);
        const seen = new WeakSet<object>();
        let ended = false,
            steps = 0;
        for (let guard = 0; guard < MAX_STEPS * 2 && total < MAX_STEPS; guard++) {
            if (sim.frozen(C.STEP)) continue;
            sim.share();
            const [c0, c1] = player.next();
            if (player.roundSpent) break;
            sim.advance(C.STEP, c0, c1);
            total++;
            steps++;
            sim.fields.forEach((f, i) => {
                const side = i as 0 | 1,
                    s = sides[side];
                for (const e of f.sfx) {
                    if (e.k === 'pop') s.pops++;
                    else if (e.k === 'send') {
                        s.chains++;
                        s.bestChain = Math.max(s.bestChain, e.p);
                        if (e.p >= 7) note(side, 'chain');
                    } else if (e.k === 'reverse') s.reverses++;
                    else if (e.k === 'fever') {
                        s.fevers++;
                        note(side, 'fever');
                    } else if (e.k === 'bomb') {
                        s.bombs++;
                        note(side, 'bomb');
                    } else if (e.k === 'hurt') s.hits++;
                    else if (e.k === 'stun') s.stuns++;
                    else if (e.k === 'extra' && e.p === 1) s.perfects++;
                    else if (e.k === 'death') note(side, 'ko');
                }
                f.sfx = [];
            });
            // What each meadow sent this step has just set off between the meadows.
            for (const tr of sim.transits) {
                if (seen.has(tr.o)) continue;
                seen.add(tr.o);
                const side = tr.from,
                    s = sides[side],
                    o = tr.o;
                if (o.kind === 'star' && o.k === undefined) s.fireballs++;
                else if (o.kind === 'imp') {
                    s.extras++;
                    note(side, 'extra');
                } else if (o.kind === 'moth') {
                    s.guardians++;
                    note(side, 'guardian');
                }
            }
            if (total % SAMPLE_EVERY === 0) sample(sim);
            const [dead0, dead1] = sim.dead;
            if (mode === 'endless' ? dead0 : dead0 || dead1) {
                if (dead0) note(0, 'ko');
                if (dead1 && mode !== 'endless') note(1, 'ko');
                if (mode !== 'endless' && dead0 !== dead1) {
                    winner = dead0 ? 1 : 0;
                    sides[winner].roundsWon++;
                }
                ended = true;
                break;
            }
        }
        sample(sim);
        rounds.push({ start, seconds: total * C.STEP - start, winner });
        // A round that runs past its recording, or ends before it, didn't play out as it was played.
        if (!ended || steps !== r.steps) exact = false;
    }
    return { seconds: total * C.STEP, fairies: [picks[0].id, picks[1].id], rounds, sides, samples, events, exact };
}

/** The same numbers seen from side `me`: that side first (a server-run online match is recorded in seat order). */
export function fromSide(s: MatchStats, me: 0 | 1): MatchStats {
    if (me === 0) return s;
    /** A pair the other way round. */
    const flip = <T>(p: [T, T]): [T, T] => [p[1], p[0]];
    return {
        ...s,
        fairies: flip(s.fairies),
        sides: flip(s.sides),
        rounds: s.rounds.map(r => ({ ...r, winner: r.winner < 0 ? r.winner : ((1 - r.winner) as 0 | 1) })),
        samples: s.samples.map(x => ({ t: x.t, hull: flip(x.hull), pops: flip(x.pops), attacks: flip(x.attacks) })),
        events: s.events.map(e => ({ ...e, side: (1 - e.side) as 0 | 1 })),
    };
}
