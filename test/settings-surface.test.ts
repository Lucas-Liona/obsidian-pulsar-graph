import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MAX_OPACITY_RANGE, parseSettings, sittingGapPlacement } from '../src/settings';

describe('sittingGapPlacement', () => {
    // The bug: the length the history counts sittings by was only drawn with
    // trails on, and trails are off by default while the history is on.
    it('is reachable at the defaults', () => {
        expect(sittingGapPlacement(DEFAULT_SETTINGS)).toBe('history');
    });

    it('goes under History whenever the history is on, trails or not', () => {
        expect(sittingGapPlacement({ history: true, sessionTrails: false })).toBe('history');
        expect(sittingGapPlacement({ history: true, sessionTrails: true })).toBe('history');
    });

    it('goes with the trails while only they read it', () => {
        expect(sittingGapPlacement({ history: false, sessionTrails: true })).toBe('trails');
    });

    it('is not drawn when nothing reads it', () => {
        expect(sittingGapPlacement({ history: false, sessionTrails: false })).toBeNull();
    });
});

describe('MAX_OPACITY_RANGE', () => {
    // The panel's Brightest stopped at 6 while the setting went to 12, so a
    // value above 6 snapped down as soon as the panel's slider was touched.
    it('holds every maximum opacity a saved setting can have', () => {
        const highest = parseSettings({ maxOpacity: 1_000 }).maxOpacity;
        const lowest = parseSettings({ maxOpacity: -5, minOpacity: -5 }).maxOpacity;

        expect(MAX_OPACITY_RANGE.highest).toBe(highest);
        expect(MAX_OPACITY_RANGE.lowest).toBe(lowest);
    });

    it('holds the default', () => {
        expect(DEFAULT_SETTINGS.maxOpacity).toBeGreaterThanOrEqual(MAX_OPACITY_RANGE.lowest);
        expect(DEFAULT_SETTINGS.maxOpacity).toBeLessThanOrEqual(MAX_OPACITY_RANGE.highest);
    });
});
