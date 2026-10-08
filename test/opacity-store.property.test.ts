import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { TFile } from 'obsidian';
import { FADE_TYPES } from '../src/fade';
import { OpacityStore } from '../src/opacity-store';
import { AgeScale, DEFAULT_SETTINGS, PulsarGraphSettings } from '../src/settings';

const NOW = Date.UTC(2026, 9, 7, 12);
const DAY = 24 * 60 * 60 * 1000;

const AGE_SCALES: AgeScale[] = ['even', 'rank', 'log', 'halflife'];

/**
 * Settings that shape opacity, over the ranges the settings tab allows. The
 * intensity blend is held at 0: it mixes in how often a note was worked on,
 * which is meant to lift a busy old note above a quiet new one.
 */
const settings: fc.Arbitrary<PulsarGraphSettings> = fc.record({
    ageScale: fc.constantFrom(...AGE_SCALES),
    fadeType: fc.constantFrom(...FADE_TYPES),
    normalizeBy: fc.constantFrom('vault' as const, 'window' as const, 'shown' as const),
    windowDays: fc.double({ min: 0.25, max: 365, noNaN: true }),
    halfLifeDays: fc.double({ min: 1 / 24, max: 365, noNaN: true }),
    steepness: fc.double({ min: 0.1, max: 10, noNaN: true }),
    numSteps: fc.integer({ min: 1, max: 20 }),
    ends: fc.tuple(fc.double({ min: 0, max: 1, noNaN: true }), fc.double({ min: 0, max: 12, noNaN: true }))
}).map(({ ends: [a, b], ...shape }) => ({ ...DEFAULT_SETTINGS, ...shape, minOpacity: Math.min(a, b), maxOpacity: Math.max(a, b), intensityBlend: 0 }));

/**
 * A vault of up to 40 notes over two years, its times drawn from a short list
 * so that many notes share one, as a bulk import leaves them.
 */
const vault: fc.Arbitrary<[string, number][]> = fc.array(fc.integer({ min: 0, max: 2 * 365 }), { minLength: 1, maxLength: 8 })
    .chain((ages) => fc.array(fc.constantFrom(...ages), { minLength: 1, maxLength: 40 }))
    .map((ages) => ages.map((age, index): [string, number] => [`n${index}.md`, NOW - age * DAY]));

function storeOf(notes: [string, number][], chosen: PulsarGraphSettings): OpacityStore {
    const store = new OpacityStore(() => chosen);
    store.build(notes.map(([path, mtime]) => Object.assign(new TFile(), { path, extension: 'md', stat: { mtime, ctime: mtime, size: 1 } })));
    store.refresh();
    return store;
}

/**
 * Opacity is `min + fade * (max - min)`, which can land an ulp past the
 * maximum: 0.9999999999999991 + (11.999999999993614 - 0.9999999999999991) is
 * 11.999999999993616. Alpha is clamped at 1 when drawn, so that is arithmetic,
 * not a brighter note.
 */
const SLACK = 1e-9;

/** Every pair, newer second, so a property can say what newer means. */
function* pairs(notes: [string, number][]): Generator<[[string, number], [string, number]]> {
    for (const a of notes) {
        for (const b of notes) {
            if (a[1] <= b[1]) {
                yield [a, b];
            }
        }
    }
}

describe('OpacityStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('draws every note between the minimum and the maximum', () => {
        fc.assert(fc.property(vault, settings, (notes, chosen) => {
            const store = storeOf(notes, chosen);

            for (const [path] of notes) {
                const opacity = store.opacityFor(path);

                expect(opacity).toBeDefined();
                expect(opacity).toBeGreaterThanOrEqual(chosen.minOpacity - SLACK);
                expect(opacity).toBeLessThanOrEqual(chosen.maxOpacity + SLACK);
            }
        }));
    });

    // The whole plugin rests on this: a note edited later is never drawn
    // fainter than one edited earlier, whatever the scale or curve.
    it('never draws a newer note fainter than an older one, and ties alike', () => {
        fc.assert(fc.property(vault, settings, (notes, chosen) => {
            const store = storeOf(notes, chosen);

            for (const [[older, then], [newer, now]] of pairs(notes)) {
                const a = store.opacityFor(older) ?? Number.NaN;
                const b = store.opacityFor(newer) ?? Number.NaN;

                if (then === now) {
                    expect(a).toBe(b);
                } else {
                    expect(a).toBeLessThanOrEqual(b);
                }
            }
        }));
    });

    // Rank places a note by how many notes are strictly older, so notes on
    // the same instant share a place rather than being spread by load order.
    it('places a note by rank at the share of the vault strictly older than it', () => {
        fc.assert(fc.property(vault, (notes) => {
            const chosen = { ...DEFAULT_SETTINGS, ageScale: 'rank' as const, fadeType: 'linear' as const, minOpacity: 0, maxOpacity: 1, intensityBlend: 0 };
            const store = storeOf(notes, chosen);

            for (const [path, mtime] of notes) {
                const older = notes.filter(([, other]) => other < mtime).length;
                const expected = notes.length <= 1 ? 1 : older / (notes.length - 1);

                expect(store.opacityFor(path)).toBe(expected);
            }
        }));
    });

    it('picks the newest few as a stable sort would, ties to whichever came first', () => {
        const asked = fc.array(fc.constantFrom('n0.md', 'n1.md', 'n2.md', 'n3.md', 'n4.md', 'n5.md', 'missing.md'), { maxLength: 12 });

        fc.assert(fc.property(vault, asked, fc.integer({ min: 0, max: 8 }), fc.subarray(['n0.md', 'n1.md', 'n2.md']), (notes, paths, count, skipped) => {
            const store = storeOf(notes, DEFAULT_SETTINGS);
            const mtime = new Map(notes);
            const skip = new Set(skipped);

            const expected = paths
                .filter((path) => mtime.has(path) && !skip.has(path))
                .map((path): [string, number] => [path, mtime.get(path) ?? 0])
                .sort((a, b) => b[1] - a[1])
                .slice(0, count)
                .map(([path]) => path);

            expect(store.newestAmong(paths, count, skip)).toEqual(expected);
        }));
    });

    it('picks everything since a moment, newest first', () => {
        fc.assert(fc.property(vault, fc.integer({ min: 0, max: 2 * 365 }), fc.subarray(['n0.md', 'n1.md']), (notes, back, skipped) => {
            const store = storeOf(notes, DEFAULT_SETTINGS);
            const since = NOW - back * DAY;
            const skip = new Set(skipped);

            const expected = notes
                .filter(([path, mtime]) => mtime >= since && !skip.has(path))
                .sort((a, b) => b[1] - a[1])
                .map(([path]) => path);

            expect(store.newestSince(notes.map(([path]) => path), since, skip)).toEqual(expected);
        }));
    });

    // Re-measuring across a smaller set changes how bright, never the order
    // and never past either end of the range.
    it('spreads a subset across the range without reordering it', () => {
        fc.assert(fc.property(vault, settings, fc.integer({ min: 0, max: 48 }), (notes, chosen, floorHours) => {
            const store = storeOf(notes, chosen);
            const subset = notes.filter((_, index) => index % 2 === 0);
            const spread = store.spreadAcross(subset.map(([path]) => path), floorHours);

            if (chosen.ageScale === 'halflife' || subset.length < 3) {
                expect(spread).toBeNull();
                return;
            }

            expect(spread?.size).toBe(subset.length);

            for (const [[older, then], [newer, now]] of pairs(subset)) {
                const a = spread?.get(older) ?? Number.NaN;
                const b = spread?.get(newer) ?? Number.NaN;

                expect(a).toBeGreaterThanOrEqual(chosen.minOpacity - SLACK);
                expect(b).toBeLessThanOrEqual(chosen.maxOpacity + SLACK);
                expect(then === now ? a === b : a <= b).toBe(true);
            }
        }));
    });
});
