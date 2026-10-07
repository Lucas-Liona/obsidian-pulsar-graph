import { formatAge } from './age';
import { OpacityRange, withinRanges } from './filter';
import { joinStats } from './stats-text';

/** What a set of ranges keeps of the vault, counted in one pass. */
export interface RangeSummary {
    kept: number;
    total: number;
    /** Newest and oldest modification time among what is kept. */
    newest: number;
    oldest: number;
}

/**
 * Whether one note survives a set of ranges.
 *
 * A note with no brightness yet is kept, since there is nothing to judge it
 * by, and so is anything exempt: the open note, the spotlit ones and the pins,
 * for the reasons `keptFromFilter` gives.
 */
export function keepsNote(path: string, strength: number | undefined, ranges: OpacityRange[], exempt: ReadonlySet<string>): boolean {
    return strength === undefined || exempt.has(path) || withinRanges(Math.min(1, Math.max(0, strength)), ranges);
}

/**
 * Counts what a set of ranges keeps.
 *
 * The exempt set is taken whole rather than asked for per note. Asking per
 * note is what this replaced: the exemptions include the spotlit notes, and
 * finding those sorts the vault, so one readout sorted the vault once for
 * every note in it — 212 ms per pointer move over a 1103-note vault.
 */
export function summariseRanges(
    notes: Iterable<[string, number]>,
    strengthOf: (path: string) => number | undefined,
    ranges: OpacityRange[],
    exempt: ReadonlySet<string>
): RangeSummary {
    let kept = 0;
    let total = 0;
    let newest = 0;
    let oldest = Number.POSITIVE_INFINITY;

    for (const [path, mtime] of notes) {
        total++;

        if (!keepsNote(path, strengthOf(path), ranges, exempt)) {
            continue;
        }

        kept++;
        newest = Math.max(newest, mtime);
        oldest = Math.min(oldest, mtime);
    }

    return { kept, total, newest, oldest };
}

/**
 * A summary in the units the question was asked in: how many notes are left,
 * and how old the ends of that stretch are.
 */
export function describeSummary(summary: RangeSummary, now: number): string {
    const { kept, total, newest, oldest } = summary;

    if (kept === 0) {
        return `Nothing in range, of ${total} notes.`;
    }

    // The share, because "194 of 1092" is a ratio nobody computes while
    // dragging and "18%" is the thing the handle is actually choosing.
    const share = Math.round((kept / total) * 100);
    const ages = oldest === newest
        ? formatAge(newest, now)
        : `${formatAge(newest, now)} back to ${formatAge(oldest, now)}`;

    return joinStats(`${kept} of ${total} notes`, `${share < 1 ? '<1' : share}%`, ages);
}
