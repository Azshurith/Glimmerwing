/** Colours and fonts shared by the meadows and the menu screens. */

export const PALETTE = {
  skyTop: '#2a1d52',
  skyBottom: '#15304a',
  grass: '#0f2b26',
  grassTip: '#1d4a3c',
  puff: '#fff6d8',
  star: '#ffe27a',
  bramble: '#b98ae0',
  moth: '#ffcf8a',
  text: '#f6f0ff',
  dim: 'rgba(246,240,255,0.55)',
};

/** Body text: the page's serif. */
export const FONT = '"Fraunces", Georgia, "Times New Roman", serif';

/** Chunky arcade lettering for headings, tags and nameplates. */
export const ARCADE = '"Bungee", "Arial Black", Impact, sans-serif';

/** Player colours: badges, cursors and READY frames on every screen. */
export const PLAYER_COLORS: Readonly<Record<'p1' | 'p2' | 'cpu', string>> = {
  p1: '#ff5d7a',
  p2: '#4fb8ff',
  cpu: '#b9a6ff',
};
