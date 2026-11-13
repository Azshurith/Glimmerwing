/** How the match is played: against the CPU, two players on one device, or online. */
export type Mode = 'cpu' | 'versus' | 'online';

/** How the screen is laid out: both meadows side by side, or tall for a portrait screen. */
export type Layout = 'wide' | 'tall';

/** Where a meadow is drawn in the view, and at what scale. */
export interface Placement {
    x: number;
    y: number;
    s: number;
}

/** Where the game is in its flow, from the title screen to the end of a match. */
export type Phase = 'title' | 'modes' | 'select' | 'countdown' | 'playing' | 'roundOver' | 'matchOver';
