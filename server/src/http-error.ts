/** An error that becomes an HTTP answer with this status (and, for a replay from another build, `stale`). */
export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        readonly stale = false,
    ) {
        super(message);
    }
}
