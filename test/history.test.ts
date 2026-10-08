import { describe, expect, it, vi } from 'vitest';
import type { App, Plugin } from 'obsidian';
import { EditHistory } from '../src/history';

const CONFIG = 'config';
const FOLDER = `${CONFIG}/plugins/pulsar-graph`;
const FILE = `${FOLDER}/history.json`;
const BACKUP = `${FOLDER}/history.backup.json`;

/** A file adapter over a map, which can be told to fail. */
function disk(initial: Record<string, string> = {}) {
    const files = new Map(Object.entries(initial));
    const state = {
        failRead: false,
        failWriteTo: null as RegExp | null,
        /** The app dies writing this file: half of it lands, and nothing after it. */
        crashIn: null as RegExp | null,
        crashed: false,
        written: [] as string[],
        hold: null as Promise<void> | null
    };

    const adapter = {
        exists: async (path: string) => files.has(path),
        read: async (path: string) => {
            if (state.failRead) {
                throw new Error('EBUSY');
            }

            const text = files.get(path);
            if (text === undefined) {
                throw new Error('ENOENT');
            }

            return text;
        },
        write: async (path: string, text: string) => {
            if (state.crashed) {
                throw new Error('gone');
            }

            if (state.crashIn?.test(path)) {
                state.crashed = true;
                files.set(path, text.slice(0, Math.floor(text.length / 2)));
                throw new Error('gone');
            }

            if (state.failWriteTo?.test(path)) {
                throw new Error('EACCES');
            }

            if (state.hold) {
                await state.hold;
            }

            files.set(path, text);
            state.written.push(path);
        }
    };

    const app = { vault: { configDir: CONFIG, adapter } } as unknown as App;
    const plugin = { manifest: { id: 'pulsar-graph' } } as unknown as Plugin;

    return { files, state, history: () => new EditHistory(app, plugin) };
}

/** Lets every promise already queued run to the end. */
async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) {
        await Promise.resolve();
    }
}

const SAVED = JSON.stringify({ v: 1, awake: 0, notes: { 'a.md': [[1, 2, 10, 20]] }, opened: { 'a.md': 5 } });

function stored(text: string | undefined): { notes: Record<string, unknown>; opened: Record<string, unknown> } {
    return JSON.parse(text ?? 'null') as { notes: Record<string, unknown>; opened: Record<string, unknown> };
}

describe('history file safety', () => {
    it('keeps a file that does not parse before starting a new one', async () => {
        const damaged = SAVED.slice(0, 30);
        const { files, history } = disk({ [FILE]: damaged });
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        await h.flush();

        const copies = [...files.keys()].filter((path) => /\/history\.damaged-.+\.json$/.test(path));
        expect(copies).toHaveLength(1);
        expect(files.get(copies[0] ?? '')).toBe(damaged);
        expect(Object.keys(stored(files.get(FILE)).opened)).toEqual(['b.md']);
    });

    it('writes nothing over a damaged file it could not keep a copy of', async () => {
        const damaged = SAVED.slice(0, 30);
        const { files, state, history } = disk({ [FILE]: damaged });
        state.failWriteTo = /damaged/;
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        await h.flush();

        expect(files.get(FILE)).toBe(damaged);
        expect(state.written).toEqual([]);
    });

    it('never writes over a file it could not read, and reads it again on the heartbeat', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED });
        state.failRead = true;
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        h.record('b.md', 100, 3, 60_000, 50);
        await h.flush();

        expect(files.get(FILE)).toBe(SAVED);
        expect(state.written).toEqual([]);
        expect(h.sittings('b.md')).toBe(0);

        state.failRead = false;
        h.heartbeat();
        await settle();

        expect(h.sittings('a.md')).toBe(1);

        h.markSeen('b.md', 8);
        await h.flush();

        expect(Object.keys(stored(files.get(FILE)).notes)).toEqual(['a.md']);
        expect(stored(files.get(FILE)).opened).toEqual({ 'a.md': 5, 'b.md': 8 });
    });

    it('lets forgetting everything replace a file it could not read, since that was asked for', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED });
        state.failRead = true;
        const h = history();

        await h.load();
        await h.clear();

        expect(stored(files.get(FILE)).notes).toEqual({});
    });

    it('waits for a write already under way before a flush returns', async () => {
        const { state, history } = disk({ [FILE]: SAVED });
        const h = history();
        await h.load();

        let release = (): void => undefined;
        state.hold = new Promise((resolve) => {
            release = resolve;
        });

        // The debounce starts the write, so the flush below finds nothing
        // left to write and has to wait for that one instead.
        vi.useFakeTimers();
        h.markSeen('b.md', 7);
        vi.advanceTimersByTime(5000);
        vi.useRealTimers();

        let flushed = false;
        const done = h.flush().then(() => {
            flushed = true;
        });

        await settle();
        expect(flushed).toBe(false);

        release();
        await done;

        expect(flushed).toBe(true);
        expect(state.written).toEqual([BACKUP, FILE]);
    });

    it('writes the backup first, with the same contents', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED });
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        await h.flush();

        expect(state.written).toEqual([BACKUP, FILE]);
        expect(files.get(BACKUP)).toBe(files.get(FILE));
    });

    // The case the backup exists for: quitting or crashing part way through
    // writing the file itself left it cut short, and the next load used to
    // start over.
    it('loses nothing when a write of the file is cut short', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED, [BACKUP]: SAVED });
        const before = history();
        await before.load();

        state.crashIn = /history\.json$/;
        before.markSeen('b.md', 7);
        await before.flush();
        expect(() => stored(files.get(FILE))).toThrow();

        state.crashIn = null;
        state.crashed = false;
        const after = history();
        await after.load();

        expect(after.sittings('a.md')).toBe(1);
        expect([...files.keys()].some((path) => path.includes('damaged'))).toBe(false);

        after.markSeen('c.md', 8);
        await after.flush();

        expect(stored(files.get(FILE)).opened).toEqual({ 'a.md': 5, 'b.md': 7, 'c.md': 8 });
    });

    it('keeps the file whole when a write of the backup is cut short', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED, [BACKUP]: SAVED });
        const before = history();
        await before.load();

        state.crashIn = /backup/;
        before.markSeen('b.md', 7);
        await before.flush();

        expect(files.get(FILE)).toBe(SAVED);

        state.crashIn = null;
        state.crashed = false;
        const after = history();
        await after.load();

        expect(after.sittings('a.md')).toBe(1);
    });

    it('still keeps a damaged copy when the backup is no better', async () => {
        const damaged = SAVED.slice(0, 30);
        const { files, history } = disk({ [FILE]: damaged, [BACKUP]: SAVED.slice(0, 20) });
        const h = history();

        await h.load();

        expect(h.sittings('a.md')).toBe(0);
        const copies = [...files.keys()].filter((path) => path.includes('damaged'));
        expect(copies.map((path) => files.get(path))).toEqual([damaged]);
    });

    // A write never removes the file, so a missing one was removed on purpose.
    it('starts again rather than bringing back a file that was removed', async () => {
        const { history } = disk({ [BACKUP]: SAVED });
        const h = history();

        await h.load();

        expect(h.sittings('a.md')).toBe(0);
    });

    it('still writes the file when the backup cannot be written', async () => {
        const { files, state, history } = disk({ [FILE]: SAVED });
        state.failWriteTo = /backup/;
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        await h.flush();

        expect(stored(files.get(FILE)).opened).toEqual({ 'a.md': 5, 'b.md': 7 });
    });

    it('starts a new history when there is no file yet', async () => {
        const { files, history } = disk();
        const h = history();

        await h.load();
        h.markSeen('b.md', 7);
        await h.flush();

        expect(stored(files.get(FILE)).opened).toEqual({ 'b.md': 7 });
    });
});
