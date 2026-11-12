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

export type CritterKind = 'puff' | 'beetle' | 'spinner';

export interface Puff {
  kind: CritterKind;
  /** Which formation it came in with (0 for Fever rushes, which never hold up the next wave). */
  wave?: number;
  /** Hits left on a beetle's shell. Shots and bursts break the shell before the body. */
  shell: number;
  maxHp: number;
  baseX: number;
  /** Formation flight path, for waves that sweep, swoop or drop in columns. */
  /** 1 for normal critters, larger for big ones. */
  size: number;
  path?: { type: 'swoop' | 'sweep' | 'column' | 'rise'; t: number; delay: number; dir: number; ox: number; oy: number };
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

export interface Burst {
  x: number;
  y: number;
  maxR: number;
  age: number;
  chainId: number;
  /** Things this burst has already damaged, so it hits each only once. */
  hits: Set<object>;
}

export type AttackKind = 'star' | 'bramble' | 'comet' | 'imp';

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
   * How a star flies: 'drop' falls straight down, 'seeker' slides across the
   * top to line up with the fairy and then plunges, 'slant' cuts a diagonal
   * and glances off the walls.
   */
  flight: StarFlight;
  /** Seconds a seeker still spends lining up before it plunges. */
  seekT: number;
  /** Plunge speed a seeker switches to once it's lined up. */
  plunge: number;
  /** Extra Attack critters wear the sender's colour and look. */
  color?: string;
  look?: string;
  /** Flight timer for critters that need a second clock. */
  t?: number;
}

export type StarFlight = 'drop' | 'seeker' | 'slant' | 'zig' | 'homing' | 'lateral' | 'bounce' | 'bat';

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

export type GuardianPattern = 'aimed' | 'ring' | 'rapid' | 'rain' | 'spiral' | 'sweep';

export interface Guardian {
  name: string;
  color: string;
  /** Signature attack. */
  pattern: GuardianPattern;
  /** Its repertoire (signature first): each attack cycle picks one at random. */
  patterns: GuardianPattern[];
}

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

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dead: boolean;
}

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
}

/** Where a player's fairy is now, so a drag can move her relative to it. */
export interface Pos {
  x: number;
  y: number;
}
