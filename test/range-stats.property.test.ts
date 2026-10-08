import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { filterGraphData, OpacityRange } from '../src/filter';
import { keepsNote, openNoteMatters, summariseRanges } from '../src/range-stats';

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const ranges: fc.Arbitrary<OpacityRange[]> = fc.array(fc.record({ from: unit, to: unit }), { minLength: 1, maxLength: 3 });

/**
 * A vault: each note with a modification time, a brightness or none yet, and
 * a handful exempt. Times are drawn from a small set so ties are common, as
 * they are after an import.
 */
const vault = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 5 }), { maxLength: 40 }).chain((paths) => fc.record({
    notes: fc.array(fc.integer({ min: 0, max: 20 }), { minLength: paths.length, maxLength: paths.length })
        .map((times) => paths.map((path, index): [string, number] => [path, times[index] ?? 0])),
    strengths: fc.array(fc.option(fc.double({ min: -0.5, max: 3, noNaN: true }), { nil: undefined }), { minLength: paths.length, maxLength: paths.length }),
    exempt: fc.subarray(paths)
}));

describe('summariseRanges', () => {
    // The single pass has to say what walking the vault note by note says.
    it('counts and dates exactly what keepsNote keeps', () => {
        fc.assert(fc.property(vault, ranges, ({ notes, strengths, exempt }, chosen) => {
            const strength = new Map(notes.map(([path], index) => [path, strengths[index]]));
            const spared = new Set(exempt);
            const kept = notes.filter(([path]) => keepsNote(path, strength.get(path), chosen, spared));

            expect(summariseRanges(notes, (path) => strength.get(path), chosen, spared)).toEqual({
                kept: kept.length,
                total: notes.length,
                newest: Math.max(0, ...kept.map(([, mtime]) => mtime)),
                oldest: Math.min(Number.POSITIVE_INFINITY, ...kept.map(([, mtime]) => mtime))
            });
        }));
    });
});

describe('keepsNote', () => {
    // The readout under the bar and the graph itself answer the same question
    // through two functions; if they ever disagree, the count is a lie.
    it('keeps exactly what filterGraphData keeps', () => {
        fc.assert(fc.property(vault, ranges, ({ notes, strengths, exempt }, chosen) => {
            const strength = new Map(notes.map(([path], index) => [path, strengths[index]]));
            const spared = new Set(exempt);
            const data = { nodes: Object.fromEntries(notes.map(([path]) => [path, {}])) };

            const out = filterGraphData(data, { ranges: chosen, strengthOf: (path) => strength.get(path), keep: spared }) as { nodes: object };

            for (const [path] of notes) {
                expect(Object.prototype.hasOwnProperty.call(out.nodes, path)).toBe(keepsNote(path, strength.get(path), chosen, spared));
            }
        }));
    });
});

describe('openNoteMatters', () => {
    const path = fc.option(fc.constantFrom('a.md', 'b.md', 'c.md'), { nil: null });
    const keptAnyway = fc.subarray(['a.md', 'b.md', 'c.md']).map((kept) => (candidate: string): boolean => kept.includes(candidate));

    it('is false for a switch that goes nowhere', () => {
        fc.assert(fc.property(path, keptAnyway, (same, kept) => {
            expect(openNoteMatters(same, same, kept)).toBe(false);
        }));
    });

    // Only the open note's exemption moves, so a switch matters exactly when
    // one end of it is a note the ranges would drop by themselves.
    it('is true exactly when either end is not kept anyway', () => {
        fc.assert(fc.property(path, path, keptAnyway, (left, opened, kept) => {
            fc.pre(left !== opened);
            const dropped = (one: string | null): boolean => one !== null && !kept(one);

            expect(openNoteMatters(left, opened, kept)).toBe(dropped(left) || dropped(opened));
        }));
    });

    it('does not care which way the switch went', () => {
        fc.assert(fc.property(path, path, keptAnyway, (left, opened, kept) => {
            expect(openNoteMatters(left, opened, kept)).toBe(openNoteMatters(opened, left, kept));
        }));
    });
});
