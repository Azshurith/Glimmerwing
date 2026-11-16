// Runs the game checks in a worker thread (verify-worker.ts, built beside this as dist/verify-worker.cjs), one at
// a time, so playing a game through (up to a second or so) never holds up the online matches.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { Verdict } from '@/server/verify';
import type { CatalogResponse, Progress } from '@/types';

/** The worker's file, built beside the server. */
const WORKER = join(__dirname, 'verify-worker.cjs');

/** Checks finished games in a worker thread. */
export class Verifier {
    private worker: Worker | null = null;
    private next = 1;
    private waiting = new Map<number, (v: Verdict) => void>();

    /** The verifier, or null when the worker hasn't been built. */
    static create(): Verifier | null {
        if (existsSync(WORKER)) return new Verifier();
        console.warn('No dist/verify-worker.cjs: build the game to have finished games checked and counted.');
        return null;
    }

    /** The worker, started (again, if it stopped) when needed. */
    private get thread(): Worker {
        if (this.worker) return this.worker;
        const w = new Worker(WORKER);
        w.on('message', ({ id, verdict }: { id: number; verdict: Verdict }) => {
            this.waiting.get(id)?.(verdict);
            this.waiting.delete(id);
        });
        w.on('error', e => console.error('Verifier error:', e));
        w.on('exit', () => {
            this.worker = null;
            for (const done of this.waiting.values()) done({ ok: false, error: 'Verifier stopped' });
            this.waiting.clear();
        });
        w.unref();
        this.worker = w;
        return w;
    }

    /** Check a replay against a player's progress and what's switched off; resolves with the verdict. */
    verify(replay: unknown, progress: Progress | null, off: CatalogResponse): Promise<Verdict> {
        return new Promise(resolve => {
            const id = this.next++;
            this.waiting.set(id, resolve);
            this.thread.postMessage({ id, replay, progress, off });
        });
    }

    /** Stop the worker. */
    async close(): Promise<void> {
        await this.worker?.terminate();
    }
}
