// The catalog: the fairies, maps and modes in the characters, maps and types_modes tables, each numbered by the
// database and known to the game by its `code`. The server reads them at start and again every little while, so
// switching a fairy, map or mode off (is_enabled = 0, or soft-deleting the row, e.g. in phpMyAdmin) or changing
// its art takes effect without a restart. Without a database nothing is off, nothing is numbered and there's no
// art (the game draws its own).
import type { DataSource } from 'typeorm';
import { fromJson } from './database/entities/columns';
import type { CatalogArt, CatalogResponse, MonsterArt, SpriteAtlas } from '@/types';

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

/** A catalog row as read (raw, so a sheet's bytes are never read here). */
interface Row {
    id: number;
    code: string;
    is_enabled: number | boolean;
    deleted_at: Date | null;
    updated_at: Date;
}

/** A catalog table as read: every row, deleted ones too. */
function tableOf(rows: Row[]): Table {
    const t = empty();
    for (const r of rows) {
        const id = Number(r.id);
        t.ids.set(r.code, id);
        t.codes.set(id, r.code);
        if (!Number(r.is_enabled) || r.deleted_at) t.off.add(r.code);
    }
    return t;
}

/** A row's version: when it last changed (ms). */
const version = (r: Row) => new Date(r.updated_at).getTime();

/** The fairies, maps and modes, as last read. */
export class Catalog {
    private characters = empty();
    private maps = empty();
    private modes = empty();
    private art: CatalogArt = { characters: {}, maps: {} };
    private timer: NodeJS.Timeout | null = null;

    constructor(private db: DataSource | null) {}

    /** Read the catalog again (a failed read keeps the last one). */
    async refresh(): Promise<void> {
        if (!this.db) return;
        const db = this.db;
        /** Rows of a query. */
        const rows = <T>(sql: string) => db.query(sql) as Promise<T[]>;
        try {
            const [cs, ms, ts, mons] = await Promise.all([
                rows<Row & { sprite_atlas: unknown; has_sheet: number }>(
                    `SELECT id, code, is_enabled, deleted_at, updated_at, sprite_atlas,
                        sprite_sheet IS NOT NULL AS has_sheet FROM characters`,
                ),
                rows<Row & { monster_cell: number | null; monster_overlay_row: number | null; has_sheet: number }>(
                    `SELECT id, code, is_enabled, deleted_at, updated_at, monster_cell, monster_overlay_row,
                        monster_sheet IS NOT NULL AS has_sheet FROM maps`,
                ),
                rows<Row>('SELECT id, code, is_enabled, deleted_at, updated_at FROM types_modes'),
                rows<{ map_id: number; code: string; name: string; role: MonsterArt['role']; sheet_row: number }>(
                    'SELECT map_id, code, name, role, sheet_row FROM monsters WHERE deleted_at IS NULL ORDER BY id',
                ),
            ]);
            this.characters = tableOf(cs);
            this.maps = tableOf(ms);
            this.modes = tableOf(ts);
            const art: CatalogArt = { characters: {}, maps: {} };
            for (const c of cs) {
                const atlas = c.sprite_atlas == null ? null : (fromJson(c.sprite_atlas) as SpriteAtlas);
                if (Number(c.has_sheet) && atlas) art.characters[c.code] = { v: version(c), atlas };
            }
            for (const m of ms) {
                if (!Number(m.has_sheet) || m.monster_cell == null) continue;
                const monsters = mons
                    .filter(x => Number(x.map_id) === Number(m.id))
                    .map(x => ({ code: x.code, name: x.name, role: x.role, row: Number(x.sheet_row) }));
                art.maps[m.code] = {
                    v: version(m),
                    cell: Number(m.monster_cell),
                    overlay: Number(m.monster_overlay_row ?? 0),
                    monsters,
                };
            }
            this.art = art;
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

    /** What's switched off and the art the database keeps, as GET /api/catalog answers. */
    response(): CatalogResponse {
        return { ...this.off(), art: this.art };
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
