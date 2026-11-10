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

/** Sudden death: Hollow Crows wake if a round drags on. */
export const CROW_TIMES = [100, 140, 175];
export const CROW_WARNING = 3;
export const CROW_RADIUS = 9;

/** Crows can be driven off with enough hits, but come back faster. */
export const CROW_HP = 14;
export const CROW_RETURN = 8;

/** Overcharge: hold past a full charge to spend half a gauge and send your guardian. */
export const OVERCHARGE_TIME = 1.2;
export const OVERCHARGE_COST = 0.5;
/** Rally: break this many incoming stars within the window to send your guardian. */
export const RALLY_COUNT = 4;
export const RALLY_WINDOW = 4;
export const RALLY_COOLDOWN = 20;

/** Tempo: the meadow speeds up the longer a round (and a match) goes on. */
export const TEMPO_RAMP_TIME = 120;   // seconds to reach the full in-round ramp
export const TEMPO_RAMP = 0.6;        // +60% by then
export const TEMPO_PER_ROUND = 0.1;   // each earlier round in the match adds 10%
export const TEMPO_MAX = 2;

export const TRANSIT_TIME = 0.7;
export const ROUNDS_TO_WIN = 2;
