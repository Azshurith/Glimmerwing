import { ApiError, apiBase, apiCall } from '@/net/api';
import { freshProgress } from './rewards';
import type {
    EndlessRank,
    LeaderEntry,
    MeResponse,
    Progress,
    ReplayData,
    ReplaySummary,
    ResultResponse,
    Saved,
    SyncedSettings,
} from '@/types';

const ACCOUNT_KEY = 'glimmerwing-account-v1';
const SYNC_KEY = 'glimmerwing-sync-v1';
const PENDING_KEY = 'glimmerwing-pending-results-v1';
/** How long settings changes are gathered before they're sent, so a burst of changes is one request. */
const SEND_DELAY = 1500;
/** The most finished games kept to send later while the server can't be reached. */
const MAX_PENDING = 20;

/** The guest identity a browser keeps: the token is all it needs to prove who it is. */
interface StoredAccount {
    id: number;
    name: string;
    token: string;
}

/** When this browser last saved its settings (its own clock, ms); the newer copy wins when it syncs. */
interface SyncStamps {
    settingsAt: number;
}

/** What the server has for the game to take on: its progress always, settings when they're newer. */
export interface SyncResult {
    progress?: Progress;
    settings?: SyncedSettings;
}

/** Read JSON from localStorage, or a fallback when it's missing, unreadable or storage is unavailable. */
function readStore<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

/** Write JSON to localStorage, skipped where storage is unavailable. */
function writeStore(key: string, v: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
        /* ignore */
    }
}

/**
 * The player's account on the game server: a guest made the first time this browser reaches the server.
 *
 * The server decides progress. A finished game goes to it as its replay; the server plays it through again,
 * works out what it earned, and answers with the progress that counts, which the game takes on (it shows its own
 * reckoning at once, then the server's). Games finished while the server can't be reached wait in this browser
 * and count once they've been sent and checked. Settings are the player's own and simply sync (the newer copy
 * wins). The browser keeps a copy of everything, so the game plays the same offline or from a file.
 */
export class Account {
    private base = apiBase();
    private stored: StoredAccount | null = readStore<StoredAccount | null>(ACCOUNT_KEY, null);
    private stamps: SyncStamps = { settingsAt: 0, ...readStore<Partial<SyncStamps>>(SYNC_KEY, {}) };
    private timer = 0;
    private latest: SyncedSettings | null = null;
    private flushing = false;
    /** Whether the server has answered since the game started. */
    online = false;
    /** Everyone's best Endless runs, as last fetched. */
    leaders: LeaderEntry[] = [];
    /** Where the player's best Endless run ranks among everyone's, as last heard. */
    rank: EndlessRank | null = null;
    /** Told whenever the server's progress arrives (after games waiting here have been counted, say). */
    onProgress: ((p: Progress) => void) | null = null;

    /** The player's name: the account's once there is one. */
    get name(): string {
        return this.stored?.name ?? 'GUEST';
    }

    /** The account's id, to pick the player out on the leaderboard. */
    get id(): number | null {
        return this.stored?.id ?? null;
    }

    /** Whether there's a server to save to at all. */
    get hasServer(): boolean {
        return this.base !== null;
    }

    /** How many finished games are waiting in this browser to be sent and counted. */
    get pending(): number {
        return readStore<ReplayData[]>(PENDING_KEY, []).length;
    }

    /**
     * Meet the server: make a guest if this browser has none, then take its progress (it decides that) and
     * whichever copy of the settings is newer, and send the games waiting here. Resolves empty when there's no
     * server or it can't be reached: the game plays on from this browser's copies.
     */
    async start(settings: SyncedSettings): Promise<SyncResult> {
        if (!this.base) return {};
        try {
            const me = await this.me();
            this.online = true;
            this.rank = me.endless;
            // The server's record is the one that counts (a new account's is empty).
            const out: SyncResult = { progress: me.progress?.data ?? freshProgress() };
            const s = this.meet(me.settings, this.stamps.settingsAt);
            if (s) {
                out.settings = s.data;
                this.stamps.settingsAt = s.savedAt;
                writeStore(SYNC_KEY, this.stamps);
            } else this.sendSettings(settings);
            void this.flush();
            void this.refreshLeaders();
            return out;
        } catch (e) {
            console.warn('Game server unavailable; games are kept here to count later.', e);
            return {};
        }
    }

    /** The server's copy when it's newer than this browser's, else null. */
    private meet<T>(server: Saved<T> | null, localAt: number): Saved<T> | null {
        return server && server.savedAt > localAt ? server : null;
    }

    /** Who the server says this browser is, making a guest first if it has none (or its token is unknown). */
    private async me(): Promise<MeResponse> {
        const base = this.base!;
        if (this.stored) {
            try {
                return await apiCall<MeResponse>(base, 'GET', '/me', undefined, this.stored.token);
            } catch (e) {
                if (!(e instanceof ApiError && e.status === 401)) throw e;
            }
        }
        this.stored = await apiCall<StoredAccount>(base, 'POST', '/guest', {});
        writeStore(ACCOUNT_KEY, this.stored);
        this.stamps = { settingsAt: 0 };
        // A new account starts from nothing: the server keeps the record from here on.
        return { id: this.stored.id, name: this.stored.name, progress: null, settings: null, endless: null };
    }

    /** Settings were saved in this browser: stamp them and send them up shortly. */
    saveSettings(s: SyncedSettings): void {
        this.stamps.settingsAt = Date.now();
        writeStore(SYNC_KEY, this.stamps);
        this.sendSettings(s);
    }

    /** Send the latest settings after a short wait (a newer save in the meantime replaces them). */
    private sendSettings(s: SyncedSettings): void {
        if (!this.base || !this.stored) return;
        this.latest = structuredClone(s);
        clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            const body = { data: this.latest, savedAt: this.stamps.settingsAt };
            apiCall(this.base!, 'PUT', '/me/settings', body, this.stored!.token).catch((e: unknown) =>
                console.warn("Couldn't save settings to the server.", e),
            );
        }, SEND_DELAY);
    }

    /**
     * Send a finished game to be checked and counted. Resolves with what the server made of it, or null if it
     * couldn't be counted now (no server, or it couldn't be reached: then it waits here to be sent later).
     */
    async submit(replay: ReplayData): Promise<ResultResponse | null> {
        if (!this.base) return null;
        if (!this.stored || !this.online) {
            this.keep(replay);
            return null;
        }
        try {
            const r = await this.send(replay);
            this.adopt(r);
            return r;
        } catch (e) {
            // One the server turned down (it doesn't hold up, it's from another version, it's counted already)
            // would be turned down every time; keep only those it never got.
            if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) this.keep(replay);
            else console.warn("The server didn't count that game:", e.message);
            return null;
        }
    }

    /** Post one game to the server. */
    private send(replay: ReplayData): Promise<ResultResponse> {
        return apiCall<ResultResponse>(this.base!, 'POST', '/results', { replay }, this.stored!.token);
    }

    /** Take on what the server answered for a game: its progress, and an Endless run's rank. */
    private adopt(r: ResultResponse): void {
        if (r.rank) {
            this.rank = r.rank;
            void this.refreshLeaders();
        }
        this.onProgress?.(r.progress);
    }

    /** Keep a game to send once the server answers again (the oldest go first when there are too many). */
    private keep(replay: ReplayData): void {
        const list = readStore<ReplayData[]>(PENDING_KEY, []);
        if (list.some(d => d.at === replay.at)) return;
        list.push(replay);
        writeStore(PENDING_KEY, list.slice(-MAX_PENDING));
    }

    /** Send the games kept while the server couldn't be reached, oldest first. */
    private async flush(): Promise<void> {
        if (this.flushing) return;
        this.flushing = true;
        try {
            for (;;) {
                const list = readStore<ReplayData[]>(PENDING_KEY, []);
                if (!list.length) break;
                const d = list[0];
                try {
                    this.adopt(await this.send(d));
                } catch (e) {
                    // Can't reach the server: try again next time. Turned down: drop it.
                    if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) break;
                }
                writeStore(
                    PENDING_KEY,
                    readStore<ReplayData[]>(PENDING_KEY, []).filter(x => x.at !== d.at),
                );
            }
        } finally {
            this.flushing = false;
        }
    }

    /** Start the record over on the server; resolves with the fresh progress, or null if it couldn't. */
    async reset(): Promise<Progress | null> {
        if (!this.base || !this.stored) return null;
        try {
            writeStore(PENDING_KEY, []);
            const r = await apiCall<{ progress: Progress }>(this.base, 'POST', '/me/reset', {}, this.stored.token);
            return r.progress;
        } catch {
            return null;
        }
    }

    /** The player's replays on the server, newest first (empty when there's no server). */
    async listReplays(): Promise<ReplaySummary[]> {
        if (!this.base || !this.stored) return [];
        return apiCall<ReplaySummary[]>(this.base, 'GET', '/me/replays?limit=30', undefined, this.stored.token);
    }

    /** Fetch a replay by its share code (anyone's). */
    async fetchReplay(code: string): Promise<ReplayData> {
        if (!this.base) throw new Error('No game server');
        const r = await apiCall<{ data: ReplayData }>(this.base, 'GET', `/replays/${encodeURIComponent(code)}`);
        return r.data;
    }

    /** Fetch everyone's best Endless runs. */
    async refreshLeaders(): Promise<void> {
        if (!this.base) return;
        try {
            this.leaders = await apiCall<LeaderEntry[]>(this.base, 'GET', '/leaderboard/endless?limit=10');
        } catch {
            /* keep the last list */
        }
    }
}
