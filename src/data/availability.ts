// Which fairies and maps the server has switched off (its characters and maps tables). A switched-off one shows
// as locked and can't be picked; with no server, or before it answers, everything is on.
import type { CatalogResponse } from '@/types';

const CATALOG_KEY = 'glimmerwing-catalog-v1';

let offFairies = new Set<string>();
let offMaps = new Set<string>();

/** Take on what the server has switched off, and keep it for next time (and for playing offline). */
export function setCatalog(c: CatalogResponse): void {
    offFairies = new Set(c.disabledCharacters);
    offMaps = new Set(c.disabledMaps);
    try {
        localStorage.setItem(CATALOG_KEY, JSON.stringify(c));
    } catch {
        /* storage unavailable */
    }
}

/** Take on what the server last said, as kept in this browser. */
export function loadCatalog(): void {
    try {
        const raw = localStorage.getItem(CATALOG_KEY);
        const c = raw ? (JSON.parse(raw) as Partial<CatalogResponse>) : null;
        if (Array.isArray(c?.disabledCharacters) && Array.isArray(c?.disabledMaps)) setCatalog(c as CatalogResponse);
    } catch {
        /* nothing kept */
    }
}

/** Whether the fairy `id` can be picked. */
export const fairyAvailable = (id: string): boolean => !offFairies.has(id);

/** Whether the map `id` can be played on. */
export const mapAvailable = (id: string): boolean => !offMaps.has(id);
