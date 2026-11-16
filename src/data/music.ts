// Recorded music: the menus' track, and maps that have a track of their own (any other map plays the synthesised
// battle loop).
// Tracks are inlined as data URLs by esbuild (see build.mjs), so the game stays a single page. The originals are
// kept under assets/source/music/; the copies here are trimmed to loop and re-encoded smaller (112 kb/s).
import castleTrack from '@/../assets/music/castle.mp3';
import caveTrack from '@/../assets/music/cave.mp3';
import desertTrack from '@/../assets/music/desert.mp3';
import forestTrack from '@/../assets/music/forest.mp3';
import menuTrack from '@/../assets/music/menu.mp3';
import selectTrack from '@/../assets/music/select.mp3';

/** The menus' music ("Chant Royal"), played in place of the synthesised menu loop. */
export const MENU_MUSIC: string | undefined = menuTrack;
/** The fairy and map select screens' music ("Nimble Violin Adventure"); without it they'd keep the menus' music. */
export const SELECT_MUSIC: string | undefined = selectTrack;

/** Each map's own round music, by map id. */
export const MAP_MUSIC: Partial<Record<string, string>> = {
    forest: forestTrack,
    cave: caveTrack,
    desert: desertTrack,
    castle: castleTrack,
};

/** The music a round on `mapId` plays: its own track if it has one, otherwise the battle loop. */
export const roundMusic = (mapId: string): 'battle' | `map:${string}` => (MAP_MUSIC[mapId] ? `map:${mapId}` : 'battle');
