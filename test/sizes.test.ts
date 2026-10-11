import { describe, expect, it } from 'vitest';
import { applySizes, clearSizes, GraphNode, GraphRenderer } from '../src/graph';

/** Obsidian's node, close enough: a size from its link count, a title from its size. */
class Node {
    fontDirty = false;
    constructor(readonly id: string, readonly links: number) {}

    getSize(): number {
        return Math.max(8, Math.min(3 * Math.sqrt(this.links + 1), 30));
    }

    getTextStyle(): { fontSize?: number } {
        return { fontSize: 14 + this.getSize() / 4 };
    }
}

function graph(...nodes: Node[]): GraphRenderer {
    const nodeLookup: Record<string, GraphNode> = Object.fromEntries(nodes.map((node) => [node.id, node]));
    return { nodeLookup, changed: () => undefined };
}

const BY_AGE = { spotlit: new Set<string>(), spotlightSize: 2, smallest: 0.5, largest: 2, byAge: true, titleScale: 1 };

describe('sizing nodes by age', () => {
    it('multiplies each node\'s own size by its own scale', () => {
        const old = new Node('old.md', 0);
        const hub = new Node('hub.md', 99);
        const renderer = graph(old, hub);

        applySizes(renderer, { ...BY_AGE, strengthOf: (path) => (path === 'hub.md' ? 1 : 0) });

        expect(old.getSize()).toBe(8 * 0.5);
        expect(hub.getSize()).toBe(30 * 2);
    });

    it('gives every node the same function, rather than one of its own', () => {
        const nodes = [new Node('a.md', 0), new Node('b.md', 3), new Node('c.md', 9)];
        applySizes(graph(...nodes), { ...BY_AGE, titleScale: 1.5, strengthOf: (path) => (path === 'a.md' ? 0 : 0.5) });

        // Which function each node answers with, read off the node itself.
        const own = (node: Node, name: 'getSize' | 'getTextStyle'): unknown => Object.getOwnPropertyDescriptor(node, name)?.value;

        expect(new Set(nodes.map((node) => own(node, 'getSize'))).size).toBe(1);
        expect(new Set(nodes.map((node) => own(node, 'getTextStyle'))).size).toBe(1);
        expect(own(nodes[0], 'getSize')).toBeInstanceOf(Function);
    });

    it('scales titles on top, and never compounds when applied again', () => {
        const node = new Node('a.md', 0);
        const renderer = graph(node);
        const options = { ...BY_AGE, titleScale: 1.5, strengthOf: (): number => 1 };

        for (let pass = 0; pass < 5; pass++) {
            applySizes(renderer, options);
        }

        expect(node.getSize()).toBe(16);
        expect(node.getTextStyle().fontSize).toBe((14 + 16 / 4) * 1.5);
    });

    it('hands every node its own methods back', () => {
        const node = new Node('a.md', 0);
        const renderer = graph(node);
        applySizes(renderer, { ...BY_AGE, titleScale: 1.5, strengthOf: (): number => 1 });

        clearSizes(renderer);

        expect(Object.prototype.hasOwnProperty.call(node, 'getSize')).toBe(false);
        expect(Object.prototype.hasOwnProperty.call(node, 'getTextStyle')).toBe(false);
        expect(node.getSize()).toBe(8);
    });

    it('calls through a prototype another plugin patched afterwards', () => {
        class Patched extends Node {}
        const node = new Patched('a.md', 0);
        applySizes(graph(node), { ...BY_AGE, strengthOf: (): number => 1 });

        Patched.prototype.getSize = function (this: Node): number {
            return Node.prototype.getSize.call(this) + 10;
        };

        expect(node.getSize()).toBe((8 + 10) * 2);
    });
});
