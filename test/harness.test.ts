import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Component, debounce, Plugin } from 'obsidian';
import { hookRendererFrame } from '../src/graph';
import { createWorld, FakeRenderer, FakeText } from './harness';

// The plugin tests are only as good as the fake they run against, so the fake
// is held to what AGENTS.md says Obsidian does, here, where a drift in it
// fails on its own rather than as a puzzling plugin failure.

function node(links: string[] = [], color?: { a: number; rgb: number }): { type: string; links: Record<string, boolean>; color?: { a: number; rgb: number } } {
    return { type: '', links: Object.fromEntries(links.map((target) => [target, true])), ...(color ? { color } : {}) };
}

describe('the fake renderer', () => {
    it('keeps every surviving node, and its place, and puts a new one among its links', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node(), 'b.md': node(), 'c.md': node() }, numLinks: 0 });
        const [a, b] = [renderer.node('a.md'), renderer.node('b.md')];
        Object.assign(a, { x: 100, y: 50 });
        Object.assign(b, { x: 300, y: 150 });

        renderer.setData({ nodes: { 'a.md': node(), 'b.md': node(), 'd.md': node(['a.md', 'b.md']) }, numLinks: 2 });

        expect(renderer.ids()).toEqual(['a.md', 'b.md', 'd.md']);
        expect(renderer.node('a.md')).toBe(a);
        expect([a.x, a.y, b.x, b.y]).toEqual([100, 50, 300, 150]);
        expect([renderer.node('d.md').x, renderer.node('d.md').y]).toEqual([200, 100]);
    });

    it('resets every node\'s colour from the data on each rebuild', () => {
        const renderer = new FakeRenderer();
        const data = { nodes: { 'a.md': node(), 'b.md': node([], { a: 1, rgb: 0xe05050 }) }, numLinks: 0 };
        renderer.setData(data);
        renderer.node('a.md').color = { a: 2.5, rgb: 0x123456 };
        renderer.node('b.md').color = { a: 0.2, rgb: 0xe05050 };

        renderer.setData(data);

        expect(renderer.node('a.md').color).toBeUndefined();
        expect(renderer.node('b.md').color).toEqual({ a: 1, rgb: 0xe05050 });
    });

    it('builds a link only when both of its ends exist', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node(['b.md', 'gone.md']), 'b.md': node() }, numLinks: 2 });

        expect(renderer.links).toHaveLength(1);
        expect(Object.keys(renderer.node('a.md').forward)).toEqual(['b.md']);
        expect(Object.keys(renderer.node('b.md').reverse)).toEqual(['a.md']);
    });

    it('eases a tint down all the way, and up to nine short of it', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node() }, numLinks: 0 });
        const circle = renderer.node('a.md').circle;

        if (!circle) {
            throw new Error('Every node is drawn');
        }

        // A pin's colour handed back by colour alone: red and blue come down,
        // green has three to climb and never does.
        circle.tint = 0xb885eb;
        renderer.frames(1000);

        expect(circle.tint).toBe(0x888588);
    });

    it('stops calling its render callback once idle for 60 frames, until woken', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node() }, numLinks: 0 });

        renderer.frames(1000);
        const drawn = renderer.drawn;

        expect(drawn).toBe(61);
        expect(renderer.frame()).toBe(false);

        renderer.changed();
        renderer.frames(5);

        expect(renderer.drawn).toBe(drawn + 5);
    });

    it('counts what is wrapped around each hook, including what cannot be unwrapped', () => {
        const renderer = new FakeRenderer();
        const first = hookRendererFrame(renderer, () => undefined);
        const second = hookRendererFrame(renderer, () => undefined);

        expect(renderer.wrappers('renderCallback')).toBe(2);

        // Underneath the second, the first can only go quiet.
        first?.release();
        expect(renderer.wrappers('renderCallback')).toBe(2);

        second?.release();
        expect(renderer.wrappers('renderCallback')).toBe(1);
    });

    it('drops every wrapper and every title when its graphics are rebuilt', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node() }, numLinks: 0 });
        hookRendererFrame(renderer, () => undefined);
        const title = renderer.node('a.md').text;
        const label = new FakeText('2 days ago', {});
        title?.addChild(label);

        renderer.rebuildGraphics();

        expect(renderer.wrappers('renderCallback')).toBe(0);
        expect(title?.destroyed).toBe(true);
        expect(label.parent).toBeNull();
        expect(renderer.node('a.md').text).not.toBe(title);
    });

    it('fills a hovered node with the highlight, and a focused one with its own colour', () => {
        const renderer = new FakeRenderer();
        renderer.setData({ nodes: { 'a.md': node([], { a: 1, rgb: 0xe05050 }), 'b.md': { ...node(), type: 'focused' } }, numLinks: 0 });

        renderer.hover('a.md');

        expect(renderer.node('a.md').getFillColor()).toBe(renderer.colors.fillHighlight);
        expect(renderer.node('b.md').getFillColor()).toBe(renderer.colors.fillFocused);
        expect(renderer.previews).toEqual(['a.md']);
    });
});

describe('the fake app', () => {
    beforeEach(() => {
        vi.useFakeTimers({ now: Date.UTC(2026, 9, 8) });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.UTC(2026, 9, 8);

    function world(): ReturnType<typeof createWorld> {
        return createWorld({
            notes: [
                { path: 'a.md', mtime: now - DAY, ctime: now - 30 * DAY, links: ['b.md'] },
                { path: 'b.md', mtime: now - 2 * DAY, ctime: now - 20 * DAY },
                { path: 'c.md', mtime: now - 3 * DAY, ctime: now - 10 * DAY, links: ['a.md'] },
                { path: 'd.md', mtime: now - 4 * DAY, ctime: now - 5 * DAY }
            ]
        });
    }

    it('builds each graph through whatever creator is registered when its leaf opens', () => {
        const app = world();
        const original = app.registry.viewByType.graph;
        let built = 0;
        app.registry.viewByType.graph = (leaf) => {
            built++;
            return original?.(leaf);
        };

        const view = app.workspace.openGraph();

        expect(built).toBe(1);
        expect(app.registry.wrappers('graph')).toBe(1);
        expect(view.renderer.built).toEqual([4]);
    });

    it('gives a local graph its centre and every note a link away, either way', () => {
        const app = world();
        const view = app.workspace.openLocalGraph('a.md');

        expect(view.renderer.ids()).toEqual(['a.md', 'b.md', 'c.md']);
        expect(view.engine?.options.localFile).toBe('a.md');
        expect(view.dataEngine).toBeUndefined();
    });

    it('replays notes in the order they were created, with a counter that only climbs', () => {
        const app = world();
        const view = app.workspace.openGraph();

        view.graphEngine.replayTo(now - 15 * DAY);
        expect(view.renderer.ids()).toEqual(['a.md', 'b.md']);

        view.graphEngine.replayTo(null);
        expect(view.renderer.ids()).toEqual(['a.md', 'b.md', 'c.md', 'd.md']);
        expect(view.graphEngine.progression).toBe(2);
    });

    it('holds writes to a slow path, then lands them in the order they were made', async () => {
        const app = world();
        const release = app.adapter.hold(/slow/);
        const writes = [app.adapter.write('slow.json', '1'), app.adapter.write('fast.json', '1'), app.adapter.write('slow.json', '2')];
        await Promise.resolve();

        expect(app.adapter.written).toEqual(['fast.json']);

        release();
        await Promise.all(writes);

        expect(app.adapter.written).toEqual(['fast.json', 'slow.json', 'slow.json']);
        expect(app.adapter.files.get('slow.json')).toBe('2');
    });

    it('keeps a plugin\'s data in data.json in its own folder', async () => {
        const app = world();

        class Probe extends Plugin {}

        const probe = new Probe(app.app, { id: 'probe', name: 'Probe', author: '', version: '0', minAppVersion: '0', description: '', dir: 'config/plugins/probe' });
        await probe.saveData({ kept: true });

        expect(app.adapter.json('config/plugins/probe/data.json')).toEqual({ kept: true });
        expect(await probe.loadData()).toEqual({ kept: true });
    });
});

describe('the runtime', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('debounces as Obsidian does: the last call, once, after the delay', () => {
        const calls: number[] = [];
        const later = debounce((value: number) => calls.push(value), 100);
        const reset = debounce((value: number) => calls.push(value), 100, true);

        later(1);
        vi.advanceTimersByTime(60);
        later(2);
        vi.advanceTimersByTime(40);
        expect(calls).toEqual([2]);

        reset(3);
        vi.advanceTimersByTime(60);
        reset(4);
        vi.advanceTimersByTime(40);
        expect(calls).toEqual([2]);
        vi.advanceTimersByTime(60);
        expect(calls).toEqual([2, 4]);

        later(5);
        later.cancel();
        vi.advanceTimersByTime(1000);
        expect(calls).toEqual([2, 4]);

        later(6);
        later.run();
        expect(calls).toEqual([2, 4, 6]);
    });

    it('unloads children first, then what was registered, newest first, then itself', () => {
        const order: string[] = [];

        class Probe extends Component {
            constructor(private readonly name: string) {
                super();
            }

            onunload(): void {
                order.push(`${this.name} unloaded`);
            }
        }

        const parent = new Probe('parent');
        const child = parent.addChild(new Probe('child'));
        parent.register(() => order.push('first registered'));
        parent.register(() => order.push('second registered'));
        const interval = window.setInterval(() => order.push('tick'), 10);
        parent.registerInterval(interval);

        parent.load();
        parent.unload();
        vi.advanceTimersByTime(100);

        expect(order).toEqual(['child unloaded', 'second registered', 'first registered', 'parent unloaded']);
        expect(child).toBeInstanceOf(Probe);
    });
});
