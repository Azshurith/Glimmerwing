// The art the database starts with: the game's own files (assets/, beside dist/). A fairy or map whose sheet is
// still empty gets the bundled one, and every monster on a bundled sheet gets a row; anything already there is
// left alone, so art changed in the database stays. (Emptying a sheet puts the bundled one back at the next start.)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FAIRIES } from '@/data/characters';
import { MAPS } from '@/data/maps';
import { bundledMonsters } from '@/data/monsters';
import type { MonsterKind, MonsterRole, SpriteAtlas } from '@/types';

/** The game's assets folder. */
const ASSETS = join(__dirname, '..', 'assets');

/** Something that runs SQL: a DataSource, or a migration's QueryRunner. */
interface Runs {
    query(sql: string, args?: unknown[]): Promise<unknown>;
}

/** A bundled file's bytes, or null when it isn't there. */
function file(...path: string[]): Buffer | null {
    const p = join(ASSETS, ...path);
    return existsSync(p) ? readFileSync(p) : null;
}

/** Fill empty sheets and missing monsters from the game's own files. */
export async function seedArt(db: Runs): Promise<void> {
    for (const f of FAIRIES) {
        const s = f.sprite;
        const png = s?.file ? file(s.file) : null;
        if (!s || !png) continue;
        const atlas: SpriteAtlas = {
            cw: s.cw,
            ch: s.ch,
            bodyX: s.bodyX,
            bodyY: s.bodyY,
            scale: s.scale,
            anims: s.anims,
        };
        await db.query(
            'UPDATE characters SET sprite_sheet = ?, sprite_atlas = ? WHERE code = ? AND sprite_sheet IS NULL',
            [png, JSON.stringify(atlas), f.id],
        );
    }
    for (const m of MAPS) {
        const sheet = bundledMonsters(m.id);
        const png = sheet ? file('monsters', `${m.id}.png`) : null;
        if (!sheet || !png) continue;
        await db.query(
            'UPDATE maps SET monster_sheet = ?, monster_cell = ?, monster_overlay_row = ? ' +
                'WHERE code = ? AND monster_sheet IS NULL',
            [png, sheet.cell, sheet.overlay, m.id],
        );
        /** What a kind plays in a formation on this map, or null for one the sheet holds but never uses. */
        const role = (k: MonsterKind): MonsterRole | null =>
            k === sheet.big
                ? 'big'
                : k === sheet.shelled
                  ? 'shelled'
                  : k === sheet.spinner
                    ? 'spinner'
                    : sheet.roster.includes(k)
                      ? 'plain'
                      : null;
        for (const [kind, row] of Object.entries(sheet.rows) as [MonsterKind, number][]) {
            const r = role(kind);
            if (!r) continue;
            await db.query(
                'INSERT IGNORE INTO monsters (map_id, code, name, role, sheet_row) SELECT id, ?, ?, ?, ? FROM maps WHERE code = ?',
                [kind, sheet.names[kind] ?? kind, r, row, m.id],
            );
        }
    }
}
