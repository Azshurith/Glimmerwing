/** Saved stats and unlocked fairies. */
export interface Progress {
    wins: number;
    bestChain: number;
    fevers: number;
    flawless: number;
    unlocked: string[];
}

/** The player's settings, saved in this browser. */
export interface Settings {
    /**
     * On an upright phone, against the CPU: hide the rival's meadow and console so your meadow takes the whole
     * screen (taller, up to the top), with a slim bar for the round and the rival's hearts.
     */
    hideRival: boolean;
    /** The keyboard keys for each scheme (see input/keys.ts for the defaults). */
    keys: KeyBindings;
}

/** A gameplay action a key can be bound to. */
export type KeyAction = 'up' | 'down' | 'left' | 'right' | 'fire' | 'bloom' | 'auto';
/** Whose keys: one player alone, or player one and two sharing a keyboard. */
export type KeyScheme = 'solo' | 'p1' | 'p2';
/** For each scheme, the keys (KeyboardEvent codes, up to two) bound to each action. */
export type KeyBindings = Record<KeyScheme, Record<KeyAction, string[]>>;
