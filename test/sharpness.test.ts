import { describe, expect, it } from 'vitest';
import { banded, curveAt, formatSharpness, shapeRecency, SHARPNESS_STOPS, sharpnessOf } from '../src/fade';
import { nearestStop } from '../src/duration';

const RECENCIES = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];

describe('sharpness', () => {
    it('draws exactly the curves the fade types drew', () => {
        for (const recency of RECENCIES) {
            // Linear is a sharpness of 1, and an exponential curve is its steepness.
            const linear = curveAt(1);
            expect(shapeRecency(linear.fadeType, recency, { steepness: linear.steepness, numSteps: 5 })).toBe(recency);
            expect(shapeRecency('linear', recency, { steepness: 2, numSteps: 5 })).toBe(recency);

            for (const sharpness of SHARPNESS_STOPS) {
                const curve = curveAt(sharpness);
                expect(shapeRecency(curve.fadeType, recency, { steepness: curve.steepness, numSteps: 5 })).toBeCloseTo(Math.pow(recency, sharpness), 12);
            }
        }
    });

    it('reads a saved curve back as the sharpness it was', () => {
        expect(sharpnessOf({ fadeType: 'linear', steepness: 2 })).toBe(1);
        expect(sharpnessOf({ fadeType: 'exponential', steepness: 2 })).toBe(2);
        expect(sharpnessOf({ fadeType: 'exponential', steepness: 7 })).toBe(7);
        for (const sharpness of SHARPNESS_STOPS) {
            expect(sharpnessOf(curveAt(sharpness))).toBe(sharpness);
        }
    });

    it('keeps the sharpness through bands and back', () => {
        // A straight line saved with the default steepness of 2 comes back straight.
        const straight = { fadeType: 'linear' as const, steepness: 2 };
        const there = banded(straight);
        expect(there.fadeType).toBe('step');
        expect(curveAt(sharpnessOf(there))).toEqual({ fadeType: 'linear', steepness: 1 });

        for (const sharpness of SHARPNESS_STOPS) {
            expect(sharpnessOf(banded(curveAt(sharpness)))).toBe(sharpness);
        }
    });

    it('puts a value between stops on the nearest one, by ratio', () => {
        expect(SHARPNESS_STOPS[nearestStop(SHARPNESS_STOPS, 1)]).toBe(1);
        expect(SHARPNESS_STOPS[nearestStop(SHARPNESS_STOPS, 7)]).toBe(6);
        expect(SHARPNESS_STOPS[nearestStop(SHARPNESS_STOPS, 0.1)]).toBe(0.25);
        expect(SHARPNESS_STOPS[nearestStop(SHARPNESS_STOPS, 3.4)]).toBe(3);
    });

    it('writes itself as a multiplier', () => {
        expect(formatSharpness(1)).toBe('× 1');
        expect(formatSharpness(0.33)).toBe('× 0.33');
        expect(formatSharpness(2.5)).toBe('× 2.5');
    });
});
