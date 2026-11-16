// A worker thread that checks finished games, so playing one through (up to a second or so) never holds up the
// online relay. It loads the game's own simulation, bundled by the build as dist/verify.mjs (see
// src/server/verify.ts), and answers each { id, replay, progress } with { id, verdict }.
import { parentPort } from 'node:worker_threads';

const { verifyReplay } = await import(new URL('../dist/verify.mjs', import.meta.url).href);

parentPort.on('message', ({ id, replay, progress }) => {
    let verdict;
    try {
        verdict = verifyReplay(replay, progress);
    } catch (e) {
        verdict = { ok: false, error: `Check failed: ${e?.message ?? e}` };
    }
    parentPort.postMessage({ id, verdict });
});
