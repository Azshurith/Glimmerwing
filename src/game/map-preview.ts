// The Maps screen's live preview: a small meadow on the chosen map, running the real game code, so its own
// formations fly in, hold, re-form and leave, drawn as its own monsters. The fairy only drifts along the
// bottom and never shoots, so every formation plays out whole; the meadow starts over now and then.
import * as C from '@/core/config';
import { FAIRIES } from '@/data/characters';
import type { Controls, FormationSpec } from '@/types';
import { Field } from './field';

/** Seconds of a run before it starts over (the stage's formations get busier as a round goes on). */
const RUN_TIME = 40;
/** How much of the round runs unseen first, so the first formation is already on its way. */
const PREROLL = 1.4;
/** How high above the bottom the fairy drifts. */
const FLY_Y = 40;

/** Words for a formation's shape, entry and movement in the caption. */
const SHAPE: Record<string, string> = {
    line: 'Line',
    column: 'Column',
    diagonal: 'Diagonal',
    v: 'V',
    chevron: 'Chevron',
    arc: 'Arc',
    ring: 'Ring',
    grid: 'Grid',
    wave: 'Wave',
};
const MOVE: Record<string, string> = {
    sway: 'sways',
    bob: 'bobs',
    figure8: 'loops',
    orbit: 'orbits',
    march: 'marches',
    creep: 'creeps down',
};

/** A looping run of one map's formations, stepped by `Game` while the Maps screen is up. */
export class MapPreview {
    /** The meadow in the preview, or null while no map is shown. */
    field: Field | null = null;
    private mapId = '';
    private runs = 0;

    /** Show map `mapId`; a new map starts the run over. */
    show(mapId: string): void {
        if (mapId === this.mapId) return;
        this.mapId = mapId;
        this.runs = 0;
        this.restart();
    }

    /** What the meadow is showing: the latest formation's shape, how it moves, and whether it re-forms. */
    get caption(): string {
        const s: FormationSpec | null = this.field?.latestFormation ?? null;
        if (!s) return '';
        const parts = [`${SHAPE[s.shape] ?? s.shape} of ${s.count}`, MOVE[s.move] ?? s.move];
        if (s.morph) parts.push(`re-forms into a ${SHAPE[s.morph]?.toLowerCase() ?? s.morph}`);
        return parts.join(' · ');
    }

    /** Start the run from the top with a fresh meadow on the map. */
    private restart(): void {
        if (!this.mapId) {
            this.field = null;
            return;
        }
        const f = new Field(0x3a95 + this.runs * 7919, FAIRIES[0]);
        f.mapId = this.mapId;
        // Nothing can hurt her here.
        f.settled = true;
        f.player.y = C.FIELD_H - FLY_Y;
        this.field = f;
        for (let t = 0; t < PREROLL; t += C.STEP) this.run(f);
    }

    /** Advance the preview by one fixed step. */
    update(): void {
        const f = this.field;
        if (!f) return;
        if (f.time > RUN_TIME) {
            this.runs++;
            this.restart();
            return;
        }
        this.run(f);
    }

    /** Step the meadow once, the fairy drifting slowly from side to side; whatever it sends goes nowhere. */
    private run(f: Field): void {
        const x = C.FIELD_W / 2 + Math.sin(f.time * 0.6) * C.FIELD_W * 0.3;
        const input: Controls = {
            left: false,
            right: false,
            up: false,
            down: false,
            fire: false,
            target: { x, y: C.FIELD_H - FLY_Y },
        };
        f.update(C.STEP, input);
        f.outbox.length = 0;
        f.sfx.length = 0;
    }
}
