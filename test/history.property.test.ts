import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import type { App, Plugin } from 'obsidian';
import { Bead, EditHistory } from '../src/history';

const NOW = Date.UTC(2026, 9, 7, 12);
const MINUTE = 60 * 1000;

/** A file adapter over a map. Every read and write goes through the history's own code. */
function disk(): { history: () => EditHistory } {
    const files = new Map<string, string>();
    const adapter = {
        exists: (path: string): Promise<boolean> => Promise.resolve(files.has(path)),
        read: (path: string): Promise<string> => {
            const text = files.get(path);
            return text === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(text);
        },
        write: (path: string, text: string): Promise<void> => {
            files.set(path, text);
            return Promise.resolve();
        }
    };

    const app = { vault: { configDir: 'config', adapter } } as unknown as App;
    const plugin = { manifest: { id: 'pulsar-graph' } } as unknown as Plugin;

    return { history: () => new EditHistory(app, plugin) };
}

async function loaded(): Promise<EditHistory> {
    const history = disk().history();
    await history.load();
    return history;
}

/** Note paths end in .md, as every note's does; that also keeps `__proto__` out. */
const path = fc.string({ maxLength: 8 }).map((name) => `${name}.md`);

/** One write as the vault reports it: when, and how long the note was afterwards. */
const write = fc.record({
    path: fc.constantFrom('a.md', 'b.md', 'c.md'),
    mtime: fc.integer({ min: 0, max: 600 * MINUTE }),
    size: fc.integer({ min: 0, max: 50 })
});

/** Writes in whatever order they arrive, including out of order, as sync delivers them. */
const writes = fc.array(write, { maxLength: 60 });
const gapMs = fc.integer({ min: 1, max: 240 }).map((minutes) => minutes * MINUTE);
const cap = fc.integer({ min: 1, max: 20 });

function snapshot(history: EditHistory, paths: readonly string[]): Record<string, Bead[]> {
    return Object.fromEntries(paths.map((one) => [one, history.beadsFor(one).map((bead) => ({ ...bead }))]));
}

const PATHS = ['a.md', 'b.md', 'c.md'];

describe('EditHistory', () => {
    beforeEach(() => {
        // The clock stands still, so a load measures no downtime; and the
        // write timer, if the debounce has one, only fires on a flush.
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Live writes and File Recovery imports, interleaved in any order.
    it('keeps every note\'s sittings in order, apart, and within the cap', async () => {
        const imported = fc.record({
            path: fc.constantFrom('a.md', 'b.md', 'c.md'),
            times: fc.array(fc.integer({ min: 0, max: 600 * MINUTE }), { maxLength: 10 })
        });
        const steps = fc.array(fc.oneof(write, imported), { maxLength: 60 });

        await fc.assert(fc.asyncProperty(steps, gapMs, cap, async (sequence, gap, most) => {
            const history = await loaded();

            for (const step of sequence) {
                if ('times' in step) {
                    history.merge(step.path, step.times, gap, most);
                } else {
                    history.record(step.path, step.mtime, step.size, gap, most);
                }
            }

            for (const at of PATHS) {
                const beads = history.beadsFor(at);
                expect(beads.length).toBeLessThanOrEqual(most);

                beads.forEach((bead, index) => {
                    expect(bead.start).toBeLessThanOrEqual(bead.end);

                    // Apart by more than the gap, which is what made them two
                    // sittings rather than one.
                    const next = beads[index + 1];
                    if (next) {
                        expect(next.start - bead.end).toBeGreaterThan(gap);
                    }
                });
            }
        }));
    });

    it('ignores the same write arriving twice', async () => {
        await fc.assert(fc.asyncProperty(writes, write, gapMs, cap, async (seen, last, gap, most) => {
            const history = await loaded();

            for (const { path: at, mtime, size } of [...seen, last]) {
                history.record(at, mtime, size, gap, most);
            }

            const before = snapshot(history, PATHS);
            history.record(last.path, last.mtime, last.size, gap, most);

            expect(snapshot(history, PATHS)).toEqual(before);
        }));
    });

    // The File Recovery import says it is safe to press twice.
    it('merges the same import twice to the same history as once', async () => {
        const times = fc.array(fc.integer({ min: 0, max: 600 * MINUTE }), { maxLength: 40 });

        await fc.assert(fc.asyncProperty(writes, times, gapMs, cap, async (seen, imported, gap, most) => {
            const history = await loaded();

            for (const { path: at, mtime, size } of seen) {
                history.record(at, mtime, size, gap, most);
            }

            history.merge('a.md', imported, gap, most);
            const once = snapshot(history, PATHS);

            history.merge('a.md', imported, gap, most);

            expect(snapshot(history, PATHS)).toEqual(once);
        }));
    });

    it('moves a renamed note\'s sittings and last look exactly, leaving nothing behind', async () => {
        await fc.assert(fc.asyncProperty(writes, gapMs, fc.option(fc.integer({ min: 0, max: NOW }), { nil: undefined }), async (seen, gap, looked) => {
            const history = await loaded();

            for (const { path: at, mtime, size } of seen) {
                history.record(at, mtime, size, gap, 100);
            }

            if (looked !== undefined) {
                history.markSeen('a.md', looked);
            }

            const beads = snapshot(history, ['a.md'])['a.md'];
            const others = snapshot(history, ['b.md', 'c.md']);

            history.rename('a.md', 'filed/a.md');

            expect(history.beadsFor('filed/a.md')).toEqual(beads);
            expect(history.seenAt('filed/a.md')).toBe(looked);
            expect(history.beadsFor('a.md')).toEqual([]);
            expect(history.seenAt('a.md')).toBeUndefined();
            expect(snapshot(history, ['b.md', 'c.md'])).toEqual(others);
        }));
    });

    it('forgets a deleted note\'s sittings and last look, and nothing else', async () => {
        await fc.assert(fc.asyncProperty(writes, gapMs, async (seen, gap) => {
            const history = await loaded();

            for (const { path: at, mtime, size } of seen) {
                history.record(at, mtime, size, gap, 100);
                history.markSeen(at, mtime);
            }

            const others = snapshot(history, ['b.md', 'c.md']);
            const before = history.coverage();
            const had = history.sittings('a.md');

            history.forget('a.md');

            expect(history.sittings('a.md')).toBe(0);
            expect(history.seenAt('a.md')).toBeUndefined();
            expect(snapshot(history, ['b.md', 'c.md'])).toEqual(others);
            expect(history.coverage().beads).toBe(before.beads - had);
        }));
    });

    // Whatever is in memory is what the next session reads back.
    it('reads back exactly what it wrote', async () => {
        const looks = fc.array(fc.tuple(path, fc.integer({ min: 0, max: NOW })), { maxLength: 10 });
        const imports = fc.array(fc.tuple(path, fc.array(fc.integer({ min: 0, max: 600 * MINUTE }), { minLength: 1, maxLength: 10 })), { maxLength: 5 });

        await fc.assert(fc.asyncProperty(writes, looks, imports, gapMs, cap, async (seen, looked, imported, gap, most) => {
            const { history } = disk();
            const first = history();
            await first.load();

            for (const { path: at, mtime, size } of seen) {
                first.record(at, mtime, size, gap, most);
            }

            for (const [at, times] of imported) {
                first.merge(at, times, gap, most);
            }

            for (const [at, when] of looked) {
                first.markSeen(at, when);
            }

            await first.flush();

            const second = history();
            await second.load();

            const paths = [...PATHS, ...imported.map(([at]) => at), ...looked.map(([at]) => at)];

            expect(snapshot(second, paths)).toEqual(snapshot(first, paths));
            expect(second.coverage()).toEqual(first.coverage());

            for (const at of paths) {
                expect(second.seenAt(at)).toBe(first.seenAt(at));
            }
        }));
    });
});
