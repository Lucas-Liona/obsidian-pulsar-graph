import { describe, expect, it } from 'vitest';
import { OpacityRange, withinRanges } from '../src/filter';
import { describeSummary, keepsNote, openNoteMatters, summariseRanges } from '../src/range-stats';
import { fakeVault, newest, seeded } from './vault';

const NOW = Date.UTC(2026, 9, 7, 12);
const HOUR = 60 * 60 * 1000;

describe('keepsNote', () => {
    const none = new Set<string>();

    it('keeps a note inside a range and drops one outside', () => {
        expect(keepsNote('a', 0.5, [{ from: 0.4, to: 0.6 }], none)).toBe(true);
        expect(keepsNote('a', 0.7, [{ from: 0.4, to: 0.6 }], none)).toBe(false);
    });

    it('reads a brightness above 1 as the top of the line', () => {
        expect(keepsNote('a', 2.5, [{ from: 0.9, to: 1 }], none)).toBe(true);
    });

    it('keeps what is exempt or not yet graded, whatever the range', () => {
        expect(keepsNote('a', 0.1, [{ from: 0.5, to: 1 }], new Set(['a']))).toBe(true);
        expect(keepsNote('a', undefined, [{ from: 0.5, to: 1 }], none)).toBe(true);
    });
});

describe('summariseRanges', () => {
    it('counts what survives and the ages at its ends', () => {
        const notes: [string, number][] = [['old', NOW - 100 * HOUR], ['mid', NOW - 10 * HOUR], ['new', NOW - HOUR]];
        const strength = new Map([['old', 0.1], ['mid', 0.5], ['new', 0.9]]);

        const summary = summariseRanges(notes, (path) => strength.get(path), [{ from: 0.4, to: 1 }], new Set());

        expect(summary).toEqual({ kept: 2, total: 3, newest: NOW - HOUR, oldest: NOW - 10 * HOUR });
    });

    // The quadratic version this replaced, written out so the two can be held
    // to the same answers on vaults neither was tuned against.
    it('agrees with asking about the exemptions once per note', () => {
        const random = seeded(7);

        for (let trial = 0; trial < 25; trial++) {
            const { mtimes, strengths } = fakeVault(300, trial + 1, NOW);
            const from = random() * 0.9;
            const ranges: OpacityRange[] = [{ from, to: from + 0.1 + random() * (1 - from - 0.1) }];

            const slow = { kept: 0, newest: 0, oldest: Number.POSITIVE_INFINITY };
            for (const [path, mtime] of mtimes) {
                const exempt = ['notes/0.md', ...newest(mtimes, 3)];
                const strength = strengths.get(path);

                if (strength === undefined || exempt.includes(path) || withinRanges(Math.min(1, Math.max(0, strength)), ranges)) {
                    slow.kept++;
                    slow.newest = Math.max(slow.newest, mtime);
                    slow.oldest = Math.min(slow.oldest, mtime);
                }
            }

            const fast = summariseRanges(mtimes, (path) => strengths.get(path), ranges, new Set(['notes/0.md', ...newest(mtimes, 3)]));

            expect(fast).toEqual({ ...slow, total: mtimes.size });
        }
    });
});

describe('describeSummary', () => {
    it('says nothing is left when nothing is', () => {
        expect(describeSummary({ kept: 0, total: 12, newest: 0, oldest: Infinity }, NOW)).toBe('Nothing in range, of 12 notes.');
    });

    it('gives the count, the share and both ends', () => {
        const text = describeSummary({ kept: 230, total: 1100, newest: NOW - 12 * 60 * 1000, oldest: NOW - 40 * 24 * HOUR }, NOW);

        expect(text).toBe('230 of 1100 notes · 21% · 12 minutes ago back to 1 month ago');
    });

    it('says one age when both ends are the same note', () => {
        expect(describeSummary({ kept: 1, total: 1100, newest: NOW - HOUR, oldest: NOW - HOUR }, NOW)).toBe('1 of 1100 notes · <1% · 1 hour ago');
    });
});

// Every note open re-ran the filter over the whole vault, which cost a 167 ms
// block per tab switch at 20,000 notes, for a result that almost never changed.
describe('openNoteMatters', () => {
    const inRange = new Set(['kept.md', 'also kept.md']);
    const kept = (path: string): boolean => inRange.has(path);

    it('changes nothing between two notes the filter keeps anyway', () => {
        expect(openNoteMatters('kept.md', 'also kept.md', kept)).toBe(false);
    });

    it('matters when leaving a note that was only there because it was open', () => {
        expect(openNoteMatters('old.md', 'kept.md', kept)).toBe(true);
    });

    it('matters when opening a note the filter would drop', () => {
        expect(openNoteMatters('kept.md', 'old.md', kept)).toBe(true);
    });

    it('matters when nothing was open and an outside note opens, and not the other way round for a kept one', () => {
        expect(openNoteMatters(null, 'old.md', kept)).toBe(true);
        expect(openNoteMatters(null, 'kept.md', kept)).toBe(false);
        expect(openNoteMatters('kept.md', null, kept)).toBe(false);
    });

    it('changes nothing when the same note opens again', () => {
        expect(openNoteMatters('old.md', 'old.md', kept)).toBe(false);
    });
});
