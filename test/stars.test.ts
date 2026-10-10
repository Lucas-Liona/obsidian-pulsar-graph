import { describe, expect, it } from 'vitest';
import type { GraphNode, GraphRenderer } from '../src/graph';
import { BREATH_FRAME_MS, rhythmOf, shimmer, Stars, strengthAt, swell, waveOf, widthAt } from '../src/stars';

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
    eventMode = 'static';
    parent: FakeCircle | null = null;
    destroyed = false;
    children: (FakeSprite | FakeCircle)[] = [];

    /** The shape, which a circle built over another's shares. */
    constructor(readonly geometry: object = {}) {}

    addChild(child: FakeSprite | FakeCircle): void {
        this.children.push(child);
        child.parent = this;
    }

    removeChild(child: FakeSprite | FakeCircle): void {
        this.children = this.children.filter((each) => each !== child);
        child.parent = null;
    }

    destroy(): void {
        this.destroyed = true;
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

/** A star is two children: the halo, and the circle drawn again over it. */
function halo(circle: FakeCircle): FakeSprite {
    expect(circle.children).toHaveLength(2);
    return circle.children[0] as FakeSprite;
}

function core(circle: FakeCircle): FakeCircle {
    expect(circle.children).toHaveLength(2);
    return circle.children[1] as FakeCircle;
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

    it('keeps the note its own colour, drawing its circle again over the halo in the tint the renderer gives it', () => {
        const { renderer, circle } = graph(['a.md']);
        const stars = new Stars(renderer, paint);
        circle('a.md').tint = 0x4dff91;

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(0);

        const over = core(circle('a.md'));
        expect(over.geometry).toBe(circle('a.md').geometry);
        expect(over.tint).toBe(0x4dff91);
        expect(over.eventMode).toBe('none');

        // The renderer eases the circle's tint per frame; the copy follows.
        circle('a.md').tint = 0xc084fc;
        stars.sync(16);
        expect(over.tint).toBe(0xc084fc);

        stars.set({ paths: [], light: false, pulse: false });
        stars.sync(32);
        expect(over.destroyed).toBe(true);
        expect(circle('a.md').children).toHaveLength(0);
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

    it('adds light on a dark theme and multiplies dark in on a light one', () => {
        const { renderer, circle } = graph(['a.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(0);
        const star = halo(circle('a.md'));
        expect(star.blendMode).toBe(1);

        stars.set({ paths: ['a.md'], light: true, pulse: false });
        stars.sync(0);
        const hole = halo(circle('a.md'));

        expect(hole.blendMode).toBe(2);
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
        expect(circle('c.md').children).toHaveLength(2);
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
        expect(Math.min(...seen)).toBeGreaterThanOrEqual(30);
    });

    it('grows a halo with its breath, and puts it back at its own width when the pulse stops', () => {
        const { renderer, circle } = graph(['a.md']);
        const stars = new Stars(renderer, paint);
        const own = (6 * 200) / 256;

        stars.set({ paths: ['a.md'], light: false, pulse: true });
        const widths = new Set<number>();
        for (let now = 0; now < 5000; now += 125) {
            stars.sync(now);
            const across = halo(circle('a.md')).scale.x;
            expect(across).toBeGreaterThanOrEqual(own - 1e-9);
            expect(across).toBeLessThanOrEqual((8 * 200) / 256 + 1e-9);
            widths.add(Math.round(across * 100));
        }

        expect(widths.size).toBeGreaterThan(5);

        stars.set({ paths: ['a.md'], light: false, pulse: false });
        stars.sync(5000);
        expect(halo(circle('a.md')).scale.x).toBe(own);
    });

    it('assigns a breath rather than building on the last frame, so a thousand frames do not drift', () => {
        const long = graph(['a.md', 'b.md']);
        const fresh = graph(['a.md', 'b.md']);
        const worn = new Stars(long.renderer, paint);
        const once = new Stars(fresh.renderer, paint);

        worn.set({ paths: ['a.md', 'b.md'], light: false, pulse: true });
        once.set({ paths: ['a.md', 'b.md'], light: false, pulse: true });
        for (let frame = 0; frame < 1000; frame++) {
            worn.sync(frame * 33 + (frame % 7));
        }

        worn.sync(40000);
        once.sync(40000);

        for (const path of ['a.md', 'b.md']) {
            expect(halo(long.circle(path)).scale.x).toBe(halo(fresh.circle(path)).scale.x);
            expect(halo(long.circle(path)).alpha).toBe(halo(fresh.circle(path)).alpha);
        }
    });

    it('keeps a star its own pace when a newer note pushes it down the list', () => {
        const { renderer, circle } = graph(['a.md', 'b.md', 'c.md']);
        const stars = new Stars(renderer, paint);

        stars.set({ paths: ['a.md', 'b.md'], light: false, pulse: true });
        stars.sync(0);
        stars.set({ paths: ['c.md', 'a.md', 'b.md'], light: false, pulse: true });

        for (const now of [500, 1700, 2900]) {
            stars.sync(now);
            expect(halo(circle('a.md')).alpha).toBeCloseTo(shimmer(strengthAt(1, 3), waveOf(now, rhythmOf('a.md'))), 10);
        }
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

    it('never goes above full or below 0.12 for any star of 250, and peaks at full on the newest', () => {
        for (const path of ['a.md', 'notes/b.md', 'Zeta 2026.md']) {
            const rhythm = rhythmOf(path);
            let highest = 0;
            for (let rank = 0; rank < 250; rank++) {
                const strength = strengthAt(rank, 250);
                for (let now = 0; now <= rhythm.period; now += rhythm.period / 200) {
                    const value = shimmer(strength, waveOf(now, rhythm));
                    expect(value).toBeGreaterThanOrEqual(0.12);
                    expect(value).toBeLessThanOrEqual(1);
                    if (rank === 0) {
                        highest = Math.max(highest, value);
                    }
                }
            }

            expect(highest).toBeGreaterThan(0.999);
        }
    });

    it('swings every star by the same amount, the newest wider than every star in step did', () => {
        const spread = (strength: number): number => shimmer(strength, 1) - shimmer(strength, -1);

        expect(spread(1)).toBeCloseTo(0.7, 10);
        expect(spread(0.4)).toBeCloseTo(0.7, 10);
        // One breath of every star in step ran the newest from 0.35 to 1.
        expect(spread(1)).toBeGreaterThan(0.65);
        expect([shimmer(1, -1), shimmer(0.4, -1), shimmer(0.4, 1)].map((value) => Math.round(value * 100))).toEqual([30, 12, 82]);
    });

    it('keeps a newer star the brighter of two at the same point in a breath', () => {
        for (let wave = -1; wave <= 1; wave += 0.05) {
            expect(shimmer(1, wave)).toBeGreaterThan(shimmer(0.7, wave));
            expect(shimmer(0.7, wave)).toBeGreaterThan(shimmer(0.4, wave));
        }
    });

    it('grows a halo outward by two circle widths, never below its own width', () => {
        for (const width of [widthAt(0, 250), widthAt(249, 250)]) {
            expect(swell(width, -1)).toBe(width);
            expect(swell(width, 1)).toBe(width + 2);
            for (let wave = -1; wave <= 1; wave += 0.05) {
                expect(swell(width, wave)).toBeGreaterThanOrEqual(width);
                expect(swell(width, wave)).toBeLessThanOrEqual(width + 2);
            }
        }
    });
});

describe('a star\'s pace', () => {
    const paths = Array.from({ length: 2000 }, (_, i) => `Folder ${i % 7}/Note ${i}.md`);
    const periods = paths.map((path) => rhythmOf(path).period);

    it('is the same every time for the same note, and differs between notes', () => {
        expect(rhythmOf('a.md')).toEqual(rhythmOf('a.md'));
        // All but the few held at two or five seconds.
        expect(new Set(periods).size).toBeGreaterThan(1800);
    });

    it('takes about three seconds, never under two or over five', () => {
        const mean = periods.reduce((sum, period) => sum + period, 0) / periods.length;
        const sd = Math.sqrt(periods.reduce((sum, period) => sum + (period - mean) ** 2, 0) / periods.length);

        expect(Math.min(...periods)).toBeGreaterThanOrEqual(2000);
        expect(Math.max(...periods)).toBeLessThanOrEqual(5000);
        expect(mean).toBeGreaterThan(3100);
        expect(mean).toBeLessThan(3300);
        // Drawn with an sd of 800, a little less once held between two and five.
        expect(sd).toBeGreaterThan(680);
        expect(sd).toBeLessThan(820);
    });

    it('starts each note at its own point in the breath', () => {
        const phases = paths.map((path) => rhythmOf(path).phase);
        const quarters = [0, 0, 0, 0];
        for (const phase of phases) {
            expect(phase).toBeGreaterThanOrEqual(0);
            expect(phase).toBeLessThan(2 * Math.PI);
            quarters[Math.floor(phase / (Math.PI / 2))]++;
        }

        for (const count of quarters) {
            expect(count).toBeGreaterThan(400);
        }
    });
});
