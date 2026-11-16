// The server's check of a finished game: it plays the replay again, step by step, through the same simulation the
// game ran (the player's own controls from the tape; the CPU deciding for itself, from the round's seed), and
// works out the result itself. Bundled for Node by build.mjs into dist/verify-worker.cjs, a worker thread the
// server (server/src/verifier.ts) hands games to; nothing here touches the page.
import * as C from '@/core/config';
import { fairyById } from '@/data/characters';
import { mapById } from '@/data/maps';
import { stageOpen } from '@/data/stages';
import { RoundSim } from '@/game/match';
import { REPLAY_FORMAT, SIM_VERSION, TapeReader, isReplay, quantize } from '@/game/replay';
import { applyOutcome, fairyOpen, freshProgress } from '@/game/rewards';
import type { CatalogResponse, MatchOutcome, Progress, ReplayData } from '@/types';

/** The longest game the server will play through (in playing steps): an hour. */
const MAX_STEPS = 60 * 60 * 60;

/** What the check found: what the game earned, or why it doesn't count. */
export type Verdict =
    | {
          ok: true;
          outcome: MatchOutcome;
          /** The player's progress with the game added, and what it earned. */
          progress: Progress;
          trophyDelta: number;
          unlocked: string[];
          newStages: string[];
          endlessNew: boolean;
          /** Play time (seconds), the map and the two fairies, for the history and the leaderboard. */
          seconds: number;
          map: string;
          fairies: [string, string];
      }
    | { ok: false; error: string; stale?: boolean };

/** A failed check. */
const fail = (error: string, stale = false): Verdict => ({ ok: false, error, stale });

/**
 * Play `data` again and, if it holds up, add it to `progress` (the player's progress as the server has it).
 * It doesn't hold up if it's from another build of the game, uses a fairy or a stage the player hasn't opened,
 * uses a fairy or a map that's switched off (`off`, the server's catalog), or its recording doesn't play out to
 * the end it claims.
 */
export function verifyReplay(
    data: unknown,
    progress: Progress | null,
    off: CatalogResponse = { disabledCharacters: [], disabledMaps: [] },
): Verdict {
    if (!isReplay(data)) return fail('Not a replay');
    const d: ReplayData = data;
    // Online matches are run, and counted, by the server itself.
    if (d.mode === 'online') return fail('Online matches are counted by the server');
    if (off.disabledModes?.includes(d.mode)) return fail('That mode is switched off');
    if (d.format !== REPLAY_FORMAT || d.sim !== SIM_VERSION)
        return fail('Recorded on another version of the game', true);
    const p: Progress = structuredClone(progress ?? freshProgress());
    const f0 = fairyById(d.fairies[0]),
        f1 = fairyById(d.fairies[1]);
    if (!f0 || !f1 || !mapById(d.map)) return fail('Unknown fairy or map');
    // Only what this player has opened: their fairy (both, two players on one screen) and the stage.
    if (!fairyOpen(p, f0.id) || (d.mode === 'versus' && !fairyOpen(p, f1.id))) return fail('That fairy is locked');
    if (!stageOpen(p, d.map)) return fail('That stage is locked');
    if (off.disabledMaps.includes(d.map)) return fail('That map is unavailable');
    if (off.disabledCharacters.includes(f0.id) || (d.mode === 'versus' && off.disabledCharacters.includes(f1.id)))
        return fail('That fairy is unavailable');
    if (!d.rounds.length || d.rounds.length > 2 * C.ROUNDS_TO_WIN - 1) return fail('Wrong number of rounds');

    const dt = C.STEP;
    const wins: [number, number] = [0, 0];
    let bestChain = 0,
        fevers = 0,
        total = 0,
        endless = { seconds: 0, guardians: 0 };
    for (const [ri, r] of d.rounds.entries()) {
        const where = ` (round ${ri + 1})`;
        if (wins[0] >= C.ROUNDS_TO_WIN || wins[1] >= C.ROUNDS_TO_WIN) return fail('Rounds after the match ended');
        // The meadow size it was played at, as the game would have set it.
        const single = d.mode === 'endless' && r.field.single;
        if (r.field.single && !single) return fail('Bad meadow size');
        C.setFieldWidth(r.field.w, single);
        C.setFieldHeight(r.field.h);
        if (C.FIELD_W !== r.field.w || C.FIELD_H !== r.field.h) return fail('Bad meadow size');
        const sim = new RoundSim(d.mode, r.seed, [f0, f1], wins[0] + wins[1], d.map, (r.seed & 1) === 0);
        const tapes = [new TapeReader(r.tapes[0]), new TapeReader(r.tapes[1])];
        let steps = 0;
        for (let guard = 0; ; guard++) {
            if (guard > MAX_STEPS * 2 || total + steps > MAX_STEPS) return fail('Too long');
            if (sim.frozen(dt)) continue;
            sim.share();
            const c0 = tapes[0].next();
            const c1 = d.mode === 'versus' ? tapes[1].next() : quantize(sim.cpuControls(dt));
            sim.advance(dt, c0, c1);
            steps++;
            const [dead0, dead1] = sim.dead;
            if (d.mode === 'endless' ? dead0 : dead0 || dead1) {
                if (d.mode !== 'endless') {
                    const w = dead0 && dead1 ? -1 : dead0 ? 1 : 0;
                    if (w >= 0) wins[w as 0 | 1]++;
                }
                break;
            }
            if (steps > r.steps) return fail(`The recording doesn't reach the end of its round${where}`);
        }
        if (steps !== r.steps) return fail(`The recording plays out differently${where}: ${steps} of ${r.steps} steps`);
        total += steps;
        // Only the human players' play counts toward the record.
        for (const f of d.mode === 'versus' ? sim.fields : [sim.fields[0]]) {
            bestChain = Math.max(bestChain, f.bestChain);
            fevers += f.fevers;
        }
        if (d.mode === 'endless') endless = { seconds: sim.endlessT, guardians: sim.endlessBosses };
    }
    if (d.mode !== 'endless' && wins[0] < C.ROUNDS_TO_WIN && wins[1] < C.ROUNDS_TO_WIN)
        return fail('The match is unfinished');
    const outcome: MatchOutcome = {
        mode: d.mode,
        wins,
        bestChain,
        fevers,
        endless: d.mode === 'endless' ? endless : undefined,
    };
    const rewards = applyOutcome(p, outcome);
    return {
        ok: true,
        outcome,
        progress: p,
        trophyDelta: rewards.trophyDelta,
        unlocked: rewards.unlocked.map(f => f.id),
        newStages: rewards.newStages,
        endlessNew: rewards.endlessNew,
        seconds: Math.round(total * dt * 10) / 10,
        map: d.map,
        fairies: [f0.id, f1.id],
    };
}
