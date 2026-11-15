// The trophy road: each map is a stage, opened by trophies won in VS CPU and Online matches, and each has
// formations of its own that grow harder along the road, and a sharper CPU.
import type { Progress, Stage } from '@/types';

/** The stages in order along the trophy road. */
export const STAGES: Stage[] = [
    {
        // Gentle: lines, V's and arcs that float and sway, mostly one-shot critters, an unhurried round.
        mapId: 'forest',
        blurb: "Flowers, lines, V's and arcs that float and sway",
        trophies: 0,
        cpuReaction: 0.17,
        waves: {
            shapes: { line: 1.5, v: 1.4, arc: 1.3, grid: 0.4, ring: 0.4, diagonal: 0.7 },
            rest: 0.25,
            signature: { flower: 5.5 },
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
        blurb: 'Stalactites, rings and waves that orbit and scatter',
        trophies: 100,
        cpuReaction: 0.14,
        waves: {
            shapes: { ring: 2.2, wave: 1.6, column: 1.4, arc: 1.2, line: 0.7 },
            rest: 0.25,
            signature: { stalactite: 5.5 },
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
        blurb: 'Pyramids and diagonals that swoop and creep, diving exits',
        trophies: 300,
        cpuReaction: 0.115,
        waves: {
            shapes: { diagonal: 2.2, wave: 2, line: 1.2, ring: 0.7 },
            rest: 0.25,
            signature: { pyramid: 5.5 },
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
        blurb: 'Crosses, grids and chevrons that re-form, armoured and tough',
        trophies: 600,
        cpuReaction: 0.09,
        waves: {
            shapes: { grid: 2.4, chevron: 2, ring: 1.4, v: 1.2, line: 0.6 },
            rest: 0.25,
            signature: { cross: 5.5 },
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
    {
        // Tides: long lines and waves that sway in and out, lots of dew bubbles, a quick ramp.
        mapId: 'beach',
        blurb: 'Seashell spirals and long waves on the tide, lots of bubbles',
        trophies: 1000,
        cpuReaction: 0.08,
        waves: {
            shapes: { wave: 2.4, line: 1.6, arc: 1.4, diagonal: 1.2 },
            rest: 0.25,
            signature: { spiral: 5.5 },
            kinds: { spinner: 1.2, beetle: 1.3 },
            moves: { sway: 1.8, bob: 1.5 },
            exits: { sides: 1.6, left: 1.4, right: 1.4, dive: 1.4 },
            start: 0.35,
            ramp: 65,
            hp: 0.25,
            extra: 1,
            morph: 1.4,
            big: 1.3,
            bubble: 2.2,
            pace: 0.82,
        },
    },
    {
        // Eruption: dense grids, rings and V's that dive at you, tough and big critters, a fast, early ramp.
        mapId: 'volcano',
        blurb: 'Eruptions, grids and rings that dive at you, early and fast',
        trophies: 1500,
        cpuReaction: 0.07,
        waves: {
            shapes: { grid: 2, ring: 1.8, v: 1.6, chevron: 1.4, line: 0.5 },
            rest: 0.25,
            signature: { eruption: 5.5 },
            kinds: { beetle: 1.8, spinner: 1.5 },
            moves: { creep: 1.6, march: 1.4, orbit: 1.4 },
            exits: { dive: 2.4, scatter: 1.4 },
            start: 0.45,
            ramp: 55,
            hp: 0.3,
            extra: 2,
            morph: 1.8,
            big: 1.8,
            bubble: 1.2,
            pace: 0.78,
        },
    },
    {
        // Zero-g: everything orbits and figure-eights, re-forms all the time, toughest and fastest of all.
        mapId: 'space',
        blurb: 'Stars and rings that orbit and re-form: the toughest of all',
        trophies: 2200,
        cpuReaction: 0.06,
        waves: {
            shapes: { ring: 2.4, arc: 1.6, grid: 1.6, chevron: 1.4, column: 1.2 },
            rest: 0.25,
            signature: { star: 5.5 },
            kinds: { spinner: 2, beetle: 1.6 },
            moves: { orbit: 2.6, figure8: 2.4, bob: 1.2 },
            exits: { scatter: 2, dive: 1.8 },
            start: 0.55,
            ramp: 45,
            hp: 0.4,
            extra: 2,
            morph: 2.6,
            big: 1.6,
            bubble: 1.5,
            pace: 0.72,
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
