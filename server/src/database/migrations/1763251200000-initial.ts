import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The tables as the first server made them (its schema.sql). Every statement is safe on a database that
 * already has them, so an existing database is simply taken over.
 */
export class Initial1763251200000 implements MigrationInterface {
    name = 'Initial1763251200000';

    /** Make the tables that aren't there yet. */
    async up(q: QueryRunner): Promise<void> {
        const table = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
        await q.query(`CREATE TABLE IF NOT EXISTS players (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            token_hash CHAR(64) NOT NULL,
            name VARCHAR(24) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY players_token (token_hash)
        ) ${table}`);
        await q.query(`CREATE TABLE IF NOT EXISTS progress (
            player_id INT UNSIGNED NOT NULL,
            data LONGTEXT NOT NULL CHECK (JSON_VALID(data)),
            trophies INT NOT NULL DEFAULT 0,
            best_trophies INT NOT NULL DEFAULT 0,
            wins INT NOT NULL DEFAULT 0,
            endless_best DOUBLE NOT NULL DEFAULT 0,
            saved_at BIGINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (player_id),
            KEY progress_trophies (trophies),
            CONSTRAINT progress_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${table}`);
        await q.query(`CREATE TABLE IF NOT EXISTS settings (
            player_id INT UNSIGNED NOT NULL,
            data LONGTEXT NOT NULL CHECK (JSON_VALID(data)),
            saved_at BIGINT NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (player_id),
            CONSTRAINT settings_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${table}`);
        await q.query(`CREATE TABLE IF NOT EXISTS matches (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            player_id INT UNSIGNED NOT NULL,
            mode VARCHAR(12) NOT NULL,
            map VARCHAR(16) NOT NULL,
            fairy VARCHAR(16) NOT NULL,
            rival_fairy VARCHAR(16) NOT NULL,
            rounds_won TINYINT UNSIGNED NOT NULL,
            rounds_lost TINYINT UNSIGNED NOT NULL,
            won TINYINT(1) NOT NULL,
            best_chain INT NOT NULL DEFAULT 0,
            trophy_delta INT NOT NULL DEFAULT 0,
            seconds DOUBLE NOT NULL DEFAULT 0,
            played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY matches_player (player_id, played_at),
            CONSTRAINT matches_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${table}`);
        await q.query(`CREATE TABLE IF NOT EXISTS endless_runs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            player_id INT UNSIGNED NOT NULL,
            seconds DOUBLE NOT NULL,
            guardians INT NOT NULL DEFAULT 0,
            fairy VARCHAR(16) NOT NULL,
            map VARCHAR(16) NOT NULL,
            best_chain INT NOT NULL DEFAULT 0,
            played_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY endless_seconds (seconds),
            KEY endless_player (player_id, seconds),
            CONSTRAINT endless_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${table}`);
        await q.query(`CREATE TABLE IF NOT EXISTS replays (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            code CHAR(10) NOT NULL,
            player_id INT UNSIGNED NOT NULL,
            mode VARCHAR(12) NOT NULL,
            map VARCHAR(16) NOT NULL,
            version VARCHAR(16) NOT NULL,
            seconds DOUBLE NOT NULL DEFAULT 0,
            data LONGTEXT NOT NULL CHECK (JSON_VALID(data)),
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY replays_code (code),
            KEY replays_player (player_id, created_at),
            CONSTRAINT replays_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${table}`);
        await q.query('ALTER TABLE replays ADD COLUMN IF NOT EXISTS recorded BIGINT NULL');
        await q.query('CREATE UNIQUE INDEX IF NOT EXISTS replays_recorded ON replays (player_id, recorded)');
    }

    /** Drop every table. */
    async down(q: QueryRunner): Promise<void> {
        for (const t of ['replays', 'endless_runs', 'matches', 'settings', 'progress', 'players'])
            await q.query(`DROP TABLE IF EXISTS ${t}`);
    }
}
