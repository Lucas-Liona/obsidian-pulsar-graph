import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { FADE_TYPES, FadeOptions, shapeRecency } from '../src/fade';

/**
 * The curves, over every setting the settings tab can store: steepness 0.1 to
 * 10 and 1 to 20 steps (STEEPNESS_RANGE and STEPS_RANGE in settings.ts), any
 * recency from the oldest note to the newest.
 */
const recency = fc.double({ min: 0, max: 1, noNaN: true });
const fadeType = fc.constantFrom(...FADE_TYPES);
const options: fc.Arbitrary<FadeOptions> = fc.record({
    steepness: fc.double({ min: 0.1, max: 10, noNaN: true }),
    numSteps: fc.integer({ min: 1, max: 20 })
});

describe('shapeRecency', () => {
    it('stays within the opacity range it is a fraction of', () => {
        fc.assert(fc.property(fadeType, recency, options, (type, at, shape) => {
            const out = shapeRecency(type, at, shape);

            expect(out).toBeGreaterThanOrEqual(0);
            expect(out).toBeLessThanOrEqual(1);
        }));
    });

    // A newer note is never drawn fainter than an older one, whichever curve.
    it('never ranks an older note above a newer one', () => {
        fc.assert(fc.property(fadeType, recency, recency, options, (type, a, b, shape) => {
            const [older, newer] = a <= b ? [a, b] : [b, a];

            expect(shapeRecency(type, older, shape)).toBeLessThanOrEqual(shapeRecency(type, newer, shape));
        }));
    });

    it('puts the oldest note at the bottom and the newest at the top', () => {
        fc.assert(fc.property(fadeType, options, (type, shape) => {
            fc.pre(type !== 'step' || shape.numSteps >= 2);

            expect(shapeRecency(type, 0, shape)).toBe(0);
            expect(shapeRecency(type, 1, shape)).toBe(1);
        }));
    });

    // One step is no gradient at all, so every note is held at the top.
    it('draws everything at full strength with a single step', () => {
        fc.assert(fc.property(recency, options, (at, shape) => {
            expect(shapeRecency('step', at, { ...shape, numSteps: 1 })).toBe(1);
        }));
    });

    it('lands every step on one of its evenly spaced levels', () => {
        fc.assert(fc.property(recency, fc.integer({ min: 2, max: 20 }), (at, steps) => {
            const level = shapeRecency('step', at, { steepness: 2, numSteps: steps }) * (steps - 1);

            expect(Math.abs(level - Math.round(level))).toBeLessThan(1e-9);
        }));
    });
});
