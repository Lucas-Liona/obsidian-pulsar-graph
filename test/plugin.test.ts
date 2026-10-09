import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type PulsarGraphPlugin from '../src/main';
import type { PulsarGraphSettings } from '../src/settings';
import { clearNotices, createWorld, dataPath, historyPath, loadPlugin, notices, settle, unloadPlugin, wait, type FakeGraphView, type FakeRenderer, type NoteSpec, type World, type WorldOptions } from './harness';

// The whole plugin, loaded into the fake Obsidian in ./harness, as a user's
// vault would load it. Module tests each check one file; these check what the
// files do together, which is where a local graph lost its own centre (#122)
// with 94 module tests passing.
//
// A test written as `it.fails` is a known bug: it states what should happen,
// fails today for the reason in its comment, and starts passing — which
// vitest reports as a failure — once the bug is fixed, so it cannot be left
// behind marked as broken.

const NOW = Date.UTC(2026, 9, 8, 12);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Three notes worked on this morning, two linked from the first, and two from long ago. */
const NOTES: NoteSpec[] = [
    { path: 'centre.md', mtime: NOW - HOUR, ctime: NOW - 500 * DAY, links: ['n1.md', 'n2.md'] },
    { path: 'n1.md', mtime: NOW - 2 * HOUR, ctime: NOW - 500 * DAY },
    { path: 'n2.md', mtime: NOW - 3 * HOUR, ctime: NOW - 500 * DAY },
    { path: 'other.md', mtime: NOW - 300 * DAY, ctime: NOW - 500 * DAY },
    { path: 'oldest.md', mtime: NOW - 400 * DAY, ctime: NOW - 500 * DAY }
];

const EVERY_NOTE = ['centre.md', 'n1.md', 'n2.md', 'oldest.md', 'other.md'];

/** Keeps old notes only: the bottom 0.3 of the curve. */
const OLD_ONLY: Partial<PulsarGraphSettings> = { filterEnabled: true, filterRanges: [{ from: 0, to: 0.3 }], filterAxis: 'curve' };

/** What OLD_ONLY keeps of NOTES by itself: other.md sits at 0.25, oldest.md at 0. */
const OLD_NOTES = ['oldest.md', 'other.md'];

/** What a node's circle is drawn in with no group colour. */
const GREY = 0x888888;

function vault(options: Partial<WorldOptions> = {}): World {
    return createWorld({ notes: NOTES, ...options });
}

/** Every age label hanging off a title, per node. */
function labels(view: FakeGraphView): Record<string, number> {
    return Object.fromEntries(view.renderer.nodes.map((node) => [node.id, node.text?.children.length ?? 0]));
}

function hooks(renderer: FakeRenderer): Record<string, number> {
    return {
        renderCallback: renderer.wrappers('renderCallback'),
        setData: renderer.wrappers('setData'),
        onNodeHover: renderer.wrappers('onNodeHover'),
        onNodeUnhover: renderer.wrappers('onNodeUnhover')
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** The history file as written, with how many sittings each note has and who was seen. */
function storedHistory(world: World): { sittings: Record<string, number>; seen: string[] } {
    const stored = world.adapter.json(historyPath(world));

    if (!isRecord(stored) || !isRecord(stored.notes) || !isRecord(stored.opened)) {
        throw new Error('No history file has been written');
    }

    return {
        sittings: Object.fromEntries(Object.entries(stored.notes).map(([path, beads]) => [path, Array.isArray(beads) ? beads.length : 0])),
        seen: Object.keys(stored.opened).sort()
    };
}

function storedPins(world: World): unknown {
    const stored = world.adapter.json(dataPath(world));
    return isRecord(stored) ? stored.pins : undefined;
}

beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
    clearNotices();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('a local graph and its centre', () => {
    // #122. A local graph linked to one pane keeps its centre while you work in
    // another; a filter that spared only the open note emptied it.
    it('keeps its centre when focus moves to a note in another pane', async () => {
        const world = vault();
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, OLD_ONLY);
        const local = world.workspace.openLocalGraph('centre.md');
        const global = world.workspace.openGraph();
        await settle();

        expect(local.renderer.ids()).toEqual(['centre.md']);
        expect(global.renderer.ids()).toEqual(['centre.md', ...OLD_NOTES]);

        world.workspace.openNote('other.md', { newLeaf: true });
        await settle();

        // The switch did refilter: the global graph let go of the note left.
        expect(global.renderer.ids()).toEqual(OLD_NOTES);
        expect(local.renderer.ids()).toEqual(['centre.md']);

        world.workspace.openNote('centre.md');
        await settle();

        expect(local.renderer.ids()).toEqual(['centre.md']);
        await unloadPlugin(plugin);
    });

    // Review finding 3, as the review first saw it: a reload seemed to fix an
    // emptied panel because the reload left it unfiltered. Attaching to a
    // graph that was already open refiltered through a store nothing had
    // refreshed yet, so n1.md and n2.md came back, and stayed.
    it('keeps only its centre across a reload while focus is elsewhere (review finding 3)', async () => {
        const world = vault();
        world.workspace.openNote('centre.md');
        const first = await loadPlugin(world, OLD_ONLY);
        const local = world.workspace.openLocalGraph('centre.md');
        world.workspace.openNote('other.md', { newLeaf: true });
        await settle();
        expect(local.renderer.ids()).toEqual(['centre.md']);

        await unloadPlugin(first);
        const second = await loadPlugin(world);

        expect(local.renderer.ids()).toEqual(['centre.md']);
        await unloadPlugin(second);
    });
});

describe('the age filter as a graph opens', () => {
    // #110: the graph is hooked as Obsidian builds it, so its very first build
    // is already filtered rather than every note in the vault.
    it('filters a graph opened while Pulsar runs from its very first build', async () => {
        const world = vault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, OLD_ONLY);

        const global = world.workspace.openGraph();
        await settle();

        expect(global.renderer.built).toEqual([2]);
        expect(global.renderer.ids()).toEqual(OLD_NOTES);
        await unloadPlugin(plugin);
    });

    // Review finding 3. Plugins load before the layout is restored, so a graph
    // restored at startup is built through the creator hook before anything
    // has refreshed the store, and a position never computed reads undefined,
    // which keeps the note. Attaching refiltered, but before the tab bar's
    // first paint refreshed the store, and nothing filtered again afterwards:
    // every note, from the first build on.
    it('filters a graph restored at startup from its very first build (review finding 3)', async () => {
        const world = vault({ layoutReady: false });
        const plugin = await loadPlugin(world, OLD_ONLY);

        const restored = world.workspace.openGraph();
        world.workspace.ready();
        await settle();

        expect(restored.renderer.built).toEqual([2]);
        expect(restored.renderer.ids()).toEqual(OLD_NOTES);
        await unloadPlugin(plugin);
    });

    // Review finding 3, as a reload or an update finds it: the graph is already
    // open, and attaching refiltered through a store not yet refreshed.
    it('filters a graph that was already open when Pulsar loaded (review finding 3)', async () => {
        const world = vault();
        const global = world.workspace.openGraph();
        const plugin = await loadPlugin(world, OLD_ONLY);
        await settle();

        expect(global.renderer.ids()).toEqual(OLD_NOTES);
        await unloadPlugin(plugin);
    });

    // Review finding 3, as the review harness found it. With the tab bar off
    // nothing refreshed the store before a new graph's first build or its
    // attach, and a later switch between two kept notes never refilters.
    it('filters a graph opened with the tab bar switched off (review finding 3)', async () => {
        const world = vault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, { ...OLD_ONLY, tabBar: false });

        const global = world.workspace.openGraph();
        await settle();
        world.workspace.openNote('oldest.md');
        await settle();

        expect(global.renderer.ids()).toEqual(OLD_NOTES);
        await unloadPlugin(plugin);
    });
});

describe('the graph\'s own replay', () => {
    /** recent.md is the vault's newest creation, and the filter takes it out. */
    function replayVault(): World {
        return createWorld({
            notes: [
                { path: 'oldest.md', mtime: NOW - 400 * DAY, ctime: NOW - 500 * DAY },
                { path: 'other.md', mtime: NOW - 300 * DAY, ctime: NOW - 400 * DAY },
                { path: 'recent.md', mtime: NOW - HOUR, ctime: NOW - 2 * DAY }
            ]
        });
    }

    const REPLAY: Partial<PulsarGraphSettings> = { ...OLD_ONLY, replay: true, replayTrailDays: 1 };

    it('draws each note by when it was written while the replay runs', async () => {
        const world = replayVault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, REPLAY);
        const global = world.workspace.openGraph();
        await settle();

        // Only oldest.md existed 450 days ago, and it was written at the playhead.
        global.graphEngine.replayTo(NOW - 450 * DAY);
        await settle();

        expect(global.renderer.ids()).toEqual(['oldest.md']);
        expect(global.renderer.node('oldest.md').color?.a).toBe(3);
        await unloadPlugin(plugin);
    });

    // Review finding 4. "Caught up" was measured against the newest creation
    // in the whole vault, which this graph's filter never lets it draw, so the
    // graph stayed in replay brightness for good: other.md, created at the
    // last note the graph can show, was drawn as brand new.
    it('goes back to today\'s brightness once every note it can show is drawn (review finding 4)', async () => {
        const world = replayVault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, REPLAY);
        const global = world.workspace.openGraph();
        await settle();
        const today = global.renderer.node('other.md').color?.a;

        global.graphEngine.replayTo(NOW - 450 * DAY);
        global.graphEngine.replayTo(null);
        await settle();

        expect(global.renderer.ids()).toEqual(OLD_NOTES);
        expect(global.renderer.node('other.md').color?.a).toBe(today);
        await unloadPlugin(plugin);
    });
});

describe('the edit history', () => {
    /** a.md with one sitting on record from ten days ago, open in front. */
    async function writing(): Promise<{ world: World; plugin: PulsarGraphPlugin }> {
        const world = createWorld({ notes: [{ path: 'a.md', mtime: NOW - 10 * DAY, size: 100 }, { path: 'b.md', mtime: NOW - 20 * DAY }] });
        world.adapter.files.set(historyPath(world), JSON.stringify({
            v: 1,
            awake: NOW - DAY,
            notes: { 'a.md': [[NOW - 10 * DAY, NOW - 10 * DAY, 100, 100]] },
            opened: {}
        }));
        world.workspace.openNote('a.md');

        const plugin = await loadPlugin(world, {});

        // A new sitting with a.md, kept in memory until the debounced write.
        world.vault.modify('a.md', { mtime: NOW, size: 120 });

        return { world, plugin };
    }

    /** Switches Pulsar off and on again, letting the history's writes land only once it is back on. */
    async function switchOffAndOn(plugin: PulsarGraphPlugin, disk: { hold: (pattern: RegExp) => () => void }): Promise<void> {
        const release = disk.hold(/history/);

        plugin.settings.enabled = false;
        await plugin.saveSettings();
        plugin.settings.enabled = true;
        const on = plugin.saveSettings();
        await settle();

        release();
        await on;
    }

    it('keeps a sitting across switching off and on when the disk keeps up', async () => {
        const { world, plugin } = await writing();
        expect(plugin.historyCoverage().beads).toBe(2);

        plugin.settings.enabled = false;
        await plugin.saveSettings();
        plugin.settings.enabled = true;
        await plugin.saveSettings();
        await wait(10_000);

        expect(plugin.historyCoverage().beads).toBe(2);
        expect(storedHistory(world).sittings).toEqual({ 'a.md': 2 });
        await unloadPlugin(plugin);
    });

    // Review finding 5. Switching off flushes without waiting, and switching
    // on read the file at once: a disk slower than the read handed back the
    // file from before the flush, its beads replaced the newer ones in memory,
    // and the next write saved that.
    it('keeps a sitting across switching off and on while the write is still landing (review finding 5)', async () => {
        const { world, plugin } = await writing();

        await switchOffAndOn(plugin, world.adapter);
        await wait(10_000);

        expect({ inMemory: plugin.historyCoverage().beads, onDisk: storedHistory(world).sittings }).toEqual({ inMemory: 2, onDisk: { 'a.md': 2 } });
        await unloadPlugin(plugin);
    });

    // The same race across a reload rather than a switch, and not fixed by
    // waiting in begin(): the instance reading the file is a new one, and the
    // write still landing belongs to the instance just unloaded, which nothing
    // in the new one can wait for. Plausible rather than seen: Obsidian loads
    // the new instance's code and data.json before this read.
    it.fails('keeps a sitting across a reload while the last write is still landing', async () => {
        const { world, plugin } = await writing();
        const release = world.adapter.hold(/history/);

        plugin.unload();
        const reloading = loadPlugin(world);
        await settle();
        release();
        const reloaded = await reloading;
        await wait(10_000);

        expect({ inMemory: reloaded.historyCoverage().beads, onDisk: storedHistory(world).sittings }).toEqual({ inMemory: 2, onDisk: { 'a.md': 2 } });
        await unloadPlugin(reloaded);
    });

    // A pin and a history are both held against a path, so filing a note away
    // is exactly what would otherwise lose them.
    it('follows a pinned note through a rename, in the settings and in the history', async () => {
        const { world, plugin } = await writing();
        await plugin.togglePin('a.md');

        world.vault.rename('a.md', 'archive/a.md');
        await wait(10_000);

        expect(storedPins(world)).toEqual(['archive/a.md']);
        expect(storedHistory(world).sittings).toEqual({ 'archive/a.md': 2 });
        await unloadPlugin(plugin);
    });

    // #24's rule: a deleted note takes its history with it, whichever of the
    // vault and the workspace reports the deletion first. Their order has not
    // been checked live, so both are tested.
    it('forgets a note deleted while open when the workspace lets go of it first', async () => {
        const { world, plugin } = await writing();

        world.deleteOpenNote('a.md', 'workspace');
        await wait(10_000);

        expect(storedHistory(world)).toEqual({ sittings: {}, seen: [] });
        await unloadPlugin(plugin);
    });

    // Audit item 6. The delete handler forgot the note's history but not its
    // place in the attention clock, so when the workspace reported the leaf
    // emptied afterwards, the note left was stamped as seen and written back.
    it('forgets a note deleted while open when the vault reports it first (audit item 6)', async () => {
        const { world, plugin } = await writing();

        world.deleteOpenNote('a.md', 'vault');
        await wait(10_000);

        expect(storedHistory(world)).toEqual({ sittings: {}, seen: [] });
        await unloadPlugin(plugin);
    });
});

describe('reloading', () => {
    // AGENTS.md: "An unloaded instance must never attach again." Timers,
    // debounced updates and saves in flight still hold the old instance, and
    // once re-attached it was measured at 22 wrappers per frame after three
    // reloads.
    it('never attaches an unloaded instance again, whatever it left running', async () => {
        const world = vault();
        world.workspace.openNote('centre.md');
        let plugin = await loadPlugin(world, { ageLabels: 'titles' });
        const views = [world.workspace.openGraph(), world.workspace.openLocalGraph('centre.md')];
        await settle();
        const listening = { workspace: world.workspace.listenerCount(), vault: world.vault.listenerCount() };

        for (let reload = 1; reload <= 3; reload++) {
            // What a reload finds under way: a debounced update after an edit,
            // a save, and a repaint owed at the end of the task.
            world.vault.modify('n1.md', { mtime: NOW + reload * 1000 });
            const saving = plugin.saveSettings();
            world.workspace.openNote(reload % 2 === 0 ? 'centre.md' : 'n2.md');

            plugin.unload();
            await saving;
            const stale = plugin;
            plugin = await loadPlugin(world);

            // A settings tab left open across the reload, saving again.
            await stale.saveSettings();
            await wait(60_000);
            views.forEach((view) => view.renderer.frames(5));
        }

        for (const view of views) {
            expect(hooks(view.renderer)).toEqual({ renderCallback: 1, setData: 1, onNodeHover: 1, onNodeUnhover: 1 });
            expect(Object.values(labels(view)).every((count) => count === 1)).toBe(true);
        }

        expect([world.registry.wrappers('graph'), world.registry.wrappers('localgraph')]).toEqual([1, 1]);
        expect({ workspace: world.workspace.listenerCount(), vault: world.vault.listenerCount() }).toEqual(listening);
        await unloadPlugin(plugin);
    });

    // AGENTS.md: "A released hook may still be called." Something wrapped on
    // top of Pulsar's hooks cannot be unwrapped by Pulsar, so each hook has
    // to switch itself off. Before that, an unloaded instance went on drawing
    // age labels from its frozen copy of the vault, stacked on the live ones.
    it('goes quiet underneath another plugin\'s hooks once unloaded', async () => {
        const world = vault();
        world.workspace.openNote('other.md');
        const first = await loadPlugin(world, { ...OLD_ONLY, ageLabels: 'titles' });
        const global = world.workspace.openGraph();
        await settle();
        global.renderer.frames(5);
        expect(labels(global)).toEqual({ 'oldest.md': 1, 'other.md': 1 });

        const theirs = wrapAsAnotherPlugin(global.renderer);
        await unloadPlugin(first);

        // Still in the chain, under theirs, but doing nothing: no labels,
        // no filter, nothing on hover.
        expect(hooks(global.renderer)).toEqual({ renderCallback: 2, setData: 2, onNodeHover: 2, onNodeUnhover: 0 });
        global.renderer.frames(5);
        global.renderer.hover('oldest.md');
        global.renderer.frames(5);
        expect(global.renderer.ids()).toEqual(EVERY_NOTE);
        expect(Object.values(labels(global)).every((count) => count === 0)).toBe(true);
        global.renderer.unhover();

        // Loaded again, there is one set of labels, not two, and theirs
        // still runs.
        const second = await loadPlugin(world);
        global.renderer.frames(5);
        expect(Object.values(labels(global)).every((count) => count === 1)).toBe(true);
        expect(theirs.frames).toBeGreaterThan(0);
        await unloadPlugin(second);
    });

    // Review finding 14. Saving went straight to data.json before anything
    // checked whether this instance had been unloaded, so a settings tab left
    // open across a reload wrote the old settings over the new ones — the pin
    // made since included.
    it('never lets an unloaded instance write over the settings (review finding 14)', async () => {
        const world = vault();
        const first = await loadPlugin(world, {});
        await unloadPlugin(first);

        const second = await loadPlugin(world);
        await second.togglePin('other.md');
        const saved = world.adapter.files.get(dataPath(world));
        clearNotices();

        first.settings.maxOpacity = 2;
        await first.saveSettings();
        await first.togglePin('oldest.md');
        await first.unpinAll();

        expect(storedPins(world)).toEqual(['other.md']);
        expect(world.adapter.files.get(dataPath(world))).toBe(saved);
        expect(notices()).toEqual([]);
        await unloadPlugin(second);
    });
});

/** Wraps every hook on a renderer the way Pulsar does, as a second plugin would. */
function wrapAsAnotherPlugin(renderer: FakeRenderer): { frames: number; builds: number; hovers: number } {
    const seen = { frames: 0, builds: 0, hovers: 0 };
    const frame = renderer.renderCallback;
    const setData = renderer.setData;
    const hover = renderer.onNodeHover;

    renderer.renderCallback = function (this: FakeRenderer): void {
        frame.call(this);
        seen.frames++;
    };

    renderer.setData = function (this: FakeRenderer, data: unknown): unknown {
        seen.builds++;
        return setData.call(this, data);
    };

    renderer.onNodeHover = function (this: FakeRenderer, event: unknown, id: string, type: string): void {
        hover.call(this, event, id, type);
        seen.hovers++;
    };

    return seen;
}

describe('graphs that close', () => {
    const NONE = { renderCallback: 0, setData: 0, onNodeHover: 0, onNodeUnhover: 0 };

    it('lets go of a graph when its leaf closes', async () => {
        const world = vault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, { ...OLD_ONLY, ageLabels: 'titles' });
        const global = world.workspace.openGraph();
        await settle();
        global.renderer.frames(5);

        world.workspace.close(world.workspace.leafOf(global));
        await settle();

        expect(hooks(global.renderer)).toEqual(NONE);
        await unloadPlugin(plugin);
    });

    // #98. After a programmatic detach, getLeavesOfType went on returning the
    // leaf while the workspace had stopped walking it, so its renderer stayed
    // attached, with every hook, and a refilter rebuilt it with the live ones.
    it('lets go of a graph whose leaf is gone, though getLeavesOfType still returns it (#98)', async () => {
        const world = vault();
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, { ...OLD_ONLY, ageLabels: 'titles' });
        const gone = world.workspace.openGraph();
        const kept = world.workspace.openGraph();
        await settle();

        world.workspace.detachLingering(world.workspace.leafOf(gone));
        await settle();
        const builds = gone.renderer.built.length;

        // A switch the filter cares about refilters every attached graph.
        world.workspace.openNote('other.md');
        await settle();

        expect(hooks(gone.renderer)).toEqual(NONE);
        expect(gone.renderer.built).toHaveLength(builds);
        expect(kept.renderer.ids()).toEqual(OLD_NOTES);
        expect(hooks(kept.renderer)).toEqual({ renderCallback: 1, setData: 1, onNodeHover: 1, onNodeUnhover: 1 });
        await unloadPlugin(plugin);
    });
});

describe('colour', () => {
    // AGENTS.md: "setData is what wipes node colour." Every rebuild resets each
    // node's colour from group data, and the hook on it is what puts the fade
    // back; a group's colour has to come through untouched.
    it('puts the fade back after every rebuild, keeping group colours', async () => {
        const world = vault({ groups: [{ prefix: 'n1', rgb: 0xe05050 }] });
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, {});
        const global = world.workspace.openGraph();
        await settle();

        const colours = (): Record<string, { a: number; rgb: number } | undefined> => Object.fromEntries(
            global.renderer.nodes.map((node) => [node.id, node.color])
        );

        expect(colours()).toMatchObject({
            'centre.md': { a: 3, rgb: GREY },
            'n1.md': { rgb: 0xe05050 },
            'oldest.md': { a: 0.1, rgb: GREY }
        });

        // A new note moves the newest end of the range, and the engine rebuilds.
        world.vault.create({ path: 'new.md', mtime: NOW });
        world.renderGraphs();

        expect(global.renderer.built).toHaveLength(2);
        expect(colours()).toMatchObject({
            'new.md': { a: 3, rgb: GREY },
            'n1.md': { rgb: 0xe05050 },
            'oldest.md': { a: 0.1, rgb: GREY }
        });
        expect(global.renderer.node('centre.md').color?.a).toBeLessThan(3);
        await unloadPlugin(plugin);
    });

    // On a light theme an alpha above 1 is a step toward the white background:
    // at the shipped maximum of 3 the newest note was drawn white on white,
    // and with most of a vault above 1 the graph was links and nothing else.
    it('deepens nodes past full strength on a light theme, and hands every one back on a dark one', async () => {
        const world = vault({ groups: [{ prefix: 'n1', rgb: 0xe05050 }] });
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, {});
        const global = world.workspace.openGraph();
        await settle();
        const before = Object.fromEntries(global.renderer.nodes.map((node) => [node.id, node.color?.rgb]));

        expect(global.renderer.node('centre.md').color).toEqual({ a: 3, rgb: GREY });

        world.setTheme('light');
        await settle();
        global.renderer.frames(100);

        expect(Math.max(...global.renderer.nodes.map((node) => node.color?.a ?? NaN))).toBe(1);
        expect(global.renderer.node('centre.md').color).toEqual({ a: 1, rgb: 0x000000 });
        expect(global.renderer.node('centre.md').circle?.tint).toBe(0x000000);
        expect(global.renderer.node('oldest.md').color).toEqual({ a: 0.1, rgb: GREY });

        world.setTheme('dark');
        await settle();
        global.renderer.frames(100);

        const stalled = global.renderer.nodes.filter((node) => node.circle?.tint !== before[node.id]).map((node) => node.id);
        expect(stalled).toEqual([]);
        expect(global.renderer.node('centre.md').color).toEqual({ a: 3, rgb: GREY });
        expect(global.renderer.node('n1.md').color?.rgb).toBe(0xe05050);
        await unloadPlugin(plugin);
    });

    // The default green stands 1.31:1 off white, fainter than an ordinary
    // node, so the note being picked out was the hardest one to see.
    it('draws the spotlight darker on a light theme, and as picked on a dark one', async () => {
        const world = vault();
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, { spotlightNewest: true });
        const global = world.workspace.openGraph();
        await settle();
        global.renderer.frames(100);

        expect(plugin.settings.spotlightColor).toBe('#4dff91');
        expect(global.renderer.node('centre.md').circle?.tint).toBe(0x4dff91);

        world.setTheme('light');
        await settle();
        global.renderer.frames(100);
        expect(global.renderer.node('centre.md').circle?.tint).toBe(0x33a960);

        world.setTheme('dark');
        await settle();
        global.renderer.frames(100);
        expect(global.renderer.node('centre.md').circle?.tint).toBe(0x4dff91);
        await unloadPlugin(plugin);
    });

    // AGENTS.md: "Easing a tint upward stalls; downward converges." The pin
    // colour is held by assigning it, and handing a node back has to land the
    // tint exactly: left to the renderer, n2.md would ease from the pin colour
    // to #888588 and stop there, three short of its own green.
    it('draws a pin in exactly the colour picked, and hands the node back exactly', async () => {
        const world = vault();
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, {});
        const global = world.workspace.openGraph();
        await settle();
        const node = global.renderer.node('n2.md');

        await plugin.togglePin('n2.md');
        await settle();
        global.renderer.frames(100);
        // #c084fc at the default strength of 0.85 over #888888.
        expect(node.circle?.tint).toBe(0xb885eb);

        await plugin.togglePin('n2.md');
        await settle();
        global.renderer.frames(100);
        expect(node.circle?.tint).toBe(GREY);
        await unloadPlugin(plugin);
    });

    // AGENTS.md: "Mid-rebuild a node has no colour." A rebuild while a node is
    // painted must not mistake the paint for the node's own colour.
    it('hands a pinned node its group colour back after a rebuild in between', async () => {
        const world = vault({ groups: [{ prefix: 'n1', rgb: 0xe05050 }] });
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, {});
        const global = world.workspace.openGraph();
        await settle();
        const node = global.renderer.node('n1.md');

        await plugin.togglePin('n1.md');
        await settle();
        world.vault.create({ path: 'new.md', mtime: NOW });
        world.renderGraphs();
        await settle();
        global.renderer.frames(100);

        await plugin.togglePin('n1.md');
        await settle();
        global.renderer.frames(100);

        expect(node.color?.rgb).toBe(0xe05050);
        expect(node.circle?.tint).toBe(0xe05050);
        await unloadPlugin(plugin);
    });
});

describe('durations past the old ends', () => {
    // A window of 6 hours used to be read as 1 day: the setting floored at a
    // day and rounded to whole ones. In 6 hours, a note 7 hours old is past the
    // window and sits at the minimum; in a day it would not.
    it('measures a window of a quarter of a day as six hours', async () => {
        const notes: NoteSpec[] = [...NOTES, { path: 'seven.md', mtime: NOW - 7 * HOUR, ctime: NOW - 500 * DAY }];
        const world = vault({ notes });
        world.workspace.openNote('centre.md');
        const plugin = await loadPlugin(world, { normalizeBy: 'window', windowDays: 0.25 });
        const global = world.workspace.openGraph();
        await settle();

        expect(plugin.settings.windowDays).toBe(0.25);
        expect(global.renderer.node('seven.md').color?.a).toBeCloseTo(0.1, 5);
        expect(global.renderer.node('n2.md').color?.a).toBeGreaterThan(0.1);
        await unloadPlugin(plugin);
    });

    // The spotlight window stopped at 12 hours, so "everything touched today"
    // could not be said: a note from 20 hours ago was never marked.
    it('spotlights a note from twenty hours ago with a window of a day', async () => {
        const notes: NoteSpec[] = [...NOTES, { path: 'yesterday.md', mtime: NOW - 20 * HOUR, ctime: NOW - 500 * DAY }];
        const world = vault({ notes });
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, { spotlightNewest: true, spotlightBy: 'window', spotlightMinutes: 24 * 60 });
        const global = world.workspace.openGraph();
        await settle();
        global.renderer.frames(100);

        expect(plugin.settings.spotlightMinutes).toBe(24 * 60);
        expect(global.renderer.node('yesterday.md').circle?.tint).toBe(0x4dff91);
        expect(global.renderer.node('other.md').circle?.tint).toBe(GREY);
        await unloadPlugin(plugin);
    });
});

describe('unloading', () => {
    it('leaves no hook behind and hands every graph back as Obsidian drew it', async () => {
        const world = vault({ groups: [{ prefix: 'n1', rgb: 0xe05050 }] });
        world.workspace.openNote('other.md');
        const plugin = await loadPlugin(world, {
            ...OLD_ONLY,
            ageLabels: 'titles',
            spotlightNewest: true,
            nodeSizeByAge: true,
            pins: ['n2.md']
        });
        const views = [world.workspace.openGraph(), world.workspace.openLocalGraph('centre.md')];
        await settle();
        views.forEach((view) => view.renderer.frames(10));

        // Everything this test expects to be undone was done: the spotlit
        // centre and the pinned n2.md survive the filter, and are painted.
        const [global] = views;
        expect(global.renderer.ids()).toEqual(['centre.md', 'n2.md', ...OLD_NOTES]);
        expect(global.renderer.node('n2.md').circle?.tint).not.toBe(GREY);
        expect(Object.prototype.hasOwnProperty.call(global.renderer.node('centre.md'), 'getSize')).toBe(true);

        await unloadPlugin(plugin);
        views.forEach((view) => view.renderer.frames(100));

        for (const view of views) {
            expect(hooks(view.renderer)).toEqual({ renderCallback: 0, setData: 0, onNodeHover: 0, onNodeUnhover: 0 });
            expect(Object.values(labels(view)).every((count) => count === 0)).toBe(true);

            for (const node of view.renderer.nodes) {
                expect(node.color, node.id).toEqual(world.groupColour(node.id));
                expect(node.circle?.tint, node.id).toBe(node.getFillColor().rgb);
                expect(Object.prototype.hasOwnProperty.call(node, 'getSize'), node.id).toBe(false);
                expect(Object.prototype.hasOwnProperty.call(node, 'getTextStyle'), node.id).toBe(false);
            }
        }

        expect(global.renderer.ids()).toEqual(EVERY_NOTE);
        expect([world.registry.wrappers('graph'), world.registry.wrappers('localgraph')]).toEqual([0, 0]);
        expect({ workspace: world.workspace.listenerCount(), vault: world.vault.listenerCount() }).toEqual({ workspace: 0, vault: 0 });
        expect(vi.getTimerCount()).toBe(0);

        // And a graph opened afterwards is Obsidian's alone.
        const later = world.workspace.openGraph();
        expect(hooks(later.renderer)).toEqual({ renderCallback: 0, setData: 0, onNodeHover: 0, onNodeUnhover: 0 });
        expect(later.renderer.ids()).toEqual(EVERY_NOTE);
    });
});

describe('stars', () => {
    it('start off', async () => {
        const plugin = await loadPlugin(vault());

        expect(plugin.settings.stars).toBe(false);
        expect(plugin.settings.starPulse).toBe(false);
        await unloadPlugin(plugin);
    });

    // The fake renderer's titles are not PIXI text, so there is nothing to
    // build a halo from, which is what a future Obsidian without them would
    // look like. A pulse with nothing to pulse must not keep the graph awake.
    it('let a graph they cannot be drawn on go to sleep, pulse and all', async () => {
        const world = vault();
        const plugin = await loadPlugin(world, { stars: true, starPulse: true, starCount: 3 });
        const view = world.workspace.openGraph();
        await settle();

        expect(view.renderer.frames(1000)).toBeLessThan(100);
        await unloadPlugin(plugin);
    });
});
