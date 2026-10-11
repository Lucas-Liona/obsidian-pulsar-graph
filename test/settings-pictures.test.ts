import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { poolNeighbours, sizeScale, warmByGroup } from '../src/graph';
import { sameSitting } from '../src/history';
import { inkColoursFor } from '../src/ink';
import { OpacityStore } from '../src/opacity-store';
import { DEFAULT_SETTINGS, parseSettings } from '../src/settings';
import { drawnRgb, linkedGraph, parseColour, seenStrength, spaced, spacedPlaces } from '../src/settings-pictures';
import { fadeStrength } from '../src/tabs';

const DARK = { light: false, background: 0x1e1e1e };
const LIGHT = { light: true, background: 0xffffff };

describe('spaced', () => {
    it('gives every time when there are fewer than asked for', () => {
        expect(spaced([1, 2, 3], 5)).toEqual([1, 2, 3]);
    });

    it('keeps the oldest and the newest, evenly between', () => {
        const times = Array.from({ length: 101 }, (_unused, index) => index * 10);
        expect(spaced(times, 5)).toEqual([0, 250, 500, 750, 1000]);
    });

    it('never repeats a place', () => {
        fc.assert(fc.property(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 600 }), (length, count) => {
            const places = spacedPlaces(length, count);
            expect(new Set(places).size).toBe(places.length);
            expect(places.length).toBe(Math.min(length, count));
            expect(places.every((place) => place >= 0 && place < length)).toBe(true);
        }));
    });
});

describe('drawnRgb', () => {
    it('lays a colour over the background below full strength', () => {
        expect(drawnRgb(0xb3b3b3, 0, DARK)).toBe(0x1e1e1e);
        expect(drawnRgb(0xb3b3b3, 1, DARK)).toBe(0xb3b3b3);
    });

    // AGENTS.md: the renderer multiplies each channel and clamps, so a dark
    // theme's grey climbs to white past 1.
    it('lightens past 1 on a dark theme, channel by channel', () => {
        expect(drawnRgb(0x908caa, 1.84, DARK)).toBe(0xffffff);
        expect(drawnRgb(0x808080, 1.5, DARK)).toBe(0xc0c0c0);
    });

    it('deepens past 1 on a light theme, as the graph does', () => {
        expect(drawnRgb(0x5c5c5c, 2, LIGHT)).toBe(0x000000);
        expect(drawnRgb(0x5c5c5c, 1, LIGHT)).toBe(0x5c5c5c);
    });

    // The pictures promise what the plugin promises: a stronger note is never
    // drawn closer to the background than a weaker one, on either theme.
    it('never draws a stronger note fainter', () => {
        const grey = fc.integer({ min: 0x40, max: 0xd0 }).map((level) => (level << 16) | (level << 8) | level);
        const strength = fc.double({ min: 0, max: 12, noNaN: true });

        fc.assert(fc.property(grey, strength, strength, fc.boolean(), (node, a, b, light) => {
            const palette = light ? LIGHT : DARK;
            const [low, high] = a <= b ? [a, b] : [b, a];
            expect(seenStrength(drawnRgb(node, high, palette), palette)).toBeGreaterThanOrEqual(seenStrength(drawnRgb(node, low, palette), palette) - 1e-9);
        }));
    });
});

describe('parseColour', () => {
    it('reads hex, short hex and rgb', () => {
        expect(parseColour('#4dff91')).toBe(0x4dff91);
        expect(parseColour('#fff')).toBe(0xffffff);
        expect(parseColour('rgb(12, 34, 56)')).toBe(0x0c2238);
    });

    it('lays a transparent colour over the background', () => {
        expect(parseColour('rgba(255, 255, 255, 0.5)', 0, 0x000000)).toBe(0x808080);
    });

    it('falls back on anything else', () => {
        expect(parseColour('var(--x)', 0x123456)).toBe(0x123456);
    });
});

// The pictures call these instead of copying their sums; each is the one the
// running plugin uses.
describe('what the pictures share with the plugin', () => {
    it('sizes by strength between the two ends', () => {
        expect(sizeScale(undefined, { smallest: 0.7, largest: 1.8 })).toBe(1);
        expect(sizeScale(0, { smallest: 0.7, largest: 1.8 })).toBeCloseTo(0.7);
        expect(sizeScale(1, { smallest: 0.7, largest: 1.8 })).toBeCloseTo(1.8);
        expect(sizeScale(4, { smallest: 0.7, largest: 1.8 })).toBeCloseTo(1.8);
    });

    it('counts a save exactly the gap after the last as the same sitting', () => {
        expect(sameSitting(0, 30, 30)).toBe(true);
        expect(sameSitting(0, 31, 30)).toBe(false);
    });

    it('writes the dim as how much of the page is kept', () => {
        expect(inkColoursFor('#ff7a45', 0.45)).toEqual({ '--pulsar-ink': '#ff7a45', '--pulsar-ink-dim': '55%' });
    });

    it('fades a tab by attention, gradually or at once, and never below the floor', () => {
        const options = { mode: 'attention' as const, curve: 'over' as const, after: 60, floor: 0.35 };
        expect(fadeStrength(options, 0, undefined)).toBe(1);
        expect(fadeStrength(options, 30, undefined)).toBeCloseTo(0.675);
        expect(fadeStrength(options, 600, undefined)).toBe(0.35);
        expect(fadeStrength({ ...options, curve: 'at' }, 59, undefined)).toBe(1);
        expect(fadeStrength({ ...options, curve: 'at' }, 60, undefined)).toBe(0.35);
        expect(fadeStrength({ ...options, mode: 'modified' }, undefined, 0.1)).toBe(0.35);
        expect(fadeStrength(options, undefined, undefined)).toBe(1);
    });

    it('pools a glow and a group temperature over an example graph with no renderer', () => {
        const graph = linkedGraph(['Work/a.md', 'Work/b.md', 'Old/c.md'], [['Work/a.md', 'Work/b.md']]);
        const own = new Map([['Work/a.md', 1], ['Work/b.md', 0.1], ['Old/c.md', 0.2]]);

        const glowed = poolNeighbours(graph, own, 0.5, 1);
        expect(glowed.get('Work/b.md')).toBeCloseTo(0.5);
        expect(glowed.get('Old/c.md')).toBeCloseTo(0.2);

        const warmed = warmByGroup(graph, own, 1, 'folder');
        expect(warmed.get('Work/a.md')).toBe(warmed.get('Work/b.md'));
        expect(warmed.get('Old/c.md')).toBeCloseTo(0.2);
    });

    it('measures example notes in a store of their own, as a panel is measured', () => {
        const settings = parseSettings({ ...DEFAULT_SETTINGS, ageScale: 'even', minOpacity: 0, maxOpacity: 1, fadeType: 'linear' });
        const store = new OpacityStore(() => settings);
        const notes = [0, 5, 10].map((day) => ({ path: `n${day}.md`, stat: { mtime: day * 86_400_000, ctime: day * 86_400_000, size: 0 } }));
        store.build(notes);
        store.refresh();

        const spread = store.spreadAcross(notes.map((note) => note.path), 6);
        expect(spread?.get('n0.md')).toBeCloseTo(0);
        expect(spread?.get('n5.md')).toBeCloseTo(0.5);
        expect(spread?.get('n10.md')).toBeCloseTo(1);
    });
});
