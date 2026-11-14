// The maps: each one is a look for the scenery behind the meadows (see render/scenery/), seen from above at an
// angle: either islands floating over the clouds (Forest) or solid ground seen through drifting haze, with big
// things standing on it (Cave, Desert, Castle). Each round's seed picks one (both meadows always share
// it); `?map=<id>` in the page's address forces one. A new map is a new entry here.
import type { MapTheme } from '@/types';

/** Every map. */
export const MAPS: MapTheme[] = [
    {
        id: 'forest',
        terrain: 'islands',
        name: 'Forest',
        sky: ['#2f7ce8', '#5cb0f6'],
        haze: '#8cc6f4',
        cloud: ['#ffffff', '#d8eaff', '#9cc0ee'],
        cloudAlpha: 1,
        ground: 'grass',
        top: ['#c6f27a', '#84d63e', '#56ad2e', '#2f7a28'],
        cliffStyle: 'bricks',
        cliff: ['#f6cc6a', '#dca444', '#b07a2c', '#7a4c22'],
        drips: ['#34307e', '#4c58b8', '#86b4f0'],
        water: ['#2b6cc0', '#4aa6ec', '#9ad8ff'],
        ink: '#23285c',
        leaves: ['#2c7a2a', '#5cbf36', '#b2ea5c'],
        trunk: '#8a5a2c',
        flower: ['#fff4c8', '#e8b43c'],
        roof: ['#f07a5a', '#d4503c', '#9c3430'],
        cone: ['#f8b25e', '#cc7036'],
        mote: '#fff4b0',
        veil: [0.42, 0.12],
        big: { tree: 1.5, cone: 0.12 },
        small: { flowers: 3, bush: 2, lupine: 1, rock: 0.6 },
        odds: { pond: 0.3, cottage: 0.14, path: 0.3, fence: 0.3, falls: 0.45 },
    },
    {
        id: 'cave',
        terrain: 'ground',
        name: 'Cave',
        sky: ['#0c0820', '#231a4a'],
        haze: '#2a2156',
        cloud: ['#5a4c94', '#3c3274', '#261e52'],
        cloudAlpha: 0.75,
        ground: 'rock',
        top: ['#8a82b0', '#5e5688', '#433c6c', '#2c2650'],
        cliffStyle: 'crag',
        cliff: ['#7c72a8', '#564c84', '#3a3262', '#221c40'],
        drips: ['#2a2448', '#4a4078', '#9ae8f0'],
        water: ['#0e6a7a', '#1eb4c4', '#9cfaf0'],
        ink: '#0e0a20',
        leaves: ['#1e5a52', '#2e8a76', '#6ad8b4'],
        trunk: '#4c3e5a',
        flower: ['#9cfaf0', '#ffffff'],
        roof: ['#a07ae0', '#7454c0', '#4c3490'],
        cone: ['#7ef0ff', '#3a9ad8'],
        mote: '#8cfaf0',
        veil: [0.35, 0.05],
        big: { crystal: 1.1, glowshroom: 0.8, cone: 0.4 },
        small: { rock: 2, glowshroom: 1.2, crystal: 1, bones: 0.3 },
        odds: { pond: 0.3, cottage: 0, path: 0, fence: 0, falls: 0.35 },
    },
    {
        id: 'desert',
        terrain: 'ground',
        name: 'Desert',
        sky: ['#e8945a', '#f6cf86'],
        haze: '#f4cf98',
        cloud: ['#ffe8dc', '#f8c4b4', '#e09a94'],
        cloudAlpha: 0.75,
        ground: 'sand',
        top: ['#fff0b4', '#f2d07a', '#d8ac5a', '#a87838'],
        cliffStyle: 'strata',
        cliff: ['#f4c890', '#d89a5c', '#b06a3c', '#7c4428'],
        drips: ['#a8683a', '#d0965c', '#f6d8a0'],
        water: ['#2a7ac0', '#40b0e8', '#a8e8ff'],
        ink: '#4a2618',
        leaves: ['#2e7a3a', '#56b048', '#a6dc64'],
        trunk: '#a8743c',
        flower: ['#ff7aa8', '#ffe066'],
        roof: ['#f0d8a8', '#d8b480', '#a8804c'],
        cone: ['#ffe0a0', '#d8a050'],
        mote: '#fff0c8',
        veil: [0.4, 0.12],
        big: { palm: 2.4, cactus: 0.5, cone: 0.3 },
        small: { rock: 1.2, cactus: 0.6, bones: 0.5, palm: 0.6 },
        odds: { pond: 0.18, cottage: 0, path: 0, fence: 0, falls: 0.12 },
    },
    {
        id: 'castle',
        terrain: 'ground',
        name: 'Castle',
        sky: ['#3a2a72', '#c4708e'],
        haze: '#8a6ab0',
        cloud: ['#ffd6e8', '#d8a8d0', '#8c6aa8'],
        cloudAlpha: 0.9,
        ground: 'tiles',
        top: ['#e2dcef', '#bcb4d4', '#9890b8', '#5e567e'],
        cliffStyle: 'wall',
        cliff: ['#c8c0dc', '#a29ac0', '#7a729c', '#4a4470'],
        drips: ['#2c5a3a', '#4a8a4a', '#86c46a'],
        water: ['#2a4a9c', '#4a7ad8', '#a8c4ff'],
        ink: '#1e1838',
        leaves: ['#24603a', '#3c8c48', '#7cc464'],
        trunk: '#6a4a3a',
        flower: ['#ff8ab4', '#ffe066'],
        roof: ['#5a7ae0', '#3a4ec0', '#24308a'],
        cone: ['#e8e0f4', '#a89cc8'],
        mote: '#ffb86a',
        veil: [0.4, 0.1],
        big: { tower: 1.4, tree: 0.9, torch: 0.4 },
        small: { torch: 1, bush: 1.2, flowers: 0.8, rock: 0.4 },
        odds: { pond: 0.15, cottage: 0, path: 0.5, fence: 0, falls: 0.25 },
    },
];

/** The map with id `id`, or null if there's none. */
export function mapById(id: string | null | undefined): MapTheme | null {
    return MAPS.find(m => m.id === id) ?? null;
}

/** The map a round with seed `seed` plays on (the same on both sides, online too). */
export function mapForSeed(seed: number): MapTheme {
    let h = Math.imul(seed ^ 0x5bd1e995, 0x27d4eb2f);
    h ^= h >>> 15;
    return MAPS[(h >>> 0) % MAPS.length];
}
