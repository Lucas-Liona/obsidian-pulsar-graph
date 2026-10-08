import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { COOLING_STOPS, formatDuration, nearestStop } from '../src/duration';
import { parseSettings } from '../src/settings';

/** Anything from a tenth of a second to a day, in seconds. */
const seconds = fc.double({ min: 0.1, max: 24 * 60 * 60, noNaN: true });
const stop = fc.integer({ min: 0, max: COOLING_STOPS.length - 1 });

describe('nearestStop', () => {
    it('picks a stop no further away, by ratio, than any other', () => {
        fc.assert(fc.property(seconds, (value) => {
            const chosen = Math.abs(Math.log(COOLING_STOPS[nearestStop(COOLING_STOPS, value)] / value));

            for (const other of COOLING_STOPS) {
                expect(chosen).toBeLessThanOrEqual(Math.abs(Math.log(other / value)) + 1e-12);
            }
        }));
    });

    // A longer duration never puts the thumb further left.
    it('never moves the thumb back for a longer duration', () => {
        fc.assert(fc.property(seconds, seconds, (a, b) => {
            const [shorter, longer] = a <= b ? [a, b] : [b, a];

            expect(nearestStop(COOLING_STOPS, shorter)).toBeLessThanOrEqual(nearestStop(COOLING_STOPS, longer));
        }));
    });
});

describe('a stop, saved and read back', () => {
    // What the slider writes is what the next load puts the thumb on.
    it('lands on the stop it was saved from', () => {
        fc.assert(fc.property(stop, (index) => {
            const saved = JSON.parse(JSON.stringify({ inkMinutes: COOLING_STOPS[index] / 60 })) as unknown;
            const read = parseSettings(saved).inkMinutes * 60;

            expect(nearestStop(COOLING_STOPS, read)).toBe(index);
            expect(formatDuration(read)).toBe(formatDuration(COOLING_STOPS[index]));
        }));
    });
});

describe('cools over, as stored', () => {
    it('is always between a second and four hours', () => {
        fc.assert(fc.property(fc.oneof(fc.double(), fc.integer(), fc.constant(null), fc.string()), (stored) => {
            const minutes = parseSettings({ inkMinutes: stored }).inkMinutes;

            expect(minutes).toBeGreaterThanOrEqual(1 / 60);
            expect(minutes).toBeLessThanOrEqual(240);
        }));
    });
});
