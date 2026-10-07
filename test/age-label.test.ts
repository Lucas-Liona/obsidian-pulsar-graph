import { describe, expect, it } from 'vitest';
import { AgeLabels } from '../src/age-label';
import { GraphNode, GraphRenderer, GraphText } from '../src/graph';

/**
 * A title shaped like PIXI's: destroying it removes its children, which is
 * what leaves a label parented to nothing after Obsidian rebuilds graphics.
 */
class Text implements GraphText {
    alpha = 1;
    visible = true;
    resolution = 2;
    y = 0;
    scale = { x: 1, y: 1 };
    style = { fontFamily: 'sans' };
    anchor = { set: (): void => undefined };
    children: GraphText[] = [];
    parent: GraphText | null = null;
    destroyed = false;

    constructor(public text: string) {}

    addChild(child: GraphText): void {
        child.parent = this;
        this.children.push(child);
    }

    removeChild(child: GraphText): void {
        this.children = this.children.filter((kept) => kept !== child);
        child.parent = null;
    }

    destroy(): void {
        for (const child of [...this.children]) {
            this.removeChild(child);
        }

        this.destroyed = true;
    }
}

function graph(): { renderer: GraphRenderer; node: GraphNode } {
    const node: GraphNode = { id: 'a.md', text: new Text('a'), getSize: () => 8 };
    const renderer: GraphRenderer = { nodeLookup: { 'a.md': node }, nodes: [node] };

    return { renderer, node };
}

describe('AgeLabels', () => {
    it('puts one label on a visible title', () => {
        const { renderer, node } = graph();
        const labels = new AgeLabels(renderer, () => ({ text: '2 hours ago', strength: 1 }));

        labels.setMode('titles');
        labels.sync();
        labels.sync();

        expect(node.text?.children.map((child) => child.text)).toEqual(['2 hours ago']);
    });

    it('labels the new title after Obsidian rebuilds graphics', () => {
        const { renderer, node } = graph();
        const labels = new AgeLabels(renderer, () => ({ text: '2 hours ago', strength: 1 }));

        labels.setMode('titles');
        labels.sync();

        // What clearGraphics then initGraphics does to a node.
        node.text?.destroy();
        node.text = new Text('a');
        labels.sync();

        expect(node.text.children.map((child) => child.text)).toEqual(['2 hours ago']);
    });

    it('takes every label off on destroy', () => {
        const { renderer, node } = graph();
        const labels = new AgeLabels(renderer, () => ({ text: '2 hours ago', strength: 1 }));

        labels.setMode('titles');
        labels.sync();
        labels.destroy();

        expect(node.text?.children).toEqual([]);
    });
});
