const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * How long ago something happened, in the roughest unit that still says
 * something useful. The graph is a glance, not a log, so "3 months ago" is more
 * readable than a date and more honest than "92 days ago".
 */
export function formatAge(mtime: number, now: number): string {
    const elapsed = now - mtime;

    if (elapsed < 0) {
        return 'just now';
    }

    if (elapsed < MINUTE) {
        return 'seconds ago';
    }

    if (elapsed < HOUR) {
        return plural(Math.floor(elapsed / MINUTE), 'minute');
    }

    if (elapsed < DAY) {
        return plural(Math.floor(elapsed / HOUR), 'hour');
    }

    if (elapsed < WEEK) {
        const days = Math.floor(elapsed / DAY);
        return days === 1 ? 'yesterday' : plural(days, 'day');
    }

    if (elapsed < MONTH) {
        return plural(Math.floor(elapsed / WEEK), 'week');
    }

    if (elapsed < YEAR) {
        return plural(Math.floor(elapsed / MONTH), 'month');
    }

    return plural(Math.floor(elapsed / YEAR), 'year');
}

/**
 * A length of time rather than a point in the past: "3 days", not "3 days ago".
 *
 * Same ladder, no special cases. "Yesterday" and "just now" are answers to when
 * something happened and say nothing at all about how long something lasted.
 */
export function formatSpan(milliseconds: number): string {
    const span = Math.max(0, milliseconds);

    if (span < MINUTE) {
        return 'under a minute';
    }

    if (span < HOUR) {
        return units(Math.floor(span / MINUTE), 'minute');
    }

    if (span < DAY) {
        return units(Math.floor(span / HOUR), 'hour');
    }

    if (span < WEEK) {
        return units(Math.floor(span / DAY), 'day');
    }

    if (span < MONTH) {
        return units(Math.floor(span / WEEK), 'week');
    }

    if (span < YEAR) {
        return units(Math.floor(span / MONTH), 'month');
    }

    return units(Math.floor(span / YEAR), 'year');
}

function plural(count: number, unit: string): string {
    return `${units(count, unit)} ago`;
}

function units(count: number, unit: string): string {
    return `${count} ${unit}${count === 1 ? '' : 's'}`;
}
