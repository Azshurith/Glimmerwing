// Shared synth voices for the effects and the music: two-operator FM, the bright, bell-and-brass sound of the
// arcade FM chips of TSS's day, built from plain Web Audio oscillators, and a small synthesised room reverb.
// Every patch here is original.

/** An FM patch: how the modulator is tuned and how its brightness and the volume move over a note. */
export interface FmPatch {
    /** Modulator frequency as a multiple of the note's (whole numbers sound tuned, others bell-like). */
    ratio: number;
    /** Brightness at the start of the note, as modulation depth in multiples of the note's frequency. */
    index: number;
    /** Brightness it settles to, and how fast it gets there (seconds). */
    indexEnd: number;
    indexTime: number;
    /** Volume attack (seconds); the note then decays to `sustain` of its peak by its end. */
    attack: number;
    sustain: number;
    /** Carrier wave: sine for most, triangle for a softer edge. */
    wave?: OscillatorType;
    /** A second carrier detuned by this many cents, for a fuller chorus (0 for none). */
    detune?: number;
}

/** The patches: names say what they sound like. */
export const PATCHES = {
    /** A glassy bell with a long shimmer: pops, chimes, sparkles. */
    bell: { ratio: 3.5, index: 4, indexEnd: 0.2, indexTime: 0.35, attack: 0.004, sustain: 0.02 },
    /** A tiny glockenspiel ping, shorter and higher than the bell. */
    glock: { ratio: 5, index: 2.5, indexEnd: 0.1, indexTime: 0.12, attack: 0.002, sustain: 0.01 },
    /** A tine electric piano for chords. */
    ep: { ratio: 1, index: 1.6, indexEnd: 0.25, indexTime: 0.25, attack: 0.006, sustain: 0.25, detune: 6 },
    /** A punchy slap bass. */
    bass: { ratio: 1, index: 2.2, indexEnd: 0.5, indexTime: 0.07, attack: 0.004, sustain: 0.55 },
    /** A brass stab that brightens as it opens: fanfares and bosses. */
    brass: { ratio: 1, index: 0.6, indexEnd: 2.4, indexTime: 0.06, attack: 0.025, sustain: 0.7, detune: 8 },
    /** A reedy lead for melodies. */
    lead: { ratio: 2, index: 1.3, indexEnd: 0.8, indexTime: 0.2, attack: 0.01, sustain: 0.6, detune: 5 },
    /** A plucked string for quick arpeggios. */
    pluck: { ratio: 1, index: 3, indexEnd: 0.2, indexTime: 0.09, attack: 0.002, sustain: 0.05, wave: 'triangle' },
} satisfies Record<string, FmPatch>;

/** One of the patch names. */
export type PatchName = keyof typeof PATCHES;

/**
 * Play one FM note into `dest`: `freq` Hz at time `t` for `dur` seconds, at peak volume `vol`; `to` slides the
 * pitch there over the note.
 */
export function fmNote(
    ctx: AudioContext,
    dest: AudioNode,
    patch: FmPatch,
    freq: number,
    t: number,
    dur: number,
    vol: number,
    to?: number,
): void {
    const g = ctx.createGain();
    g.connect(dest);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + patch.attack);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol * patch.sustain), t + Math.max(dur, patch.attack + 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);

    const mod = ctx.createOscillator();
    mod.frequency.setValueAtTime(freq * patch.ratio, t);
    if (to) mod.frequency.exponentialRampToValueAtTime(to * patch.ratio, t + dur);
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(freq * patch.index, t);
    depth.gain.exponentialRampToValueAtTime(Math.max(1, freq * patch.indexEnd), t + patch.indexTime);
    mod.connect(depth);

    const carriers = patch.detune ? [-patch.detune / 2, patch.detune / 2] : [0];
    const each = 1 / carriers.length;
    const mix = ctx.createGain();
    mix.gain.value = each;
    mix.connect(g);
    const stop = t + dur + 0.1;
    for (const cents of carriers) {
        const c = ctx.createOscillator();
        c.type = patch.wave ?? 'sine';
        c.frequency.setValueAtTime(freq, t);
        if (to) c.frequency.exponentialRampToValueAtTime(to, t + dur);
        c.detune.value = cents;
        depth.connect(c.frequency);
        c.connect(mix);
        c.start(t);
        c.stop(stop);
    }
    mod.start(t);
    mod.stop(stop);
}

/** A short synthesised room: decaying stereo noise as the impulse, so pops and chimes ring a little. */
export function makeReverb(ctx: AudioContext, seconds = 1.4): ConvolverNode {
    const rate = ctx.sampleRate,
        len = Math.floor(rate * seconds);
    const ir = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    return conv;
}

/** The frequency of a note `semi` semitones from A4. */
export const hz = (semi: number): number => 440 * Math.pow(2, semi / 12);
