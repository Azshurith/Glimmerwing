import type { Settings } from '@/types';

const KEY = 'glimmerwing-settings-v1';
/** The settings a player starts with. */
const defaults = (): Settings => ({ hideRival: false });

/** Read saved settings, or the defaults if there are none or storage is unavailable. */
export function loadSettings(): Settings {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) return { ...defaults(), ...(JSON.parse(raw) as Partial<Settings>) };
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
