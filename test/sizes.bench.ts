import { bench, describe } from 'vitest';
import { applySizes, GraphNode, GraphRenderer } from '../src/graph';

/**
 * What sizing nodes by age costs the renderer on one frame. Obsidian asks
 * every node for its size while it draws, through `getSize`, which sizing
 * replaces on each node it scales.
 */
class Node {
    weight: number;
    fontDirty = false;
    constructor(readonly id: string, readonly renderer: { fNodeSizeMult: number }, index: number) {
        this.weight = index % 17;
    }

    // Close to the shape of Obsidian's own: a size from the node's link count,
    // scaled by the slider in the graph's controls.
    getSize(): number {
        return this.renderer.fNodeSizeMult * Math.max(8, Math.min(3 * Math.sqrt(this.weight + 1), 30));
    }

    getTextStyle(): { fontSize?: number } {
        return { fontSize: 14 };
    }
}

for (const notes of [1_000, 20_000]) {
    const settings = { fNodeSizeMult: 1 };
    const nodeLookup: Record<string, GraphNode> = {};
    const nodes: Node[] = [];

    for (let i = 0; i < notes; i++) {
        const node = new Node(`Note ${i}.md`, settings, i);
        nodes.push(node);
        nodeLookup[node.id] = node;
    }

    const renderer = { nodeLookup, changed: () => undefined } as unknown as GraphRenderer;
    applySizes(renderer, {
        spotlit: new Set(['Note 0.md']),
        spotlightSize: 2,
        strengthOf: (path) => (Number(path.slice(5, -3)) % 101) / 100,
        smallest: 0.7,
        largest: 1.8,
        byAge: true,
        titleScale: 1
    });

    describe(`sizes, ${notes.toLocaleString('en-US')} nodes`, () => {
        // Three asks a node a frame: the circle, its hit area, the title's place.
        bench('a frame of getSize, three per node', () => {
            let total = 0;
            for (let pass = 0; pass < 3; pass++) {
                for (let i = 0; i < nodes.length; i++) {
                    total += nodes[i].getSize();
                }
            }
            if (total < 0) {
                throw new Error('unreachable');
            }
        });
    });
}
