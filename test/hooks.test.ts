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
