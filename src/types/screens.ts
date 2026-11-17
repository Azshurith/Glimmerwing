import type { EndlessRank, LeaderEntry } from './account';
import type { MatchStats } from './replay';
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
    /** A solo run (Endless): no rival's panel, and the emblem names the mode with this line under it. */
    solo?: { title: string; line: string };
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

/** Where the lobby's keyboard cursor is: on the mode picker, or along the bar of screens at the bottom. */
export type LobbyFocus = 'mode' | 'nav';

/** One mode on the lobby's mode picker. */
export interface LobbyMode {
    action: TitleAction;
    label: string;
    sub: string;
    color: string;
    /** Can't be started (coming soon, or switched off on the server), and the word on its ribbon. */
    off: boolean;
    ribbon: string;
}

/** What the lobby (the main menu) shows. */
export interface LobbyView {
    touch: boolean;
    /** The player: name, avatar (a fairy's id) and frame, wins, trophies, and whether the server is reached. */
    name: string;
    fairy: string;
    frame: string;
    wins: number;
    trophies: number;
    online: boolean;
    /** Stages open on the trophy road, of all of them; and the next one, with the trophies toward it. */
    stages: [number, number];
    next: { map: string; name: string; have: number; need: number } | null;
    /** The mode on the picker, and where the cursor is. */
    mode: LobbyMode;
    focus: LobbyFocus;
    nav: number;
    /** The stage behind it all (a map id), and its name. */
    map: string;
    mapName: string;
    /** The latest World chat lines for the ticker, and whether the chat panel is open. */
    chat: { name: string; body: string }[];
    chatOpen: boolean;
    /** On a phone, whether the friends panel is pulled out. */
    friendsOpen: boolean;
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
    trophies: number;
    bestTrophies: number;
    /** The longest Endless run, in seconds. */
    endlessBest: number;
    /** The player's name (a guest's, until sign-in exists). */
    name: string;
    /** Whether saves are reaching the game server (else they stay in this browser). */
    synced: boolean;
    /** Where the player's best Endless run ranks among everyone's, if known. */
    rank: EndlessRank | null;
    /** The best Endless runs of all, best first, and which of them is the player's (by account id). */
    leaders: LeaderEntry[];
    me: number | null;
    /** Which tab is showing, and the match history: its rows, cursor, first row in view and a line in their place. */
    tab: ProfileTab;
    history: HistoryRow[];
    index: number;
    start: number;
    message: string;
}

/** Which half of the Profile screen is showing: the record and unlocks, or the match history. */
export type ProfileTab = 'record' | 'history';

/** One game in Profile's match history. */
export interface HistoryRow {
    /** The mode, on a coloured tag: VS CPU, 2 PLAYERS, ONLINE or ENDLESS. */
    tag: string;
    color: string;
    /** Who flew (e.g. "Stella vs Clove"). */
    title: string;
    /** The result on the right: WIN 2-1, LOSS 1-2, or an Endless run's time. */
    result: string;
    resultColor: string;
    /** The map, the length and the trophies won or lost. */
    detail: string;
    /** When it was played. */
    when: string;
    /** Kept only in this browser (not yet saved to the server). */
    local: boolean;
}

/** The match details screen's tabs: the result, the players' numbers side by side, and graphs over time. */
export type MatchTab = 'overview' | 'scoreboard' | 'graphs';

/** What the match details screen shows: one game from the history, in full, with its replay to watch. */
export interface MatchInfoView {
    touch: boolean;
    tab: MatchTab;
    /** Which graph is showing (see GRAPHS in match-screen.ts). */
    graph: number;
    /**
     * The match's numbers from its replay, the player's side first (null until worked out, or without a replay),
     * and a line in their place meanwhile.
     */
    stats: MatchStats | null;
    statsNote: string;
    /** The two sides' fairy names and what to call them (YOU and RIVAL, CPU or THE STORM). */
    names: [string, string];
    labels: [string, string];
    tag: string;
    color: string;
    /** VICTORY, DEFEAT or RUN OVER, and the line under it (when it was played). */
    banner: string;
    won: boolean;
    when: string;
    /** The player's fairy and the rival's (null in Endless), by id. */
    fairy: string;
    rival: string | null;
    /** The rounds (e.g. "2 - 1"), or an Endless run's time, and the line under it. */
    score: string;
    scoreLabel: string;
    /** The overview's numbers, as tiles. */
    tiles: [label: string, value: string][];
    /** Whether there's a replay to watch, its share link (empty without one) and a short note. */
    hasReplay: boolean;
    link: string;
    note: string;
}

/** What a title-screen choice or a mode-menu card does when it's picked. */
export type TitleAction =
    | 'google'
    | 'guest'
    | 'play'
    | 'characters'
    | 'profile'
    | 'maps'
    | 'story'
    | 'endless'
    | 'cpu'
    | 'versus'
    | 'online'
    | 'settings'
    | 'guide';

/** What the Maps screen shows: the map in view, which are locked, your trophies and the demo's caption. */
export interface MapsView {
    index: number;
    locked: boolean[];
    trophies: number;
    touch: boolean;
    /** What the live demo is showing: the formation now flying (see game/map-preview.ts). */
    caption: string;
}

/** What the map select screen shows: the chosen card (0 is Random, then each map in order). */
export interface MapSelectView {
    index: number;
    touch: boolean;
    /** The player's trophies, shown in the heading. */
    trophies: number;
    /** Per map (in MAPS order), whether its stage is still locked. */
    locked: boolean[];
}
