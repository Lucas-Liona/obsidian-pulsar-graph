import { browser, expect } from '@wdio/globals';
import { before, describe, it } from 'mocha';
import { obsidianPage } from 'wdio-obsidian-service';

// Every function handed to executeObsidian is stringified and run inside
// Obsidian, so it can capture nothing from this file: constants go in as
// arguments, and the types below are erased before it is sent.

const PLUGIN = 'pulsar-graph';
const DAY = 86_400_000;
// Each note in the fixture vault is this much older than the one before it,
// so twenty of them span about a year.
const STEP_DAYS = 18;

/** The graph internals read here. None of it is documented; see AGENTS.md. */
interface GraphNode {
    color?: { a: number; rgb: number } | null;
    circle?: { alpha: number } | null;
}

interface GraphRenderer {
    nodeLookup: Record<string, GraphNode>;
    width: number;
    setData: unknown;
    renderCallback: unknown;
    onNodeHover: unknown;
    onNodeUnhover: unknown;
}

interface Pulsar {
    attached: Map<GraphRenderer, { kind: string }>;
}

interface AppInternals {
    plugins: { plugins: Record<string, Pulsar | undefined>; enabledPlugins: Set<string> };
    viewRegistry: { viewByType: Record<string, unknown> };
    setting: {
        open(): void;
        openTabById(id: string): void;
        close(): void;
        activeTab: { id: string; containerEl: HTMLElement } | null;
    };
}

type Which = 'first' | 'second' | 'local';

/** What the spec keeps inside the window between steps. */
interface E2EState {
    errors: string[];
    graphs: Partial<Record<Which, GraphRenderer>>;
    originals?: Record<string, unknown>;
    wrapperSources?: Record<string, string>;
}

interface Brightness {
    nodes: number;
    attached: boolean;
    newest: { a: number; alpha: number } | null;
    oldest: { a: number; alpha: number } | null;
}

interface DataFile {
    exists: boolean;
    mtime: number;
    text: string;
}

/** How bright the newest and the oldest note are drawn in one graph. */
async function brightness(which: Which): Promise<Brightness> {
    return browser.executeObsidian(({ app }, which, plugin) => {
        const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
        const renderer = state.graphs[which];
        const pulsar = (app as unknown as AppInternals).plugins.plugins[plugin];
        if (!renderer) {
            return { nodes: 0, attached: false, newest: null, oldest: null };
        }

        const files = app.vault.getMarkdownFiles().filter((f) => renderer.nodeLookup[f.path]);
        files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        const read = (path: string | undefined): { a: number; alpha: number } | null => {
            const node = path === undefined ? undefined : renderer.nodeLookup[path];
            return node?.color && node.circle ? { a: node.color.a, alpha: node.circle.alpha } : null;
        };

        return {
            nodes: Object.keys(renderer.nodeLookup).length,
            attached: pulsar?.attached.has(renderer) ?? false,
            newest: read(files[0]?.path),
            oldest: read(files[files.length - 1]?.path),
        };
    }, which, PLUGIN);
}

/** Opens a graph in a new tab and keeps its renderer under `which`. */
async function openGraph(which: Which, type: 'graph' | 'localgraph', file?: string): Promise<void> {
    await browser.executeObsidian(async ({ app }, which, type, file) => {
        const leaf = app.workspace.getLeaf('tab');
        await leaf.setViewState({ type, active: true, state: file ? { file } : {} });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
        state.graphs[which] = (leaf.view as unknown as { renderer?: GraphRenderer }).renderer;
    }, which, type, file);

    // Drawn, at a size: a renderer in a hidden leaf has a width of 0 and
    // draws nothing.
    await browser.waitUntil(async () => {
        const b = await browser.executeObsidian((_, which) => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const renderer = state.graphs[which];
            return { nodes: Object.keys(renderer?.nodeLookup ?? {}).length, width: renderer?.width ?? 0 };
        }, which);
        return b.nodes > 1 && b.width > 0;
    }, { timeoutMsg: `the ${which} graph never drew its notes` });
}

/** Pulsar's data.json as it is on disk. */
async function dataFile(): Promise<DataFile> {
    return browser.executeObsidian(async ({ app }, plugin) => {
        const path = `${app.vault.configDir}/plugins/${plugin}/data.json`;
        if (!(await app.vault.adapter.exists(path))) {
            return { exists: false, mtime: 0, text: '' };
        }
        const stat = await app.vault.adapter.stat(path);
        return { exists: true, mtime: stat?.mtime ?? 0, text: await app.vault.adapter.read(path) };
    }, PLUGIN);
}

/** Waits for whatever saving is under way to finish, and returns the file. */
async function settledDataFile(): Promise<DataFile> {
    let last = await dataFile();
    for (;;) {
        await browser.pause(1500);
        const now = await dataFile();
        if (JSON.stringify(now) === JSON.stringify(last)) {
            return now;
        }
        last = now;
    }
}

async function errors(): Promise<string[]> {
    return browser.executeObsidian(() => (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E.errors);
}

describe('Pulsar in Obsidian', function () {
    before(async function () {
        // Anything logged as an error from here on fails the run.
        await browser.executeObsidian(() => {
            const state: E2EState = { errors: [], graphs: {} };
            (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E = state;
            const original = console.error.bind(console);
            console.error = (...args: unknown[]) => {
                state.errors.push(args.map(String).join(' '));
                original(...args);
            };
            window.addEventListener('error', (event) => state.errors.push(`error: ${event.message}`));
            window.addEventListener('unhandledrejection', (event) => state.errors.push(`rejection: ${String(event.reason)}`));
        });

        // A checkout gives every note the same modification time, so the test
        // spreads them across a year, newest first in alphabetical order.
        const pending = await browser.executeObsidian(({ app, require }, day, step) => {
            const fs = require('fs') as { utimesSync(path: string, atime: Date, mtime: Date): void };
            const adapter = app.vault.adapter as unknown as { getFullPath(path: string): string };
            const now = Date.now();
            const files = app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
            const wanted: Record<string, number> = {};
            files.forEach((file, i) => {
                const when = now - i * step * day;
                fs.utimesSync(adapter.getFullPath(file.path), new Date(when), new Date(when));
                wanted[file.path] = when;
            });
            return wanted;
        }, DAY, STEP_DAYS);

        await browser.waitUntil(async () => browser.executeObsidian(({ app }, wanted) =>
            Object.entries(wanted).every(([path, when]) => {
                const file = app.vault.getFileByPath(path);
                return file !== null && Math.abs(file.stat.mtime - when) < 2000;
            }), pending), { timeoutMsg: 'Obsidian never saw the new modification times' });

        // A graph open before Pulsar is, so Obsidian's own hooks on it can be
        // recorded before anything wraps them.
        await openGraph('first', 'graph');
        await browser.executeObsidian(({ app }) => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const renderer = state.graphs.first;
            const registry = (app as unknown as AppInternals).viewRegistry.viewByType;
            if (renderer) {
                state.originals = {
                    setData: renderer.setData,
                    renderCallback: renderer.renderCallback,
                    onNodeHover: renderer.onNodeHover,
                    onNodeUnhover: renderer.onNodeUnhover,
                    graph: registry.graph,
                    localgraph: registry.localgraph,
                };
            }
        });
    });

    it('loads with no errors', async function () {
        await obsidianPage.enablePlugin(PLUGIN);
        await browser.waitUntil(async () => browser.executeObsidian(({ app }, plugin) => {
            const plugins = (app as unknown as AppInternals).plugins;
            return plugins.enabledPlugins.has(plugin) && plugins.plugins[plugin] !== undefined;
        }, PLUGIN), { timeoutMsg: 'Pulsar never loaded' });

        // It reaches the graph that was already open.
        await browser.waitUntil(async () => (await brightness('first')).attached, {
            timeoutMsg: 'Pulsar never attached to the graph that was open before it loaded',
        });

        expect(await errors()).toEqual([]);
    });

    it('draws the newest note brighter than the oldest in a graph opened after it', async function () {
        await openGraph('second', 'graph');

        await browser.waitUntil(async () => {
            const b = await brightness('second');
            return b.attached && b.newest !== null && b.oldest !== null && b.newest.alpha > b.oldest.alpha;
        }, { timeoutMsg: 'the newest note was never drawn brighter than the oldest' });

        const b = await brightness('second');
        expect(b.nodes).toBe(20);
        expect(b.newest!.a).toBeGreaterThan(b.oldest!.a);
        expect(b.newest!.alpha).toBeGreaterThan(b.oldest!.alpha);
    });

    it('attaches to a local graph', async function () {
        await openGraph('local', 'localgraph', 'Index.md');

        await browser.waitUntil(async () => {
            const b = await brightness('local');
            return b.attached && b.newest !== null && b.oldest !== null && b.newest.a > b.oldest.a;
        }, { timeoutMsg: 'Pulsar never graded the local graph' });

        const kind = await browser.executeObsidian(({ app }, plugin) => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const pulsar = (app as unknown as AppInternals).plugins.plugins[plugin];
            return state.graphs.local ? pulsar?.attached.get(state.graphs.local)?.kind : undefined;
        }, PLUGIN);
        expect(kind).toBe('local');
    });

    it('leaves one wrapper per hook after two reloads, and none once unloaded', async function () {
        // What Pulsar's own wrappers look like, to tell them apart from
        // Obsidian's functions on graphs whose originals were never seen.
        await browser.executeObsidian(() => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const renderer = state.graphs.first;
            if (renderer) {
                state.wrapperSources = {
                    setData: String(renderer.setData),
                    renderCallback: String(renderer.renderCallback),
                    onNodeHover: String(renderer.onNodeHover),
                };
            }
        });

        // Back to back, as a hot reload does it, with nothing let to settle in
        // between: debounced work still holds the old instance.
        for (let i = 0; i < 2; i++) {
            await obsidianPage.disablePlugin(PLUGIN);
            await obsidianPage.enablePlugin(PLUGIN);
        }
        await browser.pause(3000);

        const loaded = await browser.executeObsidian(({ app }, plugin) => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const pulsar = (app as unknown as AppInternals).plugins.plugins[plugin];
            const first = state.graphs.first;
            return {
                attached: pulsar?.attached.size ?? 0,
                wrapped: first !== undefined && state.originals !== undefined && first.setData !== state.originals.setData,
            };
        }, PLUGIN);
        expect(loaded).toEqual({ attached: 3, wrapped: true });

        await obsidianPage.disablePlugin(PLUGIN);
        // Long enough for any timer an unloaded instance left behind to fire
        // and, if it could, attach again.
        await browser.pause(3000);

        const unloaded = await browser.executeObsidian(({ app }) => {
            const state = (window as unknown as { __pulsarE2E: E2EState }).__pulsarE2E;
            const registry = (app as unknown as AppInternals).viewRegistry.viewByType;
            const first = state.graphs.first;
            const originals = state.originals ?? {};
            const sources = state.wrapperSources ?? {};
            const renderers = Object.values(state.graphs);
            return {
                // The graph whose originals were recorded has exactly them back.
                firstRestored: first !== undefined
                    && first.setData === originals.setData
                    && first.onNodeHover === originals.onNodeHover
                    && first.onNodeUnhover === originals.onNodeUnhover
                    && String(first.renderCallback) === String(originals.renderCallback),
                creatorsRestored: registry.graph === originals.graph && registry.localgraph === originals.localgraph,
                // No graph is left with a Pulsar wrapper on top.
                wrappersLeft: renderers.filter((r) => r !== undefined && (
                    String(r.setData) === sources.setData
                    || String(r.renderCallback) === sources.renderCallback
                    || String(r.onNodeHover) === sources.onNodeHover)).length,
            };
        });
        expect(unloaded).toEqual({ firstRestored: true, creatorsRestored: true, wrappersLeft: 0 });

        await obsidianPage.enablePlugin(PLUGIN);
        await browser.waitUntil(async () => (await brightness('second')).attached, {
            timeoutMsg: 'Pulsar never attached again after being switched back on',
        });
    });

    it('writes nothing to data.json when its settings tab is opened and closed', async function () {
        const before = await settledDataFile();

        await browser.executeObsidian(({ app }, plugin) => {
            const setting = (app as unknown as AppInternals).setting;
            setting.open();
            setting.openTabById(plugin);
        }, PLUGIN);
        await browser.waitUntil(async () => browser.executeObsidian(({ app }, plugin) => {
            const tab = (app as unknown as AppInternals).setting.activeTab;
            return tab?.id === plugin && tab.containerEl.childElementCount > 0;
        }, PLUGIN), { timeoutMsg: 'the settings tab never drew' });
        await browser.pause(1500);
        await browser.executeObsidian(({ app }) => (app as unknown as AppInternals).setting.close());

        // Past the 400 ms a save waits for.
        await browser.pause(2000);
        expect(await dataFile()).toEqual(before);
    });

    it('logged no errors through the whole run', async function () {
        expect(await errors()).toEqual([]);
    });
});
