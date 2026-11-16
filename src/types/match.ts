import type { Outgoing } from './game';

/** The modes a round can be played in. */
export type RoundMode = 'cpu' | 'versus' | 'endless' | 'online';

/** An attack on its way from one meadow to the other. */
export interface Transit {
    o: Outgoing;
    from: 0 | 1;
    t: number;
}
