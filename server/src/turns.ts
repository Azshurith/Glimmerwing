/**
 * Each player's results are counted one at a time, so two at once (a game sent twice, or an online match ending
 * while a VS CPU game is being checked) can't both add to the same progress.
 */
export class Turns {
    private queues = new Map<number, Promise<unknown>>();

    /** Run `job` after anything else of player `id`'s still being counted. */
    run<T>(id: number, job: () => Promise<T>): Promise<T> {
        const before = this.queues.get(id) ?? Promise.resolve();
        const run = before.then(job, job);
        const tail = run.catch(() => undefined);
        this.queues.set(id, tail);
        void tail.then(() => {
            if (this.queues.get(id) === tail) this.queues.delete(id);
        });
        return run;
    }
}
