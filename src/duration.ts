/**
 * A length of time picked from a list of round values, for a setting that runs
 * from seconds to hours.
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

/** From a second, for writing that should only flash, to four hours, a long sitting. */
export const COOLING_STOPS: DurationStops = [
    1, 2, 3, 5, 10, 15, 20, 30, 45,
    MINUTE, 2 * MINUTE, 3 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 20 * MINUTE, 30 * MINUTE, 45 * MINUTE,
    HOUR, 1.5 * HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR
];

export type DurationUnit = 's' | 'min' | 'h';

export function unitOf(seconds: number): DurationUnit {
    const whole = Math.round(seconds);

    if (whole < MINUTE) {
        return 's';
    }

    return whole < HOUR ? 'min' : 'h';
}

/** "5 s", "10 min", "1.5 h". */
export function formatDuration(seconds: number): string {
    const whole = Math.round(seconds);
    const unit = unitOf(whole);

    if (unit === 's') {
        return `${Math.max(1, whole)} s`;
    }

    const amount = whole / (unit === 'min' ? MINUTE : HOUR);
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
