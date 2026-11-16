// Recorded music for maps that have a track of their own; any other map plays the synthesised battle loop.
// Tracks are inlined as data URLs by esbuild (see build.mjs), so the game stays a single page. The originals are
// kept under assets/source/music/; the copies here are trimmed to loop and re-encoded smaller (112 kb/s).
import caveTrack from '@/../assets/music/cave.mp3';
import forestTrack from '@/../assets/music/forest.mp3';

/** Each map's own round music, by map id. */
export const MAP_MUSIC: Partial<Record<string, string>> = {
    forest: forestTrack,
    cave: caveTrack,
};

/** The music a round on `mapId` plays: its own track if it has one, otherwise the battle loop. */
export const roundMusic = (mapId: string): 'battle' | `map:${string}` => (MAP_MUSIC[mapId] ? `map:${mapId}` : 'battle');
