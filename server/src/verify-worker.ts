// A worker thread that checks finished games with the game's own simulation (src/server/verify.ts). Each
// { id, replay, progress, off } is answered with { id, verdict }.
import { parentPort } from 'node:worker_threads';
import { verifyReplay } from '@/server/verify';
import type { Verdict } from '@/server/verify';
import type { CatalogResponse, Progress } from '@/types';

/** One game to check. */
interface Job {
    id: number;
    replay: unknown;
    progress: Progress | null;
    off: CatalogResponse;
}

parentPort?.on('message', ({ id, replay, progress, off }: Job) => {
    let verdict: Verdict;
    try {
        verdict = verifyReplay(replay, progress, off);
    } catch (e) {
        verdict = { ok: false, error: `Check failed: ${(e as Error)?.message ?? String(e)}` };
    }
    parentPort?.postMessage({ id, verdict });
});
