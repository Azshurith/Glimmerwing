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

/** The background music loops: a calm one for the menus and a driving one for rounds. */
export type MusicTrack = 'menu' | 'battle';
