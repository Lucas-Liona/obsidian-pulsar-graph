import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { contrastWithWhite, legibleOnLight, LIGHT_CONTRAST } from '../src/graph';

const rgb = fc.integer({ min: 0, max: 0xffffff });
const channels = (value: number): number[] => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];

describe('a colour of ours on a light theme', () => {
    it('always stands far enough off white', () => {
        fc.assert(fc.property(rgb, (colour) => {
            expect(contrastWithWhite(legibleOnLight(colour))).toBeGreaterThanOrEqual(LIGHT_CONTRAST);
        }));
    });

    it('is left exactly as picked when it already does', () => {
        fc.assert(fc.property(rgb.filter((colour) => contrastWithWhite(colour) >= LIGHT_CONTRAST), (colour) => {
            expect(legibleOnLight(colour)).toBe(colour);
        }));
    });

    it('is only ever darkened, and keeps the order of its channels, so the hue holds', () => {
        fc.assert(fc.property(rgb, (colour) => {
            const before = channels(colour);
            const after = channels(legibleOnLight(colour));

            for (let i = 0; i < 3; i++) {
                expect(after[i]).toBeLessThanOrEqual(before[i]);

                for (let j = 0; j < 3; j++) {
                    if (before[i] > before[j]) {
                        expect(after[i]).toBeGreaterThanOrEqual(after[j]);
                    }
                }
            }
        }));
    });

    it('is darkened no further than it takes', () => {
        fc.assert(fc.property(rgb.filter((colour) => contrastWithWhite(colour) < LIGHT_CONTRAST), (colour) => {
            expect(contrastWithWhite(legibleOnLight(colour))).toBeLessThan(LIGHT_CONTRAST + 0.25);
        }));
    });

    it('turns the default green into one that reads on white', () => {
        expect(contrastWithWhite(0x4dff91)).toBeCloseTo(1.31, 2);
        expect(legibleOnLight(0x4dff91)).toBe(0x33a960);
    });
});
