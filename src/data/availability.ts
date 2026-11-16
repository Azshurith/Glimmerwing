// Which fairies, maps and game modes the server has switched off (its characters, maps and types_modes tables). A
// switched-off fairy or map shows as locked and a mode's card is greyed out; none can be picked. With no server,
// everything is on; until it answers, what it said last time (kept in this browser) holds.
import type { CatalogResponse } from '@/types';

const CATALOG_KEY = 'glimmerwing-catalog-v1';

let offFairies = new Set<string>();
let offMaps = new Set<string>();
let offModes = new Set<string>();

/** Take on what the server has switched off, and keep it for next time (and for playing offline). */
export function setCatalog(c: CatalogResponse): void {
    offFairies = new Set(c.disabledCharacters);
    offMaps = new Set(c.disabledMaps);
    offModes = new Set(c.disabledModes ?? []);
    try {
        localStorage.setItem(CATALOG_KEY, JSON.stringify(c));
    } catch {
        /* storage unavailable */
    }
}

/** Take on what the server last said, as kept in this browser; answers with it (null if nothing's kept). */
export function loadCatalog(): CatalogResponse | null {
    try {
        const raw = localStorage.getItem(CATALOG_KEY);
        const c = raw ? (JSON.parse(raw) as Partial<CatalogResponse>) : null;
        if (!Array.isArray(c?.disabledCharacters) || !Array.isArray(c?.disabledMaps)) return null;
        setCatalog(c as CatalogResponse);
        return c as CatalogResponse;
    } catch {
        return null;
    }
}

/** Whether the fairy `id` can be picked. */
export const fairyAvailable = (id: string): boolean => !offFairies.has(id);

/** Whether the map `id` can be played on. */
export const mapAvailable = (id: string): boolean => !offMaps.has(id);

/** Whether the game mode `code` ('cpu', 'versus', 'endless', 'online') can be played. */
export const modeAvailable = (code: string): boolean => !offModes.has(code);

loadCatalog();
