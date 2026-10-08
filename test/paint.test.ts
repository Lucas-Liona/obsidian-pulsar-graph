import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { applyOpacity, GraphNode, GraphRenderer, newPaint, OpacityOptions } from '../src/graph';
import { OpacityStore } from '../src/opacity-store';
import { DEFAULT_SETTINGS } from '../src/settings';

const GREY = 0x908caa;
const GREEN = 0x4dff91;
const PURPLE = 0xc084fc;

/** Three notes a day apart, under the shipped settings, whose maximum is 3. */
function setUp(): { renderer: GraphRenderer; store: OpacityStore; node: (path: string) => GraphNode } {
    const now = Date.UTC(2026, 9, 7);
    const day = 24 * 60 * 60 * 1000;
    const mtimes: [string, number][] = [['new.md', now], ['middle.md', now - day], ['old.md', now - 90 * day]];

    const store = new OpacityStore(() => DEFAULT_SETTINGS);
    store.build(mtimes.map(([path, mtime]) => Object.assign(new TFile(), { path, stat: { mtime, ctime: mtime, size: 1 } })));

    const nodeLookup: Record<string, GraphNode> = {};
    for (const [path] of mtimes) {
        nodeLookup[path] = { id: path, color: { a: 1, rgb: GREY }, circle: { tint: GREY, visible: true } };
    }

    return { renderer: { nodeLookup, colors: { fill: { rgb: GREY } } }, store, node: (path) => nodeLookup[path] };
}

function options(overrides: Partial<OpacityOptions>): OpacityOptions {
    return {
        adaptive: false,
        replayAt: null,
        replayTrailDays: 60,
        anchorPath: null,
        spreadFloorHours: 6,
        spotlit: [],
        spotlightRgb: GREEN,
        spotlightStrength: 1,
        neighbourBleed: 0,
        neighbourHops: 1,
        clusterWarmth: 0,
        clusterBy: 'folder',
        pinned: new Set(),
        pinOpacity: DEFAULT_SETTINGS.maxOpacity,
        pinMark: true,
        pinRgb: PURPLE,
        pinStrength: 1,
        paint: newPaint(),
        ...overrides,
    };
}

describe('painted colours', () => {
    it('draws the spotlight at no more than full alpha, in exactly the colour picked', () => {
        const { renderer, store, node } = setUp();

        const drawn = applyOpacity(renderer, store, options({ spotlit: ['new.md'] }));

        expect(drawn?.get('new.md')).toBeGreaterThan(1);
        expect(node('new.md').color).toEqual({ a: 1, rgb: GREEN });
    });

    it('draws a pin at no more than full alpha, though it is held at the maximum', () => {
        const { renderer, store, node } = setUp();

        const drawn = applyOpacity(renderer, store, options({ pinned: new Set(['old.md']) }));

        expect(drawn?.get('old.md')).toBe(DEFAULT_SETTINGS.maxOpacity);
        expect(node('old.md').color).toEqual({ a: 1, rgb: PURPLE });
    });

    it('leaves a painted note below full alpha where it was', () => {
        const { renderer, store, node } = setUp();

        const drawn = applyOpacity(renderer, store, options({ spotlit: ['old.md'] }));
        const opacity = drawn?.get('old.md') ?? NaN;

        expect(opacity).toBeLessThan(1);
        expect(node('old.md').color).toEqual({ a: opacity, rgb: GREEN });
    });

    it('still lets an unpainted note past 1, which is what a high maximum is for', () => {
        const { renderer, store, node } = setUp();

        applyOpacity(renderer, store, options({ spotlit: ['old.md'] }));

        expect(node('new.md').color?.a).toBeGreaterThan(1);
        expect(node('new.md').color?.rgb).toBe(GREY);
    });
});
