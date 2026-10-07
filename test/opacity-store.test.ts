import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { OpacityStore } from '../src/opacity-store';
import { DEFAULT_SETTINGS } from '../src/settings';
import { fakeVault, seeded } from './vault';

/** A store over fake files, with the settings the plugin ships with. */
export function storeOf(mtimes: Map<string, number>): OpacityStore {
    const store = new OpacityStore(() => DEFAULT_SETTINGS);
    const files = [...mtimes].map(([path, mtime]) => Object.assign(new TFile(), { path, stat: { mtime, ctime: mtime, size: 1 } }));

    store.build(files);
    return store;
}

describe('newestAmong', () => {
    it('matches a stable sort, ties included', () => {
        const random = seeded(3);

        for (let trial = 0; trial < 40; trial++) {
            // Few distinct times, so most picks are decided by a tie.
            const mtimes = new Map<string, number>();
            for (let index = 0; index < 200; index++) {
                mtimes.set(`n${index}.md`, Math.floor(random() * 6));
            }

            const store = storeOf(mtimes);
            const count = 1 + Math.floor(random() * 12);
            const skip = new Set([`n${Math.floor(random() * 200)}.md`]);

            const expected = [...mtimes].filter(([path]) => !skip.has(path)).sort((a, b) => b[1] - a[1]).slice(0, count).map(([path]) => path);

            expect(store.newestAmong(mtimes.keys(), count, skip)).toEqual(expected);
        }
    });

    it('returns everything there is when asked for more', () => {
        const store = storeOf(new Map([['a.md', 1], ['b.md', 3], ['c.md', 2]]));

        expect(store.newestAmong(['a.md', 'b.md', 'c.md', 'missing.md'], 10)).toEqual(['b.md', 'c.md', 'a.md']);
    });

    it('returns nothing for a count of zero', () => {
        const { mtimes } = fakeVault(50);

        expect(storeOf(mtimes).newestAmong(mtimes.keys(), 0)).toEqual([]);
    });
});
