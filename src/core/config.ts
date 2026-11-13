// Tuning constants for Trench Duel. All distances are in field pixels,
// all times in seconds.

export const FIELD_W = 240;
export const FIELD_H = 320;
export const GAP = 24;
export const VIEW_W = FIELD_W * 2 + GAP;
export const VIEW_H = FIELD_H;

/**
 * The tall view, used while playing on a portrait screen (one player on the device):
 * your meadow at the bottom, as wide as the view and touching its bottom edge (touch play is
 * all gestures on the meadow, so nothing sits under it), and the rival's at half size at the
 * top beside a compact console.
 */
export const TALL_W = FIELD_W + 24;
/** Height of the band above your meadow that holds the rival's meadow and the console. */
export const TALL_TOP = 172;
/** Room the title and select screens are designed for below TALL_TOP + FIELD_H. */
export const TALL_STRIP = 56;
/** The tall view's shortest height; on longer screens it stretches to their shape, up to TALL_H_MAX. */
export const TALL_H = TALL_TOP + FIELD_H + TALL_STRIP;
export const TALL_H_MAX = 680;
/** Your meadow's scale in the tall view: it spans the whole width. */
export const TALL_OWN_S = TALL_W / FIELD_W;
/**
 * The tall view can be shorter than TALL_H, so a squatter phone screen is still filled. In a round the band above
 * your meadow (rival's meadow and console) shrinks, down to TALL_TOP_MIN; the title and select screens shrink as a
 * whole (see menu-fit.ts). Below TALL_H_MIN the view stops shrinking and the page shows bars.
 */
export const TALL_TOP_MIN = 104;
export const TALL_H_MIN = Math.ceil(FIELD_H * TALL_OWN_S) + TALL_TOP_MIN;
/** Where the rival's meadow sits in the tall view, at half size (moved down to centre it in the band above yours). */
export const TALL_RIVAL = { x: 8, y: 6, s: 0.5 } as const;
export const TALL_CONSOLE = { x: 136, y: 6, w: 120, h: FIELD_H / 2 } as const;

export const STEP = 1 / 60;

/**
 * Life, in half-hearts (10 = five hearts), and damage, as in Twinkle Star Sprites:
 * - running into a critter (zako) costs one heart but can't take you below half
 *   a heart; you're stunned (mash to shake it off sooner), then slowed and
 *   weakened for a few seconds, and your rival recovers half a heart;
 * - being hit by an attack (stars, brambles, Extra Attacks, a guardian or its
 *   shots) costs three hearts, you blink invincible for about a second, and
 *   your rival recovers a heart;
 * - Death (the hollow crow) knocks you out outright.
 */
export const MAX_HULL = 10;
export const ZAKO_DAMAGE = 2;
export const ATTACK_DAMAGE = 6;
export const HEAL_ON_ZAKO = 1;
export const HEAL_ON_ATTACK = 2;
export const INVULN_TIME = 1.0;
export const STUN_TIME = 1.1;
export const MASH_STEP = 0.04; // each new button/direction press while stunned shaves this off
export const STUN_MIN = 0.6; // however hard you mash, a stun lasts at least this long
export const ZAKO_GRACE = 0.6; // after a stun, critters pass through you this long
export const IMPAIR_TIME = 5;
export const IMPAIR_SPEED = 0.6; // movement multiplier while impaired
export const IMPAIR_FIRE = 1.7; // time between shots multiplier while impaired
export const IMPAIR_CHARGE = 0.6; // charge speed multiplier while impaired
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
/** A fireball's level: 1 is a Normal Attack, 2 or more a Reverse (higher for fairies with a counter boost). */
export const MAX_STAR_LEVEL = 3;

export const GAUGE_MAX = 200;
export const MOTH_HP = 70; // bosses are tough: a few seconds of focused fire won't banish one
/**
 * Guardians (Boss Attacks) run through phases, as in Twinkle Star Sprites:
 * rush in, wander (circling, random direction), attack, then exit off a side.
 * Taking GUARDIAN_STUN_DMG while wandering makes it reel, briefly untouchable.
 * Shots nudge an exiting guardian sideways, so you can steer where it leaves.
 */
export const GUARDIAN_ENTER = 0.45;
export const GUARDIAN_WANDER = 2;
/**
 * The attack phase is GUARDIAN_CYCLES_MIN to _MAX cycles; each cycle runs one
 * attack from the guardian's repertoire, picked at random, for that attack's
 * own length. Raise the cycle counts to make bosses stay longer.
 */
export const GUARDIAN_CYCLES_MIN = 3;
export const GUARDIAN_CYCLES_MAX = 4;
/**
 * When false, a guardian never leaves on its own: it keeps cycling through
 * its attacks until it's banished with shots or dispelled with a bomb.
 * Set true to have it leave after GUARDIAN_CYCLES_MIN-_MAX cycles.
 */
export const GUARDIAN_LEAVES = false;
export const GUARDIAN_CYCLE: Record<string, number> = {
    aimed: 1.8,
    ring: 2.1,
    rapid: 1.6,
    rain: 2.4,
    spiral: 2.6,
    sweep: 2.1,
};
/** Two bosses sent within this many seconds of each other clash and cancel out. */
export const BOSS_CLASH_WINDOW = 1.5;
/**
 * While attacking, the guardian now and then slides down near the fairy,
 * hangs there a moment, then glides back to its post (touching it hurts).
 */
export const GUARDIAN_SWOOP_EVERY = 3;
export const GUARDIAN_SWOOP_DOWN = 0.6;
export const GUARDIAN_SWOOP_HOLD = 0.35;
export const GUARDIAN_SWOOP_BACK = 0.8;
export const GUARDIAN_SWOOP_GAP = 46; // how far above the fairy it stops
export const GUARDIAN_CIRCLE = 55; // wander circle radius
export const GUARDIAN_SPIN = 1.7; // radians a second
export const GUARDIAN_STUN_DMG = 5;
export const GUARDIAN_STUN = 0.6;
export const GUARDIAN_NUDGE = 18; // sideways speed each shot adds while it exits

export const FEVER_TIME = 6;
/** During Fever you fire this many times faster (autofire and tapping alike). The shot pattern doesn't change. */
export const FEVER_FIRE_RATE = 2;
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
 * Waves flow like Twinkle Star Sprites: there's no spawn clock. Each formation flies in, holds its
 * shape for a while and flies off (see waves.ts); the next comes in once it's cleared or gone, or as
 * it starts to leave, so clearing fast brings the swarm faster.
 */
export const WAVE_GAP = 0.5; // beat before the next formation sets off
export const WAVE_MAX_WAIT = 20; // safety net only: a formation can't hold up the next one longer than this

/** Sudden death, part one: at this point every critter speeds up sharply. */
export const SURGE_TIME = 100;
export const SURGE_SPEED = 1.35;

/**
 * Sudden death, part two: the Hollow Crow (the meadow's Death). One crow per
 * round. It wakes in one meadow, hunts for a while, then crosses into the
 * other, back and forth. Drive it off and it returns sooner, in your
 * rival's meadow, and faster. Its touch is an instant knockout, like Death's.
 */
export const CROW_TIME = 102; // about when Death appears in Twinkle Star Sprites
export const CROW_WARNING = 3;
export const CROW_RADIUS = 9;
export const CROW_HP = 14;
export const CROW_SPEED = 170; // dive speed at level 1
export const CROW_SPEED_STEP = 25; // added per level
export const CROW_STAY = 10; // seconds it hunts one meadow before crossing (level 1)
export const CROW_STAY_MIN = 4;
export const CROW_RETURN = 8; // seconds before a driven-off crow reappears (level 1)
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
export const GAUGE_START = GAUGE_LEVEL; // each round starts at level 1
export const EXTRA_COST = 0.5; // in gauge levels
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
export const TEMPO_RAMP_TIME = 120; // seconds to reach the full in-round ramp
export const TEMPO_RAMP = 0.6; // +60% by then
export const TEMPO_PER_ROUND = 0.1; // each earlier round in the match adds 10%
export const TEMPO_MAX = 2;

/** Petal bloom: clears bullets and stray stars, pops small fry with no chain credit. */
export const BLOOMS_PER_ROUND = 2;
/** Bramblewick's Thornquake slows her meadow's critters, attacks and bullets (not her) like Kim's bomb. */
export const BOMB_SLOW = 0.5;
export const BOMB_SLOW_TIME = 1.6;
/** Umbra's Duskfall: the hole sits here and drags hazards in before it bursts. */
export const HOLE_Y = 110;
export const HOLE_PULL = 160;

/** Extra Attack seekers: how long one lines up before plunging. */
export const SEEK_TIME = 0.75; // how long a seeker lines up before plunging
/**
 * Fireballs (TSS Normal Attacks). A chain of 4 or more sends floor((hits - 2) / 2) of them: 4-5 hits
 * send 1, 6-7 send 2, 8-9 send 3 and so on. During Fever every hit after the first sends one.
 */
export const FIREBALL_MIN_HITS = 4;
/** Fireballs a chain of `hits` sends. */
export const fireballsFor = (hits: number) => (hits >= FIREBALL_MIN_HITS ? Math.floor((hits - 2) / 2) : 0);
/** Fireballs a chain of `hits` sends during Fever. */
export const feverFireballsFor = (hits: number) => Math.max(0, hits - 1);
/** Most fireballs one chain can send. */
export const FIREBALL_CAP = 12;
/**
 * A fireball's size comes from the combo hit that sent it: hits 2-5 small, 6-10 medium, 11-15 large,
 * 16 and up extra large. It takes size + 1 shots to break (2 to 5).
 */
/** Size of the fireball sent by combo hit number `hit`. */
export const fireballSizeAt = (hit: number) => (hit <= 5 ? 1 : hit <= 10 ? 2 : hit <= 15 ? 3 : 4);
/** Shots a fireball of this size takes to break. */
export const fireballHp = (size: number) => size + 1;
/** A fireball's radius by size. */
export const fireballRadius = (size: number) => 5.5 + size * 1.6;
/**
 * A Normal fireball comes in at the top right above the receiving fairy (a volley's others FIREBALL_AIM_SPREAD
 * apart on either side) and falls straight down, faster and faster, to FIREBALL_FALL_SPEED (about 0.45 of the
 * meadow's height a second). It doesn't follow the fairy once it's in.
 */
export const FIREBALL_ENTER_SPEED = 24;
export const FIREBALL_ACCEL = 150;
export const FIREBALL_FALL_SPEED = 140;
export const FIREBALL_AIM_SPREAD = 22;
/** Seconds between the fireballs of one volley setting off, so they come down staggered, never in a row. */
export const FIREBALL_STAGGER = 0.16;
/**
 * Speed. Size never changes it. Each Normal is sent at a speed picked between FIREBALL_NORMAL_SPEED_MIN and
 * _MAX times normal and keeps it all the way. Each reflection multiplies it by
 * SPEED_REVERSE (initial tuning target, not measured), each Perfect whoever shot it back has this round adds
 * PERFECT_SPEED_STEP (up to PERFECT_SPEED_MAX), and the tempo and sudden death speed everything in flight. FIREBALL_MAX_SPEED caps it so nothing can skip
 * past a hitbox in one step. SPEED_EXTRA is how much faster an Extra Attack crosses between the meadows.
 */
export const SPEED_NORMAL = 1;
export const FIREBALL_NORMAL_SPEED_MIN = 1.4;
export const FIREBALL_NORMAL_SPEED_MAX = 2;
export const SPEED_REVERSE = 1.25;
/** How many times a fireball can be shot back; broken once more after that, it becomes an Extra Attack. */
export const FIREBALL_MAX_REFLECTS = 2;
export const SPEED_EXTRA = 1.8;
export const PERFECT_SPEED_STEP = 0.08;
export const PERFECT_SPEED_MAX = 1.5;
export const FIREBALL_MAX_SPEED = 300;
/** A fireball's speed multiplier after `reflects` reflections, with the sender's Perfect `boost`. */
export const fireballSpeedMul = (reflects: number, boost: number) =>
    Math.min(3, SPEED_NORMAL * SPEED_REVERSE ** reflects * boost);
/** A shot that doesn't break a fireball slows it to FIREBALL_HIT_SLOW for FIREBALL_STALL s and flashes it. */
export const FIREBALL_STALL = 0.06;
export const FIREBALL_HIT_SLOW = 0.6;
export const FIREBALL_HIT_FLASH = 0.1;
/**
 * A fireball you shoot down flashes, turns into a Reverse where it broke and crosses the screen: diagonally up, a bounce off the top line, diagonally down
 * (fireball-path.ts) to where the rival's fairy was, starting at FIREBALL_BACK_START of its reflected speed
 * and reaching it over FIREBALL_BACK_RAMP seconds.
 */
export const FIREBALL_BACK_START = 0.3;
export const FIREBALL_BACK_RAMP = 0.3;
export const FIREBALL_FLASH = 0.3;
/** Positions kept for a Reverse's glowing trail. */
export const FIREBALL_TAIL = 10;
/**
 * Fever fireballs come many at a time, so each falls at FEVER_FIREBALL_SPEED of the normal speed early in a
 * round, easing up to full speed by FEVER_SPEED_RAMP_TIME seconds in (on top of the tempo, which speeds up
 * everything in flight as the match goes on).
 */
export const FEVER_FIREBALL_SPEED = 0.7;
export const FEVER_SPEED_RAMP_TIME = 120;
/** How fast a Fever fireball falls, as a share of normal, `t` seconds into the round. */
export const feverSpeedAt = (t: number) =>
    FEVER_FIREBALL_SPEED + (1 - FEVER_FIREBALL_SPEED) * Math.min(1, t / FEVER_SPEED_RAMP_TIME);
export const SEEK_SLIDE = 170; // how fast it slides across while lining up

export const TRANSIT_TIME = 0.7;
/**
 * A Normal fireball's route to the rival (see normalRoute), at FIREBALL_TRANSIT_SPEED (meadow units a second, the
 * same as it falls, times the speed it was sent with; slower in Fever, by its pace; on the tempo, like everything in
 * flight). Sent from within FIREBALL_NEAR_TOP of the top, it slides straight across into the rival's meadow at
 * that height, never above FIREBALL_TOP_Y (just under the HUD bar, so it's never hidden behind it), and drops
 * straight down once it's over the rival's fairy. From lower down it climbs diagonally to FIREBALL_TOP_Y, bounces
 * off it and comes down diagonally into the rival's meadow at their fairy. Reverses fly the same climb and
 * bounce. Bounces sit near the middle of the screen, over the gap between the meadows: a true reflection's
 * bounce point pulled most of the way there, keeping FIREBALL_BOUNCE_SPREAD of its distance from it.
 */
export const FIREBALL_TRANSIT_SPEED = 140;
export const FIREBALL_TOP_Y = 40;
/** The highest a formation sits once it's in: just under the HUD strip (24 units deep). */
export const CRITTER_TOP = 38;
export const FIREBALL_NEAR_TOP = 70;
/**
 * The chance a Normal sent from lower down takes the straight route instead of the bounce: straight up to
 * FIREBALL_TOP_Y, straight across into the rival's meadow, then straight down over their fairy.
 */
export const FIREBALL_STRAIGHT_CHANCE = 0.5;
export const FIREBALL_BOUNCE_SPREAD = 0.25;
/** A fireball's speed between the meadows, given its reflections and its sender's Perfects boost. */
export const fireballTransitSpeed = (reflects: number, boost: number) =>
    Math.min(FIREBALL_MAX_SPEED, FIREBALL_TRANSIT_SPEED * fireballSpeedMul(reflects, boost));
export const ROUNDS_TO_WIN = 2;

/** Online play. */
export const NET_VERSION = '40'; // bump when the wire format changes; only matching versions are paired
export const LOCAL_SERVER = 'ws://localhost:8787/ws';
export const SNAP_EVERY = 3; // send a meadow snapshot every 3 steps (20 a second)
export const END_GRACE = 0.25; // host waits this long for a near-simultaneous knockout
