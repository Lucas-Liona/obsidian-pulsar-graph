import { describe, expect, it } from 'vitest';
import { COOLING_STOPS, durationMarks, formatDuration, nearestStop } from '../src/duration';
import { parseSettings } from '../src/settings';

describe('formatDuration', () => {
    it('writes each unit the way it is said', () => {
        expect(formatDuration(1)).toBe('1 s');
        expect(formatDuration(45)).toBe('45 s');
        expect(formatDuration(60)).toBe('1 min');
        expect(formatDuration(5 * 60)).toBe('5 min');
        expect(formatDuration(60 * 60)).toBe('1 h');
        expect(formatDuration(90 * 60)).toBe('1.5 h');
        expect(formatDuration(4 * 60 * 60)).toBe('4 h');
    });

    // A value set some other way is written as itself, not as its stop.
    it('writes a value between stops as it is', () => {
        expect(formatDuration(7 * 60)).toBe('7 min');
        expect(formatDuration(90)).toBe('1.5 min');
    });
});

describe('nearestStop', () => {
    it('finds a stop exactly', () => {
        expect(COOLING_STOPS[nearestStop(COOLING_STOPS, 5 * 60)]).toBe(5 * 60);
        expect(COOLING_STOPS[nearestStop(COOLING_STOPS, 1)]).toBe(1);
    });

    // By ratio: seven minutes is 1.4 times five and ten is 1.43 times seven.
    it('snaps a value between stops to the nearer one by ratio', () => {
        expect(COOLING_STOPS[nearestStop(COOLING_STOPS, 7 * 60)]).toBe(5 * 60);
        expect(COOLING_STOPS[nearestStop(COOLING_STOPS, 40)]).toBe(45);
    });

    it('holds anything outside the stops at the nearer end', () => {
        expect(nearestStop(COOLING_STOPS, 0)).toBe(0);
        expect(nearestStop(COOLING_STOPS, -5)).toBe(0);
        expect(nearestStop(COOLING_STOPS, Number.NaN)).toBe(0);
        expect(nearestStop(COOLING_STOPS, 24 * 60 * 60)).toBe(COOLING_STOPS.length - 1);
    });
});

describe('durationMarks', () => {
    // "---- s | m ----- o ---": a mark where seconds end and one where minutes do.
    it('marks the track where the unit changes', () => {
        const { marks, units } = durationMarks(COOLING_STOPS);
        const last = COOLING_STOPS.length - 1;

        expect(marks).toEqual([8.5 / last, 17.5 / last]);
        expect(units.map(({ unit }) => unit)).toEqual(['s', 'min', 'h']);
    });

    it('names each unit in the middle of its stretch', () => {
        const { marks, units } = durationMarks(COOLING_STOPS);

        expect(units[0].at).toBeCloseTo(marks[0] / 2);
        expect(units[1].at).toBeCloseTo((marks[0] + marks[1]) / 2);
        expect(units[2].at).toBeCloseTo((marks[1] + 1) / 2);
    });

    it('draws no mark across stops of one unit', () => {
        expect(durationMarks([1, 5, 30])).toEqual({ marks: [], units: [{ unit: 's', at: 0.5 }] });
    });
});

describe('cools over, as stored', () => {
    const minutes = (stored: unknown): number => parseSettings({ inkMinutes: stored }).inkMinutes;

    it('keeps a second, stored as a fraction of a minute', () => {
        expect(minutes(1 / 60)).toBe(1 / 60);
        expect(minutes(5 / 60)).toBe(5 / 60);
    });

    it('keeps whole minutes saved before seconds were allowed', () => {
        expect(minutes(5)).toBe(5);
        expect(minutes(240)).toBe(240);
    });

    it('holds nothing, or less, at a second', () => {
        expect(minutes(0)).toBe(1 / 60);
        expect(minutes(-3)).toBe(1 / 60);
    });

    it('holds more than four hours at four hours', () => {
        expect(minutes(241)).toBe(240);
        expect(minutes(100000)).toBe(240);
    });

    it('starts at five minutes', () => {
        expect(minutes(undefined)).toBe(5);
    });
});
