import { describe, expect, it } from 'vitest';
import type { App } from 'obsidian';
import { GraphRenderer, hookGraphCreation, hookRendererData, hookRendererFrame } from '../src/graph';
import { hookNodeHover } from '../src/hover';

/** Just enough of a renderer for the hooks, which only touch these properties. */
function renderer(): GraphRenderer {
    return {
        nodeLookup: {},
        renderCallback: () => undefined,
        setData: (data: unknown) => data,
        onNodeHover: () => undefined,
        onNodeUnhover: () => undefined
    };
}

describe('hookRendererFrame', () => {
    it('restores the original when it is still on top', () => {
        const graph = renderer();
        const obsidian = graph.renderCallback;
        const hook = hookRendererFrame(graph, () => undefined);

        hook?.release();

        expect(graph.renderCallback).toBe(obsidian);
    });

    // The bug behind the stacked age labels: the plugin is reloaded, the new
    // instance wraps over the old wrapper, and the old one can no longer be
    // unlinked. It has to stop doing anything instead.
    it('goes quiet when released underneath a later wrapper', () => {
        const graph = renderer();
        let first = 0;
        let second = 0;

        const old = hookRendererFrame(graph, () => first++);
        hookRendererFrame(graph, () => second++);
        old?.release();

        graph.renderCallback?.();
        graph.renderCallback?.();

        expect(first).toBe(0);
        expect(second).toBe(2);
    });

    it('survives the plugin being reloaded across a graphics rebuild', () => {
        const graph = renderer();
        let unloaded = 0;

        // Loaded, then Obsidian rebuilds graphics and the plugin re-installs.
        const attached = hookRendererFrame(graph, () => unloaded++);
        graph.renderCallback = () => undefined;
        attached?.release();
        const reinstalled = hookRendererFrame(graph, () => unloaded++);

        // Reloaded: the new instance wraps before anything else runs.
        let current = 0;
        hookRendererFrame(graph, () => current++);
        reinstalled?.release();

        for (let frame = 0; frame < 10; frame++) {
            graph.renderCallback?.();
        }

        expect(unloaded).toBe(0);
        expect(current).toBe(10);
    });
});

describe('hookRendererData', () => {
    it('passes data straight through once released underneath a later wrapper', () => {
        const graph = renderer();
        const transformed: unknown[] = [];

        const hook = hookRendererData(graph, () => undefined, (data) => {
            transformed.push(data);
            return 'filtered';
        });

        const outer = graph.setData;
        graph.setData = (data: unknown) => outer?.call(graph, data);
        hook?.release();

        expect(graph.setData('everything')).toBe('everything');
        expect(transformed).toEqual([]);
    });

    // A graph whose timelapse had been started never went idle: the engine
    // resends identical data nine times a second, and each one used to reset
    // every colour and wake the renderer twice over.
    describe('given the same graph again', () => {
        /** A renderer whose setData builds one node per entry, as Obsidian's does. */
        function building(): { graph: GraphRenderer; built: () => number } {
            const graph = renderer();
            let built = 0;

            graph.setData = function (this: GraphRenderer, data: unknown): void {
                built++;
                this.nodes = Object.keys((data as { nodes: object }).nodes).map((id) => ({ id }));
            };

            return { graph, built: () => built };
        }

        const data = (...ids: string[]): object => ({
            nodes: Object.fromEntries(ids.map((id) => [id, { type: '', links: {} }])),
            numLinks: 0
        });

        it('hands the renderer nothing and does not call back', () => {
            const { graph, built } = building();
            let calledBack = 0;
            hookRendererData(graph, () => calledBack++, (supplied) => supplied);

            graph.setData?.(data('a.md', 'b.md'));
            graph.setData?.(data('a.md', 'b.md'));
            graph.setData?.(data('b.md', 'a.md'));

            expect(built()).toBe(1);
            expect(calledBack).toBe(1);
        });

        it('still passes on a graph that changed', () => {
            const { graph, built } = building();
            let calledBack = 0;
            hookRendererData(graph, () => calledBack++, (supplied) => supplied);

            graph.setData?.(data('a.md', 'b.md'));
            graph.setData?.(data('a.md', 'b.md', 'c.md'));
            graph.setData?.(data('a.md', 'b.md'));

            expect(built()).toBe(3);
            expect(calledBack).toBe(3);
        });

        it('compares what survives the filter, not what was supplied', () => {
            const { graph, built } = building();
            let hidden = new Set(['c.md']);
            const hook = hookRendererData(graph, () => undefined, (supplied) => ({
                ...(supplied as object),
                nodes: Object.fromEntries(Object.entries((supplied as { nodes: object }).nodes).filter(([id]) => !hidden.has(id)))
            }));

            graph.setData?.(data('a.md', 'b.md', 'c.md'));

            // A refilter that keeps the same notes costs nothing.
            hook?.reapply();
            expect(built()).toBe(1);

            // One that brings a note back rebuilds.
            hidden = new Set();
            hook?.reapply();
            expect(built()).toBe(2);
            expect(graph.nodes?.length).toBe(3);
        });

        it('rebuilds if the renderer no longer holds what it was given', () => {
            const { graph, built } = building();
            hookRendererData(graph, () => undefined, (supplied) => supplied);

            graph.setData?.(data('a.md', 'b.md'));
            graph.nodes = [];
            graph.setData?.(data('a.md', 'b.md'));

            expect(built()).toBe(2);
        });
    });
});

describe('hookNodeHover', () => {
    it('stops calling back once released underneath a later wrapper', () => {
        const graph = renderer();
        const seen: string[] = [];

        const release = hookNodeHover(graph, { onHover: (id) => seen.push(id), onUnhover: () => seen.push('-') });
        const outer = graph.onNodeHover;
        graph.onNodeHover = (event, id, type) => outer?.call(graph, event, id, type);
        release();

        graph.onNodeHover?.({} as MouseEvent, 'a.md', 'file');
        graph.onNodeUnhover?.();

        expect(seen).toEqual([]);
    });
});

describe('hookGraphCreation', () => {
    type Creator = (leaf: unknown) => unknown;

    /** A registry like Obsidian's, whose graph views close through register(). */
    function registry(): { app: App; viewByType: Record<string, Creator | undefined>; close: () => void } {
        const closing: Array<() => void> = [];
        const view = (): unknown => ({ renderer: renderer(), register: (callback: () => void) => closing.push(callback) });
        const viewByType: Record<string, Creator | undefined> = { graph: view, localgraph: view, markdown: () => ({}) };

        return {
            app: { viewRegistry: { viewByType } } as unknown as App,
            viewByType,
            close: () => closing.splice(0).forEach((callback) => callback())
        };
    }

    // The point of it: a hook put on here sees the graph's very first build,
    // which the engine sends as the view opens, before the layout changes.
    it('hands over each graph renderer before the view is returned', () => {
        const { app, viewByType } = registry();
        const built: number[] = [];

        hookGraphCreation(app, (graph) => {
            hookRendererData(graph, () => undefined, (data) => {
                built.push(Object.keys((data as { nodes: object }).nodes).length);
                return { nodes: {} };
            });
        });

        for (const viewType of ['graph', 'localgraph']) {
            const view = viewByType[viewType]?.({}) as { renderer: GraphRenderer };
            view.renderer.setData?.({ nodes: { 'a.md': {}, 'b.md': {} } });
        }

        expect(built).toEqual([2, 2]);
    });

    it('leaves every other view type alone', () => {
        const { app, viewByType } = registry();
        const markdown = viewByType.markdown;
        let created = 0;

        hookGraphCreation(app, () => created++);
        viewByType.markdown?.({});

        expect(viewByType.markdown).toBe(markdown);
        expect(created).toBe(0);
    });

    it('runs what was registered when the view closes', () => {
        const { app, viewByType, close } = registry();
        let closed = 0;

        hookGraphCreation(app, (_graph, onClose) => onClose(() => closed++));
        viewByType.graph?.({});
        close();

        expect(closed).toBe(1);
    });

    it('puts the creators back when it is still on top', () => {
        const { app, viewByType } = registry();
        const graph = viewByType.graph;
        const local = viewByType.localgraph;

        hookGraphCreation(app, () => undefined)();

        expect(viewByType.graph).toBe(graph);
        expect(viewByType.localgraph).toBe(local);
    });

    it('goes quiet when released underneath a later wrapper', () => {
        const { app, viewByType } = registry();
        let created = 0;

        const release = hookGraphCreation(app, () => created++);
        const outer = viewByType.graph;
        viewByType.graph = (leaf) => outer?.(leaf);
        release();
        viewByType.graph({});

        expect(created).toBe(0);
    });

    it('still opens the graph when the callback throws', () => {
        const { app, viewByType } = registry();

        hookGraphCreation(app, () => {
            throw new Error('broken');
        });

        expect(viewByType.graph?.({})).toHaveProperty('renderer');
    });

    it('does nothing without a registry to wrap', () => {
        expect(() => hookGraphCreation({} as App, () => undefined)()).not.toThrow();
    });
});
