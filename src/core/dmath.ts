// Maths that gives the same answer in every browser and on the server.
//
// A round is replayed (and checked by the server) by running the simulation again, so it must come out exactly the
// same everywhere. +, -, *, / and Math.sqrt are exact in every JavaScript engine (IEEE 754), but Math.sin, cos,
// atan2, hypot, pow and ** are left to each engine, and Safari's differ from Chrome's and Node's in the last digit.
// The simulation (src/game, src/core) uses these instead; drawing code can keep using Math.

const PIO2_HI = 1.5707963267341256; // π/2 split in two, so k·π/2 is subtracted without losing digits
const PIO2_LO = 6.077100506506192e-11;
const PIO2 = Math.PI / 2;
const SQRT3 = 1.7320508075688772;
const TAN_PI_12 = 0.2679491924311227; // 2 - √3

/** sin(r) for |r| ≤ π/4, by its Taylor series (Horner form), good to about 1e-16. */
function sinCore(r: number): number {
    const z = r * r;
    return (
        r +
        r *
            z *
            (-1 / 6 +
                z *
                    (1 / 120 +
                        z *
                            (-1 / 5040 +
                                z *
                                    (1 / 362880 +
                                        z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000)))))))
    );
}

/** cos(r) for |r| ≤ π/4, by its Taylor series. */
function cosCore(r: number): number {
    const z = r * r;
    return (
        1 +
        z *
            (-1 / 2 +
                z *
                    (1 / 24 +
                        z *
                            (-1 / 720 +
                                z * (1 / 40320 + z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200)))))))
    );
}

/** x brought into [-π/4, π/4], and which quarter turn it came from (0 to 3). */
function reduce(x: number): [number, number] {
    const k = Math.round(x / PIO2);
    const r = x - k * PIO2_HI - k * PIO2_LO;
    return [r, ((k % 4) + 4) % 4];
}

/** The sine of x, the same in every engine. */
export function sin(x: number): number {
    const [r, q] = reduce(x);
    return q === 0 ? sinCore(r) : q === 1 ? cosCore(r) : q === 2 ? -sinCore(r) : -cosCore(r);
}

/** The cosine of x, the same in every engine. */
export function cos(x: number): number {
    const [r, q] = reduce(x);
    return q === 0 ? cosCore(r) : q === 1 ? -sinCore(r) : q === 2 ? -cosCore(r) : sinCore(r);
}

/** atan(t) for 0 ≤ t ≤ 2 - √3, by its series. */
function atanCore(t: number): number {
    const z = t * t;
    let s = 0;
    for (let n = 23; n >= 3; n -= 2) s = z * (1 / n - s);
    return t * (1 - s);
}

/** The arctangent of x, the same in every engine. */
export function atan(x: number): number {
    if (x !== x) return x;
    const neg = x < 0;
    let t = neg ? -x : x;
    let base = 0;
    if (t > 1) {
        t = 1 / t;
        base = PIO2;
    }
    let a: number;
    // Bring it under tan(π/12) by atan(t) = π/6 + atan((√3·t - 1) / (t + √3)).
    if (t > TAN_PI_12) a = Math.PI / 6 + atanCore((SQRT3 * t - 1) / (t + SQRT3));
    else a = atanCore(t);
    if (base) a = base - a;
    return neg ? -a : a;
}

/** The angle of the point (x, y), as Math.atan2, the same in every engine. */
export function atan2(y: number, x: number): number {
    if (x > 0) return atan(y / x);
    if (x < 0) return y >= 0 ? atan(y / x) + Math.PI : atan(y / x) - Math.PI;
    return y > 0 ? PIO2 : y < 0 ? -PIO2 : 0;
}

/** The arcsine of x (-1 to 1), the same in every engine. */
export function asin(x: number): number {
    return atan2(x, Math.sqrt(Math.max(0, 1 - x * x)));
}

/** The length of (x, y): Math.hypot for two values, the same in every engine. */
export function hypot(x: number, y: number): number {
    return Math.sqrt(x * x + y * y);
}

/** x squared, by multiplying (`** 2` is left to each engine's pow). */
export const sq = (x: number) => x * x;

/** x to a whole power n ≥ 0, by multiplying. */
export function powi(x: number, n: number): number {
    let r = 1;
    for (let i = 0; i < n; i++) r *= x;
    return r;
}

/** e to the power x, by its series after halving x until it's small, the same in every engine. */
export function exp(x: number): number {
    let k = 0;
    while (x > 0.5 || x < -0.5) {
        x /= 2;
        k++;
    }
    let s = 1,
        term = 1;
    for (let n = 1; n < 18; n++) {
        term = (term * x) / n;
        s += term;
    }
    for (let i = 0; i < k; i++) s *= s;
    return s;
}

/** x to the power y for x > 0, as e^(y·ln x), the same in every engine. */
export function pow(x: number, y: number): number {
    if (Number.isInteger(y) && y >= 0 && y < 64) return powi(x, y);
    return exp(y * ln(x));
}

/** The natural logarithm of x > 0, by Newton's method on exp, the same in every engine. */
export function ln(x: number): number {
    // A first guess from the exponent bits, then refine.
    let k = 0;
    while (x > 2) {
        x /= 2;
        k++;
    }
    while (x < 0.5) {
        x *= 2;
        k--;
    }
    let y = x - 1;
    for (let i = 0; i < 6; i++) y = y + (2 * (x - exp(y))) / (x + exp(y));
    return y + k * 0.6931471805599453;
}
