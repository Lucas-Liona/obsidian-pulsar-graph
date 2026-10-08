import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { applyOpacity, deepenRgb, GraphNode, GraphRenderer, newPaint, OpacityOptions } from '../src/graph';
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
        lightTheme: false,
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

    // On a light theme an alpha above 1 is a step toward the background: at the
    // shipped maximum of 3 the newest note was drawn white on white.
    it('deepens a node past full strength on a light theme, at alpha 1, and leaves what it reports alone', () => {
        const { renderer, store, node } = setUp();

        const drawn = applyOpacity(renderer, store, options({ lightTheme: true }));
        const middle = drawn?.get('middle.md') ?? NaN;

        expect(drawn?.get('new.md')).toBe(DEFAULT_SETTINGS.maxOpacity);
        expect(node('new.md').color).toEqual({ a: 1, rgb: 0x000000 });
        expect(node('middle.md').color).toEqual({ a: 1, rgb: deepenRgb(GREY, middle) });
        expect(node('middle.md').circle?.tint).toBe(deepenRgb(GREY, middle));
        expect(node('old.md').color).toEqual({ a: drawn?.get('old.md'), rgb: GREY });
    });

    it('lets the spotlight win over deepening on a light theme', () => {
        const { renderer, store, node } = setUp();

        applyOpacity(renderer, store, options({ lightTheme: true, spotlit: ['new.md'] }));

        expect(node('new.md').color).toEqual({ a: 1, rgb: GREEN });
    });

    // The way back is upward, which the renderer's easing stalls on, so a
    // deepened node goes through the same release as a spotlight moving on.
    it('hands a deepened node its own colour back when the theme turns dark', () => {
        const { renderer, store, node } = setUp();
        const paint = newPaint();

        applyOpacity(renderer, store, options({ lightTheme: true, paint }));
        applyOpacity(renderer, store, options({ lightTheme: false, paint }));

        expect(paint.painted.size).toBe(0);
        expect([...paint.releasing.keys()].sort()).toEqual(['middle.md', 'new.md']);
        expect(node('new.md').color?.rgb).toBe(GREY);
        expect(node('new.md').circle?.tint).toBe(GREY);
        expect(node('new.md').color?.a).toBe(DEFAULT_SETTINGS.maxOpacity);
    });

    it('still lets an unpainted note past 1, which is what a high maximum is for', () => {
        const { renderer, store, node } = setUp();

        applyOpacity(renderer, store, options({ spotlit: ['old.md'] }));

        expect(node('new.md').color?.a).toBeGreaterThan(1);
        expect(node('new.md').color?.rgb).toBe(GREY);
    });
});

describe('deepenRgb', () => {
    // The mirror of the renderer past full alpha on a dark background: each
    // channel's distance from white is multiplied rather than the channel.
    it('leaves a colour itself at 1 and sinks it to black', () => {
        expect(deepenRgb(0x5c5c5c, 1)).toBe(0x5c5c5c);
        expect(deepenRgb(0x5c5c5c, 1.5)).toBe(0x0a0a0a);
        expect(deepenRgb(0x5c5c5c, 2)).toBe(0x000000);
        expect(deepenRgb(0x5c5c5c, 3)).toBe(0x000000);
    });

    it('works on each channel apart, as a group colour needs', () => {
        expect(deepenRgb(0xe05050, 1.5)).toBe(0xd00000);
    });
});
