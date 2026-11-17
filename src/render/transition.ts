// The wipe between menu screens (the lobby to Settings, Profile, Maps or Characters, and back): the screen being
// left stays on top and is wiped away by a slanted edge of golden light sweeping across, showing the new screen
// behind it. Going deeper sweeps left to right; going back to the lobby or the title, right to left.
import { sparkle } from './draw';

/** How long a wipe takes (ms). */
const DURATION = 420;

/** The screens a wipe plays between (a round's own phases change without one). */
const MENU_PHASES = new Set([
    'title',
    'modes',
    'roster',
    'maps',
    'profile',
    'settings',
    'matchinfo',
    'select',
    'mapselect',
]);

/** Eased progress: slow at both ends. */
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);

/** A wipe between two menu screens, drawn over the new screen once it has been drawn. */
export class ScreenTransition {
    private old: HTMLCanvasElement | null = null;
    private start = 0;
    private back = false;

    /** Whether a change of phase gets a wipe: from one menu screen to another. */
    static between(from: string, to: string): boolean {
        return from !== to && MENU_PHASES.has(from) && MENU_PHASES.has(to);
    }

    /**
     * Start a wipe from what `canvas` shows now (the screen being left; call before drawing the new one). `back`
     * says the player is going back, so the wipe sweeps the other way.
     */
    begin(canvas: HTMLCanvasElement, back: boolean): void {
        // The last wipe's canvas is kept and reused (resized to fit).
        const c = this.old ?? document.createElement('canvas');
        c.width = canvas.width;
        c.height = canvas.height;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.drawImage(canvas, 0, 0);
        this.old = c;
        this.start = performance.now();
        this.back = back;
    }

    /** Draw the wipe over the new screen on `canvas`, if one is under way. */
    draw(canvas: HTMLCanvasElement): void {
        const old = this.old;
        if (!old || !this.start) return;
        const k = (performance.now() - this.start) / DURATION;
        if (k >= 1) {
            this.start = 0;
            return;
        }
        const ctx = canvas.getContext('2d')!;
        const W = canvas.width,
            H = canvas.height;
        const slant = H * 0.35;
        // Where the edge is, across the width plus the slant, so it starts and ends off screen.
        const p = ease(k) * (W + slant * 2) - slant;
        const edge = this.back ? W - p : p;
        /** Trace the part of the screen the old picture still covers. */
        const covered = () => {
            ctx.beginPath();
            if (this.back) {
                ctx.moveTo(0, 0);
                ctx.lineTo(edge - slant / 2, 0);
                ctx.lineTo(edge + slant / 2, H);
                ctx.lineTo(0, H);
            } else {
                ctx.moveTo(edge + slant / 2, 0);
                ctx.lineTo(W, 0);
                ctx.lineTo(W, H);
                ctx.lineTo(edge - slant / 2, H);
            }
            ctx.closePath();
        };
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        // The old screen, darkening as it goes.
        ctx.save();
        covered();
        ctx.clip();
        ctx.drawImage(old, 0, 0, W, H);
        ctx.fillStyle = `rgba(10,4,26,${0.45 * k})`;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        // A band of golden light along the edge, and sparkles riding it.
        const band = Math.max(6, W * 0.012);
        ctx.save();
        ctx.translate(edge, H / 2);
        ctx.transform(1, 0, slant / H, 1, 0, 0);
        const g = ctx.createLinearGradient(-band * 3, 0, band * 3, 0);
        g.addColorStop(0, 'rgba(255,214,120,0)');
        g.addColorStop(0.45, 'rgba(255,236,190,0.85)');
        g.addColorStop(0.5, 'rgba(255,255,255,1)');
        g.addColorStop(0.55, 'rgba(255,236,190,0.85)');
        g.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = g;
        ctx.fillRect(-band * 3, -H / 2, band * 6, H);
        ctx.restore();
        ctx.fillStyle = '#fff6d0';
        for (let i = 0; i < 9; i++) {
            const y = ((i * 0.13 + k * 0.6) % 1) * H;
            const x = edge + (y / H - 0.5) * slant + Math.sin(i * 2.1 + k * 9) * band * 2;
            sparkle(ctx, x, y, band * (0.6 + 0.6 * Math.abs(Math.sin(i + k * 12))));
        }
        ctx.restore();
    }
}
