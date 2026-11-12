/** Small, fast seeded PRNG (mulberry32), so both meadows roll identical waves. */
export class Rng {
    private s: number;
    constructor(seed: number) {
        this.s = seed >>> 0;
    }
    /** The next number in [0, 1), advancing the seed. */
    next(): number {
        this.s = (this.s + 0x6d2b79f5) >>> 0;
        let t = this.s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    /** A float in [a, b). */
    range(a: number, b: number): number {
        return a + (b - a) * this.next();
    }
    /** A whole number from a to b, both included. */
    int(a: number, b: number): number {
        return Math.floor(this.range(a, b + 1));
    }
}
