import { vi } from 'vitest';
import type { PluginManifest } from 'obsidian';
import PulsarGraphPlugin from '../../src/main';
import type { PulsarGraphSettings } from '../../src/settings';
import { whenLoaded } from './runtime';
import type { World } from './world';

const ID = 'pulsar-graph';

export function pluginDir(world: World): string {
    return `${world.vault.configDir}/plugins/${ID}`;
}

/** Where the plugin's settings live, as Obsidian keeps them. */
export function dataPath(world: World): string {
    return `${pluginDir(world)}/data.json`;
}

export function historyPath(world: World): string {
    return `${pluginDir(world)}/history.json`;
}

function manifest(world: World): PluginManifest {
    return {
        id: ID,
        name: 'Pulsar',
        author: 'harness',
        version: '0.0.0',
        minAppVersion: '1.8.0',
        description: 'Under test.',
        dir: pluginDir(world)
    };
}

/**
 * Loads the real plugin into a world the way Obsidian does: a new instance,
 * `load()`, and its async `onload` run to the end. Settings, when given, are
 * written to `data.json` first, over whatever was there; leave them out to
 * load what the last instance saved.
 */
export async function loadPlugin(world: World, settings?: Partial<PulsarGraphSettings>): Promise<PulsarGraphPlugin> {
    if (settings !== undefined) {
        world.adapter.files.set(dataPath(world), JSON.stringify(settings));
    }

    const plugin = new PulsarGraphPlugin(world.app, manifest(world));
    plugin.load();
    await whenLoaded(plugin);
    await settle();

    return plugin;
}

/** Disables the plugin the way Obsidian does, and lets what that started run. */
export async function unloadPlugin(plugin: PulsarGraphPlugin): Promise<void> {
    plugin.unload();
    await settle();
}

/**
 * Lets every promise and microtask already queued run, without moving the
 * clock: the repaint owed at the end of a task, a save in flight.
 */
export async function settle(): Promise<void> {
    for (let turn = 0; turn < 50; turn++) {
        await Promise.resolve();
    }
}

/** Moves the fake clock on, running every timer due on the way. */
export async function wait(ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(ms);
    await settle();
}
