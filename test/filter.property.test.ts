import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { filterGraphData, isWholeRange, OpacityRange, rangeOntoCurve, withinRanges } from '../src/filter';

const unit = fc.double({ min: 0, max: 1, noNaN: true });

/** A stretch of the line, ends in either order, as a drag can leave them. */
const range: fc.Arbitrary<OpacityRange> = fc.record({ from: unit, to: unit });

/** One to three of them, which is as many as the bar lets anyone draw. */
const ranges = fc.array(range, { minLength: 1, maxLength: 3 });

/**
 * A value on a grid of ten thousandths, finer than any handle can be placed or
 * any slider set. Unconstrained doubles find only arithmetic: a range end of
 * 5e-324 halves to 0 and keeps a note at 0 it should not, which says nothing
 * about the migration.
 */
const fine = (highest: number): fc.Arbitrary<number> => fc.integer({ min: 0, max: highest * 10_000 }).map((step) => step / 10_000);

/** The opacity ends parseSettings can store: minimum 0 to 1, maximum up to 12, never crossed. */
const ends = fc.tuple(fine(1), fine(12)).map(([a, b]) => ({ min: Math.min(a, b), max: Math.max(a, b) }));

/** Where a note sits on the curve's line, as main.ts's filterPosition works it out. */
function position(opacity: number, min: number, max: number): number {
    const span = max - min;
    return span <= 0 ? 1 : (opacity - min) / span;
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

describe('rangeOntoCurve', () => {
    // The migration's promise: a range saved on the old axis — raw opacity,
    // clamped to 1 — selects exactly the same notes once moved onto the curve.
    //
    // Two kinds of input are left out, both degenerate:
    // - a minimum equal to the maximum, where every note is drawn the same and
    //   the curve has no length to put a range on;
    // - a range lying wholly above a maximum below 1, which kept nothing on
    //   the old axis and comes out as [1, 1] — and parseRanges drops any range
    //   that is not strictly wider than a point, so it never reaches a filter.
    it('keeps the same notes the old axis kept', () => {
        fc.assert(fc.property(ends, fc.record({ from: fine(1), to: fine(1) }), unit, ({ min, max }, old, where) => {
            fc.pre(max > min);
            fc.pre(!(max < 1 && Math.min(old.from, old.to) > max));

            const moved = rangeOntoCurve(old, min, max);
            fc.pre(moved.to > moved.from);

            const opacity = min + where * (max - min);
            const before = withinRanges(clamp01(opacity), [old]);
            const after = withinRanges(clamp01(position(opacity, min, max)), [moved]);

            expect(after).toBe(before);
        }), { numRuns: 500 });
    });

    it('never turns a range around, and stays on the line', () => {
        fc.assert(fc.property(ends, unit, unit, ({ min, max }, a, b) => {
            const [low, high] = a <= b ? [a, b] : [b, a];
            const moved = rangeOntoCurve({ from: low, to: high }, min, max);

            expect(moved.from).toBeLessThanOrEqual(moved.to);
            expect(moved.from).toBeGreaterThanOrEqual(0);
            expect(moved.to).toBeLessThanOrEqual(1);
        }));
    });

    it('moves a bigger value no lower than a smaller one', () => {
        fc.assert(fc.property(ends, unit, unit, ({ min, max }, a, b) => {
            const [low, high] = a <= b ? [a, b] : [b, a];
            const lower = rangeOntoCurve({ from: low, to: low }, min, max);
            const higher = rangeOntoCurve({ from: high, to: high }, min, max);

            expect(lower.from).toBeLessThanOrEqual(higher.from);
        }));
    });
});

describe('withinRanges and isWholeRange', () => {
    it('is in any range exactly when it is in one of them', () => {
        fc.assert(fc.property(unit, ranges, (value, chosen) => {
            expect(withinRanges(value, chosen)).toBe(chosen.some((one) => withinRanges(value, [one])));
        }));
    });

    it('counts the ends of a range as inside it', () => {
        fc.assert(fc.property(range, ({ from, to }) => {
            fc.pre(from <= to);

            expect(withinRanges(from, [{ from, to }])).toBe(true);
            expect(withinRanges(to, [{ from, to }])).toBe(true);
        }));
    });

    it('calls a range whole only when it keeps every point of the line', () => {
        fc.assert(fc.property(ranges, unit, (chosen, value) => {
            if (isWholeRange(chosen)) {
                expect(withinRanges(value, chosen)).toBe(true);
            }
        }));

        fc.assert(fc.property(range, ({ from, to }) => {
            expect(isWholeRange([{ from, to }])).toBe(from <= 0 && to >= 1);
        }));
    });
});

/** Graph data as the engine hands it over, with a brightness for some of its notes. */
const graph = fc.uniqueArray(fc.string({ minLength: 1, maxLength: 6 }), { maxLength: 30 }).chain((paths) => fc.record({
    paths: fc.constant(paths),
    strengths: fc.array(fc.option(fc.double({ min: -1, max: 4, noNaN: true }), { nil: undefined }), { minLength: paths.length, maxLength: paths.length }),
    keep: fc.subarray(paths)
}));

describe('filterGraphData', () => {
    function run(paths: string[], strengths: (number | undefined)[], keep: string[], chosen: OpacityRange[]) {
        const nodes = Object.fromEntries(paths.map((path) => [path, { type: '', links: {} }]));
        const strength = new Map(paths.map((path, index) => [path, strengths[index]]));
        let dropped = -1;

        const out = filterGraphData({ nodes, numLinks: 0 }, {
            ranges: chosen,
            strengthOf: (path) => strength.get(path),
            keep: new Set(keep),
            counted: (count) => {
                dropped = count;
            }
        }) as { nodes: Record<string, unknown>; numLinks: number };

        return { nodes, strength, out, dropped };
    }

    it('only ever takes nodes away, handing back the same objects', () => {
        fc.assert(fc.property(graph, ranges, ({ paths, strengths, keep }, chosen) => {
            const { nodes, out, dropped } = run(paths, strengths, keep, chosen);

            for (const [path, node] of Object.entries(out.nodes)) {
                expect(Object.prototype.hasOwnProperty.call(nodes, path)).toBe(true);
                expect(node).toBe(nodes[path]);
            }

            expect(dropped).toBe(paths.length - Object.keys(out.nodes).length);
            expect(out.numLinks).toBe(0);
        }));
    });

    it('keeps everything exempt and everything with no brightness to judge', () => {
        fc.assert(fc.property(graph, ranges, ({ paths, strengths, keep }, chosen) => {
            const { out, strength } = run(paths, strengths, keep, chosen);

            for (const path of keep) {
                expect(out.nodes).toHaveProperty([path]);
            }

            for (const path of paths) {
                if (strength.get(path) === undefined) {
                    expect(out.nodes).toHaveProperty([path]);
                }
            }
        }));
    });

    it('keeps a judged note exactly when its clamped brightness is in range', () => {
        fc.assert(fc.property(graph, ranges, ({ paths, strengths, keep }, chosen) => {
            fc.pre(!isWholeRange(chosen));
            const { out, strength } = run(paths, strengths, keep, chosen);
            const exempt = new Set(keep);

            for (const path of paths) {
                const value = strength.get(path);

                if (value !== undefined && !exempt.has(path)) {
                    expect(Object.prototype.hasOwnProperty.call(out.nodes, path)).toBe(withinRanges(clamp01(value), chosen));
                }
            }
        }));
    });

    it('keeps everything, and reports nothing dropped, when the range is whole', () => {
        fc.assert(fc.property(graph, fc.double({ min: -1, max: 0, noNaN: true }), fc.double({ min: 1, max: 2, noNaN: true }), ({ paths, strengths }, from, to) => {
            const { nodes, out, dropped } = run(paths, strengths, [], [{ from, to }]);

            expect(Object.keys(out.nodes).sort()).toEqual(Object.keys(nodes).sort());
            expect(dropped).toBe(0);
        }));
    });
});
