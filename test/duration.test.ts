import { describe, expect, it } from 'vitest';
import {
    COOLING_STOPS, durationMarks, DurationStops, formatDuration, HALF_LIFE_STOPS, nearestStop, REPLAY_TRAIL_STOPS, SITTING_STOPS,
    SPOTLIGHT_WINDOW_STOPS, SPREAD_FLOOR_STOPS, STALE_TAB_STOPS, TAB_FADE_STOPS, unitOf, WINDOW_STOPS
} from '../src/duration';
import { DEFAULT_SETTINGS, parseSettings, PulsarGraphSettings } from '../src/settings';

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

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('days', () => {
    it('are a unit from a day up', () => {
        expect(unitOf(DAY - 1)).toBe('h');
        expect(unitOf(DAY)).toBe('d');
        expect(formatDuration(DAY)).toBe('1 d');
        expect(formatDuration(7 * DAY)).toBe('7 d');
        expect(formatDuration(365 * DAY)).toBe('365 d');
        expect(formatDuration(1.5 * DAY)).toBe('1.5 d');
    });

    it('mark where hours turn into days', () => {
        const { marks, units } = durationMarks(WINDOW_STOPS);

        // 6 and 12 h, then sixteen stops of days: one mark, halfway between 12 h and a day.
        expect(marks).toEqual([1.5 / (WINDOW_STOPS.length - 1)]);
        expect(units.map((each) => each.unit)).toEqual(['h', 'd']);
    });

    it('draw no mark on a slider of days alone', () => {
        expect(durationMarks(REPLAY_TRAIL_STOPS).marks).toEqual([]);
    });
});

/**
 * Every duration setting, the unit it is stored in, and its slider. A value
 * that is not on the slider can still be stored; the readout says it as it is
 * until the slider is moved.
 */
const DURATIONS: [keyof PulsarGraphSettings, number, DurationStops][] = [
    ['inkMinutes', MINUTE, COOLING_STOPS],
    ['tabFadeAfter', MINUTE, TAB_FADE_STOPS],
    ['staleTabAfter', MINUTE, STALE_TAB_STOPS],
    ['spotlightMinutes', MINUTE, SPOTLIGHT_WINDOW_STOPS],
    ['sessionGapMinutes', MINUTE, SITTING_STOPS],
    ['spreadFloorHours', HOUR, SPREAD_FLOOR_STOPS],
    ['windowDays', DAY, WINDOW_STOPS],
    ['halfLifeDays', DAY, HALF_LIFE_STOPS],
    ['replayTrailDays', DAY, REPLAY_TRAIL_STOPS]
];

describe.each(DURATIONS)('%s', (key, unit, stops) => {
    const stored = (value: unknown): number => parseSettings({ [key]: value })[key] as number;

    it('has stops in order', () => {
        expect([...stops].sort((a, b) => a - b)).toEqual([...stops]);
        expect(new Set(stops).size).toBe(stops.length);
    });

    it('defaults to a stop', () => {
        expect(stops).toContain((DEFAULT_SETTINGS[key] as number) * unit);
    });

    it('keeps every stop as stored, unrounded', () => {
        for (const stop of stops) {
            expect(stored(stop / unit)).toBeCloseTo(stop / unit, 10);
        }
    });

    it('holds a value past either end at that end', () => {
        expect(stored(stops[0] / unit / 2)).toBeCloseTo(stops[0] / unit, 10);
        expect(stored(0)).toBeCloseTo(stops[0] / unit, 10);
        expect(stored(stops[stops.length - 1] / unit * 2)).toBeCloseTo(stops[stops.length - 1] / unit, 10);
    });
});

describe('the new ends', () => {
    it('lets a window be six hours, "today"', () => {
        expect(parseSettings({ windowDays: 0.25 }).windowDays).toBe(0.25);
    });

    it('lets a half-life be an hour', () => {
        expect(parseSettings({ halfLifeDays: 1 / 24 }).halfLifeDays).toBeCloseTo(1 / 24, 10);
    });

    it('lets the spread floor be a quarter of an hour', () => {
        expect(parseSettings({ spreadFloorHours: 0.25 }).spreadFloorHours).toBe(0.25);
    });

    it('lets the spotlight window reach a whole day', () => {
        expect(parseSettings({ spotlightMinutes: 24 * 60 }).spotlightMinutes).toBe(24 * 60);
    });

    // The spotlight window's old slider ran 1-720 in steps of 5, so a drag
    // landed on 1, 6, 11 ... 26, 31 and never on its own default of 30.
    it('puts the spotlight window\'s default on its slider', () => {
        expect(SPOTLIGHT_WINDOW_STOPS[nearestStop(SPOTLIGHT_WINDOW_STOPS, DEFAULT_SETTINGS.spotlightMinutes * MINUTE)]).toBe(30 * MINUTE);
    });
});
