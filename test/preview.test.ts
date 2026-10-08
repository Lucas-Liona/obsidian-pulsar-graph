import { describe, expect, it } from 'vitest';
import { clearPreviewFilter, GraphRenderer, previewFilter } from '../src/graph';

interface Shape { visible: boolean; renderable?: boolean }

/**
 * A renderer whose frame does what Obsidian's does to visibility: every node
 * near the viewport is set visible again before anything is drawn. A node is
 * drawn when PIXI would draw it, visible and renderable both.
 */
function renderer(ids: string[]) {
    const shapes = new Map<string, { circle: Shape; text: Shape }>();
    const nodeLookup: Record<string, unknown> = {};

    for (const id of ids) {
        const node = { id, circle: { tint: 0, visible: true }, text: { visible: true } };
        shapes.set(id, node);
        nodeLookup[id] = node;
    }

    const links = [{ source: { id: ids[0] }, target: { id: ids[1] }, line: { alpha: 1, tint: 0, visible: true } as Shape }];
    const graph = { nodeLookup, links } as unknown as GraphRenderer;

    const frame = (): void => {
        for (const { circle, text } of shapes.values()) {
            circle.visible = true;
            text.visible = true;
        }
    };

    const drawn = (id: string): boolean => {
        const shape = shapes.get(id)?.circle;
        return !!shape && shape.visible && shape.renderable !== false;
    };

    return { graph, frame, drawn, links };
}

describe('previewFilter', () => {
    // The bug: hidden with `visible`, which Obsidian sets back on every frame,
    // so a drag hid nothing on screen.
    it('keeps a node hidden through the renderer setting it visible again', () => {
        const { graph, frame, drawn } = renderer(['old.md', 'new.md']);

        previewFilter(graph, (path) => path === 'new.md');
        frame();

        expect(drawn('old.md')).toBe(false);
        expect(drawn('new.md')).toBe(true);
    });

    it('brings a node back when the range moves over it', () => {
        const { graph, frame, drawn } = renderer(['old.md', 'new.md']);

        previewFilter(graph, (path) => path === 'new.md');
        previewFilter(graph, (path) => path === 'old.md');
        frame();

        expect(drawn('old.md')).toBe(true);
        expect(drawn('new.md')).toBe(false);
    });

    it('hides a link with either end hidden', () => {
        const { graph, links } = renderer(['old.md', 'new.md']);

        previewFilter(graph, (path) => path === 'new.md');

        expect(links[0].line.renderable).toBe(false);
    });

    it('draws everything again once cleared', () => {
        const { graph, frame, drawn, links } = renderer(['old.md', 'new.md']);

        previewFilter(graph, () => false);
        clearPreviewFilter(graph);
        frame();

        expect(drawn('old.md')).toBe(true);
        expect(drawn('new.md')).toBe(true);
        expect(links[0].line.renderable).toBe(true);
    });
});
