// Adaptive resolution: when frames come late (a Fever volley filling both meadows on a phone), the canvas
// draws fewer pixels until it keeps up again, rather than dropping frames. The page keeps its size; only
// the canvas's backing store shrinks, so the picture gets a little softer for those moments.

/** Lowest resolution scale it drops to. */
const MIN_SCALE = 0.55;
/** Each step down multiplies the scale by this; a step back up divides by it. */
const STEP = 0.85;
/** Frames count as late beyond this many times the display's own frame time. */
const LATE = 1.3;
/** Seconds it waits before judging, at the start and after each change (loading, the new size settling). */
const SETTLE = 1.5;
/** Seconds of late frames before stepping down. */
const DROP_AFTER = 0.5;
/** Seconds without late frames before trying a step up; doubles each time a step up didn't hold. */
const RISE_AFTER = 3;
const RISE_AFTER_MAX = 40;

/** Watches frame times and picks the canvas resolution scale. */
export class AdaptiveResolution {
    /** The current scale, 1 for full resolution. */
    scale = 1;
    /** The display's frame time as seen: the shortest smoothed frame time yet (1/60 s until it sees one). */
    private refresh = 1 / 60;
    /** Smoothed frame time. */
    private avg = 1 / 60;
    private late = 0;
    private onTime = 0;
    private riseAfter = RISE_AFTER;
    /** Seconds since the last step up, to tell whether it held. */
    private sinceRise = Infinity;
    /** Seconds left before it judges frames again. */
    private settle = SETTLE;

    /** Feed one frame's time in seconds; returns true when the scale changed and the canvas should be resized. */
    frame(dt: number): boolean {
        // Ignore stalls (a hidden tab, a debugger) and impossible readings.
        if (dt <= 0 || dt > 0.12) return false;
        this.avg += (dt - this.avg) * 0.1;
        this.sinceRise += dt;
        if (this.settle > 0) {
            this.settle -= dt;
            return false;
        }
        this.refresh = Math.max(1 / 240, Math.min(this.refresh, this.avg));
        if (this.avg > this.refresh * LATE) {
            this.onTime = 0;
            this.late += dt;
            if (this.late >= DROP_AFTER && this.scale > MIN_SCALE) {
                // A step up that didn't hold makes the next try wait longer.
                if (this.sinceRise < this.riseAfter) this.riseAfter = Math.min(RISE_AFTER_MAX, this.riseAfter * 2);
                this.scale = Math.max(MIN_SCALE, this.scale * STEP);
                return this.changed();
            }
        } else {
            this.late = 0;
            this.onTime += dt;
            if (this.onTime >= this.riseAfter && this.scale < 1) {
                this.scale = Math.min(1, this.scale / STEP);
                this.sinceRise = 0;
                return this.changed();
            }
        }
        return false;
    }

    /** After a step: start the counts over (the new size takes a moment to settle) and report the change. */
    private changed(): boolean {
        this.late = 0;
        this.onTime = 0;
        this.settle = 0.5;
        return true;
    }
}
