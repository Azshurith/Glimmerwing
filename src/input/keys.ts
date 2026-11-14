// Rebindable keyboard controls: the default keys, how a key is named on screen, and turning bindings into the
// code → action maps Input reads.
import type { KeyAction, KeyBindings, KeyScheme } from '@/types';

/** The actions in the order the Settings screen lists them, with their names there. */
export const KEY_ACTIONS: { action: KeyAction; label: string }[] = [
    { action: 'up', label: 'Up' },
    { action: 'down', label: 'Down' },
    { action: 'left', label: 'Left' },
    { action: 'right', label: 'Right' },
    { action: 'fire', label: 'Shoot / charge' },
    { action: 'bloom', label: 'Bomb' },
    { action: 'auto', label: 'Autofire' },
];

/** How many keys each action can have. */
export const KEYS_PER_ACTION = 2;

/** Keys that can't be bound: they pause, back out or mute everywhere. */
export const RESERVED_KEYS = new Set(['Escape', 'KeyP', 'KeyM', 'Tab']);

/**
 * The keys a player starts with. Playing alone, both the arrows and WASD steer, Z or Space shoots, X or Left
 * Shift bombs. Sharing a keyboard, player one keeps to the left (WASD, F G H) and player two to the right
 * (arrows, ' / Enter, Right Shift).
 */
export function defaultKeys(): KeyBindings {
    return {
        solo: {
            up: ['ArrowUp', 'KeyW'],
            down: ['ArrowDown', 'KeyS'],
            left: ['ArrowLeft', 'KeyA'],
            right: ['ArrowRight', 'KeyD'],
            fire: ['KeyZ', 'Space'],
            bloom: ['KeyX', 'ShiftLeft'],
            auto: ['KeyC', 'KeyF'],
        },
        p1: {
            up: ['KeyW'],
            down: ['KeyS'],
            left: ['KeyA'],
            right: ['KeyD'],
            fire: ['KeyG'],
            bloom: ['KeyH'],
            auto: ['KeyF'],
        },
        p2: {
            up: ['ArrowUp'],
            down: ['ArrowDown'],
            left: ['ArrowLeft'],
            right: ['ArrowRight'],
            fire: ['Enter', 'Slash'],
            bloom: ['ShiftRight', 'Period'],
            auto: ['Quote'],
        },
    };
}

/** Saved bindings made whole: anything missing or malformed falls back to its default. */
export function sanitizeKeys(saved: unknown): KeyBindings {
    const out = defaultKeys();
    if (!saved || typeof saved !== 'object') return out;
    for (const scheme of Object.keys(out) as KeyScheme[]) {
        const s = (saved as Record<string, unknown>)[scheme];
        if (!s || typeof s !== 'object') continue;
        for (const { action } of KEY_ACTIONS) {
            const keys = (s as Record<string, unknown>)[action];
            if (Array.isArray(keys) && keys.every(k => typeof k === 'string'))
                out[scheme][action] = (keys as string[]).slice(0, KEYS_PER_ACTION);
        }
    }
    return out;
}

/** One scheme's bindings as the code → action map Input reads. */
export function keyMap(b: KeyBindings, scheme: KeyScheme): Record<string, KeyAction> {
    const map: Record<string, KeyAction> = {};
    for (const { action } of KEY_ACTIONS) for (const code of b[scheme][action]) map[code] = action;
    return map;
}

/** Special names for keys whose code doesn't read well on its own. */
const NAMES: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Enter: 'Enter',
    ShiftLeft: 'L Shift',
    ShiftRight: 'R Shift',
    ControlLeft: 'L Ctrl',
    ControlRight: 'R Ctrl',
    AltLeft: 'L Alt',
    AltRight: 'R Alt',
    Backspace: 'Bksp',
    Slash: '/',
    Period: '.',
    Comma: ',',
    Quote: "'",
    Semicolon: ';',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
};

/** A key's name as the Settings screen shows it, e.g. 'KeyZ' → 'Z', 'ArrowLeft' → '←'. */
export function keyLabel(code: string): string {
    if (NAMES[code]) return NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
}
