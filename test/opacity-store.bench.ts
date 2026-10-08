import { bench, describe } from 'vitest';
import { storeOf } from './opacity-store.test';
import { fakeVault } from './vault';

/**
 * What the store costs as a vault grows. Every number the plugin draws comes
 * through here, and until now it had only ever run against one 1100-note vault.
 */
for (const size of [1_000, 10_000, 50_000]) {
    const { mtimes } = fakeVault(size);
    const store = storeOf(mtimes);

    describe(`store, ${size.toLocaleString('en-US')} notes`, () => {
        bench('every opacity, recomputed', () => {
            store.markStale();
            store.refresh();
        });

        // What every filter pass and note switch now asks first, with the
        // store already fresh: it has to cost nothing.
        bench('refresh, nothing stale', () => {
            store.refresh();
        }, { setup: () => store.refresh() });

        bench('newest 3 (now)', () => {
            store.newestAmong(mtimes.keys(), 3);
        });

        bench('newest 3 by full sort (before)', () => {
            [...mtimes].sort((a, b) => b[1] - a[1]).slice(0, 3);
        });
    });
}
