// Shapes shared by the sky scenery's painters (render/scenery/paint.ts) and its layout (render/scenery/scenery.ts).

/** A painted sprite and the points the scenery needs on it, all in the sprite's own pixels. */
export interface Painted {
    canvas: HTMLCanvasElement;
    /** Where the island's top surface sits at its centre column (the sprite is drawn so this meets its spot). */
    cx: number;
    cy: number;
    /** Points on the lip where a waterfall pours over the edge. */
    falls: { x: number; y: number }[];
    /** The surface at the island's left and right ends, where a bridge can tie on. */
    left: { x: number; y: number };
    right: { x: number; y: number };
}

/** How far a far-off thing fades into the sky (0 none, 1 all sky). */
export type Fade = number;

/** What an island carries on top, picked by the scenery's generator. */
export interface IslandSpec {
    seed: number;
    /** Width of the island body, in pixels. */
    w: number;
    /** How deep its rocky underside hangs, as a share of its width. */
    depth: number;
    fade: Fade;
    trees: number;
    pines: boolean;
    cottage: boolean;
    ruins: boolean;
    pond: boolean;
    falls: number;
    /** Hanging roots and vines under the soil. */
    vines: boolean;
}
