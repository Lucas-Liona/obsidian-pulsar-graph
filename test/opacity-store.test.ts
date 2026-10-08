import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { OpacityStore } from '../src/opacity-store';
import { DEFAULT_SETTINGS, PulsarGraphSettings } from '../src/settings';
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

describe('the edit-intensity blend', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const mtimes = new Map([['new.md', 10 * DAY], ['middle.md', 5 * DAY], ['old.md', 0]]);

    function storeWith(blend: number, sittings: Record<string, number>): OpacityStore {
        const settings: PulsarGraphSettings = { ...DEFAULT_SETTINGS, ageScale: 'even', fadeType: 'linear', minOpacity: 0, maxOpacity: 1, intensityBlend: blend };
        const store = new OpacityStore(() => settings);
        store.setSittingSource((path) => sittings[path] ?? 0);
        store.build([...mtimes].map(([path, mtime]) => Object.assign(new TFile(), { path, extension: 'md', stat: { mtime, ctime: mtime, size: 1 } })));
        store.refresh();
        return store;
    }

    // A fresh install has no history at all. Blending a zero in for every note
    // dimmed the whole graph by the blend.
    it('leaves a vault with no history exactly as the blend at 0 draws it', () => {
        const off = storeWith(0, {});
        const on = storeWith(0.25, {});

        for (const path of mtimes.keys()) {
            expect(on.opacityFor(path)).toBeCloseTo(off.opacityFor(path) ?? NaN);
        }

        expect(on.opacityFor('new.md')).toBeCloseTo(1);
    });

    it('lifts a note that has sittings on record above one of its age that has none', () => {
        const off = storeWith(0, { 'old.md': 9 });
        const on = storeWith(0.5, { 'old.md': 9 });

        expect(on.opacityFor('old.md')).toBeGreaterThan(off.opacityFor('old.md') ?? NaN);
    });

    // Blending only the notes with a record ranked them among themselves, so
    // the commonest case, a single sitting each, came last at 0 and was
    // dimmed below every note with no record at all.
    it('never draws a note with a sitting below one the same age with none', () => {
        const same = new Map([['worked.md', 5 * DAY], ['untouched.md', 5 * DAY], ['other.md', 0], ['newest.md', 10 * DAY]]);
        const settings: PulsarGraphSettings = { ...DEFAULT_SETTINGS, ageScale: 'even', fadeType: 'linear', minOpacity: 0, maxOpacity: 1, intensityBlend: 0.25 };
        const store = new OpacityStore(() => settings);
        store.setSittingSource((path) => ({ 'worked.md': 1, 'other.md': 1 } as Record<string, number>)[path] ?? 0);
        store.build([...same].map(([path, mtime]) => Object.assign(new TFile(), { path, extension: 'md', stat: { mtime, ctime: mtime, size: 1 } })));
        store.refresh();

        expect(store.opacityFor('worked.md')).toBeGreaterThan(store.opacityFor('untouched.md') ?? NaN);
    });
});
