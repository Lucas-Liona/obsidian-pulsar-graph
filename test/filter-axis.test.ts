import { describe, expect, it } from 'vitest';
import { rangeOntoCurve, withinRanges } from '../src/filter';
import { parseSettings } from '../src/settings';
import { seeded } from './vault';

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

describe('rangeOntoCurve', () => {
    it('keeps selecting exactly the same notes', () => {
        const random = seeded(11);

        for (let trial = 0; trial < 200; trial++) {
            const min = random() * 0.5;
            const max = min + 0.2 + random() * 3;
            const from = random();
            const to = from + random() * (1 - from);
            const old = { from, to };
            const moved = rangeOntoCurve(old, min, max);

            for (let note = 0; note < 50; note++) {
                const opacity = min + random() * (max - min);
                const before = withinRanges(clamp01(opacity), [old]);
                const after = withinRanges(clamp01((opacity - min) / (max - min)), [moved]);

                expect(after).toBe(before);
            }
        }
    });

    it('maps the end of the old line to the end of the curve', () => {
        expect(rangeOntoCurve({ from: 0.5, to: 1 }, 0.1, 3)).toEqual({ from: 0.4 / 2.9, to: 1 });
    });
});

describe('parseSettings', () => {
    it('moves ranges saved on the old axis onto the curve, once', () => {
        const stored = { minOpacity: 0.05, maxOpacity: 2.52, filterRanges: [{ from: 0.18, to: 0.69 }] };

        const first = parseSettings(stored);
        const second = parseSettings(first);

        expect(first.filterRanges[0].from).toBeCloseTo(0.13 / 2.47, 10);
        expect(first.filterRanges[0].to).toBeCloseTo(0.64 / 2.47, 10);
        expect(first.filterAxis).toBe('curve');
        expect(second.filterRanges).toEqual(first.filterRanges);
    });

    it('leaves a whole range whole', () => {
        expect(parseSettings({ filterRanges: [{ from: 0, to: 1 }] }).filterRanges).toEqual([{ from: 0, to: 1 }]);
    });

    it('converts the ranges inside a saved preset with that preset’s own opacities', () => {
        const parsed = parseSettings({
            saved: [{ name: 'Old', settings: { minOpacity: 0.2, maxOpacity: 1.2, filterRanges: [{ from: 0.7, to: 1 }] } }]
        });

        expect(parsed.saved[0].settings.filterRanges[0].from).toBeCloseTo(0.5, 10);
        expect(parsed.saved[0].settings.filterRanges[0].to).toBe(1);
    });
});
