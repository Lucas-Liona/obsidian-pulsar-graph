import { describe, expect, it } from 'vitest';
import { nodeCount, sameGraphData } from '../src/filter';

/** Graph data as the engine builds it: a type, links as { path: true }, and a colour only when a group gives one. */
function graph(nodes: Record<string, { links?: string[]; type?: string; color?: { a: number; rgb: number } }>, numLinks = 0): object {
    return {
        nodes: Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, {
            type: node.type ?? '',
            links: Object.fromEntries((node.links ?? []).map((target) => [target, true])),
            ...(node.color ? { color: node.color } : {})
        }])),
        numLinks
    };
}

describe('sameGraphData', () => {
    const base = { 'a.md': { links: ['b.md'] }, 'b.md': {}, 'c.md': { color: { a: 1, rgb: 0xff0000 } } };

    it('treats two separately built copies as the same graph', () => {
        expect(sameGraphData(graph(base, 1), graph(base, 1))).toBe(true);
    });

    it('ignores the order nodes and links arrive in', () => {
        const reordered = { 'c.md': { color: { a: 1, rgb: 0xff0000 } }, 'b.md': {}, 'a.md': { links: ['b.md'] } };

        expect(sameGraphData(graph(base, 1), graph(reordered, 1))).toBe(true);
    });

    it.each([
        ['a node added', { ...base, 'd.md': {} }],
        ['a node removed', { 'a.md': { links: ['b.md'] }, 'b.md': {} }],
        ['a link added', { ...base, 'b.md': { links: ['a.md'] } }],
        ['a link retargeted', { ...base, 'a.md': { links: ['c.md'] } }],
        ['a colour changed', { ...base, 'c.md': { color: { a: 1, rgb: 0x00ff00 } } }],
        ['a colour removed', { ...base, 'c.md': {} }],
        ['a type changed', { ...base, 'b.md': { type: 'unresolved' } }]
    ])('notices %s', (_, changed) => {
        expect(sameGraphData(graph(base, 1), graph(changed, 1))).toBe(false);
    });

    it('notices a change beside the nodes', () => {
        expect(sameGraphData(graph(base, 1), graph(base, 2))).toBe(false);
    });

    it('never calls anything that is not graph data the same', () => {
        expect(sameGraphData(null, graph(base))).toBe(false);
        expect(sameGraphData(graph(base), 'nodes')).toBe(false);
    });
});

describe('nodeCount', () => {
    it('counts nodes, and nothing when there is no graph', () => {
        expect(nodeCount(graph({ 'a.md': {}, 'b.md': {} }))).toBe(2);
        expect(nodeCount(undefined)).toBe(0);
    });
});
