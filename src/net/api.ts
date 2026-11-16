import { serverUrl } from './net';

declare const __GW_SERVER__: string;

/**
 * Where the game's API lives: beside the online relay (its `/ws` becomes `/api`). A page opened from a file with
 * no server named has none, and keeps its saves in the browser only.
 */
export function apiBase(): string | null {
    const named =
        new URLSearchParams(location.search).get('server') ??
        (typeof __GW_SERVER__ === 'string' && __GW_SERVER__ ? __GW_SERVER__ : null);
    if (!named && location.protocol !== 'http:' && location.protocol !== 'https:') return null;
    try {
        const u = new URL(serverUrl());
        u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
        u.pathname = u.pathname.replace(/\/ws\/?$/, '') + '/api';
        u.search = '';
        return u.toString().replace(/\/$/, '');
    } catch {
        return null;
    }
}

/** An answer from the API that wasn't a success. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

/**
 * Call the API: `method` on `path` (under the base), with an optional JSON body and the player's token. Resolves
 * with the parsed answer; rejects with an ApiError on an error status, or a TypeError when the server can't be
 * reached at all.
 */
export async function apiCall<T>(base: string, method: string, path: string, body?: unknown, token?: string) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
        method,
        headers,
        // Never an old answer: the offline cache leaves /api alone, and so should the browser's.
        cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new ApiError(res.status, json.error ?? res.statusText);
    return json as T;
}
