import type { Fairy } from './characters';

/** A roster medallion's place on screen; also the tap target. */
export interface SelectCard {
    fairy: Fairy;
    locked: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** One player's side panel. */
export interface SelectSide {
    fairy: Fairy;
    locked: boolean;
    done: boolean;
    /** Corner badge: 1P, 2P, YOU, CPU, RIVAL. */
    tag: string;
    color: string;
    /** The CPU picks at random when the match starts, so its panel spins a roulette. */
    cpu?: boolean;
}

/** Everything the select screen needs to draw a frame. */
export interface SelectView {
    cards: SelectCard[];
    sides: [SelectSide, SelectSide];
    cursors: { index: number; color: string; tag: string; done: boolean }[];
    heading: string;
    /** Whole seconds left to choose, or null for no timer. */
    timer: number | null;
    hints: string[];
}

/** Everything the title screen needs to draw a frame. */
export interface TitleView {
    /** Which title screen: the opening one (sign in or play as a guest), or the mode menu. */
    stage: TitleStage;
    /** Highlighted menu item. */
    index: number;
    touch: boolean;
    unlocked: number;
    total: number;
    wins: number;
    bestChain: number;
}

/** The title's two screens: the opening one (sign in or play as a guest), then the mode menu. */
export type TitleStage = 'start' | 'modes';

/** What a title-menu entry does when it's picked. */
export type TitleAction = 'google' | 'guest' | 'story' | 'cpu' | 'versus' | 'online' | 'settings' | 'guide';
