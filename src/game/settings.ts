import { defaultKeys, sanitizeKeys } from '@/input/keys';
import type { Settings } from '@/types';

const KEY = 'glimmerwing-settings-v1';
/** The settings a player starts with. */
const defaults = (): Settings => ({ hideRival: false, keys: defaultKeys() });

/** Read saved settings, or the defaults if there are none or storage is unavailable. */
export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const saved = JSON.parse(raw) as Partial<Settings>;
            return { ...defaults(), ...saved, keys: sanitizeKeys(saved.keys) };
        }
    } catch {
        /* storage unavailable: play with the defaults */
    }
    return defaults();
}

/** Save settings (silently skipped where storage is unavailable). */
export function saveSettings(s: Settings): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
        /* ignore */
    }
}
