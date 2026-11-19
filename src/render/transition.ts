// Moving from one menu screen to another (the lobby to Settings, Profile, Maps or Characters, and back): the screen
// being left fades quickly away, and the new one builds itself up in stages: its heading bar and buttons pop in first,
// one after another, then its background rises out of the dark, then its panels slide and fade in, and its hints last.
// The screens say which stage each thing they draw belongs to by drawing it inside `enter`.

/** How long the whole entrance takes (ms). */
const DURATION = 1400;
/** How long the screen being left takes to fade away (ms). */
const FADE_OUT = 180;
/** How long a new tab's content takes to come in when a screen switches tabs (ms). */
const TAB_DURATION = 420;
/** How far apart, as a share of the entrance, buttons drawn one after another start. */
const STAGGER = 0.045;

/** The stages a screen builds up in. */
export type EnterPart = 'bar' | 'buttons' | 'bg' | 'panels' | 'hint';

/** When each stage starts and ends, as shares of the entrance. */
const PARTS: Record<EnterPart, [number, number]> = {
    bar: [0, 0.3],
    buttons: [0.04, 0.42],
    bg: [0.14, 0.9],
    panels: [0.3, 0.82],
    hint: [0.6, 1],
};

/** The colour the background rises out of. */
const DARK = '#0b0520';

/** Eased progress, fast then gentle. */
const easeOut = (k: number) => 1 - (1 - k) ** 3;
/** Eased progress with a little overshoot, for things that pop in. */
const easeBack = (k: number) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

/**
 * The entrance under way, shared by every menu screen: when it started, whether the player is going back, and whether
 * it's only a change of tab (just the panels come in; the heading, tabs and background stay put).
 */
const state = { start: 0, back: false, tab: false };

/** How far `part` has come in (0 to 1, eased; 1 once no entrance is under way), `i` places it in a staggered row. */
export function entering(part: EnterPart, i = 0): number {
    if (!state.start) return 1;
    if (state.tab) {
        if (part !== 'panels') return 1;
        const k = (performance.now() - state.start) / TAB_DURATION;
        return k >= 1 ? 1 : Math.max(0, k);
    }
    const [a, b] = PARTS[part];
    const from = a + i * STAGGER;
    const k = ((performance.now() - state.start) / DURATION - from) / (b - a);
    if (k <= 0) return 0;
    return k >= 1 ? 1 : k;
}

/** Options for `enter`: where the thing sits (to pop it from its centre), its place in a row, and where it slides from. */
interface EnterOptions {
    box?: { x: number; y: number; w: number; h: number };
    i?: number;
    dx?: number;
    dy?: number;
}

/**
 * Draw one thing on a menu screen as part of `part` of the screen's entrance: buttons pop in (from the centre of `box`
 * when given) and rise a little, the heading bar drops in, panels slide in (from the right going deeper, from the left
 * going back, or from `dx`/`dy`) and fade up, the background fades up from the dark, and hints fade in.
 */
export function enter(ctx: CanvasRenderingContext2D, part: EnterPart, draw: () => void, o: EnterOptions = {}): void {
    const raw = entering(part, o.i ?? 0);
    if (raw >= 1) {
        draw();
        return;
    }
    if (raw <= 0 && part !== 'bg') return;
    const k = easeOut(raw);
    ctx.save();
    if (part === 'bg') {
        // Darkness first, the background coming up through it.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = DARK;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.restore();
        ctx.globalAlpha *= k;
    } else if (part === 'buttons') {
        ctx.globalAlpha *= Math.min(1, raw * 2.5);
        const s = 0.82 + 0.18 * easeBack(raw);
        ctx.translate(o.dx ?? 0, (o.dy ?? 6) * (1 - k));
        if (o.box) {
            const cx = o.box.x + o.box.w / 2,
                cy = o.box.y + o.box.h / 2;
            ctx.translate(cx, cy);
            ctx.scale(s, s);
            ctx.translate(-cx, -cy);
        }
    } else if (part === 'bar') {
        ctx.globalAlpha *= k;
        ctx.translate(0, -12 * (1 - k));
    } else if (part === 'panels') {
        ctx.globalAlpha *= k;
        ctx.translate((o.dx ?? (state.back ? -22 : 22)) * (1 - k), (o.dy ?? 0) * (1 - k));
    } else {
        ctx.globalAlpha *= k;
    }
    draw();
    ctx.restore();
}

/** The menu screens an entrance plays between (a round's own phases change without one). */
const MENU_PHASES = new Set([
    'title',
    'modes',
    'roster',
    'maps',
    'profile',
    'settings',
    'matchinfo',
    'select',
    'mapselect',
]);

/** The screen being left, fading away over the new one as it starts building up. */
export class ScreenTransition {
    private old: HTMLCanvasElement | null = null;

    /** Whether a change of phase gets an entrance: from one menu screen to another. */
    static between(from: string, to: string): boolean {
        return from !== to && MENU_PHASES.has(from) && MENU_PHASES.has(to);
    }

    /**
     * Start an entrance from what `canvas` shows now (the screen being left; call before drawing the new one).
     * `back` says the player is going back, so panels slide in from the other side; `tab` makes it a change of tab,
     * where only the panels come in, quickly.
     */
    begin(canvas: HTMLCanvasElement, back: boolean, tab = false): void {
        // The last transition's canvas is kept and reused (resized to fit).
        const c = this.old ?? document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(canvas, 0, 0);
        this.old = c;
        state.start = performance.now();
        state.back = back;
        state.tab = tab;
    }

    /** Draw the screen being left fading away over the new one, and end the entrance once it's done. */
    draw(canvas: HTMLCanvasElement): void {
        if (!state.start) return;
        const ms = performance.now() - state.start;
        if (ms >= (state.tab ? TAB_DURATION : DURATION)) {
            state.start = 0;
            return;
        }
        const old = this.old;
        if (!old || ms >= FADE_OUT) return;
        const ctx = canvas.getContext('2d')!;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1 - easeOut(ms / FADE_OUT);
        ctx.drawImage(old, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
}
