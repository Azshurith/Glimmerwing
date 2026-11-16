// Which fairies and maps are switched off. The rows live in the characters and maps tables (is_enabled, or the
// row soft-deleted); the server reads them at start and again every little while, so a change made in
// phpMyAdmin takes effect without a restart. Without a database nothing is off.
import type { DataSource } from 'typeorm';
import { Character, GameMap } from './database/entities/catalog';
import type { CatalogResponse } from '@/types';

/** How often the switches are read again (ms). */
const REFRESH_MS = 15_000;

/** The fairies and maps that are switched off, as last read. */
export class Catalog {
    private characters = new Set<string>();
    private maps = new Set<string>();
    private timer: NodeJS.Timeout | null = null;

    constructor(private db: DataSource | null) {}

    /** Read the switches again (a failed read keeps the last ones). */
    async refresh(): Promise<void> {
        if (!this.db) return;
        try {
            const off = (r: { isEnabled: boolean; deletedAt: Date | null }) => !r.isEnabled || !!r.deletedAt;
            const [cs, ms] = await Promise.all([
                this.db.getRepository(Character).find({ withDeleted: true }),
                this.db.getRepository(GameMap).find({ withDeleted: true }),
            ]);
            this.characters = new Set(cs.filter(off).map(c => c.id));
            this.maps = new Set(ms.filter(off).map(m => m.id));
        } catch (e) {
            console.error('Reading the catalog failed:', e);
        }
    }

    /** Keep reading the switches every little while. */
    watch(): void {
        this.timer ??= setInterval(() => void this.refresh(), REFRESH_MS);
        this.timer.unref();
    }

    /** Stop reading them. */
    stop(): void {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    /** Whether the fairy `id` can be flown. */
    fairyOn(id: string): boolean {
        return !this.characters.has(id);
    }

    /** Whether the map `id` can be played on. */
    mapOn(id: string): boolean {
        return !this.maps.has(id);
    }

    /** What's switched off, as GET /api/catalog answers (and the verifier is told). */
    off(): CatalogResponse {
        return { disabledCharacters: [...this.characters], disabledMaps: [...this.maps] };
    }
}
