import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The keys the previous migration made from the play tables to the catalog: [table, name]. */
const OLD_KEYS: [string, string][] = [
    ['matches', 'matches_mode'],
    ['matches', 'matches_map'],
    ['matches', 'matches_fairy'],
    ['matches', 'matches_rival_fairy'],
    ['endless_runs', 'endless_map'],
    ['endless_runs', 'endless_fairy'],
    ['replays', 'replays_mode'],
    ['replays', 'replays_map'],
];

/** The catalog tables and their code columns' type. */
const CATALOG: [string, string][] = [
    ['characters', 'VARCHAR(16)'],
    ['maps', 'VARCHAR(16)'],
    ['types_modes', 'VARCHAR(12)'],
];

/** The tables that belong to a player, by their old and new names. */
const RENAMES: [string, string][] = [
    ['settings', 'players_settings'],
    ['replays', 'players_replays'],
    ['progress', 'players_progress'],
    ['matches', 'players_matches'],
    ['endless_runs', 'players_runs'],
];

/**
 * What the play tables call by name now points at a number: [table, old column, new column, catalog table,
 * foreign key]. The new column takes the old one's place.
 */
const REFS: [string, string, string, string, string][] = [
    ['players_matches', 'mode', 'mode_id', 'types_modes', 'players_matches_mode'],
    ['players_matches', 'map', 'map_id', 'maps', 'players_matches_map'],
    ['players_matches', 'fairy', 'fairy_id', 'characters', 'players_matches_fairy'],
    ['players_matches', 'rival_fairy', 'rival_fairy_id', 'characters', 'players_matches_rival_fairy'],
    ['players_runs', 'fairy', 'fairy_id', 'characters', 'players_runs_fairy'],
    ['players_runs', 'map', 'map_id', 'maps', 'players_runs_map'],
    ['players_replays', 'mode', 'mode_id', 'types_modes', 'players_replays_mode'],
    ['players_replays', 'map', 'map_id', 'maps', 'players_replays_map'],
];

/**
 * The catalog (characters, maps, types_modes) gets INT AUTO_INCREMENT ids, its old ids kept as a unique `code`
 * (the game's own id, e.g. 'pip'); a player's tables are named players_*; and their mode, map, fairy and
 * rival_fairy become mode_id, map_id, fairy_id and rival_fairy_id, foreign keys to those numbers.
 */
export class IntegerIdsAndPlayerTables1763251200002 implements MigrationInterface {
    name = 'IntegerIdsAndPlayerTables1763251200002';

    /** Renumber, rename and repoint. */
    async up(q: QueryRunner): Promise<void> {
        for (const [t, key] of OLD_KEYS) await q.query(`ALTER TABLE ${t} DROP FOREIGN KEY ${key}`);
        for (const [t, code] of CATALOG) {
            await q.query(`ALTER TABLE ${t} DROP PRIMARY KEY, CHANGE COLUMN id code ${code} NOT NULL`);
            await q.query(
                `ALTER TABLE ${t} ADD COLUMN id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST, ` +
                    `ADD UNIQUE KEY ${t}_code (code)`,
            );
        }
        await q.query(`RENAME TABLE ${RENAMES.map(([a, b]) => `${a} TO ${b}`).join(', ')}`);
        for (const [t, old, col, cat, key] of REFS) {
            await q.query(`ALTER TABLE ${t} ADD COLUMN ${col} INT UNSIGNED NULL AFTER ${old}`);
            await q.query(`UPDATE ${t} x JOIN ${cat} c ON c.code = x.${old} SET x.${col} = c.id`);
            await q.query(`ALTER TABLE ${t} DROP COLUMN ${old}, MODIFY COLUMN ${col} INT UNSIGNED NOT NULL`);
            await q.query(
                `ALTER TABLE ${t} ADD CONSTRAINT ${key} FOREIGN KEY (${col}) REFERENCES ${cat} (id) ` +
                    'ON UPDATE CASCADE ON DELETE RESTRICT',
            );
        }
    }

    /** Back to names: codes as ids again, the old table names and columns. */
    async down(q: QueryRunner): Promise<void> {
        for (const [t, old, col, cat, key] of REFS) {
            await q.query(`ALTER TABLE ${t} DROP FOREIGN KEY ${key}`);
            const type = CATALOG.find(([c]) => c === cat)![1];
            await q.query(`ALTER TABLE ${t} ADD COLUMN ${old} ${type} NULL AFTER ${col}`);
            await q.query(`UPDATE ${t} x JOIN ${cat} c ON c.id = x.${col} SET x.${old} = c.code`);
            await q.query(`ALTER TABLE ${t} DROP COLUMN ${col}, MODIFY COLUMN ${old} ${type} NOT NULL`);
        }
        await q.query(`RENAME TABLE ${RENAMES.map(([a, b]) => `${b} TO ${a}`).join(', ')}`);
        for (const [t, code] of CATALOG) {
            await q.query(`ALTER TABLE ${t} DROP PRIMARY KEY, DROP COLUMN id, DROP INDEX ${t}_code`);
            await q.query(`ALTER TABLE ${t} CHANGE COLUMN code id ${code} NOT NULL FIRST, ADD PRIMARY KEY (id)`);
        }
        for (const [t, key] of OLD_KEYS) {
            const col = key.replace(/^(matches|endless|replays)_/, '');
            const cat = col === 'mode' ? 'types_modes' : col === 'map' ? 'maps' : 'characters';
            await q.query(
                `ALTER TABLE ${t} ADD CONSTRAINT ${key} FOREIGN KEY (${col}) REFERENCES ${cat} (id) ` +
                    'ON UPDATE CASCADE ON DELETE RESTRICT',
            );
        }
    }
}
