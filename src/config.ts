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
export const GUARDIAN_WANDER = 2.5;
export const GUARDIAN_ATTACK = 6;

export const FEVER_TIME = 6;
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
 * rival's meadow, and faster.
 */
export const CROW_TIME = 120;
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
/** Extra Attack critters. */
export const IMP_HP = 2;
export const IMP_RADIUS = 7;
export const IMP_SPEED = 95;
/** Rally: break this many incoming stars within the window to send your guardian. */
export const RALLY_COUNT = 4;
export const RALLY_WINDOW = 4;
export const RALLY_COOLDOWN = 20;

/** Tempo: the meadow speeds up the longer a round (and a match) goes on. */
export const TEMPO_RAMP_TIME = 120;   // seconds to reach the full in-round ramp
export const TEMPO_RAMP = 0.6;        // +60% by then
export const TEMPO_PER_ROUND = 0.1;   // each earlier round in the match adds 10%
export const TEMPO_MAX = 2;

/** Petal bloom: clears bullets and stray stars, pops small fry with no chain credit. */
export const BLOOMS_PER_ROUND = 2;
export const BLOOM_TIME = 0.6;
export const BLOOM_INVULN = 2;

/** Star flights: chance a star is a seeker or a slant (the rest drop straight). */
export const SEEKER_CHANCE = 0.25;
export const SLANT_CHANCE = 0.25;
export const SEEK_TIME = 0.75;   // how long a seeker lines up before plunging
export const SEEK_SLIDE = 170;   // how fast it slides across while lining up

export const TRANSIT_TIME = 0.7;
export const ROUNDS_TO_WIN = 2;

/** Online play. */
export const NET_VERSION = '3';          // bump when the wire format changes; only matching versions are paired
export const LOCAL_SERVER = 'ws://localhost:8787/ws';
export const SNAP_EVERY = 3;             // send a meadow snapshot every 3 steps (20 a second)
export const END_GRACE = 0.25;           // host waits this long for a near-simultaneous knockout
