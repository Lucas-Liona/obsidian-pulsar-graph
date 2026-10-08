/**
 * A length of time picked from a list of round values, for a setting that runs
 * across more than one unit: seconds to hours, minutes to days, hours to a
 * year.
 *
 * One linear slider over that span is useless at the short end: from a second to
 * four hours in one-second steps, everything under a minute is the first quarter
 * of a pixel. So each position on the slider is a stop instead, and the stops
 * thin out as they grow, the way anyone rounds a duration out loud.
 */

/** Seconds, ascending. */
export type DurationStops = readonly number[];

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 1, 2, 3, 5, 10, 15, 20, 30 and 45 of a unit: the minutes any duration list starts from. */
const ROUND_MINUTES = [1, 2, 3, 5, 10, 15, 20, 30, 45].map((m) => m * MINUTE);

/** From a second, for writing that should only flash, to four hours, a long sitting. */
export const COOLING_STOPS: DurationStops = [
    1, 2, 3, 5, 10, 15, 20, 30, 45,
    MINUTE, 2 * MINUTE, 3 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 20 * MINUTE, 30 * MINUTE, 45 * MINUTE,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR
];

/**
 * Faded after: how long a tab is ignored before it is as faint as it gets. A
 * minute at the short end, since tabs repaint every 30 seconds; a working day
 * at the long one.
 */
export const TAB_FADE_STOPS: DurationStops = [
    ...ROUND_MINUTES,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR
];

/** Marked after: how long a tab is ignored before it is marked stale, up to two days. */
export const STALE_TAB_STOPS: DurationStops = [
    5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 20 * MINUTE, 30 * MINUTE, 45 * MINUTE,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR, 12 * HOUR,
    DAY, 2 * DAY
];

/**
 * Touched within: the spotlight's window, up to a day, so "everything I worked
 * on today" is a stop. Minutes at the short end, since the window is only
 * looked at again every 30 seconds.
 */
export const SPOTLIGHT_WINDOW_STOPS: DurationStops = [
    ...ROUND_MINUTES,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 8 * HOUR, 12 * HOUR, DAY
];

/** Counts as one sitting: how far apart two saves can be and still be one sitting. */
export const SITTING_STOPS: DurationStops = [
    ...ROUND_MINUTES,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR
];

/**
 * Never spread across less than: from a quarter of an hour, for a local graph
 * of one afternoon, to a week.
 */
export const SPREAD_FLOOR_STOPS: DurationStops = [
    15 * MINUTE, 30 * MINUTE, 45 * MINUTE,
    HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
    DAY, 2 * DAY, 3 * DAY, 7 * DAY
];

/** The window: from six hours, which is "today", to a year. */
export const WINDOW_STOPS: DurationStops = [
    6 * HOUR, 12 * HOUR,
    ...[1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365].map((d) => d * DAY)
];

/** The half-life: from an hour, for today's work alone, to a year. */
export const HALF_LIFE_STOPS: DurationStops = [
    HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR,
    ...[1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 180, 365].map((d) => d * DAY)
];

/** Stays lit for: days of vault time a replayed note stays lit behind the wave. */
export const REPLAY_TRAIL_STOPS: DurationStops = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90, 120, 180, 270, 365].map((d) => d * DAY);

export type DurationUnit = 's' | 'min' | 'h' | 'd';

const UNIT_SECONDS: Record<DurationUnit, number> = { s: 1, min: MINUTE, h: HOUR, d: DAY };

export function unitOf(seconds: number): DurationUnit {
    const whole = Math.round(seconds);

    if (whole < MINUTE) {
        return 's';
    }

    if (whole < HOUR) {
        return 'min';
    }

    return whole < DAY ? 'h' : 'd';
}

/** "5 s", "10 min", "1.5 h", "3 d". */
export function formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const unit = unitOf(whole);

    if (unit === 's') {
        return `${Math.max(1, whole)} s`;
    }

    const amount = whole / UNIT_SECONDS[unit];
    return `${Math.round(amount * 10) / 10} ${unit}`;
}

/**
 * The stop nearest a stored value, measured as a ratio rather than a
 * difference: forty seconds is nearer forty-five than thirty, and seven minutes
 * nearer five than ten, the same way the stops themselves are spaced.
 */
export function nearestStop(stops: DurationStops, seconds: number): number {
    if (!(seconds > 0)) {
        return 0;
    }

    const target = Math.log(seconds);
    let best = 0;

    for (let index = 1; index < stops.length; index++) {
        if (Math.abs(Math.log(stops[index]) - target) < Math.abs(Math.log(stops[best]) - target)) {
            best = index;
        }
    }

    return best;
}

/**
 * Where on the track the unit changes, and where each unit's name goes, as
 * fractions of the way along. A mark sits halfway between the last stop of one
 * unit and the first of the next, and a name in the middle of its stretch.
 */
export function durationMarks(stops: DurationStops): { marks: number[]; units: { unit: DurationUnit; at: number }[] } {
    const last = stops.length - 1;
    const marks: number[] = [];
    const units: { unit: DurationUnit; at: number }[] = [];
    let start = 0;

    for (let index = 1; index <= stops.length; index++) {
        if (index < stops.length && unitOf(stops[index]) === unitOf(stops[index - 1])) {
            continue;
        }

        const end = index < stops.length ? (index - 0.5) / last : 1;
        units.push({ unit: unitOf(stops[index - 1]), at: (start + end) / 2 });

        if (index < stops.length) {
            marks.push(end);
        }

        start = end;
    }

    return { marks, units };
}
