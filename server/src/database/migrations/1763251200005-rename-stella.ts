import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Pip is called Stella now (her code stays 'pip', so records, replays and keys still find her). */
export class RenameStella1763251200005 implements MigrationInterface {
    name = 'RenameStella1763251200005';

    /** Rename her, unless her name has been changed in the database already. */
    async up(q: QueryRunner): Promise<void> {
        await q.query("UPDATE characters SET name = 'Stella' WHERE code = 'pip' AND name = 'Pip'");
    }

    /** Back to Pip. */
    async down(q: QueryRunner): Promise<void> {
        await q.query("UPDATE characters SET name = 'Pip' WHERE code = 'pip' AND name = 'Stella'");
    }
}
