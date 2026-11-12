/** The player badge on a meadow's HUD: 1P, 2P, YOU, CPU or RIVAL, in that player's colour. */
export interface HudTag {
  label: string;
  color: string;
}

/** The console between the meadows. */
export interface ConsoleView {
  /** Round being played, from 1. */
  round: number;
  /** The shared tempo multiplier (1 at the start of a round, up to TEMPO_MAX). */
  tempo: number;
  /** Online round-trip time in milliseconds, when playing online. */
  ping?: number;
}

/** A full-width banner across both meadows. */
export interface BannerView {
  title: string;
  sub?: string;
  /** A highlighted plate under the subtitle, e.g. a newly unlocked fairy. */
  extra?: string;
  /** Seconds since the banner appeared, for its entrance animation (omit for no animation). */
  age?: number;
  /** How much to darken the meadows behind it (0 to 1). */
  dim?: number;
  /** Title colour family. */
  tone?: 'gold' | 'pink' | 'blue';
  /** Title size in view units (default 30). */
  size?: number;
  /** Blink the subtitle, for "press to continue" prompts. */
  blinkSub?: boolean;
}
