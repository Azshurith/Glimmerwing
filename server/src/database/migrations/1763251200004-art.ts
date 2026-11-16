import type { MigrationInterface, QueryRunner } from 'typeorm';

const TABLE = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

/**
 * Art in the database. characters gets each fairy's spritesheet (the PNG) and its layout (cells, anchor, scale,
 * animations, as JSON); maps gets its monster sheet, cell size and overlay row; and monsters lists the monsters on
 * each map's sheet (kind, name, role in a formation and row). The server fills them from the game's own files at
 * start-up, where they're empty.
 */
export class Art1763251200004 implements MigrationInterface {
    name = 'Art1763251200004';

    /** Add the columns and the monsters table. */
    async up(q: QueryRunner): Promise<void> {
        await q.query(
            'ALTER TABLE characters ADD COLUMN sprite_sheet MEDIUMBLOB NULL AFTER name, ' +
                'ADD COLUMN sprite_atlas LONGTEXT NULL CHECK (JSON_VALID(sprite_atlas)) AFTER sprite_sheet',
        );
        await q.query(
            'ALTER TABLE maps ADD COLUMN monster_sheet MEDIUMBLOB NULL AFTER name, ' +
                'ADD COLUMN monster_cell SMALLINT UNSIGNED NULL AFTER monster_sheet, ' +
                'ADD COLUMN monster_overlay_row TINYINT UNSIGNED NULL AFTER monster_cell',
        );
        await q.query(`CREATE TABLE IF NOT EXISTS monsters (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            map_id INT UNSIGNED NOT NULL,
            code VARCHAR(16) NOT NULL,
            name VARCHAR(32) NOT NULL,
            role ENUM('plain', 'big', 'shelled', 'spinner') NOT NULL,
            sheet_row TINYINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            deleted_at DATETIME NULL,
            PRIMARY KEY (id),
            UNIQUE KEY monsters_map_code (map_id, code),
            CONSTRAINT monsters_map FOREIGN KEY (map_id) REFERENCES maps (id) ON UPDATE CASCADE ON DELETE CASCADE
        ) ${TABLE}`);
    }

    /** Take them away. */
    async down(q: QueryRunner): Promise<void> {
        await q.query('DROP TABLE IF EXISTS monsters');
        await q.query(
            'ALTER TABLE maps DROP COLUMN monster_sheet, DROP COLUMN monster_cell, DROP COLUMN monster_overlay_row',
        );
        await q.query('ALTER TABLE characters DROP COLUMN sprite_sheet, DROP COLUMN sprite_atlas');
    }
}
