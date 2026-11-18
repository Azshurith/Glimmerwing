import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Chat channels become a catalog table of their own: types_channels (id, code, name, is_enabled, like the
 * characters, maps and types_modes tables), and each message keeps its channel as a channel_id foreign key
 * instead of a bare name. The table is renamed players_messages to match the other player tables.
 */
export class ChatChannels1763251200008 implements MigrationInterface {
    name = 'ChatChannels1763251200008';

    /** Make the channels table, seed World chat, and repoint the messages at it (keeping every message). */
    async up(q: QueryRunner): Promise<void> {
        await q.query(`CREATE TABLE IF NOT EXISTS types_channels (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            code VARCHAR(16) NOT NULL,
            name VARCHAR(32) NOT NULL,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY types_channels_code (code)
        ) ${TABLE}`);
        await q.query(`INSERT IGNORE INTO types_channels (code, name) VALUES ('world', 'World')`);
        await q.query('RENAME TABLE chat_messages TO players_messages');
        // Rows posted before channels existed all name their channel; keep any of those as rows too.
        await q.query(`INSERT IGNORE INTO types_channels (code, name)
            SELECT DISTINCT channel, channel FROM players_messages`);
        await q.query('ALTER TABLE players_messages ADD COLUMN channel_id INT UNSIGNED NULL AFTER id');
        await q.query('UPDATE players_messages m JOIN types_channels c ON c.code = m.channel SET m.channel_id = c.id');
        await q.query(
            'ALTER TABLE players_messages DROP INDEX chat_messages_channel, ' +
                'ADD KEY players_messages_channel (channel_id, id)',
        );
        await q.query(
            'ALTER TABLE players_messages DROP COLUMN channel, MODIFY COLUMN channel_id INT UNSIGNED NOT NULL',
        );
        await q.query('ALTER TABLE players_messages DROP FOREIGN KEY chat_messages_player');
        await q.query(
            'ALTER TABLE players_messages ADD CONSTRAINT players_messages_player FOREIGN KEY (player_id) ' +
                'REFERENCES players (id) ON DELETE CASCADE',
        );
        await q.query(
            'ALTER TABLE players_messages ADD CONSTRAINT players_messages_channel FOREIGN KEY (channel_id) ' +
                'REFERENCES types_channels (id) ON UPDATE CASCADE ON DELETE RESTRICT',
        );
    }

    /** Back to channel names on chat_messages; drop the channels table. */
    async down(q: QueryRunner): Promise<void> {
        await q.query('ALTER TABLE players_messages DROP FOREIGN KEY players_messages_channel');
        await q.query('ALTER TABLE players_messages DROP FOREIGN KEY players_messages_player');
        await q.query('ALTER TABLE players_messages ADD COLUMN channel VARCHAR(40) NULL AFTER id');
        await q.query('UPDATE players_messages m JOIN types_channels c ON c.id = m.channel_id SET m.channel = c.code');
        await q.query(
            'ALTER TABLE players_messages DROP COLUMN channel_id, MODIFY COLUMN channel VARCHAR(40) NOT NULL',
        );
        await q.query(
            'ALTER TABLE players_messages DROP INDEX players_messages_channel, ' +
                'ADD KEY chat_messages_channel (channel, id)',
        );
        await q.query(
            'ALTER TABLE players_messages ADD CONSTRAINT chat_messages_player FOREIGN KEY (player_id) ' +
                'REFERENCES players (id) ON DELETE CASCADE',
        );
        await q.query('RENAME TABLE players_messages TO chat_messages');
        await q.query('DROP TABLE IF EXISTS types_channels');
    }
}
