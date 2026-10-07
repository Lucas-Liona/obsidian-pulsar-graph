import { describe, expect, it } from 'vitest';
import { bandwidthFor, niceCeiling, smoothCounts, smoothPath } from '../src/density';

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

describe('smoothCounts', () => {
    it('keeps every note on the line, ends included', () => {
        const counts = new Array<number>(400).fill(0);
        counts[0] = 300;
        counts[399] = 50;
        counts[200] = 100;

        const density = smoothCounts(counts, 0.05);

        // Notes per line, integrated over the line.
        expect(sum(density) / 400).toBeCloseTo(450, 0);
    });

    it('leaves an even spread even, right up to the ends', () => {
        const density = smoothCounts(new Array<number>(200).fill(5), 0.06);

        expect(Math.max(...density) / Math.min(...density)).toBeLessThan(1.001);
    });

    it('meets each end level rather than at an angle', () => {
        const counts = new Array<number>(400).fill(0);
        counts[3] = 100;

        const density = smoothCounts(counts, 0.04);

        // Reflection makes the slope at the end zero.
        expect(Math.abs(density[1] - density[0]) / density[0]).toBeLessThan(0.01);
    });

    it('draws one bump as one bump: up, then down, never back', () => {
        const counts = new Array<number>(400).fill(0);
        counts[180] = 40;
        counts[200] = 60;
        counts[215] = 30;

        const density = smoothCounts(counts, 0.05);
        const slopes = density.slice(1).map((value, index) => Math.sign(Math.round((value - density[index]) * 1e6)));
        const turns = slopes.filter((slope, index) => index > 0 && slope !== 0 && slopes[index - 1] !== 0 && slope !== slopes[index - 1]);

        expect(turns.length).toBe(1);
    });
});

describe('bandwidthFor', () => {
    it('stays inside its limits', () => {
        const needle = new Array<number>(400).fill(0);
        needle[100] = 10_000;
        const spread = new Array<number>(400).fill(1);

        expect(bandwidthFor(needle)).toBe(0.02);
        expect(bandwidthFor(spread)).toBeGreaterThan(0.02);
        expect(bandwidthFor(spread)).toBeLessThanOrEqual(0.15);
        expect(bandwidthFor([0, 1, 0])).toBe(0.15);
    });
});

describe('niceCeiling', () => {
    it('rounds up to a number that halves cleanly', () => {
        expect(niceCeiling(0)).toBe(4);
        expect(niceCeiling(3)).toBe(4);
        expect(niceCeiling(9.2)).toBe(12);
        expect(niceCeiling(87)).toBe(100);
        expect(niceCeiling(120)).toBe(200);
        expect(niceCeiling(240)).toBe(400);
        expect(niceCeiling(452)).toBe(500);
        expect(niceCeiling(2600)).toBe(4000);
    });

    it('never more than doubles a value', () => {
        for (let value = 1; value < 5000; value += 7) {
            expect(niceCeiling(value) / value).toBeLessThanOrEqual(4);
            expect(niceCeiling(value) >= value).toBe(true);
            expect(Number.isInteger(niceCeiling(value) / 4)).toBe(true);
        }

        for (let value = 11; value < 5000; value += 7) {
            expect(niceCeiling(value) / value).toBeLessThanOrEqual(2);
        }
    });
});

describe('smoothPath', () => {
    it('passes through every point it is given', () => {
        const points: [number, number][] = [[0, 50], [10, 20], [20, 80], [30, 40]];
        const path = smoothPath(points);

        expect(path.startsWith('M0.00,50.00')).toBe(true);
        expect(path.match(/C/g)?.length).toBe(3);
        expect(path.endsWith('30.00,40.00')).toBe(true);
    });
});
