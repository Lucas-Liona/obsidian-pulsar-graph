import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GraphLink, GraphNode, GraphRenderer, poolByPath, poolNeighbours } from '../src/graph';

/**
 * A graph as the renderer holds it: nodes by path with their adjacency both
 * ways, and the same links again as a list. Some links point at a note that is
 * not in the graph, and some notes have no brightness, as an unresolved link
 * and a note the store has not seen leave them.
 */
const graph = fc.integer({ min: 1, max: 40 }).chain((size) => fc.record({
    size: fc.constant(size),
    links: fc.array(fc.tuple(fc.integer({ min: 0, max: size + 2 }), fc.integer({ min: 0, max: size + 2 })), { maxLength: 120 }),
    strengths: fc.array(fc.option(fc.integer({ min: 0, max: 30_000 }).map((step) => step / 10_000), { freq: 6 }), { minLength: size, maxLength: size })
}));

function build({ size, links, strengths }: { size: number; links: [number, number][]; strengths: (number | null)[] }): { renderer: GraphRenderer; own: Map<string, number> } {
    const nodeLookup: Record<string, GraphNode> = {};
    const outside = new Map<number, GraphNode>();
    const nodeAt = (index: number): GraphNode => {
        if (index < size) {
            return nodeLookup[`n${index}.md`];
        }

        let node = outside.get(index);
        if (!node) {
            node = { id: `missing${index}`, forward: {}, reverse: {} };
            outside.set(index, node);
        }

        return node;
    };

    for (let index = 0; index < size; index++) {
        nodeLookup[`n${index}.md`] = { id: `n${index}.md`, forward: {}, reverse: {} };
    }

    const list: GraphLink[] = [];

    for (const [from, to] of links) {
        const source = nodeAt(from);
        const target = nodeAt(to);
        (source.forward ??= {})[target.id] = true;
        (target.reverse ??= {})[source.id] = true;
        list.push({ source, target });
    }

    const own = new Map<string, number>();
    strengths.forEach((value, index) => {
        if (value !== null) {
            own.set(`n${index}.md`, value);
        }
    });

    return { renderer: { nodeLookup, links: list }, own };
}

describe('neighbour glow', () => {
    // The pooling was rewritten to run over the list of links by position
    // instead of through each node's adjacency by path. It has to give the
    // same answer for every graph, glow and reach.
    it('pools exactly as it did through each node’s own adjacency', () => {
        fc.assert(fc.property(
            graph,
            fc.integer({ min: 0, max: 95 }).map((step) => step / 100),
            fc.integer({ min: 1, max: 3 }),
            (shape, bleed, hops) => {
                const { renderer, own } = build(shape);

                const fast = poolNeighbours(renderer, own, bleed, hops);
                const reference = poolByPath(renderer, own, bleed, hops);

                expect([...fast]).toEqual([...reference]);
            }
        ));
    });

    it('never dims a note, and never lifts one past its brightest neighbour', () => {
        fc.assert(fc.property(graph, fc.integer({ min: 1, max: 95 }).map((step) => step / 100), (shape, bleed) => {
            const { renderer, own } = build(shape);
            const pooled = poolNeighbours(renderer, own, bleed, 1);
            const brightest = Math.max(0, ...own.values());

            for (const [path, value] of own) {
                expect(pooled.get(path)).toBeGreaterThanOrEqual(value);
                expect(pooled.get(path)).toBeLessThanOrEqual(Math.max(value, brightest * bleed));
            }
        }));
    });
});
