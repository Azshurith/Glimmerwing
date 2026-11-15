import beachSheet from '@/../assets/monsters/beach.png';
import castleSheet from '@/../assets/monsters/castle.png';
import caveSheet from '@/../assets/monsters/cave.png';
import desertSheet from '@/../assets/monsters/desert.png';
import forestSheet from '@/../assets/monsters/forest.png';
import volcanoSheet from '@/../assets/monsters/volcano.png';
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

/**
 * Cave (twilight): cave slimes and wisps drift in formations, crystal bugs are the shelled ones
 * (their crystals take the shell's hits), bats corkscrew down, and the big ones are cave mushrooms.
 */
const CAVE: MonsterSheet = {
    img: loadImage(caveSheet),
    cell: 112,
    rows: { slime: 0, bat: 1, bug: 2, mushroom: 3, wisp: 4 },
    overlay: 5,
    roster: ['slime', 'wisp'],
    big: 'mushroom',
    shelled: 'bug',
    spinner: 'bat',
};

/**
 * Desert (day): sand slimes and sand foxes drift in formations, desert beetles are the shelled ones
 * (their horned shells take the hits), scorpions corkscrew down, and the big ones are cactus buds.
 */
const DESERT: MonsterSheet = {
    img: loadImage(desertSheet),
    cell: 112,
    rows: { slime: 0, cactus: 1, scorpion: 2, fox: 3, beetle: 4 },
    overlay: 5,
    roster: ['slime', 'fox'],
    big: 'cactus',
    shelled: 'beetle',
    spinner: 'scorpion',
};

/**
 * Castle: crown slimes and will-o'-wisps drift in formations, castle knights are the shelled ones
 * (their armour takes the shell's hits), bats corkscrew down, and the big ones are magic books.
 */
const CASTLE: MonsterSheet = {
    img: loadImage(castleSheet),
    cell: 112,
    rows: { slime: 0, knight: 1, bat: 2, wisp: 3, book: 4 },
    overlay: 5,
    roster: ['slime', 'wisp'],
    big: 'book',
    shelled: 'knight',
    spinner: 'bat',
};

/**
 * Beach: sea slimes and starfish drift in formations, pearl clams are the shelled ones (their shells take
 * the hits), seagulls wheel down, and the big ones are beach crabs.
 */
const BEACH: MonsterSheet = {
    img: loadImage(beachSheet),
    cell: 112,
    rows: { slime: 0, crab: 1, clam: 2, starfish: 3, gull: 4 },
    overlay: 5,
    roster: ['slime', 'starfish'],
    big: 'crab',
    shelled: 'clam',
    spinner: 'gull',
};

/**
 * Volcano: lava slimes and flame wisps drift in formations, lava crabs are the shelled ones (their rocky backs
 * take the hits), fire bats wheel down, and the big ones are magma golems.
 */
const VOLCANO: MonsterSheet = {
    img: loadImage(volcanoSheet),
    cell: 112,
    rows: { slime: 0, golem: 1, bat: 2, wisp: 3, crab: 4 },
    overlay: 5,
    roster: ['slime', 'wisp'],
    big: 'golem',
    shelled: 'crab',
    spinner: 'bat',
};

/** Monster sheets by map id. */
const SHEETS: Record<string, MonsterSheet> = {
    forest: FOREST,
    cave: CAVE,
    desert: DESERT,
    castle: CASTLE,
    beach: BEACH,
    volcano: VOLCANO,
};

/** The monster sheet for a map, or undefined if its critters stay puffs. */
export function monstersFor(mapId: string): MonsterSheet | undefined {
    return SHEETS[mapId];
}
