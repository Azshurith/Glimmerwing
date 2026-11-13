import * as C from '@/core/config';
import type { Controls, Pos } from '@/types';

// Buttons follow the arcade: A shoots (hold to charge), B blooms (the bomb), C autofires.
const KEYMAP_SOLO: Record<string, keyof Controls> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
    Space: 'fire',
    KeyZ: 'fire',
    KeyJ: 'fire',
    KeyG: 'fire',
    KeyX: 'bloom',
    KeyK: 'bloom',
    ShiftLeft: 'bloom',
    KeyH: 'bloom',
    KeyC: 'auto',
    KeyL: 'auto',
    KeyF: 'auto',
};
const KEYMAP_P1: Record<string, keyof Controls> = {
    KeyA: 'left',
    KeyD: 'right',
    KeyW: 'up',
    KeyS: 'down',
    KeyF: 'auto',
    KeyG: 'fire',
    KeyH: 'bloom',
};
const KEYMAP_P2: Record<string, keyof Controls> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Enter: 'fire',
    Slash: 'fire',
    ShiftRight: 'bloom',
    Period: 'bloom',
    Quote: 'auto',
};

/**
 * Gamepads (standard mapping) press the same keys a keyboard player would, so
 * menus and modes need nothing special. Pad 1 plays as player one (WASD side),
 * pad 2 as player two (arrows side). Both: A shoots/charges, B blooms, X or Y
 * autofires, Start confirms, Back/Select pauses or backs out.
 */
const PAD_KEYS = [
    {
        left: 'KeyA',
        right: 'KeyD',
        up: 'KeyW',
        down: 'KeyS',
        a: 'KeyG',
        b: 'KeyH',
        c: 'KeyF',
        start: 'Space',
        back: 'Escape',
    },
    {
        left: 'ArrowLeft',
        right: 'ArrowRight',
        up: 'ArrowUp',
        down: 'ArrowDown',
        a: 'Enter',
        b: 'ShiftRight',
        c: 'Quote',
        start: 'Enter',
        back: 'Escape',
    },
];
const STICK_DEADZONE = 0.45;

/** Controls with nothing pressed. */
const blank = (): Controls => ({ left: false, right: false, up: false, down: false, fire: false, target: null });

/** Finger travel to fairy travel: a little over 1:1, so a thumb doesn't have to cross the whole meadow. */
const DRAG_GAIN = 1.3;
/**
 * Touch gestures: one finger held steers and autofires; a second finger held charges, and lifting
 * it fires; a double tap sets off a bomb. A tap is a touch shorter than TAP_MS that moved less than
 * TAP_MOVE; a double tap is a second touch landing within DOUBLE_TAP_MS of the first tap lifting,
 * and within DOUBLE_TAP_DIST of it (view units).
 */
const TAP_MS = 250;
const TAP_MOVE = 10;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_DIST = 48;

/** A finger (or mouse/pen) on the playfield. */
interface Finger {
    id: number;
    /** Which half of the view it landed in: 0 left meadow, 1 right meadow. */
    side: 0 | 1;
    x: number;
    y: number;
    /** Where it landed, and where that player's fairy was then (filled on first read). */
    sx: number;
    sy: number;
    anchor: { x: number; y: number } | null;
    /** When it landed (ms), and whether it has moved far enough not to count as a tap. */
    t0: number;
    moved: boolean;
}

/**
 * Keyboard, gamepad and touch, merged into per-player controls. Tracks keys held and pressed this frame, and fingers
 * on the playfield.
 */
export class Input {
    readonly held = new Set<string>();
    /** Keys currently held by a gamepad, kept apart so keyboard key-ups can't cancel them. */
    private padHeld = new Set<string>();
    pressed = new Set<string>();
    /** Fingers on the playfield, in the order they landed. */
    private fingers: Finger[] = [];
    /** A double tap sets off a bloom: anywhere for one player, on their own side for two. */
    private bombAny = false;
    private bombSide: [boolean, boolean] = [false, false];
    /** The last quick tap to lift, for spotting a double tap. */
    private lastTap: { t: number; x: number; y: number; side: 0 | 1 } | null = null;
    /** True once the last thing the player touched was a touchscreen, for on-screen prompts. */
    touchActive = matchMedia?.('(pointer: coarse)').matches ?? false;
    /** Where the most recent tap landed this frame, in view coordinates. */
    tap: { x: number; y: number } | null = null;
    /** The current view size in view units; the page points this at the renderer's layout. */
    viewSize: () => { w: number; h: number; ox?: number } = () => ({ w: C.VIEW_W, h: C.VIEW_H });

    constructor(canvas: HTMLCanvasElement) {
        window.addEventListener('keydown', e => {
            // Typing a room code in the online lobby shouldn't steer a fairy.
            if ((e.target as HTMLElement | null)?.closest?.('#lobby')) return;
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
            if (!this.held.has(e.code)) this.pressed.add(e.code);
            this.held.add(e.code);
            this.touchActive = false;
        });
        window.addEventListener('keyup', e => this.held.delete(e.code));
        window.addEventListener('blur', () => this.held.clear());

        const toView = (e: PointerEvent) => {
            const r = canvas.getBoundingClientRect();
            const v = this.viewSize();
            // A widened menu sits `ox` in from the left; touches are in its own units.
            return {
                x: ((e.clientX - r.left) / r.width) * v.w - (v.ox ?? 0),
                y: ((e.clientY - r.top) / r.height) * v.h,
            };
        };
        canvas.addEventListener('pointerdown', e => {
            e.preventDefault();
            canvas.setPointerCapture(e.pointerId);
            this.touchActive = e.pointerType !== 'mouse';
            const p = toView(e);
            const vs = this.viewSize();
            const side: 0 | 1 = p.x < (vs.w - 2 * (vs.ox ?? 0)) / 2 ? 0 : 1;
            const now = performance.now();
            // A touch landing just after a quick tap, close to it, is a double tap: a bomb.
            const lt = this.lastTap;
            if (lt && now - lt.t < DOUBLE_TAP_MS && Math.hypot(p.x - lt.x, p.y - lt.y) < DOUBLE_TAP_DIST) {
                this.bombAny = true;
                if (lt.side === side) this.bombSide[side] = true;
                this.lastTap = null;
            }
            this.fingers.push({ id: e.pointerId, side, ...p, sx: p.x, sy: p.y, anchor: null, t0: now, moved: false });
            this.pressed.add('Pointer');
            this.tap = p;
        });
        canvas.addEventListener('pointermove', e => {
            const f = this.fingers.find(f => f.id === e.pointerId);
            if (!f) return;
            Object.assign(f, toView(e));
            if (Math.hypot(f.x - f.sx, f.y - f.sy) > TAP_MOVE) f.moved = true;
        });
        const up = (e: PointerEvent) => {
            const f = this.fingers.find(f => f.id === e.pointerId);
            const now = performance.now();
            // Remember a quick, still touch as a tap, so a second one soon after makes a double tap.
            if (f && !f.moved && now - f.t0 < TAP_MS) this.lastTap = { t: now, x: f.x, y: f.y, side: f.side };
            this.fingers = this.fingers.filter(f => f.id !== e.pointerId);
        };
        canvas.addEventListener('pointerup', up);
        canvas.addEventListener('pointercancel', up);
        // Long-press menus and text selection get in the way of holding to charge.
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    /** On-screen buttons press and release keys, so they work everywhere keys do. */
    virtual(code: string, down: boolean): void {
        if (down) {
            if (!this.held.has(code)) this.pressed.add(code);
            this.held.add(code);
            this.touchActive = true;
        } else this.held.delete(code);
    }

    /** Read the gamepads once per display frame, turning their buttons into key presses. */
    pollPads(): void {
        const pads = navigator.getGamepads?.() ?? [];
        const now = new Set<string>();
        let slot = 0;
        for (const pad of pads) {
            if (!pad || !pad.connected || slot >= PAD_KEYS.length) continue;
            const k = PAD_KEYS[slot++];
            const b = (i: number) => !!pad.buttons[i]?.pressed;
            const ax = pad.axes[0] ?? 0,
                ay = pad.axes[1] ?? 0;
            if (b(14) || ax < -STICK_DEADZONE) now.add(k.left);
            if (b(15) || ax > STICK_DEADZONE) now.add(k.right);
            if (b(12) || ay < -STICK_DEADZONE) now.add(k.up);
            if (b(13) || ay > STICK_DEADZONE) now.add(k.down);
            if (b(0)) now.add(k.a);
            if (b(1)) now.add(k.b);
            if (b(2) || b(3)) now.add(k.c);
            if (b(9)) now.add(k.start);
            if (b(8)) now.add(k.back);
        }
        for (const code of now) if (!this.padHeld.has(code) && !this.held.has(code)) this.pressed.add(code);
        this.padHeld = now;
    }

    /** Forget this frame's presses and taps; called after each simulation step. */
    endFrame(): void {
        this.pressed.clear();
        this.tap = null;
        this.bombAny = false;
        this.bombSide = [false, false];
    }

    /** Controls from a key map, counting keys held on the keyboard or a pad, or tapped this frame. */
    private read(map: Record<string, keyof Controls>): Controls {
        const c = blank();
        for (const [code, action] of Object.entries(map)) {
            // A very quick tap can start and end between frames; still count it.
            if (this.held.has(code) || this.padHeld.has(code) || this.pressed.has(code))
                (c as unknown as Record<string, boolean>)[action] = true;
        }
        return c;
    }

    /**
     * Touch for one player: the fairy moves with the first finger, relative to where she was when
     * it landed, so the finger never hides her and can rest anywhere. One finger held autofires;
     * with a second finger down she charges instead, and lifting it fires the charge.
     * `side` null takes fingers anywhere (one player on the device).
     */
    private drag(c: Controls, side: 0 | 1 | null, me: Pos | undefined): void {
        const mine = this.fingers.filter(f => side === null || f.side === side);
        const f = mine[0];
        if (!f || !me) return;
        f.anchor ??= { x: me.x, y: me.y };
        c.target = {
            x: Math.max(0, Math.min(C.FIELD_W, f.anchor.x + (f.x - f.sx) * DRAG_GAIN)),
            y: Math.max(0, Math.min(C.FIELD_H, f.anchor.y + (f.y - f.sy) * DRAG_GAIN)),
        };
        c.auto = true;
        if (mine.length >= 2) c.fire = true;
    }

    /** Controls for one player using every input: keys, pads and touch anywhere. */
    solo(me?: Pos): Controls {
        const c = this.read(KEYMAP_SOLO);
        this.drag(c, null, me);
        if (this.bombAny) c.bloom = true;
        return c;
    }
    /** Two players on one device: each steers with fingers on their own meadow. */
    p1(me?: Pos): Controls {
        const c = this.read(KEYMAP_P1);
        this.drag(c, 0, me);
        if (this.bombSide[0]) c.bloom = true;
        return c;
    }
    /** Controls for player 2 when two players share one device. */
    p2(me?: Pos): Controls {
        const c = this.read(KEYMAP_P2);
        this.drag(c, 1, me);
        if (this.bombSide[1]) c.bloom = true;
        return c;
    }
}
