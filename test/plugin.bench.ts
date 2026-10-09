import { bench, describe } from 'vitest';
import type PulsarGraphPlugin from '../src/main';
import type { PulsarGraphSettings } from '../src/settings';
import { FEATURES_OFF } from './features-off';
import { createWorld, loadPlugin, settle, unloadPlugin, type NoteSpec, type World } from './harness';
import { fakeVault } from './vault';

/**
 * What the plugin costs where a graph is attached: a graph opening while it
 * runs, and Obsidian starting with a graph restored. Measured through the
 * whole plugin against the fake Obsidian in ./harness, so the fake engine and
 * renderer are in every number; "no plugin" is what they cost alone.
 *
 * Each iteration undoes itself — the graph is closed, the plugin unloaded —
 * because a bench cannot set up outside the time it measures. Closing and
 * unloading are in the numbers too, alike before and after any change.
 */

/**
 * The core fade alone. The arms named "filter off" and "filter on" were
 * recorded against the defaults from before most features were switched on
 * for a new install, and keep them, so they stay comparable with the baseline.
 */
const CORE: Partial<PulsarGraphSettings> = FEATURES_OFF;

/** Keeps the oldest stretch of the curve, which in these vaults is about a third of the notes. */
const FILTER: Partial<PulsarGraphSettings> = { ...CORE, filterEnabled: true, filterRanges: [{ from: 0, to: 0.3 }], filterAxis: 'curve' };

/** A new install: no saved settings, so every default, with most features on. */
const ALL_ON: Partial<PulsarGraphSettings> = {};

/** The bench vault, each note linking to one other so the renderer has links to build. */
function vaultOf(size: number): NoteSpec[] {
    const { mtimes } = fakeVault(size);
    const paths = [...mtimes.keys()];

    return paths.map((path, index) => ({
        path,
        mtime: mtimes.get(path) ?? 0,
        links: [paths[(index * 7 + 3) % paths.length]]
    }));
}

/** Few iterations, because one is a whole vault built and torn down. */
const SLOW = { iterations: 5, warmupIterations: 1, time: 0, warmupTime: 0 };

for (const size of [1_000, 10_000, 50_000]) {
    const notes = vaultOf(size);

    describe(`plugin, ${size.toLocaleString('en-US')} notes`, () => {
        /**
         * A graph opened and closed in a world that is already running. Each
         * bench keeps its own world: a cycle's teardown can land after the
         * next bench's setup.
         */
        const openAndClose = (settings: Partial<PulsarGraphSettings> | null): [() => Promise<void>, Parameters<typeof bench>[2]] => {
            let world: World | null = null;
            let plugin: PulsarGraphPlugin | null = null;

            const run = async (): Promise<void> => {
                if (!world) {
                    throw new Error('No world set up');
                }

                const view = world.workspace.openGraph();
                await settle();
                world.workspace.close(world.workspace.leafOf(view));
                await settle();
            };

            const options = {
                ...SLOW,
                setup: async (): Promise<void> => {
                    world = createWorld({ notes });
                    world.workspace.openNote(notes[0].path);
                    plugin = settings === null ? null : await loadPlugin(world, settings);
                },
                teardown: async (): Promise<void> => {
                    const loaded = plugin;
                    world = null;
                    plugin = null;

                    if (loaded) {
                        await unloadPlugin(loaded);
                    }
                }
            };

            return [run, options];
        };

        bench('open and close a graph, no plugin', ...openAndClose(null));
        bench('open and close a graph, filter off', ...openAndClose(CORE));
        bench('open and close a graph, filter on', ...openAndClose(FILTER));
        bench('open and close a graph, all on (new defaults)', ...openAndClose(ALL_ON));

        const startUp = (settings: Partial<PulsarGraphSettings>) => async (): Promise<void> => {
            const starting = createWorld({ notes, layoutReady: false });
            starting.workspace.openNote(notes[0].path);
            const loaded = await loadPlugin(starting, settings);

            starting.workspace.openGraph();
            starting.workspace.ready();
            await settle();
            await unloadPlugin(loaded);
        };

        bench('start up with a graph restored, filter off', startUp(CORE), SLOW);
        bench('start up with a graph restored, filter on', startUp(FILTER), SLOW);
        bench('start up with a graph restored, all on (new defaults)', startUp(ALL_ON), SLOW);
    });
}
