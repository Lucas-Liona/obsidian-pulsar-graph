import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphLink, GraphNode, GraphRenderer, GraphTexture } from '../src/graph';
import { LinkShading } from '../src/links';

/** A texture as Obsidian's renderer hands one out: built from a canvas through its own constructor. */
class FakeTexture implements GraphTexture {
    width = 64;
    constructor(readonly stops: string[] = []) {}

    static from(canvas: { stops: string[] }): FakeTexture {
        return new FakeTexture(canvas.stops);
    }
}

type Line = NonNullable<GraphLink['line']>;

/** Obsidian draws every link with the one texture. */
const PLAIN = new FakeTexture();

function node(id: string): GraphNode {
    return { id };
}

function link(source: GraphNode, target: GraphNode): GraphLink & { line: Line } {
    return { source, target, rendered: true, line: { alpha: 1, tint: 0, visible: true, texture: PLAIN } };
}

/**
 * A renderer with a list of links and the colours Obsidian draws them in, and
 * a frame that does what Obsidian's does to a link's alpha: sets it back to its
 * own eased value before anything after it runs.
 */
function world(strengths: Record<string, number>, mtimes: Record<string, number> = {}) {
    const nodes = { a: node('a.md'), b: node('b.md'), c: node('c.md'), loose: node('loose') };
    const links = [link(nodes.a, nodes.b), link(nodes.b, nodes.c), link(nodes.loose, nodes.loose)];
    let hovered: GraphNode | null = null;
    const renderer = {
        links,
        colors: { line: { a: 0.6, rgb: 0x888888 }, lineHighlight: { a: 1, rgb: 0xffffff } },
        getHighlightNode: () => hovered
    } as unknown as GraphRenderer;

    const state = { strengths, mtimes, revision: 0, mtimeReads: 0 };
    const shading = new LinkShading(
        renderer,
        (id) => state.strengths[id],
        (id) => {
            state.mtimeReads++;
            return state.mtimes[id];
        },
        () => state.revision
    );

    const frame = (): void => {
        for (const each of renderer.links ?? []) {
            if (each.line) {
                each.line.alpha = 0.6;
            }
        }

        shading.sync();
    };

    return { nodes, links, renderer, shading, state, frame, hover: (n: GraphNode | null) => { hovered = n; } };
}

describe('LinkShading', () => {
    describe('uniform', () => {
        it('draws a link at the line alpha times its livelier end', () => {
            const { links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.9, 'c.md': 0.5 });
            shading.setMode('uniform');

            frame();

            expect(links[0].line.alpha).toBeCloseTo(0.6 * 0.9);
            expect(links[1].line.alpha).toBeCloseTo(0.6 * 0.9);
        });

        it('holds its alpha through the renderer setting it back every frame', () => {
            const { links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.4, 'c.md': 0.5 });
            shading.setMode('uniform');

            for (let i = 0; i < 5; i++) {
                frame();
            }

            expect(links[0].line.alpha).toBeCloseTo(0.6 * 0.4);
        });

        // Each end is read at no more than 1, so a maximum above 1 never reaches
        // a link: on a light theme it would lighten the line into the page.
        it('never draws a link past the line alpha, however bright its ends', () => {
            const { links, shading, frame } = world({ 'a.md': 3, 'b.md': 2.5, 'c.md': 3 });
            shading.setMode('uniform');

            frame();

            expect(links[0].line.alpha).toBeCloseTo(0.6);
            expect(links[1].line.alpha).toBeCloseTo(0.6);
        });

        it('leaves a link with neither end graded to the renderer', () => {
            const { links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.4 });
            shading.setMode('uniform');

            frame();

            expect(links[2].line.alpha).toBe(0.6);
        });

        it('uses the highlight alpha for the hovered node\'s links and dims the rest', () => {
            const { nodes, links, shading, frame, hover } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 1 });
            shading.setMode('uniform');

            hover(nodes.a);
            frame();

            expect(links[0].line.alpha).toBeCloseTo(1 * 0.5);
            expect(links[1].line.alpha).toBeCloseTo(0.2 * 0.6 * 1);
        });

        it('reads new strengths once the revision moves, and not before', () => {
            const { links, shading, frame, state } = world({ 'a.md': 0.2, 'b.md': 0.4, 'c.md': 0.5 });
            shading.setMode('uniform');
            frame();

            state.strengths = { 'a.md': 1, 'b.md': 0.4, 'c.md': 0.5 };
            frame();
            expect(links[0].line.alpha).toBeCloseTo(0.6 * 0.4);

            state.revision++;
            frame();
            expect(links[0].line.alpha).toBeCloseTo(0.6 * 1);
        });

        it('works a link out afresh when a different one takes its place in the list', () => {
            const { nodes, links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.4, 'c.md': 0.9 });
            shading.setMode('uniform');
            frame();

            const replacement = link(nodes.c, nodes.a);
            links[0] = replacement;
            frame();

            expect(replacement.line.alpha).toBeCloseTo(0.6 * 0.9);
        });

        it('works every link out when the list grows', () => {
            const { nodes, links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.4, 'c.md': 0.9 });
            shading.setMode('uniform');
            frame();

            const added = link(nodes.a, nodes.c);
            links.push(added);
            frame();

            expect(added.line.alpha).toBeCloseTo(0.6 * 0.9);
        });

        it('skips a link that is not rendered', () => {
            const { links, shading, frame } = world({ 'a.md': 0.2, 'b.md': 0.4, 'c.md': 0.9 });
            shading.setMode('uniform');
            links[0].rendered = false;

            frame();

            expect(links[0].line.alpha).toBe(0.6);
        });
    });

    describe('gradient', () => {
        beforeEach(() => {
            vi.stubGlobal('createEl', () => {
                const canvas = {
                    width: 0,
                    height: 0,
                    stops: [] as string[],
                    getContext: () => ({
                        createLinearGradient: () => ({ addColorStop: (_at: number, colour: string) => canvas.stops.push(colour) }),
                        fillRect: () => undefined,
                        fillStyle: null
                    })
                };
                return canvas;
            });
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it('stretches a ramp that is brightest at the newer end', () => {
            const { links, shading, frame } = world({ 'a.md': 0.25, 'b.md': 1, 'c.md': 0.25 });
            shading.setMode('gradient');

            frame();

            // a → b climbs toward its target; b → c falls away from its source.
            const up = links[0].line.texture as FakeTexture;
            const down = links[1].line.texture as FakeTexture;
            expect(up.stops[1]).toBe('rgba(255, 255, 255, 1)');
            expect(down.stops[0]).toBe('rgba(255, 255, 255, 1)');
            expect(up).not.toBe(down);
        });

        it('shares one texture between links with the same ratio and direction', () => {
            const { nodes, links, shading, frame } = world({ 'a.md': 0.25, 'b.md': 1, 'c.md': 0.25 });
            links.push(link(nodes.c, nodes.b));
            shading.setMode('gradient');

            frame();

            expect(links[3].line.texture).toBe(links[0].line.texture);
        });

        it('hands back the texture Obsidian drew with when switched off', () => {
            const { links, shading, frame } = world({ 'a.md': 0.25, 'b.md': 1, 'c.md': 0.25 });
            const plain = links[0].line.texture;
            shading.setMode('gradient');
            frame();

            shading.setMode('off');

            expect(links[0].line.texture).toBe(plain);
            expect(links[1].line.texture).toBe(plain);
        });
    });

    describe('trails', () => {
        const MINUTE = 60 * 1000;
        const TRAIL = { gapMs: 30 * MINUTE, rgb: 0x5ac8fa, strength: 1 };

        // a and b were saved ten minutes apart; c a day later.
        const MTIMES = { 'a.md': 0, 'b.md': 10 * MINUTE, 'c.md': 24 * 60 * MINUTE };

        it('tints a link between two notes saved within a sitting, and only that one', () => {
            const { links, shading, frame } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 0.5 }, MTIMES);
            shading.setTrails(TRAIL);

            frame();

            expect(links[0].line.tint).toBe(0x5ac8fa);
            expect(links[1].line.tint).toBe(0);
        });

        // Asked every frame, this was two lookups by path per link: 87,000 a
        // frame in the 20,000-note bench vault.
        it('reads the dates once per revision, not once per frame', () => {
            const { shading, state, frame } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 0.5 }, MTIMES);
            shading.setTrails(TRAIL);

            frame();
            const first = state.mtimeReads;
            for (let i = 0; i < 5; i++) {
                frame();
            }

            expect(first).toBeGreaterThan(0);
            expect(state.mtimeReads).toBe(first);

            state.revision++;
            frame();
            expect(state.mtimeReads).toBe(2 * first);
        });

        it('keeps tinting through the renderer easing the tint back each frame', () => {
            const { links, shading, frame } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 0.5 }, MTIMES);
            shading.setTrails(TRAIL);
            frame();

            links[0].line.tint = 0x888888;
            frame();

            expect(links[0].line.tint).toBe(0x5ac8fa);
        });

        it('works the trails out again when the sitting changes length', () => {
            const { links, shading, frame } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 0.5 }, MTIMES);
            shading.setTrails(TRAIL);
            frame();

            shading.setTrails({ ...TRAIL, gapMs: 5 * MINUTE });
            links[0].line.tint = 0;
            frame();

            expect(links[0].line.tint).toBe(0);
        });

        it('draws trails with link ageing switched off', () => {
            const { links, shading, frame } = world({ 'a.md': 0.5, 'b.md': 0.5, 'c.md': 0.5 }, MTIMES);
            shading.setMode('off');
            shading.setTrails(TRAIL);

            frame();

            expect(links[0].line.tint).toBe(0x5ac8fa);
            expect(links[0].line.alpha).toBe(0.6);
        });
    });
});

