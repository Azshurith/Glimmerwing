// Tuning constants for Trench Duel. All distances are in field pixels,
// all times in seconds.

export const FIELD_W = 240;
export const FIELD_H = 320;
export const GAP = 24;
export const VIEW_W = FIELD_W * 2 + GAP;
export const VIEW_H = FIELD_H;

export const STEP = 1 / 60;

export const MAX_HULL = 5;
export const INVULN_TIME = 1.4;
export const PLAYER_SPEED = 225;
export const PLAYER_RADIUS = 6;
/** As in Twinkle Star Sprites, the fairy can fly anywhere in her meadow: this is just the top margin. */
export const PLAYER_MIN_Y = 14;

export const SHOT_SPEED = 430;
export const FIRE_COOLDOWN = 0.11;
/** Autofire: time between shots while the autofire button is held. */
export const AUTO_FIRE_COOLDOWN = 0.13;
export const HOLD_BEFORE_CHARGE = 0.2;
export const CHARGE_TIME = 0.85;

export const PUFF_RADIUS = 9;
export const BURST_RADIUS = 27;
export const CHARGED_BURST_RADIUS = 54;
export const BURST_LIFE = 0.38;

export const STAR_RADIUS = 7;
export const BRAMBLE_RADIUS = 12;
export const BRAMBLE_HP = 4;
export const MAX_STAR_LEVEL = 3;
/** Hits a star needs: 1 + its level, so 2 to 4. */
export const starHp = (level: number) => 1 + level;

export const GAUGE_MAX = 200;
export const MOTH_HP = 32;
/**
 * Guardians (Boss Attacks) run through phases, as in Twinkle Star Sprites:
 * rush in, wander (circling, random direction), attack, then exit off a side.
 * Taking GUARDIAN_STUN_DMG while wandering makes it reel, briefly untouchable.
 * Shots nudge an exiting guardian sideways, so you can steer where it leaves.
 */
export const GUARDIAN_ENTER = 0.45;
export const GUARDIAN_WANDER = 2.5;
export const GUARDIAN_ATTACK = 6;
export const GUARDIAN_CIRCLE = 55;      // wander circle radius
export const GUARDIAN_SPIN = 1.7;       // radians a second
export const GUARDIAN_STUN_DMG = 5;
export const GUARDIAN_STUN = 0.6;
export const GUARDIAN_NUDGE = 18;       // sideways speed each shot adds while it exits

export const FEVER_TIME = 6;
/** During Fever you fire this many times faster (autofire and tapping alike). The shot pattern doesn't change. */
export const FEVER_FIRE_RATE = 2;
/** Most stars a single chain can send during Fever. */
export const FEVER_STAR_CAP = 12;
/** When the first moonseed arrives each round, then how often after that. */
export const MOONSEED_FIRST = 32;
export const MOONSEED_EVERY = 40;
/** How long the warning shows before a moonseed drifts in. */
export const MOONSEED_WARNING = 2.5;
/** The freeze when a moonseed breaks. */
export const HITSTOP = 0.35;

/** Comets: sent when you break a fully-powered star. They can't be broken, only dodged. */
export const COMET_RADIUS = 6;
export const COMET_SPEED = 230;

/**
 * Waves flow like Twinkle Star Sprites: there's no spawn clock. The next
 * formation comes in as soon as the last one is popped or has left the
 * meadow, so clearing fast brings the swarm faster.
 */
export const WAVE_GAP = 0.35;       // beat between a wave clearing and the next arriving
export const WAVE_MAX_WAIT = 12;    // safety net only: a straggling wave can't stall the meadow longer than this

/** Sudden death, part one: at this point every critter speeds up sharply. */
export const SURGE_TIME = 100;
export const SURGE_SPEED = 1.35;

/**
 * Sudden death, part two: the Hollow Crow (the meadow's Death). One crow per
 * round. It wakes in one meadow, hunts for a while, then crosses into the
 * other, back and forth. Drive it off and it returns sooner, in your
 * rival's meadow, and faster. Its touch is an instant knockout, like Death's.
 */
export const CROW_TIME = 102;            // about when Death appears in Twinkle Star Sprites
export const CROW_WARNING = 3;
export const CROW_RADIUS = 9;
export const CROW_HP = 14;
export const CROW_SPEED = 170;      // dive speed at level 1
export const CROW_SPEED_STEP = 25;  // added per level
export const CROW_STAY = 10;        // seconds it hunts one meadow before crossing (level 1)
export const CROW_STAY_MIN = 4;
export const CROW_RETURN = 8;       // seconds before a driven-off crow reappears (level 1)
export const CROW_RETURN_MIN = 2;

/**
 * Power gauge and charge shots, as in Twinkle Star Sprites. The gauge has
 * three levels and fills as you pop critters. Holding fire charges up one
 * level per CHARGE_TIME, as far as the gauge allows; letting go fires:
 *   Lv 1  a piercing charged torpedo (free)
 *   Lv 2  the torpedo plus your fairy's Extra Attack sent to the rival
 *   Lv 3  the torpedo plus your guardian (the Boss Attack)
 * Below level 1 you can't charge at all.
 */
export const GAUGE_LEVEL = GAUGE_MAX / 3;
export const GAUGE_START = GAUGE_LEVEL;  // each round starts at level 1
export const EXTRA_COST = 0.5;           // in gauge levels
export const BOSS_COST = 2;
/** Extra Attack critters: they can't be shot or burst, only dodged (or cleared by a bomb). */
export const IMP_RADIUS = 7;
export const IMP_SPEED = 95;
/** Homing critters steer after the fairy for this long, turning at most this fast (radians a second). */
export const HOMING_TIME = 2.6;
export const HOMING_TURN = 2.4;
/** Hearthsparks: how fast they streak across, and the ring of sparks they burst into. */
export const LATERAL_SPEED = 125;
export const SPARK_BULLETS = 8;
export const SPARK_SPEED = 75;
/** Burrs: gravity, the hop, and how often they hop. They drift down slowly overall. */
export const BURR_GRAVITY = 150;
export const BURR_HOP = 40;
export const BURR_HOP_EVERY = 0.9;
/** Dusk moths: weave this long, then dive at this speed toward where the fairy was. */
export const BAT_WEAVE = 1.2;
export const BAT_DIVE = 200;
/** Break this many reverse stars within one chain to send your guardian (the TSS reverse-chain Boss Attack). */
export const BOSS_CHAIN_REVERSES = 3;

/** Tempo: the meadow speeds up the longer a round (and a match) goes on. */
export const TEMPO_RAMP_TIME = 120;   // seconds to reach the full in-round ramp
export const TEMPO_RAMP = 0.6;        // +60% by then
export const TEMPO_PER_ROUND = 0.1;   // each earlier round in the match adds 10%
export const TEMPO_MAX = 2;

/** Petal bloom: clears bullets and stray stars, pops small fry with no chain credit. */
export const BLOOMS_PER_ROUND = 2;
/** Bramblewick's Thornquake slows her meadow's critters, attacks and bullets (not her) like Kim's bomb. */
export const BOMB_SLOW = 0.5;
export const BOMB_SLOW_TIME = 1.6;
/** Umbra's Duskfall: the hole sits here and drags hazards in before it bursts. */
export const HOLE_Y = 110;
export const HOLE_PULL = 160;

/** Star flights: chance a star is a seeker or a slant (the rest drop straight). */
export const SEEKER_CHANCE = 0.25;
export const SLANT_CHANCE = 0.25;
export const SEEK_TIME = 0.75;   // how long a seeker lines up before plunging
export const SEEK_SLIDE = 170;   // how fast it slides across while lining up

export const TRANSIT_TIME = 0.7;
export const ROUNDS_TO_WIN = 2;

/** Online play. */
export const NET_VERSION = '10';          // bump when the wire format changes; only matching versions are paired
export const LOCAL_SERVER = 'ws://localhost:8787/ws';
export const SNAP_EVERY = 3;             // send a meadow snapshot every 3 steps (20 a second)
export const END_GRACE = 0.25;           // host waits this long for a near-simultaneous knockout
