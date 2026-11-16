/** Every sound effect the game can play. */
export type Sfx =
    | 'shot'
    | 'pop'
    | 'send'
    | 'charge'
    | 'release'
    | 'extra'
    | 'boss'
    | 'reverse'
    | 'hurt'
    | 'stun'
    | 'heal'
    | 'bomb'
    | 'fever'
    | 'shatter'
    | 'bossIn'
    | 'banish'
    | 'reel'
    | 'clash'
    | 'crow'
    | 'death'
    | 'tick'
    | 'ok'
    | 'start'
    | 'win'
    | 'lose';

/**
 * The background music: the menus', the fairy and map select screens' (`select`), a round's synthesised loop
 * (`battle`) or a map's own recorded track (`map:<id>`); see data/music.ts.
 */
export type MusicTrack = 'menu' | 'select' | 'battle' | `map:${string}`;
