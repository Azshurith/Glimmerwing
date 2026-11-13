import type { Formation } from './waves';

/** One player's controls for a frame. */
export interface Controls {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    fire: boolean;
    /** Petal bloom: the panic button (B). */
    bloom?: boolean;
    /** Autofire (C): rapid plain shots while held. Holding fire (A) instead charges. */
    auto?: boolean;
    /** Optional absolute target (touch input), in field coordinates. */
    target?: { x: number; y: number } | null;
}

/** The fairy in play: position, health, timers and charge. */
export interface Player {
    x: number;
    y: number;
    /** Life in half-hearts (MAX_HULL = 10 is five hearts). */
    hull: number;
    invuln: number;
    /** Seconds left stunned (frozen) after running into a critter. */
    stun: number;
    /** Seconds left slowed and weakened after a stun. */
    impair: number;
    /** Seconds left in which critters pass through harmlessly. */
    zakoGrace: number;
    /** Last input pattern while stunned, to count mashing, and how long this stun has lasted. */
    mash: number;
    stunAge: number;
    cooldown: number;
    hold: number;
    charge: number;
    /** Charge shown as a ring past level 1: 0 at level 1, 0.5 at level 2, 1 at level 3. */
    over: number;
    wasFiring: boolean;
    wasBlooming: boolean;
    blooms: number;
}

/** A shot fired by the fairy. */
export interface Shot {
    x: number;
    y: number;
    vx: number;
    charged: boolean;
    dead: boolean;
    /** A charged shot that has made its first hit ploughs on through the rest. */
    popped?: boolean;
    /** Charged shots differ by fairy: hit radius, speed (x SHOT_SPEED), damage, range in seconds, look. */
    r?: number;
    sp?: number;
    dmg?: number;
    life?: number;
    style?: ChargeStyle;
}

/** Each fairy's charge shot. */
export type ChargeStyle = 'orb' | 'thorn' | 'needles' | 'twin' | 'flare' | 'crescent';

/**
 * Each fairy's bomb (petal bloom). Every bomb makes her briefly untouchable
 * and clears hazards, but how it sweeps the meadow, how long it takes and
 * how long she's safe differ, as in Twinkle Star Sprites:
 *   dash    a streak across her row leaving a wake, then a full-field flash
 *   blast   a huge explosion from her that also slows her meadow down
 *   vortex  a frost storm that spirals out from the centre
 *   fan     a cone of petals straight ahead: partial, but the longest safety
 *   beam    a lance that sweeps from left to right over everything above her
 *   hole    a black hole that drags hazards in, then bursts in lightning
 */
export type BombStyle = 'dash' | 'blast' | 'vortex' | 'fan' | 'beam' | 'hole';
/** A fairy's bomb: how it looks and how it sweeps the meadow. */
export interface Bomb {
    name: string;
    color: string;
    shape: 'petal' | 'leaf' | 'shard' | 'heart' | 'ember' | 'moon';
    style: BombStyle;
    /** Seconds the sweep takes. */
    time: number;
    /** Seconds she's untouchable. */
    invuln: number;
}

/** What a critter is: a plain puff, a shelled beetle or a spinner. */
export type CritterKind = 'puff' | 'beetle' | 'spinner';

/** A critter in a wave, popped to start and grow chains. */
export interface Puff {
    kind: CritterKind;
    /** Which formation it came in with (0 for Fever rushes, which never hold up the next wave). */
    wave?: number;
    /** Hits left on a beetle's shell. Shots and bursts break the shell before the body. */
    shell: number;
    maxHp: number;
    baseX: number;
    /** 1 for normal critters, larger for big ones. */
    size: number;
    /** The formation it flies with and its place in it (Fever rushes have none and just drift). */
    form?: { g: Formation; i: number };
    x: number;
    y: number;
    vx: number;
    vy: number;
    phase: number;
    dead: boolean;
    /** Shots needed to pop it (1 to 3). Any pollen burst pops it outright. */
    hp: number;
    /** A moonseed: shots bounce off it; only a pollen burst can break it. */
    moonseed?: boolean;
}

/** A growing ring from a popped critter; it pops what it touches into the same chain. */
export interface Burst {
    x: number;
    y: number;
    maxR: number;
    age: number;
    chainId: number;
    /** Things this burst has already damaged, so it hits each only once. */
    hits: Set<object>;
}

/** What a rival's attack is. */
export type AttackKind = 'star' | 'bramble' | 'comet' | 'imp';

/** An attack sent from the rival's meadow. */
export interface Attack {
    x: number;
    y: number;
    vx: number;
    vy: number;
    kind: AttackKind;
    level: number;
    hp: number;
    spin: number;
    dead: boolean;
    /**
     * How it flies. A Normal fireball (kind 'star') is a 'drop': it comes in along the top border from the
     * sender's side and comes down diagonally at where the fairy was, on a line it keeps to. Shot down it becomes 'back', starting its curve across the
     * screen, and arrives in the sender's meadow as a 'cross' Reverse finishing that curve.
     * Extra Attack critters use their sender's flight ('seeker', 'zig' and the rest).
     */
    flight: StarFlight;
    /** Seconds a seeker still spends lining up, or a star still hangs at the top, before it moves off. */
    seekT: number;
    /** Plunge speed a seeker switches to once it's lined up; a star's top speed. */
    plunge: number;
    /** Extra Attack critters wear the sender's colour and look. */
    color?: string;
    look?: string;
    /** Flight timer for critters that need a second clock; a falling fireball keeps its current speed here. */
    t?: number;
    /** A fireball's size, 1 (small) to 4 (extra large): set by the combo hit that sent it; it takes size + 1 hits. */
    size?: number;
    /** Whose fireball it is: orange for player 1, purple for player 2. */
    tint?: Tint;
    /** Sent during Fever: flashes yellow. */
    fever?: boolean;
    /**
     * `speed` is a fireball's Normal speed, `flash` the seconds left of its breaking flash, and `tail` a
     * Reverse's recent positions (x, y pairs), drawn as a glowing trail.
     */
    speed?: number;
    flash?: number;
    tail?: number[];
    /** Times this fireball has been shot back (0 for a Normal, 1 for a Reverse...): each one speeds it up. */
    reflects?: number;
    /**
     * A Normal fireball's heading in the receiver's meadow (a unit vector; straight down if unset), and for one
     * that came in sliding along the top, the x where it turns straight down.
     */
    ux?: number;
    uy?: number;
    turnX?: number;
    /** Seconds a fireball still stalls after a shot that didn't break it, and its hit flash. */
    stall?: number;
    hitT?: number;
    /** A Reverse's path across the screen (see fireball-path.ts), and how far along it is (0 to 1). */
    curve?: Curve;
    k?: number;
}

/**
 * A Reverse fireball's path in meadow units, in straight legs: from (x0, y0) to the corner at (cx, cy), on to
 * (tx, ty) if it has a second corner, then to (x1, y1) and on. Points past the meadow's walls lie in the space between the meadows or in the rival's
 * meadow beside it.
 */
export interface Curve {
    x0: number;
    y0: number;
    cx: number;
    cy: number;
    /** A second corner between the first and the target, for a Reverse taking the straight route. */
    tx?: number;
    ty?: number;
    x1: number;
    y1: number;
}

/** Which player a fireball belongs to: 'p1' (orange) or 'p2' (purple). */
export type Tint = 'p1' | 'p2';

/** How an attack star or critter moves after it arrives. */
export type StarFlight =
    | 'drop'
    | 'seeker'
    | 'slant'
    | 'zig'
    | 'homing'
    | 'lateral'
    | 'bounce'
    | 'bat'
    /** A Reverse coming across from the rival's meadow along its curve, onto where the fairy was. */
    | 'cross'
    /** A fireball you shot down, bouncing off the top line toward your rival as a Reverse fireball (harmless here). */
    | 'back';

/** A fairy's Extra Attack: a few small critters sent with a level 2 charge. */
export interface Extra {
    name: string;
    count: 2 | 3 | 4;
    /**
     * drop: straight down. seeker: line up over the fairy, then plunge.
     * slant: diagonals off the walls. zig: right-angle turns.
     * homing: steers after the fairy for a while.
     * lateral: enters from a side, streaks across and bursts into a ring of sparks (Load Ran's Rabi Bomb).
     * bounce: hops slowly down the meadow, off the walls (Nanja Monja's furballs).
     * bat: weaves down, then locks on to where the fairy is and dives (Mevious's bats).
     */
    flight: StarFlight;
    /** How the critter looks. */
    look: 'spark' | 'burr' | 'glimmer' | 'dart' | 'cinder' | 'moth';
}

/** A guardian's attack pattern. */
export type GuardianPattern = 'aimed' | 'ring' | 'rapid' | 'rain' | 'spiral' | 'sweep';

/** A fairy's guardian: the boss it sends into the rival's meadow. */
export interface Guardian {
    name: string;
    color: string;
    /** Signature attack. */
    pattern: GuardianPattern;
    /** Its repertoire (signature first): each attack cycle picks one at random. */
    patterns: GuardianPattern[];
}

/** A guardian in this meadow: health, timers and which phase it is in. */
export interface Moth {
    x: number;
    y: number;
    hp: number;
    t: number;
    fireT: number;
    dead: boolean;
    guardian: Guardian;
    wing: string;
    angle: number;
    /** enter: rushes in. wander: circles. attack: locks in place and fires. exit: drifts off a side. */
    stage: 'enter' | 'wander' | 'attack' | 'exit';
    stageT: number;
    /** Which way it circles while wandering (+1 or -1), picked at random. */
    dir: number;
    /** Damage taken this wander; at GUARDIAN_STUN_DMG it reels. */
    hurt: number;
    /** Seconds of reeling left: untouchable, and the wander clock waits. */
    stun: number;
    /** Sideways drift while exiting; shots nudge it. */
    vx: number;
    /** Summoned by a reverse chain: skips the wander and attacks straight away. */
    rush: boolean;
    /** The attack it's running now, time left in this cycle, and cycles left before it leaves. */
    pattern: GuardianPattern;
    cycleT: number;
    cyclesLeft: number;
    /** Attack-phase swoop: seconds into the current swoop (-1 when not swooping), and the wait until the next. */
    swoop: number;
    swoopIn: number;
    /** Where it returns to after a swoop, and where it swoops to. */
    postX: number;
    postY: number;
    toX: number;
    toY: number;
}

/**
 * The Hollow Crow: a hunter that turns up when a round drags on. Driven off, it crosses to the other meadow and comes
 * back faster.
 */
export interface Crow {
    x: number;
    y: number;
    vx: number;
    vy: number;
    state: 'circle' | 'dive' | 'climb' | 'leave';
    /** Starts at 1 and rises each time it's driven off: faster, quicker to return. */
    level: number;
    /** Seconds left before it crosses to the other meadow. */
    stay: number;
    t: number;
    seed: number;
    hp: number;
    speed: number;
}

/** A bullet fired by a guardian or the crow. */
export interface Bullet {
    x: number;
    y: number;
    vx: number;
    vy: number;
    dead: boolean;
}

/** A spark of visual effect. */
export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    max: number;
    size: number;
    color: string;
}

/** A short text label floating up from where something happened. */
export interface Popup {
    x: number;
    y: number;
    text: string;
    age: number;
}

/** Something one field sends to the other. */
export interface Outgoing {
    /** clash: two bosses cancelled each other; remove the one I sent you. */
    /** heal: the rival got hit; recover `level` half-hearts. */
    kind: AttackKind | 'moth' | 'crow' | 'clash' | 'heal';
    /** For a crow: seconds before it appears after arriving. */
    delay?: number;
    /** For a guardian or Extra Attack: which fairy sent it. */
    fairy?: string;
    /** For a guardian: a direct rush that skips the wander phase. */
    rush?: boolean;
    level: number;
    fromX: number;
    fromY: number;
    /**
     * A Reverse crossing the screen: its curve in the sender's meadow units, how far along it was when it
     * left the sender's meadow, which way the receiver's meadow lies from the sender's (also set on a Normal
     * fireball, for its route), and its speed.
     */
    curve?: Curve;
    k?: number;
    side?: number;
    speed?: number;
    /** A Normal fireball's route (normalRoute): what it flies on the sender's side, and how it comes in. */
    route?: Point[];
    enter?: RouteEntry;
    /** A Normal fireball comes in this far from the receiving fairy's x (0 for the first of a volley). */
    aim?: number;
    /** Seconds it waits before setting off between the meadows, so a volley comes down staggered. */
    stagger?: number;
    /** For a fireball: times it has been shot back, and the speed boost from its sender's Perfects. */
    reflects?: number;
    boost?: number;
    /** For a fireball: its size (1 to 4), whose it is, and whether it was sent during Fever. */
    size?: number;
    tint?: Tint;
    fever?: boolean;
    /** For a Fever fireball: its speed as a share of normal, set when it's sent (feverSpeedAt). */
    pace?: number;
}

/** Where a player's fairy is now, so a drag can move her relative to it. */
export interface Pos {
    x: number;
    y: number;
}

/** A point in meadow units. */
export interface Point {
    x: number;
    y: number;
}

/** Where a Normal fireball comes into the rival's meadow, which way it's heading, and where it turns down. */
export interface RouteEntry {
    x: number;
    y: number;
    ux: number;
    uy: number;
    turnX?: number;
}

/** A Normal fireball's route: the part on the sender's side, and how it comes into the rival's meadow. */
export interface NormalRoute {
    points: Point[];
    enter: RouteEntry;
}
