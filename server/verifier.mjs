// Runs the game checks in a worker thread (verify-worker.mjs), one at a time, and hands back each verdict.
// Without a built dist/verify.mjs (run "npm run build") there is no verifier, and results can't be counted.

import { existsSync } from 'node:fs';
import { Worker } from 'node:worker_threads';

const BUNDLE = new URL('../dist/verify.mjs', import.meta.url);

/** Start the verifier, or return null when the game hasn't been built. */
export function createVerifier() {
    if (!existsSync(BUNDLE)) {
        console.warn('No dist/verify.mjs: build the game to have finished games checked and counted.');
        return null;
    }
    let worker = null;
    let next = 1;
    const waiting = new Map();
    /** The worker, started (again, if it died) when needed. */
    const get = () => {
        if (worker) return worker;
        worker = new Worker(new URL('./verify-worker.mjs', import.meta.url));
        worker.on('message', ({ id, verdict }) => {
            waiting.get(id)?.(verdict);
            waiting.delete(id);
        });
        worker.on('error', e => console.error('Verifier error:', e));
        worker.on('exit', () => {
            worker = null;
            for (const done of waiting.values()) done({ ok: false, error: 'Verifier stopped' });
            waiting.clear();
        });
        worker.unref();
        return worker;
    };
    return {
        /** Check a replay against a player's progress; resolves with the verdict (see src/server/verify.ts). */
        verify(replay, progress) {
            return new Promise(resolve => {
                const id = next++;
                waiting.set(id, resolve);
                get().postMessage({ id, replay, progress });
            });
        },
        close: () => worker?.terminate(),
    };
}
