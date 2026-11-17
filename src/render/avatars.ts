// Avatars for the page (the chat panel): a fairy's face as a small picture, from her portrait when it has loaded,
// else her in-game look on a glow in her colour. Painted once per fairy and kept as a data URL.
import { fairyById } from '@/data/characters';
import { shade } from './draw';
import { drawFairy } from './entities/fairy';

/** Each fairy's avatar so far, with whether it came from her portrait (one painted before it loaded is redone). */
const cache = new Map<string, { url: string; portrait: boolean }>();

/** The size the avatars are painted at, in pixels. */
const SIZE = 96;

/** A fairy's avatar as a data URL (square; the page rounds it and puts the player's frame round it). */
export function avatarUrl(id: string): string {
    const fy = fairyById(id);
    const p = fy.portrait;
    const ready = !!p && p.img.complete && p.img.naturalWidth > 0;
    const had = cache.get(fy.id);
    if (had && (had.portrait || !ready)) return had.url;
    const c = document.createElement('canvas');
    c.width = c.height = SIZE;
    const ctx = c.getContext('2d')!;
    const bg = ctx.createRadialGradient(SIZE * 0.4, SIZE * 0.35, 4, SIZE / 2, SIZE / 2, SIZE * 0.7);
    bg.addColorStop(0, fy.color);
    bg.addColorStop(1, shade(fy.color, 0.3));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (ready) {
        const [fx, fyy, fr] = p.face;
        ctx.drawImage(p.img, fx - fr, fyy - fr, fr * 2, fr * 2, 0, 0, SIZE, SIZE);
    } else drawFairy(ctx, fy, SIZE / 2, SIZE * 0.56, 2.9, 0);
    const url = c.toDataURL('image/png');
    cache.set(fy.id, { url, portrait: ready });
    return url;
}
