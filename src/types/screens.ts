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
    /** Highlighted menu item. */
    index: number;
    touch: boolean;
    unlocked: number;
    total: number;
    wins: number;
    bestChain: number;
}

/** The menus shown as a screen of cards: the main menu, and Play's choice of modes. */
export type ModeMenu = 'main' | 'play';

/** What a menu of cards shows: which menu, the highlighted card, and whether the player is on a touchscreen. */
export interface ModeView {
    menu: ModeMenu;
    index: number;
    touch: boolean;
}

/** What the Characters screen shows: the fairy in view, which fairies are still locked, and the input device. */
export interface RosterView {
    index: number;
    locked: boolean[];
    touch: boolean;
    /** On a phone, whether the demo's pop-up is open (opened with the PREVIEW button). */
    demoOpen: boolean;
    /** What the live demo of the fairy in view is showing right now (see game/preview.ts). */
    caption: string;
}

/** What the Profile screen shows: this browser's record. */
export interface ProfileView {
    touch: boolean;
    wins: number;
    bestChain: number;
    fevers: number;
    flawless: number;
    locked: boolean[];
}

/** What a title-screen choice or a mode-menu card does when it's picked. */
export type TitleAction =
    | 'google'
    | 'guest'
    | 'play'
    | 'characters'
    | 'profile'
    | 'story'
    | 'cpu'
    | 'versus'
    | 'online'
    | 'settings'
    | 'guide';

/** What the map select screen shows: the chosen card (0 is Random, then each map in order). */
export interface MapSelectView {
    index: number;
    touch: boolean;
}
