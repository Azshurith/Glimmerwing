import forestSheet from '@/../assets/monsters/forest.png';
import { loadImage } from '@/core/images';
import type { MonsterSheet } from '@/types';

/**
 * Each map's monsters: the critters of a meadow are drawn as these instead of seed puffs.
 * Maps without a sheet keep the code-drawn puffs. Atlases are cut from the source sheets in
 * assets/source/ by tools/extract-monsters.py.
 */

/**
 * Forest (day): slimes and leaf sprites drift in formations, mushroom buddies are the shelled
 * ones (the cap takes the shell's hits), bees corkscrew down, and the big ones are tree spirits.
 */
const FOREST: MonsterSheet = {
    img: loadImage(forestSheet),
    cell: 112,
    rows: { slime: 0, mushroom: 1, bee: 2, leaf: 3, tree: 4 },
    overlay: 5,
    roster: ['slime', 'leaf'],
    big: 'tree',
    shelled: 'mushroom',
    spinner: 'bee',
};

/** Monster sheets by map id. */
const SHEETS: Record<string, MonsterSheet> = { forest: FOREST };

/** The monster sheet for a map, or undefined if its critters stay puffs. */
export function monstersFor(mapId: string): MonsterSheet | undefined {
    return SHEETS[mapId];
}
