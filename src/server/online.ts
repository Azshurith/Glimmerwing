// An online match, run by the server. The two players' browsers only send their controls; the server steps the
// round (the same RoundSim as everywhere, so it plays out the same) using each player's latest controls, and
// sends both players the controls it used, step by step. Each browser runs the very same round from them, so
// what they see is what the server decided. The server deals the rounds, decides knockouts and the result, and
// counts the match toward both players' progress. Bundled into the server (dist/server.cjs) and driven by
// server/src/relay.ts.
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import { mapForSeed } from '@/data/maps';
import { RoundSim } from '@/game/match';
import { REPLAY_FORMAT, SIM_VERSION, TapeWriter, packControls, quantize, unpackControls } from '@/game/replay';
import { applyOutcome, fairyOpen, freshProgress } from '@/game/rewards';
import type { Controls, MatchOutcome, Progress, ReplayData, ReplayRound } from '@/types';

/** No buttons held. */
const IDLE: Controls = { left: false, right: false, up: false, down: false, fire: false };
/** Steps of countdown before a round starts, and of the round-over pause before the next. */
const COUNTDOWN_STEPS = Math.round(C.COUNTDOWN_TIME / C.STEP);
const ROUND_OVER_STEPS = Math.round(3.5 / C.STEP);
/** Steps gathered into one message to the players. */
const STEPS_PER_MESSAGE = 2;

/** A player in the match: how to reach them, and their account (null for a player the server doesn't know). */
export interface Seat {
    send(msg: object): void;
    player: { id: number; name: string } | null;
}

/** What the match needs from the server around it: the players' progress, and saving a finished match. */
export interface OnlineHooks {
    loadProgress(playerId: number): Promise<Progress | null>;
    /** Save one player's side of a finished match; resolves with the replay's share code, if it was kept. */
    saveResult(
        playerId: number,
        r: {
            progress: Progress;
            outcome: MatchOutcome;
            trophyDelta: number;
            seconds: number;
            map: string;
            fairies: [string, string];
            replay: ReplayData;
        },
    ): Promise<string | null>;
    /** Whether a fairy, and a map, are switched on (the server's catalog). */
    fairyOn(id: string): boolean;
    mapOn(id: string): boolean;
}

/** Where a match is: picking fairies, counting down to a round, playing it, between rounds, or settling up. */
type Stage = 'select' | 'countdown' | 'playing' | 'roundOver' | 'settling';

/**
 * One online match between two seats (0 is whoever made the room or queued first). It plays one match after
 * another, back to fairy select after each, until a player leaves.
 */
export class OnlineMatch {
    private stage: Stage = 'select';
    private picks: [string | null, string | null] = [null, null];
    private progress: [Progress | null, Progress | null] = [null, null];
    private sim: RoundSim | null = null;
    private wins: [number, number] = [0, 0];
    private roundNo = 0;
    private wait = 0;
    /** Each player's latest controls (what the server uses at every step until new ones arrive). */
    private latest: [Controls, Controls] = [IDLE, IDLE];
    /** Steps of this round so far, and those not yet sent to the players. */
    private steps = 0;
    private outgoing: (number[][] | null)[] = [];
    private firstUnsent = 0;
    /** The match as a replay (for both players' match histories), and what it counts for each player. */
    private tapes: [TapeWriter, TapeWriter] | null = null;
    private rounds: ReplayRound[] = [];
    private seed = 0;
    private bestChain: [number, number] = [0, 0];
    private fevers: [number, number] = [0, 0];
    private playSteps = 0;
    /** Set once the match is over for good (a player left). */
    closed = false;

    constructor(
        private seats: [Seat, Seat],
        private hooks: OnlineHooks,
    ) {
        seats.forEach((s, i) => {
            if (s.player)
                void hooks.loadProgress(s.player.id).then(p => {
                    this.progress[i] = p ?? freshProgress();
                });
        });
    }

    /**
     * A player's cursor on fairy select (passed on to the other player), and once they've picked, their pick.
     * A fairy the player hasn't unlocked (on the server's record) isn't accepted.
     */
    select(seat: 0 | 1, i: number, done: boolean, id: string): void {
        if (this.stage !== 'select') return;
        this.seats[1 - seat].send({ t: 'sel', i, done, id });
        if (!done) {
            this.picks[seat] = null;
            return;
        }
        const p = this.seats[seat].player ? this.progress[seat] : freshProgress();
        if (!fairyById(id) || (p && !fairyOpen(p, id))) {
            this.seats[seat].send({ t: 'error', msg: 'That fairy is locked' });
            return;
        }
        if (!this.hooks.fairyOn(id)) {
            this.seats[seat].send({ t: 'error', msg: 'That fairy is unavailable' });
            return;
        }
        this.picks[seat] = id;
        if (this.picks[0] && this.picks[1]) this.startMatch();
    }

    /** A player's controls now (packed); they hold until the next ones arrive. */
    input(seat: 0 | 1, packed: unknown): void {
        this.latest[seat] = quantize(unpackControls(packed));
    }

    /**
     * A player left. During a match it's forfeited to the one who stayed (it counts as a loss for the one who
     * left); the match is then over for good.
     */
    leave(seat: 0 | 1): void {
        if (this.closed) return;
        this.closed = true;
        const other = this.seats[1 - seat];
        if (this.stage === 'countdown' || this.stage === 'playing' || this.stage === 'roundOver') {
            // The round under way goes into the replay as far as it got (it stops where the rival left).
            if (this.stage === 'playing' && this.tapes && this.tapes[0].steps > 0) {
                const [t0, t1] = this.tapes;
                this.rounds.push({
                    seed: this.seed,
                    steps: t0.steps,
                    field: { w: C.FIELD_W, h: C.FIELD_H, single: false },
                    tapes: [t0.finish(), t1.finish()],
                });
                this.tapes = null;
            }
            this.wins[1 - seat] = C.ROUNDS_TO_WIN;
            void this.settle(true).then(() => other.send({ t: 'peerLeft' }));
        } else other.send({ t: 'peerLeft' });
    }

    /** Both have picked: the first round. */
    private startMatch(): void {
        this.wins = [0, 0];
        this.rounds = [];
        this.bestChain = [0, 0];
        this.fevers = [0, 0];
        this.playSteps = 0;
        this.newRound();
    }

    /** Deal a round: a fresh seed (it picks the map too), told to both players, then the countdown. */
    private newRound(): void {
        const f0 = fairyById(this.picks[0]!)!,
            f1 = fairyById(this.picks[1]!)!;
        // A seed whose map is switched on (any, if every one is off).
        for (let tries = 0; ; tries++) {
            this.seed = (Math.random() * 2 ** 31) | 0;
            if (this.hooks.mapOn(mapForSeed(this.seed).id) || tries >= 64) break;
        }
        const map = mapForSeed(this.seed).id;
        // Online meadows are always the usual size, so both screens agree.
        C.setFieldWidth(C.FIELD_W_BASE);
        C.setFieldHeight(C.ROUND_H);
        const roundIndex = this.wins[0] + this.wins[1];
        this.sim = new RoundSim('online', this.seed, [f0, f1], roundIndex, map, (this.seed & 1) === 0);
        this.roundNo++;
        this.steps = 0;
        this.outgoing = [];
        this.firstUnsent = 0;
        this.latest = [IDLE, IDLE];
        this.tapes = [new TapeWriter(), new TapeWriter()];
        const msg = {
            t: 'round',
            n: this.roundNo,
            seed: this.seed,
            map,
            fairies: [f0.id, f1.id],
            wins: this.wins,
        };
        for (const s of this.seats) s.send(msg);
        this.stage = 'countdown';
        this.wait = COUNTDOWN_STEPS;
    }

    /** One step of server time (C.STEP). */
    tick(): void {
        if (this.closed) return;
        if (this.stage === 'countdown') {
            if (--this.wait <= 0) this.stage = 'playing';
            return;
        }
        if (this.stage === 'roundOver') {
            if (--this.wait > 0) return;
            if (this.wins[0] >= C.ROUNDS_TO_WIN || this.wins[1] >= C.ROUNDS_TO_WIN) void this.settle(false);
            else this.newRound();
            return;
        }
        if (this.stage !== 'playing' || !this.sim) return;
        const sim = this.sim;
        const dt = C.STEP;
        if (sim.frozen(dt)) this.outgoing.push(null);
        else {
            sim.share();
            const [c0, c1] = this.latest;
            sim.advance(dt, c0, c1);
            this.tapes![0].push(c0);
            this.tapes![1].push(c1);
            this.outgoing.push([packControls(c0), packControls(c1)]);
            this.playSteps++;
        }
        this.steps++;
        const [dead0, dead1] = sim.dead;
        if (dead0 || dead1) {
            this.flush();
            this.endRound(dead0, dead1);
        } else if (this.outgoing.length >= STEPS_PER_MESSAGE) this.flush();
    }

    /** Send the steps gathered since the last message to both players. */
    private flush(): void {
        if (!this.outgoing.length) return;
        const msg = { t: 'f', n: this.roundNo, k: this.firstUnsent, fr: this.outgoing };
        for (const s of this.seats) s.send(msg);
        this.firstUnsent += this.outgoing.length;
        this.outgoing = [];
    }

    /** A fairy went down: settle the round, tell both players (with how many steps it lasted), then pause. */
    private endRound(dead0: boolean, dead1: boolean): void {
        const sim = this.sim!;
        const winner = dead0 && dead1 ? -1 : dead0 ? 1 : 0;
        if (winner >= 0) this.wins[winner as 0 | 1]++;
        sim.fields.forEach((f, i) => {
            this.bestChain[i] = Math.max(this.bestChain[i], f.bestChain);
            this.fevers[i] += f.fevers;
        });
        const [t0, t1] = this.tapes!;
        this.rounds.push({
            seed: this.seed,
            steps: t0.steps,
            field: { w: C.FIELD_W, h: C.FIELD_H, single: false },
            tapes: [t0.finish(), t1.finish()],
        });
        const msg = { t: 'end', n: this.roundNo, steps: this.steps, winner, wins: this.wins };
        for (const s of this.seats) s.send(msg);
        this.stage = 'roundOver';
        this.wait = ROUND_OVER_STEPS;
    }

    /**
     * The match is over: count it for each player the server knows (their side of it, by the same rules as every
     * game), keep it as a replay, tell each their result, and go back to fairy select for the next match.
     */
    private async settle(forfeit: boolean): Promise<void> {
        this.stage = 'settling';
        const replay: ReplayData = {
            format: REPLAY_FORMAT,
            sim: SIM_VERSION,
            mode: 'online',
            fairies: [this.picks[0]!, this.picks[1]!],
            map: this.sim?.fields[0].mapId ?? '',
            rounds: this.rounds,
            wins: [this.wins[0], this.wins[1]],
            seconds: Math.round(this.playSteps * C.STEP * 10) / 10,
            guardians: 0,
            at: Date.now(),
        };
        await Promise.all(
            this.seats.map(async (s, i) => {
                const seat = i as 0 | 1;
                const outcome: MatchOutcome = {
                    mode: 'online',
                    // Each player's side: their own rounds first.
                    wins: [this.wins[seat], this.wins[1 - seat]],
                    bestChain: this.bestChain[seat],
                    fevers: this.fevers[seat],
                };
                let progress: Progress | null = null,
                    trophyDelta = 0,
                    unlocked: string[] = [],
                    newStages: string[] = [],
                    code: string | null = null;
                if (s.player) {
                    // The record as it stands now (other games may have been counted since the match began).
                    progress = (await this.hooks.loadProgress(s.player.id)) ?? freshProgress();
                    const r = applyOutcome(progress, outcome);
                    trophyDelta = r.trophyDelta;
                    unlocked = r.unlocked.map(f => f.id);
                    newStages = r.newStages;
                    this.progress[seat] = progress;
                    try {
                        code = await this.hooks.saveResult(s.player.id, {
                            progress,
                            outcome,
                            trophyDelta,
                            seconds: replay.seconds,
                            map: replay.map,
                            fairies: [this.picks[seat]!, this.picks[1 - seat]!],
                            replay,
                        });
                    } catch (e) {
                        console.error('Saving an online result failed:', e);
                    }
                }
                s.send({ t: 'result', wins: this.wins, forfeit, progress, trophyDelta, unlocked, newStages, code });
            }),
        );
        if (this.closed) return;
        this.stage = 'select';
        this.picks = [null, null];
        this.sim = null;
    }
}
