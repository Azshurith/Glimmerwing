import type { Progress } from '@/types';

const KEY = 'glimmerwing-progress-v1';
/** Progress for a player who has never played. */
const fresh = (): Progress => ({ wins: 0, bestChain: 0, fevers: 0, flawless: 0, unlocked: [] });

/** Read saved progress, or start fresh if there is none or storage is unavailable. */
export function loadProgress(): Progress {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...fresh(), ...(JSON.parse(raw) as Partial<Progress>) };
    } catch {
        /* storage unavailable: play with fresh progress */
    }
    return fresh();
}

/** Save progress (silently skipped where storage is unavailable). */
export function saveProgress(p: Progress): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(p));
    } catch {
        /* ignore */
    }
}

/** Delete saved progress and return a fresh copy. */
export function resetProgress(): Progress {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
    return fresh();
}
