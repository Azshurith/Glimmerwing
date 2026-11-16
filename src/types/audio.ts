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

/**
 * A moment a fairy speaks at: picked, a level-2 or level-3 (guardian) charge shot, Fever, hit, knocked out, the
 * match won, and a volley of fireballs shot back.
 */
export type VoiceEvent = 'pick' | 'charge' | 'summon' | 'fever' | 'hit' | 'death' | 'win' | 'reverse';

/** A fairy's spoken lines (clip URLs) for each moment; one is picked at random each time. */
export type FairyVoice = Partial<Record<VoiceEvent, string[]>>;
