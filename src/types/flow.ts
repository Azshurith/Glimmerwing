/** How the match is played: against the CPU, two players on one device, or online. */
export type Mode = 'cpu' | 'versus' | 'online';

/** Where the game is in its flow, from the title screen to the end of a match. */
export type Phase = 'title' | 'select' | 'countdown' | 'playing' | 'roundOver' | 'matchOver';
