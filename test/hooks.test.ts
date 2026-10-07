import { describe, expect, it } from 'vitest';
import { GraphRenderer, hookRendererData, hookRendererFrame } from '../src/graph';
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
