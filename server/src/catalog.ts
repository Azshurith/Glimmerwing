// The catalog: the fairies, maps and modes in the characters, maps and types_modes tables, each numbered by the
// database and known to the game by its `code`. The server reads them at start and again every little while, so
// switching a fairy, map or mode off (is_enabled = 0, or soft-deleting the row, e.g. in phpMyAdmin) takes effect
// without a restart. Without a database nothing is off, and nothing is numbered.
import type { DataSource } from 'typeorm';
import { Character, GameMap, ModeType } from './database/entities/catalog';
import type { CatalogResponse } from '@/types';

/** How often the catalog is read again (ms). */
const REFRESH_MS = 15_000;

/** One catalog table, both ways round: codes to ids and back, and which codes are switched off. */
interface Table {
    ids: Map<string, number>;
    codes: Map<number, string>;
    off: Set<string>;
}

/** An empty table. */
const empty = (): Table => ({ ids: new Map(), codes: new Map(), off: new Set() });

/** A catalog table as read: every row, deleted ones too. */
function tableOf(rows: { id: number; code: string; isEnabled?: boolean; deletedAt: Date | null }[]): Table {
    const t = empty();
    for (const r of rows) {
        t.ids.set(r.code, r.id);
        t.codes.set(r.id, r.code);
        if (r.isEnabled === false || r.deletedAt) t.off.add(r.code);
    }
    return t;
}

/** The fairies, maps and modes, as last read. */
export class Catalog {
    private characters = empty();
    private maps = empty();
    private modes = empty();
    private timer: NodeJS.Timeout | null = null;

    constructor(private db: DataSource | null) {}

    /** Read the catalog again (a failed read keeps the last one). */
    async refresh(): Promise<void> {
        if (!this.db) return;
        try {
            const [cs, ms, ts] = await Promise.all([
                this.db.getRepository(Character).find({ withDeleted: true }),
                this.db.getRepository(GameMap).find({ withDeleted: true }),
                this.db.getRepository(ModeType).find({ withDeleted: true }),
            ]);
            this.characters = tableOf(cs);
            this.maps = tableOf(ms);
            this.modes = tableOf(ts);
        } catch (e) {
            console.error('Reading the catalog failed:', e);
        }
    }

    /** Keep reading it every little while. */
    watch(): void {
        this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
        this.timer.unref();
    }

    /** Stop reading it. */
    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Whether the fairy `code` can be flown. */
    fairyOn(code: string): boolean {
        return !this.characters.off.has(code);
    }

    /** Whether the map `code` can be played on. */
    mapOn(code: string): boolean {
        return !this.maps.off.has(code);
    }

    /** Whether the game mode `code` ('cpu', 'versus', 'endless', 'online') can be played. */
    modeOn(code: string): boolean {
        return !this.modes.off.has(code);
    }

    /** What's switched off, as GET /api/catalog answers (and the verifier is told). */
    off(): CatalogResponse {
        return {
            disabledCharacters: [...this.characters.off],
            disabledMaps: [...this.maps.off],
            disabledModes: [...this.modes.off],
        };
    }

    /** The characters row of the fairy `code`. */
    characterId(code: string): number {
        return idOf(this.characters, 'fairy', code);
    }

    /** The maps row of the map `code`. */
    mapId(code: string): number {
        return idOf(this.maps, 'map', code);
    }

    /** The types_modes row of the mode `code`. */
    modeId(code: string): number {
        return idOf(this.modes, 'mode', code);
    }

    /** The code of the fairy in characters row `id` ('' for one not in the catalog). */
    characterCode(id: number): string {
        return this.characters.codes.get(id) ?? '';
    }

    /** The code of the map in maps row `id`. */
    mapCode(id: number): string {
        return this.maps.codes.get(id) ?? '';
    }

    /** The code of the mode in types_modes row `id`. */
    modeCode(id: number): string {
        return this.modes.codes.get(id) ?? '';
    }
}

/** A code's id in a table, or an error naming what's missing (the catalog is filled from the game at start). */
function idOf(t: Table, what: string, code: string): number {
    const id = t.ids.get(code);
    if (id === undefined) throw new Error(`No ${what} "${code}" in the catalog`);
    return id;
}
