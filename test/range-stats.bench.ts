import { bench, describe } from 'vitest';
import { OpacityRange, withinRanges } from '../src/filter';
import { summariseRanges } from '../src/range-stats';
import { storeOf } from './opacity-store.test';
import { fakeVault, newest } from './vault';

/**
 * What one readout under the range bar costs: a hover, a drag step, or the
 * caption on every graph pass. The quadratic version is only run where it
 * finishes in reasonable time, which is itself the finding.
 */
const RANGES: OpacityRange[] = [{ from: 0.18, to: 0.69 }];

for (const size of [1_000, 10_000, 50_000]) {
    const { mtimes, strengths } = fakeVault(size);
    const strengthOf = (path: string): number | undefined => strengths.get(path);
    const store = storeOf(mtimes);

    describe(`${size.toLocaleString('en-US')} notes`, () => {
        bench('once per pass (now)', () => {
            const exempt = new Set(['notes/0.md', ...store.newestAmong(mtimes.keys(), 3)]);
            summariseRanges(mtimes, strengthOf, RANGES, exempt);
        });

        if (size <= 1_000) {
            bench('once per note (before)', () => {
                for (const [path] of mtimes) {
                    const exempt = ['notes/0.md', ...newest(mtimes, 3)];
                    const strength = strengths.get(path);
                    void (strength === undefined || exempt.includes(path) || withinRanges(Math.min(1, Math.max(0, strength)), RANGES));
                }
            }, { iterations: 5, time: 0 });
        }
    });
}
