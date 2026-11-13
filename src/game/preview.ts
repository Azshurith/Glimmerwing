// The Characters screen's live preview: a small meadow running the real game code, flown by a scripted pilot
// who shows off the fairy's plain shot, her charge shot and her bomb, then starts over.
import * as C from '@/core/config';
import type { Controls, Fairy } from '@/types';
import { Field } from './field';

/** The steps of the demo, in order. */
type Step = 'arrive' | 'shot' | 'charge' | 'watch' | 'bomb' | 'after';

/** How long the pilot spends on the timed steps, in seconds. */
const SHOT_TIME = 3;
const WATCH_TIME = 1.2;
const AFTER_TIME = 1.4;
/** The longest she waits for a formation before getting on with a step anyway. */
const WAIT_MAX = 4;
/** A formation counts as in once this many critters are in view and no more have come for `SETTLE` seconds. */
const FORMED = 4;
const SETTLE = 0.4;
/** How much of the round runs unseen before the demo starts, so the first formation is already on its way. */
const PREROLL = 2.2;
/** Round seeds whose first formations are big enough to show a chain well; the demo takes them in turn. */
const SEEDS = [0x5eed, 0x5eed + 2 * 7919, 0x5eed + 5 * 7919, 0x5eed + 7 * 7919, 0x5eed + 4 * 7919];
/** How high above the bottom she flies. */
const FLY_Y = 56;

/** A looping demo of one fairy's moves, stepped by `Game` while the Characters screen is up. */
export class SkillPreview {
    /** The meadow in the demo, or null while no unlocked fairy is in view. */
    field: Field | null = null;
    /** What she's showing right now, for the caption under the window. */
    caption = '';
    private fairy: Fairy | null = null;
    private step: Step = 'arrive';
    private stepT = 0;
    private loops = 0;
    /** Critters in view last step, and how long since more came in. */
    private lastSeen = 0;
    private calm = 0;

    /** Show `fairy` (null for none, e.g. while a locked one is in view); a new fairy starts the demo over. */
    show(fairy: Fairy | null): void {
        if (fairy === this.fairy) return;
        this.fairy = fairy;
        this.loops = 0;
        this.restart();
    }

    /** Start the demo from the top with a fresh meadow. */
    private restart(): void {
        const fy = this.fairy;
        if (!fy) {
            this.field = null;
            this.caption = '';
            return;
        }
        const f = new Field(SEEDS[this.loops % SEEDS.length], fy);
        // Nothing can hurt her here, and she has one charge level ready and a bomb to show.
        f.settled = true;
        f.gauge = C.GAUGE_LEVEL;
        f.player.y = C.FIELD_H - FLY_Y;
        this.field = f;
        this.go('arrive');
        for (let t = 0; t < PREROLL; t += C.STEP) this.run(f, idle(f));
    }

    /** Move on to `step`. */
    private go(step: Step): void {
        this.step = step;
        this.stepT = 0;
        this.calm = 0;
        const fy = this.fairy;
        if (!fy) return;
        this.caption =
            step === 'shot'
                ? 'SHOT'
                : step === 'charge' || step === 'watch'
                  ? `CHARGE SHOT · ${fy.chargeName}`
                  : step === 'bomb' || step === 'after'
                    ? `BOMB · ${fy.bomb.name}`
                    : '';
    }

    /** Advance the demo by one fixed step. */
    update(dt: number): void {
        const f = this.field;
        if (!f) return;
        this.stepT += dt;
        const p = f.player;
        // Critters she can see (below the HUD strip), and the middle of them, to fly under.
        const seen = f.puffs.filter(q => !q.dead && q.y > C.CRITTER_TOP && q.y < C.FIELD_H - 90);
        this.calm = seen.length > this.lastSeen ? 0 : this.calm + dt;
        this.lastSeen = seen.length;
        // A formation is in: enough critters, and no more coming (or she's waited long enough).
        const formed = (seen.length >= FORMED && this.calm > SETTLE) || this.stepT > WAIT_MAX;
        const aimX = seen.length ? seen.reduce((s, q) => s + q.x, 0) / seen.length : C.FIELD_W / 2;
        const input = idle(f);
        input.target = { x: aimX, y: C.FIELD_H - FLY_Y };
        switch (this.step) {
            case 'arrive':
                if (formed) this.go('shot');
                break;
            case 'shot':
                // Plain shots at the critter on the end: its burst sets off a chain, and she mops up what's left.
                this.mopUp(seen, input);
                if (seen.length === 0 || this.stepT > SHOT_TIME) this.go('charge');
                break;
            case 'charge':
                // A plain shot's chain usually takes the whole formation, so she charges while the next one
                // comes in, then lets go under it.
                input.fire = true;
                if (p.charge >= 1 && formed && Math.abs(p.x - aimX) < 4) input.fire = false;
                if (!input.fire) this.go('watch');
                break;
            case 'watch':
                // Then the bomb, once the next formation is in (clearing any stragglers holding it up).
                if (this.stepT > WATCH_TIME && this.fairy) this.caption = `BOMB · ${this.fairy.bomb.name}`;
                if (this.stepT > WATCH_TIME && seen.length < FORMED && this.calm > 0.8) this.mopUp(seen, input);
                if (this.stepT > WATCH_TIME && formed) this.go('bomb');
                break;
            case 'bomb':
                input.bloom = true;
                this.go('after');
                break;
            case 'after':
                if (this.stepT > (this.fairy?.bomb.time ?? 1) + AFTER_TIME) {
                    this.loops++;
                    this.restart();
                    return;
                }
                break;
        }
        this.run(f, input);
    }

    /** Fly under the critter furthest left and fire plain shots at it. */
    private mopUp(seen: { x: number }[], input: Controls): void {
        const p = this.field?.player;
        if (!p || !seen.length || !input.target) return;
        input.target.x = Math.min(...seen.map(q => q.x));
        input.auto = Math.abs(p.x - input.target.x) < 8;
    }

    /** Step the meadow once. There's no rival here: whatever she sends, and every sound, goes nowhere. */
    private run(f: Field, input: Controls): void {
        f.update(C.STEP, input);
        f.outbox.length = 0;
        f.sfx.length = 0;
    }
}

/** Controls with nothing pressed, holding her where she is. */
function idle(f: Field): Controls {
    return { left: false, right: false, up: false, down: false, fire: false, target: { x: f.player.x, y: f.player.y } };
}
