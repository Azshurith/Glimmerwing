// Shapes shared by the sky scenery: its maps (data/maps.ts), painters (render/scenery/paint.ts) and layout
// (render/scenery/scenery.ts).

/** A painted sprite and the points the scenery needs on it, all in the sprite's own pixels. */
export interface Painted {
    canvas: HTMLCanvasElement;
    /** The sprite's anchor: the middle of an island's top (the sprite is drawn so this meets its spot). */
    cx: number;
    cy: number;
    /** Points on the front edge where a waterfall pours over the cliff. */
    falls: { x: number; y: number }[];
    /** The middle of the island's left and right edges, where a bridge can land. */
    left: { x: number; y: number };
    right: { x: number; y: number };
}

/** How far a far-off thing fades into the haze (0 none, 1 all haze). */
export type Fade = number;

/** What an island's top is made of. */
export type Ground = 'grass' | 'sand' | 'rock' | 'tiles';
/** How an island's cliff face is built. */
export type CliffStyle = 'bricks' | 'strata' | 'crag' | 'wall';
/** The things that can stand on an island: big ones (trees, towers…) and small ones (flowers, rocks…). */
export type Prop =
    | 'tree'
    | 'palm'
    | 'cactus'
    | 'crystal'
    | 'glowshroom'
    | 'tower'
    | 'torch'
    | 'cone'
    | 'rock'
    | 'bush'
    | 'flowers'
    | 'lupine'
    | 'bones';

/**
 * A map's look: its sky and clouds, what its islands are made of, the colours of everything on them, and which
 * things stand on them how often. Each map is one of these (see data/maps.ts); the scenery paints whatever map
 * it's given.
 */
export interface MapTheme {
    id: string;
    name: string;
    /**
     * Islands floating over the clouds (the sky lies far below), or solid ground seen from above through drifting
     * haze, with big things standing on it.
     */
    terrain: 'islands' | 'ground';
    /** What lies far below, top to bottom of the meadow (on a ground map, the colour of its chasms). */
    sky: [string, string];
    /** The colour distant things fade toward. */
    haze: string;
    /** Clouds (or mist): lit top, body, shaded underside; and how solid they are. */
    cloud: [string, string, string];
    cloudAlpha: number;
    ground: Ground;
    /** The island top: highlight, body, texture shade, front edge. */
    top: [string, string, string, string];
    cliffStyle: CliffStyle;
    /** The cliff face: highlight, face, shade, joints. */
    cliff: [string, string, string, string];
    /** What hangs and drips off the cliff: dark, mid, tip. */
    drips: [string, string, string];
    /** Water in ponds and waterfalls: deep, body, light. */
    water: [string, string, string];
    /** The outline round everything. */
    ink: string;
    /** Leaves (rim, body, highlight) and wood. */
    leaves: [string, string, string];
    trunk: string;
    /** Flowers (petals, centre); cottage and tower roofs (light, body, dark); cones and crystals (lit, shade). */
    flower: [string, string];
    roof: [string, string, string];
    cone: [string, string];
    /** The glowing motes drifting through the scene, and the veil laid over it all (edge and middle alpha). */
    mote: string;
    veil: [number, number];
    /** Big things (one per ~30 pixels of island width at weight 1) and small things, each with its weight. */
    big: Partial<Record<Prop, number>>;
    small: Partial<Record<Prop, number>>;
    /** How likely an island is to have each of these. */
    odds: { pond: number; cottage: number; path: number; fence: number; falls: number };
}

/** What an island carries, rolled by the scenery's generator from its map. */
export interface IslandSpec {
    seed: number;
    /** Width and depth of the top, and how tall the cliff below it is, in pixels. */
    w: number;
    d: number;
    cliff: number;
    fade: Fade;
    /** How many big and small things stand on it (which ones comes from the map's weights). */
    big: number;
    small: number;
    pond: boolean;
    cottage: boolean;
    fence: boolean;
    path: boolean;
    falls: number;
}
