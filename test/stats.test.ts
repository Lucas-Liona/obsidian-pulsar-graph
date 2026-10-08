import { TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { GraphRenderer } from '../src/graph';
import { OpacityStore } from '../src/opacity-store';
import { DEFAULT_SETTINGS } from '../src/settings';
import { describeVault } from '../src/stats';

const NOW = Date.UTC(2026, 9, 8, 12);
const MINUTE = 60 * 1000;

/** Two linked notes saved twenty minutes apart. */
function graphOf(): { store: OpacityStore; renderer: GraphRenderer } {
    const store = new OpacityStore(() => DEFAULT_SETTINGS);
    store.build([['a.md', NOW], ['b.md', NOW - 20 * MINUTE]].map(([path, mtime]) => Object.assign(new TFile(), { path, stat: { mtime, ctime: mtime, size: 1 } })));
    const a = { id: 'a.md' };
    const b = { id: 'b.md' };
    const renderer = { nodeLookup: { 'a.md': a, 'b.md': b }, links: [{ source: a, target: b }] } as unknown as GraphRenderer;
    return { store, renderer };
}

function writtenTogether(sessionGapMinutes: number): string | undefined {
    const { store, renderer } = graphOf();
    const rows = describeVault(store, { ...DEFAULT_SETTINGS, sessionGapMinutes }, renderer, () => 1, null).rows;
    return rows.find((row) => row.label.startsWith('Written together'))?.label;
}

describe('the sitting length in the measurements', () => {
    // It used to be written as a bare number of minutes, `30m`, which a
    // sitting stored as a fraction would have written as `2.5m`.
    it('is written with its unit, the way the slider says it', () => {
        expect(writtenTogether(30)).toBe('Written together, within 30 min');
        expect(writtenTogether(90)).toBe('Written together, within 1.5 h');
    });
});
