// The catalog's rows come from the game's own data: every fairy, map and mode the game has gets a row (enabled,
// numbered by the database, its `code` the game's id) if it hasn't one yet. Rows already there are left alone,
// so a fairy or map switched off stays off.
import { FAIRIES } from '@/data/characters';
import { MAPS } from '@/data/maps';

/** The game's modes, as matches and replays name them. */
export const MODES: [string, string][] = [
    ['cpu', 'VS CPU'],
    ['versus', '2 Players'],
    ['endless', 'Endless'],
    ['online', 'Online'],
];

/** Something that runs SQL: a DataSource, or a migration's QueryRunner. */
interface Runs {
    query(sql: string, args?: unknown[]): Promise<unknown>;
}

/** Add the catalog rows the game has and the database hasn't. */
export async function seedCatalog(db: Runs): Promise<void> {
    /** INSERT IGNORE the rows into `table`. */
    const add = async (table: string, rows: [string, string][]) => {
        if (!rows.length) return;
        await db.query(
            `INSERT IGNORE INTO ${table} (code, name) VALUES ${rows.map(() => '(?, ?)').join(', ')}`,
            rows.flat(),
        );
    };
    await add(
        'characters',
        FAIRIES.map(f => [f.id, f.name]),
    );
    await add(
        'maps',
        MAPS.map(m => [m.id, m.name]),
    );
    await add('types_modes', MODES);
}
