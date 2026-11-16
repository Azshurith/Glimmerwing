// What a finished match or Endless run earns: the one set of rules, used by the game to show it at once and by
// the server, which decides what really counts (from a replay it has checked by playing it again).
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import { MAPS } from '@/data/maps';
import { stageFor, stageOpen } from '@/data/stages';
import type { Fairy, MatchOutcome, Progress } from '@/types';

/** What a match earned, beyond the record itself. */
export interface Rewards {
    /** Trophies won or lost. */
    trophyDelta: number;
    /** Fairies it unlocked, and stages its trophies opened (their map names). */
    unlocked: Fairy[];
    newStages: string[];
    /** An Endless run that beat the best. */
    endlessNew: boolean;
}

/** Progress for a player who has never played. */
export const freshProgress = (): Progress => ({
    wins: 0,
    bestChain: 0,
    fevers: 0,
    flawless: 0,
    unlocked: [],
    trophies: 0,
    bestTrophies: 0,
    endlessBest: 0,
    endlessBosses: 0,
});

/**
 * Add a finished match (or Endless run) to `p`, in place: wins, a flawless win against the CPU, the best chain and
 * Fevers, trophies on the road (VS CPU and Online), the Endless best, and any fairies it unlocks.
 */
export function applyOutcome(p: Progress, o: MatchOutcome): Rewards {
    const r: Rewards = { trophyDelta: 0, unlocked: [], newStages: [], endlessNew: false };
    p.bestChain = Math.max(p.bestChain, o.bestChain);
    p.fevers += o.fevers;
    if (o.mode === 'endless') {
        const e = o.endless ?? { seconds: 0, guardians: 0 };
        r.endlessNew = e.seconds > p.endlessBest;
        p.endlessBest = Math.max(p.endlessBest, e.seconds);
        p.endlessBosses = Math.max(p.endlessBosses, e.guardians);
    } else {
        const won = o.wins[0] > o.wins[1];
        // Two players on one screen: somebody won, and it's a win on this device.
        if (o.mode === 'versus' || won) p.wins++;
        if (o.mode === 'cpu' && won && o.wins[1] === 0) p.flawless++;
        // Trophies on the road: VS CPU and Online only (two players on one screen just play).
        if (o.mode === 'cpu' || o.mode === 'online') {
            const before = p.trophies;
            p.trophies = Math.max(0, p.trophies + (won ? C.TROPHY_WIN : -C.TROPHY_LOSS));
            r.trophyDelta = p.trophies - before;
            const was = p.bestTrophies;
            p.bestTrophies = Math.max(p.bestTrophies, p.trophies);
            for (const m of MAPS) if (stageFor(m.id).trophies > was && stageOpen(p, m.id)) r.newStages.push(m.name);
        }
    }
    for (const f of FAIRIES) {
        if (f.unlock && !p.unlocked.includes(f.id) && f.unlock.met(p)) {
            p.unlocked.push(f.id);
            r.unlocked.push(f);
        }
    }
    return r;
}

/** Whether a fairy may be flown with this progress (no unlock needed, or unlocked). */
export function fairyOpen(p: Progress, id: string): boolean {
    const f = FAIRIES.find(x => x.id === id);
    return !!f && (!f.unlock || p.unlocked.includes(f.id));
}
