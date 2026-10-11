import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type PulsarGraphPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/settings';
import { clearNotices, createWorld, dataPath, loadPlugin, notices, settle, unloadPlugin, wait, type FakeGraphView, type NoteSpec, type World } from './harness';

// The edges of a vault rather than its middle: nothing in it, one note,
// timestamps no one would expect, notes leaving while a graph is open, two
// graphs at once, a graph with no size, and an unload with work still queued.
// Every feature is on, as a new install has it, plus the ones that start off.

const NOW = Date.UTC(2026, 9, 11, 12);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Everything on that can be: the new defaults, and the features that start off. */
const ALL_ON = {
    ...DEFAULT_SETTINGS,
    filterEnabled: true,
    filterRanges: [{ from: 0.2, to: 1 }],
    clusterWarmth: 0.5,
    intensityBlend: 0.4,
    stars: true,
    starPulse: true,
    replay: true,
    ageLabels: 'titles' as const
};

/** Whatever the plugin left on a graph's nodes is a colour that can be drawn, and no label reads NaN. */
function expectDrawable(view: FakeGraphView): void {
    for (const node of view.renderer.nodes) {
        if (node.color) {
            expect(Number.isFinite(node.color.a), `${node.id} alpha ${node.color.a}`).toBe(true);
            expect(node.color.a, node.id).toBeGreaterThanOrEqual(0);
            expect(Number.isInteger(node.color.rgb) && node.color.rgb >= 0 && node.color.rgb <= 0xffffff, `${node.id} rgb ${node.color.rgb}`).toBe(true);
        }

        if (node.circle) {
            expect(Number.isFinite(node.circle.alpha), node.id).toBe(true);
            expect(Number.isFinite(node.circle.tint), node.id).toBe(true);
        }

        for (const label of node.text?.children ?? []) {
            expect((label as { text: string }).text, node.id).not.toMatch(/NaN|Infinity|undefined/);
        }
    }

    for (const link of view.renderer.links) {
        if (link.line) {
            expect(Number.isFinite(link.line.alpha)).toBe(true);
            expect(Number.isFinite(link.line.tint)).toBe(true);
        }
    }
}

/** Runs frames until the graph sleeps, the way a still graph settles. */
function drawFor(view: FakeGraphView, frames = 90): void {
    view.renderer.frames(frames);
}

async function open(notes: NoteSpec[]): Promise<{ world: World; plugin: PulsarGraphPlugin }> {
    const world = createWorld({ notes });
    const plugin = await loadPlugin(world, ALL_ON);
    return { world, plugin };
}

beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    clearNotices();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('a vault at its edges', () => {
    it('opens a graph of an empty vault, and one of a vault with one note', async () => {
        for (const notes of [[], [{ path: 'only.md', mtime: NOW - HOUR }]]) {
            const { world, plugin } = await open(notes);
            const global = world.workspace.openGraph();
            await settle();
            drawFor(global);
            await wait(60_000);

            expectDrawable(global);
            expect(global.renderer.ids()).toEqual(notes.map((note) => note.path));
            expect(notices()).toEqual([]);
            await unloadPlugin(plugin);
        }
    });

    it('draws notes dated in the future, at the epoch, and all at one moment', async () => {
        for (const notes of [
            [{ path: 'future.md', mtime: NOW + 30 * DAY }, { path: 'now.md', mtime: NOW }, { path: 'old.md', mtime: NOW - 300 * DAY }],
            [{ path: 'epoch.md', mtime: 0, ctime: 0 }, { path: 'now.md', mtime: NOW }],
            [{ path: 'a.md', mtime: NOW - DAY }, { path: 'b.md', mtime: NOW - DAY }, { path: 'c.md', mtime: NOW - DAY }]
        ]) {
            const { world, plugin } = await open(notes);
            world.workspace.openNote(notes[0].path);
            const global = world.workspace.openGraph();
            const local = world.workspace.openLocalGraph(notes[0].path);
            await settle();
            drawFor(global);
            drawFor(local);
            await wait(60_000);

            expectDrawable(global);
            expectDrawable(local);
            expect(notices()).toEqual([]);
            await unloadPlugin(plugin);
        }
    });

    it('keeps drawing while notes are renamed, deleted and created under an open graph', async () => {
        const { world, plugin } = await open([
            { path: 'a.md', mtime: NOW - HOUR, links: ['b.md'] },
            { path: 'b.md', mtime: NOW - DAY },
            { path: 'c.md', mtime: NOW - 100 * DAY }
        ]);
        world.workspace.openNote('a.md');
        const global = world.workspace.openGraph();
        const local = world.workspace.openLocalGraph('a.md');
        await settle();
        await plugin.togglePin('c.md');
        clearNotices();

        // Obsidian rebuilds an open graph itself when the vault changes; the
        // fake engine only does when told.
        const rebuild = (): void => {
            global.graphEngine.render();
            local.graphEngine.render();
        };

        world.vault.rename('a.md', 'moved/a.md');
        rebuild();
        await wait(2000);
        drawFor(global);
        world.vault.delete('b.md');
        rebuild();
        await wait(2000);
        drawFor(global);
        world.vault.create({ path: 'new.md', mtime: NOW });
        world.vault.delete('c.md');
        rebuild();
        await wait(10_000);
        drawFor(global);
        drawFor(local);

        expectDrawable(global);
        expectDrawable(local);
        expect(global.renderer.ids().sort()).toEqual(['moved/a.md', 'new.md']);
        // A pinned note that is deleted is no longer pinned.
        expect(plugin.settings.pins).toEqual([]);
        expect(notices()).toEqual([]);
        await unloadPlugin(plugin);
    });

    it('keeps two graphs drawing, and the other one when one closes', async () => {
        const { world, plugin } = await open([
            { path: 'a.md', mtime: NOW - HOUR, links: ['b.md'] },
            { path: 'b.md', mtime: NOW - DAY },
            { path: 'c.md', mtime: NOW - 100 * DAY }
        ]);
        world.workspace.openNote('a.md');
        const first = world.workspace.openGraph();
        const second = world.workspace.openGraph();
        await settle();
        drawFor(first);
        drawFor(second);
        expect(second.renderer.nodes.map((node) => node.color?.a)).toEqual(first.renderer.nodes.map((node) => node.color?.a));

        first.close();
        await settle();
        world.vault.modify('c.md', { mtime: NOW });
        await wait(10_000);
        drawFor(second);

        expectDrawable(second);
        await unloadPlugin(plugin);
    });

    it('draws nothing broken into a graph with no size, and is right once it has one', async () => {
        const { world, plugin } = await open([
            { path: 'a.md', mtime: NOW - HOUR },
            { path: 'b.md', mtime: NOW - DAY }
        ]);
        const global = world.workspace.openGraph();
        global.renderer.width = 0;
        global.renderer.height = 0;
        await settle();
        drawFor(global);
        await wait(10_000);
        expectDrawable(global);

        global.renderer.width = 800;
        global.renderer.height = 600;
        drawFor(global);
        expectDrawable(global);
        await unloadPlugin(plugin);
    });

    it('does nothing once unloaded with an update, a save and a history write still queued', async () => {
        const { world, plugin } = await open([
            { path: 'a.md', mtime: NOW - HOUR },
            { path: 'b.md', mtime: NOW - DAY }
        ]);
        world.workspace.openNote('a.md');
        const global = world.workspace.openGraph();
        await settle();

        // Queued: the debounced update from an edit, a debounced save, a history write.
        world.vault.modify('a.md', { mtime: NOW, size: 200 });
        plugin.settings.titleScale = 1.5;
        void plugin.saveSettings();
        const savedAt = world.adapter.written.filter((path) => path === dataPath(world)).length;

        plugin.unload();
        const wrapped = global.renderer.wrappers('renderCallback') + global.renderer.wrappers('setData');
        await wait(10 * 60_000);
        drawFor(global);

        expect(global.renderer.wrappers('renderCallback') + global.renderer.wrappers('setData')).toBe(wrapped);
        expect(world.adapter.written.filter((path) => path === dataPath(world)).length).toBeLessThanOrEqual(savedAt + 1);
        expect(notices()).toEqual([]);
    });
});
