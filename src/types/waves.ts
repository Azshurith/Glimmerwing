import type { CritterKind } from './game';

/** The shape a formation holds once it's in place. */
export type FormationShape = 'line' | 'column' | 'diagonal' | 'v' | 'chevron' | 'arc' | 'ring' | 'grid' | 'wave';

/**
 * How a formation comes in from outside the meadow: dropping in from above, swooping in from a top
 * corner (or both corners at once), gliding in from a side, or looping round from a far corner.
 */
export type FormationEntry = 'drop' | 'swoopLeft' | 'swoopRight' | 'split' | 'sideLeft' | 'sideRight' | 'loop';

/** How a formation leaves when its time is up. */
export type FormationExit = 'up' | 'sides' | 'left' | 'right' | 'dive' | 'scatter';

/** How a formation moves as a group while it holds its place. */
export type FormationMove = 'sway' | 'bob' | 'figure8' | 'orbit' | 'march' | 'creep';

/** A point in meadow units. */
export interface Vec {
    x: number;
    y: number;
}

/**
 * One formation, rolled from the shared seed so both meadows get the same sequence. Every length is
 * in meadow units (the meadow is FIELD_W by FIELD_H whatever the screen), so it scales with the view.
 */
export interface FormationSpec {
    shape: FormationShape;
    /** The shape it re-forms into partway through its hold, if any. */
    morph: FormationShape | null;
    entry: FormationEntry;
    exit: FormationExit;
    move: FormationMove;
    kind: CritterKind;
    count: number;
    /** Shots needed for each member. */
    hp: number[];
    /** Big critters: larger, tougher, wider bursts. */
    big: boolean;
    /** Wrapped in dew bubbles that must pop first. */
    bubble: boolean;
    /** Gap between neighbouring slots. */
    spacing: number;
    /** Where the formation settles: the centre of its shape. */
    cx: number;
    cy: number;
    /** Seconds between members setting off on the way in, and on the way out. */
    stagger: number;
    exitStagger: number;
    /** Seconds each member takes to fly in, and to fly out. */
    enterTime: number;
    exitTime: number;
    /** Seconds it holds its place once the last member is in. */
    hold: number;
    /** How far the group may move, as reach to the left/right and up/down (already kept inside the meadow). */
    reachX: number;
    reachY: number;
    /** The next formation starts coming in as this one leaves. */
    overlap: boolean;
}

/** A formation in play. Its members are critters whose `form` points back here. */
export interface Formation {
    id: number;
    spec: FormationSpec;
    /** Seconds since its first member set off. */
    t: number;
    /** Slots relative to the centre, for its shape and for the shape it morphs into. */
    slots: Vec[];
    slotsTo: Vec[] | null;
    /** Formation time at which the hold ends and the members start leaving. */
    exitAt: number;
    /** For Perfects: members popped, the chain that popped them (-1 once more than one has), any flown out. */
    popped?: number;
    chain?: number;
    escaped?: boolean;
}
