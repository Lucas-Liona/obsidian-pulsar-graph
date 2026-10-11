import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { App, Plugin } from 'obsidian';
import { EditHistory } from '../src/history';
import { parseSharedPresets } from '../src/presets';
import { DEFAULT_SETTINGS, parseSettings, PulsarGraphSettings, repairPreset } from '../src/settings';

/**
 * Everything Pulsar reads from outside itself: `data.json`, a preset pasted
 * from the clipboard, `history.json`. Any of them can be hand-edited, cut
 * short, synced from an older version or pasted from somewhere else. None of
 * it may throw, and nothing that comes out may be NaN or out of range.
 */

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof PulsarGraphSettings)[];
const NUMBER_KEYS = KEYS.filter((key) => typeof DEFAULT_SETTINGS[key] === 'number');

/** Anything JSON can hold, and Infinity, which is what JSON.parse makes of a number past a double's range. */
const value = fc.oneof(
    fc.jsonValue(),
    fc.constantFrom(Infinity, -Infinity, -0, Number.MAX_VALUE, -Number.MAX_VALUE, '', '#zzzzzz', '#FFFFFF', [], {})
);

/**
 * Stands in for a number past a double's range in a file's text. JSON.stringify
 * writes Infinity as null, so this is written instead and swapped for 1e400.
 */
const HUGE = 8.8e307;
const withHuge = (text: string): string => text.replace(/8\.8e\+307/g, '1e400');

/** A saved settings object with some of its keys present, each holding anything at all. */
const stored = fc.dictionary(fc.constantFrom(...KEYS, 'showAgeOnHover', 'filterAxis', '__proto__', 'constructor'), value);

/** The lowest and highest a parsed number can come out as: what the far ends parse to. */
const bounds = Object.fromEntries(NUMBER_KEYS.map((key) => {
    const low = parseSettings({ [key]: -Number.MAX_VALUE })[key] as number;
    const high = parseSettings({ [key]: Number.MAX_VALUE })[key] as number;
    return [key, { low: Math.min(low, high), high: Math.max(low, high) }];
})) as Record<string, { low: number; high: number }>;

function expectSane(settings: PulsarGraphSettings): void {
    for (const key of NUMBER_KEYS) {
        const n = settings[key] as number;
        expect(Number.isFinite(n), `${key} is ${n}`).toBe(true);
        expect(n, key).toBeGreaterThanOrEqual(bounds[key].low);
        expect(n, key).toBeLessThanOrEqual(bounds[key].high);
    }

    for (const key of KEYS) {
        expect(typeof settings[key], key).toBe(typeof DEFAULT_SETTINGS[key]);
    }

    expect(settings.minOpacity).toBeLessThanOrEqual(settings.maxOpacity);

    for (const range of settings.filterRanges) {
        expect(range.from).toBeGreaterThanOrEqual(0);
        expect(range.to).toBeLessThanOrEqual(1);
        expect(range.from).toBeLessThan(range.to);
    }
}

describe('saved settings, as read from data.json', () => {
    it('never throws, and comes out whole and in range', () => {
        fc.assert(fc.property(fc.oneof(value, stored), (data) => {
            expectSane(parseSettings(data));
        }), { numRuns: 2000 });
    });

    it('comes out already repaired, so reading it again changes nothing', () => {
        fc.assert(fc.property(stored, (data) => {
            const once = parseSettings(data);
            expect(parseSettings(JSON.parse(JSON.stringify(once)))).toEqual(once);
        }), { numRuns: 1000 });
    });

    it('survives presets nested inside presets', () => {
        // A preset never carries a list of its own, but a file can say anything.
        let data: Record<string, unknown> = {};
        for (let depth = 0; depth < 20_000; depth++) {
            data = { saved: [{ name: 'p', settings: data }] };
        }

        expect(() => parseSettings(data)).not.toThrow();
        expect(parseSettings(data).saved).toHaveLength(1);
    });
});

describe('presets pasted from the clipboard', () => {
    it('never throws on anything that parses, and repairs every one', () => {
        const entry = fc.record({ name: fc.oneof(fc.string(), value), settings: fc.oneof(value, stored) }, { requiredKeys: [] });
        fc.assert(fc.property(fc.oneof(value, entry, fc.array(fc.oneof(entry, value))), (pasted) => {
            const presets = parseSharedPresets(JSON.stringify(pasted), repairPreset);

            for (const preset of presets) {
                expect(preset.name.trim().length).toBeGreaterThan(0);
                expect(preset.name.length).toBeLessThanOrEqual(60);
                expect(repairPreset(preset.settings)).toEqual(preset.settings);
            }
        }), { numRuns: 1000 });
    });
});

/** A history over a fake disk holding `text` as its file. */
async function historyFrom(text: string): Promise<EditHistory> {
    const files = new Map<string, string>([['config/plugins/pulsar-graph/history.json', text]]);
    const adapter = {
        exists: (path: string): Promise<boolean> => Promise.resolve(files.has(path)),
        read: (path: string): Promise<string> => {
            const found = files.get(path);
            return found === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(found);
        },
        write: (path: string, data: string): Promise<void> => {
            files.set(path, data);
            return Promise.resolve();
        }
    };
    const app = { vault: { configDir: 'config', adapter } } as unknown as App;
    const plugin = { manifest: { id: 'pulsar-graph' } } as unknown as Plugin;
    const history = new EditHistory(app, plugin);
    await history.load();
    return history;
}

describe('the edit history, as read from history.json', () => {
    const number = fc.oneof(fc.double(), fc.integer(), fc.constantFrom(HUGE, -HUGE, 0, -1));
    const bead = fc.oneof(fc.array(number, { maxLength: 5 }), value);
    const file = fc.record({
        v: fc.oneof(fc.constant(1), value),
        awake: fc.oneof(number, value),
        notes: fc.oneof(fc.dictionary(fc.constantFrom('a.md', 'b.md'), fc.oneof(fc.array(bead, { maxLength: 4 }), value)), value),
        opened: fc.oneof(fc.dictionary(fc.constantFrom('a.md', 'b.md'), fc.oneof(number, value)), value)
    }, { requiredKeys: [] });

    it('never throws, and keeps only sittings that are real stretches of time', async () => {
        await fc.assert(fc.asyncProperty(file, async (stored) => {
            // JSON has no NaN; anything past a double's range reads back as Infinity.
            const history = await historyFrom(withHuge(JSON.stringify(stored)));

            for (const path of ['a.md', 'b.md']) {
                for (const sitting of history.beadsFor(path)) {
                    for (const n of [sitting.start, sitting.end, sitting.sizeStart, sitting.sizeEnd]) {
                        expect(Number.isFinite(n)).toBe(true);
                    }

                    expect(sitting.start).toBeLessThanOrEqual(sitting.end);
                    expect(sitting.sizeStart).toBeGreaterThanOrEqual(0);
                    expect(sitting.sizeEnd).toBeGreaterThanOrEqual(0);
                }

                const seen = history.seenAt(path);
                expect(seen === undefined || Number.isFinite(seen)).toBe(true);
            }

            const { oldest } = history.coverage();
            expect(oldest === undefined || Number.isFinite(oldest)).toBe(true);
            expect(Number.isFinite(history.downtime())).toBe(true);
        }), { numRuns: 1000 });
    });

    it('reads a number past a double\'s range as no sitting, not one at infinity', async () => {
        const history = await historyFrom('{"v":1,"notes":{"a.md":[[1e400,1e400,0,0],[1000,2000,10,20]]},"opened":{"a.md":1e400},"awake":-1e400}');

        expect(history.beadsFor('a.md')).toEqual([{ start: 1000, end: 2000, sizeStart: 10, sizeEnd: 20 }]);
        expect(history.seenAt('a.md')).toBeUndefined();
        expect(Number.isFinite(history.downtime())).toBe(true);
    });
});
