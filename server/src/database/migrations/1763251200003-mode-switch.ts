import type { MigrationInterface, QueryRunner } from 'typeorm';

/** types_modes gets is_enabled like characters and maps, so a game mode can be switched off. */
export class ModeSwitch1763251200003 implements MigrationInterface {
    name = 'ModeSwitch1763251200003';

    /** Add the switch, on for every mode. */
    async up(q: QueryRunner): Promise<void> {
        await q.query('ALTER TABLE types_modes ADD COLUMN is_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER name');
    }

    /** Take it away. */
    async down(q: QueryRunner): Promise<void> {
        await q.query('ALTER TABLE types_modes DROP COLUMN is_enabled');
    }
}
