export interface Controls {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  fire: boolean;
  /** Petal bloom: the panic button. */
  bloom?: boolean;
  /** Optional absolute target (touch input), in field coordinates. */
  target?: { x: number; y: number } | null;
}

export interface Player {
  x: number;
  y: number;
  hull: number;
  invuln: number;
  cooldown: number;
  hold: number;
  charge: number;
  /** Overcharge, 0 to 1, built by holding past a full charge. */
  over: number;
  wasFiring: boolean;
  wasBlooming: boolean;
  blooms: number;
}

export interface Shot { x: number; y: number; vx: number; charged: boolean; dead: boolean }

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
  x: number; y: number;
  vx: number; vy: number;
  phase: number;
  dead: boolean;
  /** Shots needed to pop it (1 to 3). Any pollen burst pops it outright. */
  hp: number;
  /** A moonseed: shots bounce off it; only a pollen burst can break it. */
  moonseed?: boolean;
}

export interface Burst {
  x: number; y: number;
  maxR: number;
  age: number;
  chainId: number;
  /** Things this burst has already damaged, so it hits each only once. */
  hits: Set<object>;
}

export type AttackKind = 'star' | 'bramble' | 'comet';

export interface Attack {
  x: number; y: number;
  vx: number; vy: number;
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
}

export type StarFlight = 'drop' | 'seeker' | 'slant';

export type GuardianPattern = 'aimed' | 'ring' | 'rapid' | 'rain' | 'spiral' | 'sweep';

export interface Guardian {
  name: string;
  color: string;
  pattern: GuardianPattern;
}

export interface Moth {
  x: number; y: number;
  hp: number;
  t: number;
  fireT: number;
  dead: boolean;
  guardian: Guardian;
  wing: string;
  angle: number;
  stage: 'wander' | 'attack' | 'exit';
  stageT: number;
}

export interface Crow {
  x: number; y: number;
  vx: number; vy: number;
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

export interface Bullet { x: number; y: number; vx: number; vy: number; dead: boolean }

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; color: string;
}

export interface Popup { x: number; y: number; text: string; age: number }

/** Something one field sends to the other. */
export interface Outgoing {
  kind: AttackKind | 'moth' | 'crow';
  /** For a crow: seconds before it appears after arriving. */
  delay?: number;
  /** For a guardian: which fairy sent it. */
  fairy?: string;
  level: number;
  fromX: number;
  fromY: number;
}

export class Rng {
  private s: number;
  constructor(seed: number) { this.s = seed >>> 0; }
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number { return a + (b - a) * this.next(); }
  int(a: number, b: number): number { return Math.floor(this.range(a, b + 1)); }
}
