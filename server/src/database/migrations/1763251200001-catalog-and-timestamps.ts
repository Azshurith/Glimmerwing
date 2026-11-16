import type { MigrationInterface, QueryRunner } from 'typeorm';
import { seedCatalog } from '@server/catalog-seed';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
/** The three columns every table ends with. */
const STAMPS = `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at DATETIME NULL`;
const CREATED = 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP';
const UPDATED = 'DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP';

/** The foreign keys from the play tables to the catalog: [table, column, catalog table, name]. */
const KEYS: [string, string, string, string][] = [
    ['matches', 'mode', 'types_modes', 'matches_mode'],
    ['matches', 'map', 'maps', 'matches_map'],
    ['matches', 'fairy', 'characters', 'matches_fairy'],
    ['matches', 'rival_fairy', 'characters', 'matches_rival_fairy'],
    ['endless_runs', 'map', 'maps', 'endless_map'],
    ['endless_runs', 'fairy', 'characters', 'endless_fairy'],
    ['replays', 'mode', 'types_modes', 'replays_mode'],
    ['replays', 'map', 'maps', 'replays_map'],
];

/**
 * The catalog (characters, maps and types_modes, so a fairy or a map can be disabled and matches and replays
 * point at them by foreign key), and created_at, updated_at and deleted_at as the last three columns of every
 * table (matches' and endless_runs' played_at becomes their created_at).
 */
export class CatalogAndTimestamps1763251200001 implements MigrationInterface {
    name = 'CatalogAndTimestamps1763251200001';

    /** Add the catalog, the timestamps and the keys. */
    async up(q: QueryRunner): Promise<void> {
        await q.query(`CREATE TABLE IF NOT EXISTS characters (
            id VARCHAR(16) NOT NULL,
            name VARCHAR(32) NOT NULL,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            ${STAMPS},
            PRIMARY KEY (id)
        ) ${TABLE}`);
        await q.query(`CREATE TABLE IF NOT EXISTS maps (
            id VARCHAR(16) NOT NULL,
            name VARCHAR(32) NOT NULL,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            ${STAMPS},
            PRIMARY KEY (id)
        ) ${TABLE}`);
        await q.query(`CREATE TABLE IF NOT EXISTS types_modes (
            id VARCHAR(12) NOT NULL,
            name VARCHAR(32) NOT NULL,
            ${STAMPS},
            PRIMARY KEY (id)
        ) ${TABLE}`);
        await seedCatalog(q);

        // players: id, token_hash, name, seen_at, then the stamps.
        await q.query(`ALTER TABLE players MODIFY COLUMN created_at ${CREATED} AFTER seen_at`);
        await q.query(`ALTER TABLE players ADD COLUMN updated_at ${UPDATED} AFTER created_at`);
        await q.query('ALTER TABLE players ADD COLUMN deleted_at DATETIME NULL AFTER updated_at');
        // progress and settings had updated_at already: created_at goes in before it.
        for (const t of ['progress', 'settings']) {
            await q.query(`ALTER TABLE ${t} ADD COLUMN created_at ${CREATED} AFTER saved_at`);
            await q.query(`ALTER TABLE ${t} MODIFY COLUMN updated_at ${UPDATED} AFTER created_at`);
            await q.query(`ALTER TABLE ${t} ADD COLUMN deleted_at DATETIME NULL AFTER updated_at`);
        }
        // matches and endless_runs: played_at is when the row was made.
        for (const [t, last] of [
            ['matches', 'seconds'],
            ['endless_runs', 'best_chain'],
        ]) {
            await q.query(`ALTER TABLE ${t} CHANGE COLUMN played_at created_at ${CREATED} AFTER ${last}`);
            await q.query(`ALTER TABLE ${t} ADD COLUMN updated_at ${UPDATED} AFTER created_at`);
            await q.query(`ALTER TABLE ${t} ADD COLUMN deleted_at DATETIME NULL AFTER updated_at`);
        }
        // replays: recorded moves up beside seconds, the recording, then the stamps.
        await q.query('ALTER TABLE replays MODIFY COLUMN recorded BIGINT NULL AFTER seconds');
        await q.query(`ALTER TABLE replays MODIFY COLUMN created_at ${CREATED} AFTER data`);
        await q.query(`ALTER TABLE replays ADD COLUMN updated_at ${UPDATED} AFTER created_at`);
        await q.query('ALTER TABLE replays ADD COLUMN deleted_at DATETIME NULL AFTER updated_at');

        // Anything already played on a fairy, map or mode the catalog doesn't know gets a (disabled) row first,
        // so the keys can't fail on old rows.
        for (const [t, col, cat] of KEYS) {
            const enabled = cat === 'types_modes' ? '' : ', is_enabled';
            const off = cat === 'types_modes' ? '' : ', 0';
            await q.query(
                `INSERT IGNORE INTO ${cat} (id, name${enabled}) SELECT DISTINCT ${col}, ${col}${off} FROM ${t}`,
            );
        }
        for (const [t, col, cat, name] of KEYS)
            await q.query(
                `ALTER TABLE ${t} ADD CONSTRAINT ${name} FOREIGN KEY (${col}) REFERENCES ${cat} (id) ` +
                    'ON UPDATE CASCADE ON DELETE RESTRICT',
            );
    }

    /** Undo it: drop the keys and the catalog, and put the old columns back. */
    async down(q: QueryRunner): Promise<void> {
        for (const [t, , , name] of KEYS) {
            await q.query(`ALTER TABLE ${t} DROP FOREIGN KEY ${name}`);
            await q.query(`ALTER TABLE ${t} DROP INDEX ${name}`);
        }
        for (const t of ['types_modes', 'maps', 'characters']) await q.query(`DROP TABLE IF EXISTS ${t}`);
        for (const t of ['players', 'progress', 'settings', 'matches', 'endless_runs', 'replays'])
            await q.query(`ALTER TABLE ${t} DROP COLUMN deleted_at`);
        for (const t of ['players', 'matches', 'endless_runs', 'replays'])
            await q.query(`ALTER TABLE ${t} DROP COLUMN updated_at`);
        for (const t of ['progress', 'settings']) await q.query(`ALTER TABLE ${t} DROP COLUMN created_at`);
        for (const t of ['matches', 'endless_runs'])
            await q.query(`ALTER TABLE ${t} CHANGE COLUMN created_at played_at ${CREATED}`);
    }
}
