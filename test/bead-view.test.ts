import { describe, expect, it } from 'vitest';
import { placeBeads } from '../src/bead-view';
import { Bead } from '../src/history';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function bead(start: number, end: number): Bead {
    return { start, end, sizeStart: 0, sizeEnd: 0 };
}

describe('placeBeads', () => {
    it('puts a note with one sitting at the top, however long it ran', () => {
        expect(placeBeads([bead(0, 40 * MINUTE)])).toEqual([1]);
    });

    // The rail used to run from the first sitting's start, so its bottom was a
    // moment no bead was drawn at, and the oldest bead floated above it by its
    // own length.
    it('puts the oldest sitting at the bottom and the newest at the top', () => {
        const placed = placeBeads([bead(0, 2 * HOUR), bead(3 * HOUR, 3 * HOUR + MINUTE), bead(5 * HOUR, 6 * HOUR)]);

        expect(placed[0]).toBe(0);
        expect(placed[2]).toBe(1);
    });

    it('spaces sittings by when each one ended', () => {
        const placed = placeBeads([bead(0, HOUR), bead(2 * HOUR, 2 * HOUR), bead(4 * HOUR, 5 * HOUR)]);

        expect(placed[1]).toBeCloseTo(0.25);
    });

    it('puts sittings ending in the same instant all at the top', () => {
        expect(placeBeads([bead(0, HOUR), bead(HOUR, HOUR)])).toEqual([1, 1]);
    });

    it('places nothing for a note with no sittings', () => {
        expect(placeBeads([])).toEqual([]);
    });
});
