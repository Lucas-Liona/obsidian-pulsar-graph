import { describe, expect, it } from 'vitest';
import type { GraphNode, GraphRenderer } from '../src/graph';
import { BREATH_FRAME_MS, breath, Stars, strengthAt, widthAt } from '../src/stars';

// The parts of Obsidian's PIXI the halos are built from, shaped the way the
// live graph has them: a title is a text, a text is a sprite, a sprite is drawn
// from a texture whose class builds textures, and a circle is a graphics object
// of radius 100 around (100, 100) that takes children.

class FakeTexture {
    static built = 0;
    destroyed = false;
    width = 256;

    static from(): FakeTexture {
        FakeTexture.built++;
        return new FakeTexture();
    }

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeSprite {
    alpha = 1;
    blendMode = 0;
    eventMode = 'auto';
    parent: FakeCircle | null = null;
    destroyed = false;
    readonly anchor = point();
    readonly position = point();
    readonly scale = point();

    constructor(readonly texture: FakeTexture) {}

    destroy(): void {
        this.destroyed = true;
    }
}

class FakeTitle extends FakeSprite {}

class FakeCircle {
    tint = 0;
    visible = true;
    children: FakeSprite[] = [];

    addChild(child: FakeSprite): void {
        this.children.push(child);
        child.parent = this;
    }

    removeChild(child: FakeSprite): void {
        this.children = this.children.filter((each) => each !== child);
        child.parent = null;
    }

    getLocalBounds(): { x: number; y: number; width: number; height: number } {
        return { x: 0, y: 0, width: 200, height: 200 };
    }
}

function point(): { x: number; y: number; set: (x: number, y?: number) => void } {
    const at = { x: 0, y: 0, set: (x: number, y = x) => {
        at.x = x;
        at.y = y;
    } };

    return at;
}

function graph(paths: string[], titled = true): { renderer: GraphRenderer; circle: (path: string) => FakeCircle; rebuild: (path: string) => void } {
    const nodes: GraphNode[] = paths.map((id) => ({
        id,
        circle: new FakeCircle() as unknown as GraphNode['circle'],
        text: titled ? (new FakeTitle(new FakeTexture()) as unknown as GraphNode['text']) : null
    }));
    const renderer: GraphRenderer = { nodes, nodeLookup: Object.fromEntries(nodes.map((node) => [node.id, node])) };

    return {
        renderer,
        circle: (path) => renderer.nodeLookup[path].circle as unknown as FakeCircle,
        rebuild: (path) => {
            renderer.nodeLookup[path].circle = new FakeCircle() as unknown as GraphNode['circle'];
        }
    };
}

/** A canvas stand-in: the halo's look is not what these tests are about. */
const paint = (): HTMLCanvasElement => ({}) as HTMLCanvasElement;

/** Timers run by hand, so a test can say how much time passes. */
class Clock {
    private queue: { at: number; run: () => void; id: number }[] = [];
    private next = 1;
    now = 0;

    readonly setTimeout = (run: () => void, ms: number): number => {
        const id = this.next++;
        this.queue.push({ at: this.now + ms, run, id });
        return id;
    };

    readonly clearTimeout = (id: number): void => {
        this.queue = this.queue.filter((each) => each.id !== id);
    };

    get pending(): number {
        return this.queue.length;
    }

    advance(ms: number): void {
        const end = this.now + ms;
        for (;;) {
            this.queue.sort((a, b) => a.at - b.at);
            const due = this.queue[0];
            if (!due || due.at > end) {
                break;
            }

            this.queue.shift();
            this.now = due.at;
            due.run();
        }

        this.now = end;
    }
}

/** A renderer whose loop is asleep or awake, counting the stages drawn without it and the times it was woken. */
function sleepy(renderer: GraphRenderer): { drawn: () => number; woken: () => number } {
    let drawn = 0;
    let woken = 0;
    renderer.idleFrames = 61;
    renderer.px = { render: () => drawn++ };
    renderer.changed = () => woken++;
    return { drawn: () => drawn, woken: () => woken };
}

function halo(circle: FakeCircle): FakeSprite {
    expect(circle.children).toHaveLength(1);
    return circle.children[0];
}

describe('stars', () => {
    it('puts one halo on each of the notes it is given, centred on the circle and out of the way of the pointer', () => {
        const { renderer, circle } = graph(['a.md', 'b.md', 'c.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: false });
        expect(stars.sync(0)).toBe(false);

        expect(stars.drawn).toBe(2);
        expect(circle('c.md').children).toHaveLength(0);

        const newest = halo(circle('a.md'));
        expect([newest.position.x, newest.position.y]).toEqual([100, 100]);
        expect(newest.anchor.x).toBe(0.5);
        // A circle is hit-tested children and all, so anything else would
        // make the whole halo hover the note.
        expect(newest.eventMode).toBe('none');
    });

    it('draws the newest widest and strongest', () => {
        const { renderer, circle } = graph(['a.md', 'b.md', 'c.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md', 'c.md'], light: false, pulse: false });
        stars.sync(0);

        const [a, b, c] = ['a.md', 'b.md', 'c.md'].map((path) => halo(circle(path)));
        expect(a.scale.x).toBeGreaterThan(b.scale.x);
        expect(b.scale.x).toBeGreaterThan(c.scale.x);
        expect(a.alpha).toBeGreaterThan(b.alpha);
        expect(b.alpha).toBeGreaterThan(c.alpha);
        // Six circle widths across for the newest, in a texture 256 wide.
        expect(a.scale.x).toBeCloseTo((6 * 200) / 256);
    });

    it('draws white light on a dark theme and black on a light one, behind the note either way', () => {
        const { renderer, circle } = graph(['a.md']);
        const painted: boolean[] = [];
        const stars = new Stars(renderer, (light) => {
            painted.push(light);
            return paint();
        });

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(0);
        const star = halo(circle('a.md'));
        // Destination-over: behind what is drawn, so the node keeps its colour.
        expect(star.blendMode).toBe(24);

        stars.set({ paths: ['a.md'], light: true, pulse: false });
        stars.sync(0);
        const hole = halo(circle('a.md'));

        expect(painted).toEqual([false, true]);
        expect(hole.blendMode).toBe(24);
        expect(hole).not.toBe(star);
        expect(star.destroyed).toBe(true);
        // A new texture in the other colour, and the old one freed.
        expect(hole.texture).not.toBe(star.texture);
        expect(star.texture.destroyed).toBe(true);
    });

    it('takes every halo off when handed no notes, and asks for no frames', () => {
        const { renderer, circle } = graph(['a.md', 'b.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: true });
        stars.sync(0);
        const before = circle('a.md').children[0];

        stars.set({ paths: [], light: false, pulse: true });
        expect(stars.sync(0)).toBe(false);

        expect(stars.drawn).toBe(0);
        expect(circle('a.md').children).toHaveLength(0);
        expect(before.destroyed).toBe(true);
    });

    it('moves a halo off a note that is no longer among the newest', () => {
        const { renderer, circle } = graph(['a.md', 'b.md', 'c.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: false });
        stars.sync(0);
        const narrowed = halo(circle('b.md')).scale.x;

        stars.set({ paths: ['c.md', 'a.md'], light: false, pulse: false });
        stars.sync(0);

        expect(circle('b.md').children).toHaveLength(0);
        expect(circle('c.md').children).toHaveLength(1);
        // a.md went from newest to second, and is drawn at the second's width.
        expect(halo(circle('a.md')).scale.x).toBeCloseTo(narrowed);
    });

    it('follows a node onto the circle Obsidian rebuilt it with', () => {
        const { renderer, circle, rebuild } = graph(['a.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(0);
        const old = circle('a.md');
        const first = halo(old);

        rebuild('a.md');
        stars.sync(0);

        expect(halo(circle('a.md'))).not.toBe(first);
        expect(old.children).toHaveLength(0);
        expect(first.destroyed).toBe(true);
        expect(stars.drawn).toBe(1);
    });

    it('builds one texture for every halo on a graph', () => {
        const { renderer } = graph(['a.md', 'b.md', 'c.md']);
        const stars = new Stars(renderer, paint);
        const before = FakeTexture.built;

        stars.set({ paths: ['a.md', 'b.md', 'c.md'], light: false, pulse: false });
        stars.sync(0);
        stars.sync(16);

        expect(FakeTexture.built - before).toBe(1);
    });

    it('breathes only when asked to, and says so only then', () => {
        const { renderer, circle } = graph(['a.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(0);
        const still = halo(circle('a.md')).alpha;
        stars.sync(1000);
        expect(halo(circle('a.md')).alpha).toBe(still);

        stars.set({ paths: ['a.md'], light: false, pulse: true });
        const seen = new Set<number>();
        for (let now = 0; now < 4000; now += 250) {
            expect(stars.sync(now)).toBe(true);
            seen.add(Math.round(halo(circle('a.md')).alpha * 100));
        }

        expect(seen.size).toBeGreaterThan(5);
        expect(Math.max(...seen)).toBeLessThanOrEqual(100);
        expect(Math.min(...seen)).toBeGreaterThanOrEqual(35);
    });

    it('breathes about 30 times a second once the graph sleeps, without waking it', () => {
        const { renderer } = graph(['a.md', 'b.md']);
        const loop = sleepy(renderer);
        const clock = new Clock();
        const stars = new Stars(renderer, paint, clock);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: true });
        // The last frame the renderer calls before it stops.
        expect(stars.sync(0)).toBe(true);
        clock.advance(1000);

        expect(loop.drawn()).toBe(Math.floor(1000 / BREATH_FRAME_MS));
        expect(loop.woken()).toBe(0);
        expect(renderer.idleFrames).toBe(61);
    });

    it('leaves the breath to the graph while it is drawing anyway, and takes it back when it stops', () => {
        const { renderer } = graph(['a.md']);
        const loop = sleepy(renderer);
        const clock = new Clock();
        const stars = new Stars(renderer, paint, clock);

        stars.set({ paths: ['a.md'], light: false, pulse: true });
        stars.sync(0);
        clock.advance(100);
        const before = loop.drawn();

        // Something moved: the renderer draws every frame itself, halos included.
        renderer.idleFrames = 0;
        clock.advance(1000);
        expect(loop.drawn() - before).toBeLessThanOrEqual(1);
        expect(clock.pending).toBe(0);

        // Its last frame before it stops again picks the breath back up.
        renderer.idleFrames = 61;
        stars.sync(clock.now);
        clock.advance(330);
        expect(loop.drawn() - before).toBeGreaterThanOrEqual(9);
    });

    it('draws no breath a graph cannot be seen in, and starts again when it can', () => {
        const { renderer } = graph(['a.md']);
        const loop = sleepy(renderer);
        const clock = new Clock();
        const stars = new Stars(renderer, paint, clock);
        const shown = { clientWidth: 0, ownerDocument: { hidden: false } };
        renderer.containerEl = shown as unknown as HTMLElement;

        stars.set({ paths: ['a.md'], light: false, pulse: true });
        stars.sync(0);
        clock.advance(2000);
        expect(loop.drawn()).toBe(0);
        // Still looking, slowly.
        expect(clock.pending).toBe(1);

        shown.clientWidth = 800;
        clock.advance(1000);
        expect(loop.drawn()).toBeGreaterThan(10);

        shown.ownerDocument.hidden = true;
        const hidden = loop.drawn();
        clock.advance(2000);
        expect(loop.drawn() - hidden).toBeLessThanOrEqual(1);
    });

    it('stops breathing when the pulse is switched off, the stars are, or the graph closes', () => {
        for (const end of ['still', 'none', 'destroyed'] as const) {
            const { renderer } = graph(['a.md']);
            const loop = sleepy(renderer);
            const clock = new Clock();
            const stars = new Stars(renderer, paint, clock);

            stars.set({ paths: ['a.md'], light: false, pulse: true });
            stars.sync(0);
            clock.advance(100);

            if (end === 'destroyed') {
                stars.destroy();
            } else {
                stars.set({ paths: end === 'none' ? [] : ['a.md'], light: false, pulse: false });
                stars.sync(clock.now);
            }

            const before = loop.drawn();
            clock.advance(2000);
            expect(loop.drawn(), end).toBe(before);
            expect(clock.pending, end).toBe(0);
        }
    });

    it('draws nothing, and breaks nothing, on a graph it cannot find PIXI in', () => {
        const { renderer, circle } = graph(['a.md'], false);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md'], light: false, pulse: true });

        expect(stars.sync(0)).toBe(false);
        expect(circle('a.md').children).toHaveLength(0);
    });

    it('leaves nothing behind when destroyed', () => {
        const { renderer, circle } = graph(['a.md', 'b.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: false });
        stars.sync(0);
        const texture = halo(circle('a.md')).texture;

        stars.destroy();

        expect(circle('a.md').children).toHaveLength(0);
        expect(circle('b.md').children).toHaveLength(0);
        expect(texture.destroyed).toBe(true);
        expect(stars.sync(0)).toBe(false);
    });
});

describe('the shape of a list of stars', () => {
    it('runs from six circle widths at full strength to three at 0.4', () => {
        expect([widthAt(0, 10), widthAt(9, 10)]).toEqual([6, 3]);
        expect([strengthAt(0, 10), strengthAt(9, 10)]).toEqual([1, 0.4]);
        expect([widthAt(0, 1), strengthAt(0, 1)]).toEqual([6, 1]);
    });

    it('never breathes all the way out', () => {
        for (let now = 0; now < 8000; now += 37) {
            for (const rank of [0, 3, 9]) {
                const value = breath(now, rank, 10);
                expect(value).toBeGreaterThanOrEqual(0.35);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
    });
});
