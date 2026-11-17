// What a player can wear in chat and on their plate: an avatar (the face of any fairy they've unlocked), a frame
// round it, and the bubble their messages sit in. A few frames and bubbles open on the trophy road. The page draws
// them (index.template.html's .frame-* and .bubble-* styles); the server checks a choice is open before keeping it.
import type { PlayerLook } from '@/types';

/** A frame or bubble style: its id, name, the colours the lobby draws it in, and the trophies it needs. */
export interface LookStyle {
    id: string;
    name: string;
    /** Main and edge colours (a frame's ring; a bubble's fill and border), for drawing it on the canvas. */
    colors: [string, string];
    trophies: number;
}

/** The frames round a player's avatar. */
export const FRAMES: LookStyle[] = [
    { id: 'gold', name: 'Gold', colors: ['#ffd45c', '#8a5a12'], trophies: 0 },
    { id: 'moon', name: 'Moonlight', colors: ['#dfe6ff', '#6a74b8'], trophies: 0 },
    { id: 'rose', name: 'Rose', colors: ['#ff9ac8', '#a2325f'], trophies: 0 },
    { id: 'leaf', name: 'Leafy', colors: ['#8ff0a0', '#2f7a3c'], trophies: 100 },
    { id: 'crystal', name: 'Crystal', colors: ['#8fe8ff', '#2a6aa8'], trophies: 300 },
    { id: 'ember', name: 'Ember', colors: ['#ff8a4c', '#8a2a0c'], trophies: 600 },
    { id: 'royal', name: 'Royal', colors: ['#c9a2ff', '#4a2a96'], trophies: 1000 },
    { id: 'star', name: 'Starlight', colors: ['#fff6c8', '#d49a2a'], trophies: 1500 },
];

/** The bubbles a player's chat messages sit in. */
export const BUBBLES: LookStyle[] = [
    { id: 'night', name: 'Night', colors: ['#2a1d5c', '#6a58b0'], trophies: 0 },
    { id: 'sky', name: 'Sky', colors: ['#1f4f8a', '#6ab8ff'], trophies: 0 },
    { id: 'meadow', name: 'Meadow', colors: ['#1f5a3a', '#6ad88a'], trophies: 0 },
    { id: 'sakura', name: 'Sakura', colors: ['#6a2448', '#ff9ac8'], trophies: 100 },
    { id: 'sunset', name: 'Sunset', colors: ['#7a2e1c', '#ffa65c'], trophies: 300 },
    { id: 'abyss', name: 'Abyss', colors: ['#0c1a3a', '#4ae0d8'], trophies: 600 },
    { id: 'royal', name: 'Royal', colors: ['#3c1a6a', '#ffd45c'], trophies: 1000 },
    { id: 'galaxy', name: 'Galaxy', colors: ['#1a0c3c', '#ff7ad9'], trophies: 2200 },
];

/** What a new player wears. */
export const DEFAULT_LOOK: PlayerLook = { avatar: 'pip', frame: 'gold', bubble: 'night' };

/** A frame by id (the first, if there's no such frame). */
export const frameById = (id: string): LookStyle => FRAMES.find(f => f.id === id) ?? FRAMES[0];

/** A bubble by id (the first, if there's no such bubble). */
export const bubbleById = (id: string): LookStyle => BUBBLES.find(b => b.id === id) ?? BUBBLES[0];
