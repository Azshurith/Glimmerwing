// The trophy road: each map is a stage, opened by trophies won in VS CPU and Online matches, and each has
// formations of its own that grow harder along the road, and a sharper CPU.
import type { Progress, Stage } from '@/types';

/** The stages in order along the trophy road. */
export const STAGES: Stage[] = [
    {
        // Gentle: lines, V's and arcs that float and sway, mostly one-shot critters, an unhurried round.
        mapId: 'forest',
        trophies: 0,
        cpuReaction: 0.17,
        waves: {
            shapes: { line: 1.5, v: 1.4, arc: 1.3, grid: 0.4, ring: 0.4, diagonal: 0.7 },
            kinds: { spinner: 0.6, beetle: 0.5 },
            moves: { sway: 1.3, bob: 1.3, creep: 0.5 },
            exits: { dive: 0.4, scatter: 0.7 },
            start: 0,
            ramp: 110,
            hp: -0.1,
            extra: 0,
            morph: 0.6,
            big: 1,
            bubble: 0.8,
            pace: 1.05,
        },
    },
    {
        // Wheeling: rings and waves that orbit and loop, more bats, formations that scatter out.
        mapId: 'cave',
        trophies: 100,
        cpuReaction: 0.14,
        waves: {
            shapes: { ring: 2.2, wave: 1.6, column: 1.4, arc: 1.2, line: 0.7 },
            kinds: { spinner: 1.7 },
            moves: { orbit: 2.5, figure8: 1.6, sway: 0.7 },
            exits: { scatter: 1.6, sides: 1.2 },
            start: 0.1,
            ramp: 95,
            hp: 0,
            extra: 0,
            morph: 1,
            big: 0.8,
            bubble: 1.2,
            pace: 1,
        },
    },
    {
        // Sweeping: diagonals and waves that swoop across and creep down, shelled beetles, diving exits.
        mapId: 'desert',
        trophies: 300,
        cpuReaction: 0.115,
        waves: {
            shapes: { diagonal: 2.2, wave: 2, line: 1.2, ring: 0.7 },
            kinds: { beetle: 1.7 },
            moves: { creep: 1.8, sway: 1.3, march: 1.3, bob: 0.6 },
            exits: { dive: 1.8, sides: 1.4, left: 1.3, right: 1.3 },
            start: 0.2,
            ramp: 80,
            hp: 0.1,
            extra: 1,
            morph: 0.8,
            big: 1.2,
            bubble: 1,
            pace: 0.9,
        },
    },
    {
        // Fortress: grids and chevrons that re-form, armoured knights, big books, tough critters, a fast round.
        mapId: 'castle',
        trophies: 600,
        cpuReaction: 0.09,
        waves: {
            shapes: { grid: 2.4, chevron: 2, ring: 1.4, v: 1.2, line: 0.6 },
            kinds: { beetle: 1.6, spinner: 1.3 },
            moves: { march: 1.5, figure8: 1.3 },
            exits: { dive: 1.5, scatter: 1.3 },
            start: 0.3,
            ramp: 70,
            hp: 0.2,
            extra: 1,
            morph: 2.2,
            big: 1.5,
            bubble: 1.3,
            pace: 0.85,
        },
    },
];

/** The stage for a map (the first stage for an unknown one, such as a preview meadow). */
export function stageFor(mapId: string): Stage {
    return STAGES.find(s => s.mapId === mapId) ?? STAGES[0];
}

/** Whether a map's stage is open on this progress. */
export function stageOpen(p: Progress, mapId: string): boolean {
    return p.bestTrophies >= stageFor(mapId).trophies;
}
