import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The history tables and the column each gets, placed before the timestamps. */
const TABLES: [table: string, after: string, key: string][] = [
    ['players_matches', 'seconds', 'players_matches_replay'],
    ['players_runs', 'best_chain', 'players_runs_replay'],
];

/**
 * Each match and Endless run in a player's history points at its replay (`replay_id`), so Profile's match history
 * can open it. Rows kept before this are linked to the replay their game saved alongside them, where one is found.
 */
export class HistoryReplays1763251200006 implements MigrationInterface {
    name = 'HistoryReplays1763251200006';

    /** Add the column and its key, then link the rows already kept. */
    async up(q: QueryRunner): Promise<void> {
        for (const [t, after, key] of TABLES) {
            await q.query(`ALTER TABLE ${t} ADD COLUMN replay_id BIGINT UNSIGNED NULL AFTER ${after}`);
            await q.query(
                `ALTER TABLE ${t} ADD CONSTRAINT ${key} FOREIGN KEY (replay_id) REFERENCES players_replays (id) ` +
                    'ON UPDATE CASCADE ON DELETE SET NULL',
            );
        }
        // A game's replay and its history row are written together, within a moment of each other.
        await q.query(
            `UPDATE players_matches x JOIN players_replays r ON r.player_id = x.player_id AND r.mode_id = x.mode_id
                AND r.map_id = x.map_id AND ABS(TIMESTAMPDIFF(SECOND, r.created_at, x.created_at)) <= 2
             SET x.replay_id = r.id WHERE x.replay_id IS NULL`,
        );
        await q.query(
            `UPDATE players_runs x JOIN players_replays r ON r.player_id = x.player_id AND r.map_id = x.map_id
                AND r.mode_id = (SELECT id FROM types_modes WHERE code = 'endless')
                AND ABS(TIMESTAMPDIFF(SECOND, r.created_at, x.created_at)) <= 2
             SET x.replay_id = r.id WHERE x.replay_id IS NULL`,
        );
    }

    /** Drop the links. */
    async down(q: QueryRunner): Promise<void> {
        for (const [t, , key] of TABLES) {
            await q.query(`ALTER TABLE ${t} DROP FOREIGN KEY ${key}`);
            await q.query(`ALTER TABLE ${t} DROP COLUMN replay_id`);
        }
    }
}
