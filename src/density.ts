/**
 * The curve drawn over the age filter's histogram, and the scale it is drawn
 * against.
 *
 * Bars answer "how many notes are here" and are rough by nature: a bar's height
 * jumps whenever a note crosses its edge. The curve answers "where is the vault
 * thick and where is it thin", and should never jump. A Gaussian kernel is
 * smooth to every order, so the curve has a first and a second derivative
 * everywhere — no corners, however the notes fall.
 */

const ROOT_TWO_PI = Math.sqrt(2 * Math.PI);

/** Bandwidth limits, as fractions of the line. */
const NARROWEST = 0.02;
const WIDEST = 0.15;

/**
 * A density over the line from counts in equal bins across it, in notes per
 * whole line: multiply by a bar's width to read it in notes per bar.
 *
 * Reflected at both ends. The line stops at 0 and 1, and a kernel that spilled
 * past either would lose that mass and draw the ends too low; folding it back
 * keeps every note on the line and flattens the curve into each end instead of
 * cutting it off.
 */
export function smoothCounts(counts: number[], bandwidth: number): number[] {
    const bins = counts.length;
    const width = 1 / bins;
    const reach = Math.ceil((4 * bandwidth) / width);
    const out = new Array<number>(bins).fill(0);

    for (let from = 0; from < bins; from++) {
        const mass = counts[from];
        if (mass === 0) {
            continue;
        }

        const centre = (from + 0.5) * width;

        for (let to = Math.max(0, from - reach); to <= Math.min(bins - 1, from + reach); to++) {
            const at = (to + 0.5) * width;
            out[to] += mass * (kernel(at - centre, bandwidth) + kernel(at + centre, bandwidth) + kernel(at - (2 - centre), bandwidth));
        }
    }

    return out;
}

function kernel(distance: number, bandwidth: number): number {
    const z = distance / bandwidth;
    return Math.exp(-0.5 * z * z) / (bandwidth * ROOT_TWO_PI);
}

/**
 * How wide the kernel is, by Silverman's rule: wide enough to smooth out which
 * bin a note happened to land in, narrow enough to keep two real bumps apart.
 * Held between limits, because a vault of three notes has no spread to measure
 * and a vault that is all one clump would otherwise be drawn as a needle.
 */
export function bandwidthFor(counts: number[]): number {
    const total = counts.reduce((sum, count) => sum + count, 0);
    if (total < 2) {
        return WIDEST;
    }

    const width = 1 / counts.length;
    let mean = 0;
    counts.forEach((count, index) => {
        mean += count * (index + 0.5) * width;
    });
    mean /= total;

    let variance = 0;
    counts.forEach((count, index) => {
        variance += count * ((index + 0.5) * width - mean) ** 2;
    });
    const deviation = Math.sqrt(variance / (total - 1));

    const spread = Math.min(deviation, interquartile(counts, total) / 1.34) || deviation;
    const rule = 0.9 * spread * total ** -0.2;

    return Math.min(WIDEST, Math.max(NARROWEST, rule));
}

function interquartile(counts: number[], total: number): number {
    const width = 1 / counts.length;
    let seen = 0;
    let lower: number | null = null;

    for (let index = 0; index < counts.length; index++) {
        seen += counts[index];

        if (lower === null && seen >= total * 0.25) {
            lower = (index + 0.5) * width;
        }

        if (seen >= total * 0.75) {
            return (index + 0.5) * width - (lower ?? 0);
        }
    }

    return 0;
}

/**
 * The round number at or above a value that an axis can be labelled with.
 * "200" and its quarter "50", where the dotted line falls on a root scale,
 * read; "187" and "46.75" do not.
 */
export function niceCeiling(value: number): number {
    if (!(value > 0)) {
        return 4;
    }

    // Small counts get a multiple of four, so the dotted line — a quarter of
    // the top on a root scale — is a whole number of notes too.
    if (value <= 10) {
        return Math.max(4, 4 * Math.ceil(value / 4));
    }

    const power = 10 ** Math.floor(Math.log10(value));

    // Every step quarters to a whole number from 10 up, and none is more
    // than double the one before, so the curve always reaches past 70% of
    // the height on a root scale.
    for (const step of [1, 2, 4, 5, 8, 10]) {
        const top = step * power;

        if (top >= value - 1e-9 && Number.isInteger(top / 4)) {
            return top;
        }
    }

    return 10 * power;
}

/**
 * A smooth path through points, as SVG cubic segments.
 *
 * Catmull-Rom, which passes through every point with a matching slope on
 * either side of it. The points are already a smooth function sampled
 * finely, so this only stops the line between samples from bending at them.
 */
export function smoothPath(points: [number, number][]): string {
    if (points.length === 0) {
        return '';
    }

    const fixed = (value: number): string => value.toFixed(2);
    let path = `M${fixed(points[0][0])},${fixed(points[0][1])}`;

    for (let index = 0; index < points.length - 1; index++) {
        const before = points[Math.max(0, index - 1)];
        const from = points[index];
        const to = points[index + 1];
        const after = points[Math.min(points.length - 1, index + 2)];

        const first: [number, number] = [from[0] + (to[0] - before[0]) / 6, from[1] + (to[1] - before[1]) / 6];
        const second: [number, number] = [to[0] - (after[0] - from[0]) / 6, to[1] - (after[1] - from[1]) / 6];

        path += ` C${fixed(first[0])},${fixed(first[1])} ${fixed(second[0])},${fixed(second[1])} ${fixed(to[0])},${fixed(to[1])}`;
    }

    return path;
}
