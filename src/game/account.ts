import { ApiError, apiBase, apiCall } from '@/net/api';
import type {
    EndlessRank,
    EndlessRecord,
    LeaderEntry,
    MatchRecord,
    MeResponse,
    Progress,
    Saved,
    SyncedSettings,
} from '@/types';

const ACCOUNT_KEY = 'glimmerwing-account-v1';
const SYNC_KEY = 'glimmerwing-sync-v1';
const PENDING_KEY = 'glimmerwing-pending-v1';
/** How long saves are gathered before they're sent, so a burst of changes is one request. */
const SEND_DELAY = 1500;
/** The most reports kept to send later while the server can't be reached. */
const MAX_PENDING = 50;

/** The guest identity a browser keeps: the token is all it needs to prove who it is. */
interface StoredAccount {
    id: number;
    name: string;
    token: string;
}

/** When this browser last saved each thing (its own clock, ms); the newer copy wins when it syncs. */
interface SyncStamps {
    progressAt: number;
    settingsAt: number;
}

/** A report that couldn't be sent yet. */
type Pending = { k: 'match'; d: MatchRecord } | { k: 'endless'; d: EndlessRecord };

/** What the server had that's newer than this browser's copy, for the game to take on. */
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
 * The player's account on the game server: a guest made the first time this browser reaches the server. The browser
 * stays the first place everything is saved, so the game plays the same offline or from a file; the account copies
 * progress and settings up to the database, reports finished matches and Endless runs, and fetches the leaderboard.
 * Whichever copy of progress or settings was saved later wins when they meet.
 */
export class Account {
    private base = apiBase();
    private stored: StoredAccount | null = readStore<StoredAccount | null>(ACCOUNT_KEY, null);
    private stamps: SyncStamps = { progressAt: 0, settingsAt: 0, ...readStore<Partial<SyncStamps>>(SYNC_KEY, {}) };
    private timers: Partial<Record<'progress' | 'settings', number>> = {};
    private latest: { progress?: Progress; settings?: SyncedSettings } = {};
    /** Whether the server has answered since the game started. */
    online = false;
    /** Everyone's best Endless runs, as last fetched. */
    leaders: LeaderEntry[] = [];
    /** Where the player's best Endless run ranks among everyone's, as last heard. */
    rank: EndlessRank | null = null;

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

    /**
     * Meet the server: make a guest if this browser has none, then compare saves. Resolves with whatever the server
     * has that's newer than this browser's copy (and sends up whatever is newer here); resolves empty when there's no
     * server or it can't be reached.
     */
    async start(progress: Progress, settings: SyncedSettings): Promise<SyncResult> {
        if (!this.base) return {};
        try {
            const me = await this.me();
            this.online = true;
            this.rank = me.endless;
            const out: SyncResult = {};
            const p = this.meet(me.progress, this.stamps.progressAt);
            if (p) {
                out.progress = p.data;
                this.stamps.progressAt = p.savedAt;
            } else this.send('progress', progress);
            const s = this.meet(me.settings, this.stamps.settingsAt);
            if (s) {
                out.settings = s.data;
                this.stamps.settingsAt = s.savedAt;
            } else this.send('settings', settings);
            writeStore(SYNC_KEY, this.stamps);
            void this.flush();
            void this.refreshLeaders();
            return out;
        } catch (e) {
            console.warn('Game server unavailable; saves stay in this browser.', e);
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
        // A new account has nothing saved yet: this browser's copies go up as they are.
        this.stamps = { progressAt: 0, settingsAt: 0 };
        return { id: this.stored.id, name: this.stored.name, progress: null, settings: null, endless: null };
    }

    /** Progress was saved in this browser: stamp it and send it up shortly. */
    saveProgress(p: Progress): void {
        this.stamps.progressAt = Date.now();
        writeStore(SYNC_KEY, this.stamps);
        this.send('progress', p);
    }

    /** Settings were saved in this browser: stamp them and send them up shortly. */
    saveSettings(s: SyncedSettings): void {
        this.stamps.settingsAt = Date.now();
        writeStore(SYNC_KEY, this.stamps);
        this.send('settings', s);
    }

    /** Send the latest copy of progress or settings after a short wait (a newer save in the meantime replaces it). */
    private send(what: 'progress' | 'settings', data: Progress | SyncedSettings): void {
        if (!this.base || !this.stored) return;
        this.latest[what] = structuredClone(data) as Progress & SyncedSettings;
        clearTimeout(this.timers[what]);
        this.timers[what] = window.setTimeout(() => {
            const body = { data: this.latest[what], savedAt: this.stamps[`${what}At`] };
            apiCall(this.base!, 'PUT', `/me/${what}`, body, this.stored!.token).catch((e: unknown) =>
                console.warn(`Couldn't save ${what} to the server.`, e),
            );
        }, SEND_DELAY);
    }

    /** Report a finished match to the player's history (kept to send later if the server can't be reached). */
    reportMatch(m: MatchRecord): void {
        void this.report({ k: 'match', d: m });
    }

    /** Report a finished Endless run; resolves with where the player's best now ranks, or null if unknown. */
    async reportEndless(r: EndlessRecord): Promise<EndlessRank | null> {
        const rank = (await this.report({ k: 'endless', d: r })) as EndlessRank | null;
        if (rank) {
            this.rank = rank;
            void this.refreshLeaders();
        }
        return rank;
    }

    /** Send one report, or keep it to send later. */
    private async report(item: Pending): Promise<unknown> {
        if (!this.base) return null;
        if (!this.stored || !this.online) {
            this.keep(item);
            return null;
        }
        try {
            const path = item.k === 'match' ? '/matches' : '/endless';
            return await apiCall(this.base, 'POST', path, item.d, this.stored.token);
        } catch (e) {
            // A bad report would fail every time; keep only those the server never got.
            if (!(e instanceof ApiError && e.status < 500)) this.keep(item);
            return null;
        }
    }

    /** Keep a report to send once the server answers again. */
    private keep(item: Pending): void {
        const list = readStore<Pending[]>(PENDING_KEY, []);
        list.push(item);
        writeStore(PENDING_KEY, list.slice(-MAX_PENDING));
    }

    /** Send the reports kept while the server couldn't be reached. */
    private async flush(): Promise<void> {
        const list = readStore<Pending[]>(PENDING_KEY, []);
        if (!list.length) return;
        writeStore(PENDING_KEY, []);
        for (const item of list) await this.report(item);
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
