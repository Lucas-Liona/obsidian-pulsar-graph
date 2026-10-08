import { bench, describe } from 'vitest';
import { GraphLink, GraphNode, GraphRenderer } from '../src/graph';
import { LinkShading } from '../src/links';

/**
 * What ageing the links costs on one frame. It runs after every frame the graph
 * draws, over every link: 43,515 of them in the 20,000-note bench vault, which
 * is about 2.2 links a note.
 */
for (const notes of [1_000, 20_000, 50_000]) {
    const count = Math.round(notes * 2.2);
    const nodes: GraphNode[] = [];
    const strengths = new Map<string, number>();

    for (let i = 0; i < notes; i++) {
        nodes.push({ id: `Note ${i}.md` });
        strengths.set(`Note ${i}.md`, (i % 997) / 997);
    }

    // A prime stride, so the ends of a link are unrelated notes.
    const links: GraphLink[] = [];
    for (let i = 0; i < count; i++) {
        links.push({ source: nodes[i % notes], target: nodes[(i * 7919 + 13) % notes], rendered: true, line: { alpha: 1, tint: 0, visible: true } });
    }

    const renderer = {
        links,
        colors: { line: { a: 0.6, rgb: 0x888888 }, lineHighlight: { a: 1, rgb: 0xffffff } },
        getHighlightNode: () => null
    } as unknown as GraphRenderer;

    let revision = 0;
    const steady = new LinkShading(renderer, (id) => strengths.get(id), () => undefined, () => 0);
    steady.setMode('uniform');
    const moving = new LinkShading(renderer, (id) => strengths.get(id), () => undefined, () => revision++);
    moving.setMode('uniform');

    describe(`links, ${notes.toLocaleString('en-US')} notes, ${count.toLocaleString('en-US')} links`, () => {
        // Nothing has changed since the last frame: what every frame costs
        // while the graph moves or settles.
        bench('a frame, nothing changed', () => {
            steady.sync();
        }, { setup: () => steady.sync() });

        // Every strength new: what the first frame after a change costs.
        bench('a frame after a change', () => {
            moving.sync();
        });
    });
}
