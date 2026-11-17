import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Chat: one row per message, by channel ('world' for now; friends', lobbies' and guilds' channels later), read in
 * order of id. And what each player wears in it: an avatar (a fairy's code), a frame and a bubble (see
 * src/data/looks.ts).
 */
export class Chat1763251200007 implements MigrationInterface {
    name = 'Chat1763251200007';

    /** Make the table, and give players their look. */
    async up(q: QueryRunner): Promise<void> {
        await q.query(
            "ALTER TABLE players ADD COLUMN avatar VARCHAR(16) NOT NULL DEFAULT 'pip' AFTER name, " +
                "ADD COLUMN avatar_frame VARCHAR(16) NOT NULL DEFAULT 'gold' AFTER avatar, " +
                "ADD COLUMN chat_bubble VARCHAR(16) NOT NULL DEFAULT 'night' AFTER avatar_frame",
        );
        await q.query(`CREATE TABLE IF NOT EXISTS chat_messages (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            channel VARCHAR(40) NOT NULL,
            player_id INT UNSIGNED NOT NULL,
            body VARCHAR(200) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY chat_messages_channel (channel, id),
            CONSTRAINT chat_messages_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
        ) ${TABLE}`);
    }

    /** Drop them. */
    async down(q: QueryRunner): Promise<void> {
        await q.query('DROP TABLE IF EXISTS chat_messages');
        await q.query('ALTER TABLE players DROP COLUMN avatar, DROP COLUMN avatar_frame, DROP COLUMN chat_bubble');
    }
}
