import { TFile } from 'obsidian';
import { shapeRecency } from './fade';
import { PulsarGraphSettings } from './settings';

/** One point on the fade curve, at a real age from this vault. */
export interface Sample {
    mtime: number;
    opacity: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How far the clock may drift before window-anchored opacities are recomputed,
 * as a fraction of the window. A hundredth of a thirty day window is about
 * seven hours, which is far below anything the eye would catch, and it is
 * checked when a graph is already being updated rather than on a timer.
 */
const ANCHOR_DRIFT_FRACTION = 0.01;

/**
 * Last-modified time and resulting opacity for every note, so applying opacity
 * to a graph is a pair of map lookups rather than a vault scan.
 *
 * Opacity is normalized against the oldest and newest note in the vault, so
 * every cached value becomes stale as soon as either end of that range moves.
 * Single-note edits in between only need their own entry recomputed.
 */
export class OpacityStore {
    private readonly mtimes = new Map<string, number>();
    private readonly opacities = new Map<string, number>();
    private opacitiesStale = true;

    private oldestMtime = Date.now();
    private newestMtime = 0;
    private newestNotePath: string | undefined;

    /** The 'now' every cached opacity was measured against, in window mode. */
    private anchor = Date.now();

    /** Every note's mtime in order, which is what rank reads positions out of. */
    private ranking: number[] = [];

    constructor(private readonly getSettings: () => PulsarGraphSettings) {}

    build(files: TFile[]): void {
        this.mtimes.clear();

        for (const file of files) {
            this.mtimes.set(file.path, file.stat.mtime);
        }

        this.recalculateRange();
        this.opacitiesStale = true;
    }

    recordChange(file: TFile): void {
        const mtime = file.stat.mtime;
        this.mtimes.set(file.path, mtime);

        if (mtime < this.oldestMtime || mtime > this.newestMtime) {
            this.oldestMtime = Math.min(this.oldestMtime, mtime);

            if (mtime > this.newestMtime) {
                this.newestMtime = mtime;
                this.newestNotePath = file.path;
            }

            this.opacitiesStale = true;
            return;
        }

        this.opacities.set(file.path, this.calculateOpacity(mtime));
    }

    recordDelete(file: TFile): void {
        const mtime = this.mtimes.get(file.path);
        this.forget(file.path);

        if (mtime === this.oldestMtime || mtime === this.newestMtime) {
            this.recalculateRange();
            this.opacitiesStale = true;
        }
    }

    /** Drops a path the vault no longer has, such as the old side of a rename. */
    forget(path: string): void {
        this.mtimes.delete(path);
        this.opacities.delete(path);
    }

    /** Marks every cached opacity for recalculation, after a settings change. */
    markStale(): void {
        this.opacitiesStale = true;
    }

    refresh(): void {
        if (this.anchorHasDrifted()) {
            this.opacitiesStale = true;
        }

        if (!this.opacitiesStale) {
            return;
        }

        this.anchor = Date.now();
        this.rebuildRanking();
        this.opacities.clear();
        for (const [path, mtime] of this.mtimes) {
            this.opacities.set(path, this.calculateOpacity(mtime));
        }

        this.opacitiesStale = false;
    }

    /** The most recently modified note, which the spotlight setting picks out. */
    newestPath(): string | undefined {
        return this.newestNotePath;
    }

    /**
     * Walks the curve across whatever range opacity is currently measured
     * against, so the settings preview shows what these numbers do to real
     * ages rather than to an invented range.
     */
    sample(count: number): Sample[] {
        if (this.mtimes.size === 0) {
            return [];
        }

        // Rank spaces notes evenly by position, so walking the calendar would
        // say nothing. Walking the places themselves shows the ages they land on.
        if (this.getSettings().ageScale === 'rank') {
            return this.samplePlaces(count);
        }

        const { oldest, newest } = this.normalizingRange();
        const span = newest - oldest;

        // A single note, or a vault edited entirely within one instant.
        if (span <= 0) {
            return [{ mtime: newest, opacity: this.calculateOpacity(newest) }];
        }

        const samples: Sample[] = [];

        for (let step = 0; step < count; step++) {
            const mtime = oldest + span * (count === 1 ? 1 : step / (count - 1));
            samples.push({ mtime, opacity: this.calculateOpacity(mtime) });
        }

        return samples;
    }

    private samplePlaces(count: number): Sample[] {
        const places = this.ranking.length;
        if (places === 0) {
            return [];
        }

        const samples: Sample[] = [];

        for (let step = 0; step < count; step++) {
            const at = count === 1 ? places - 1 : Math.round((step / (count - 1)) * (places - 1));
            const mtime = this.ranking[at];

            samples.push({ mtime, opacity: this.calculateOpacity(mtime) });
        }

        return samples;
    }

    /** Every graded note and when it was last modified. */
    entries(): IterableIterator<[string, number]> {
        return this.mtimes.entries();
    }

    mtimeFor(path: string): number | undefined {
        return this.mtimes.get(path);
    }

    opacityFor(path: string): number | undefined {
        return this.opacities.get(path);
    }

    cacheOpacityFor(path: string, mtime: number): number {
        const opacity = this.calculateOpacity(mtime);
        this.opacities.set(path, opacity);
        return opacity;
    }

    private calculateOpacity(mtime: number): number {
        const { fadeType, minOpacity, maxOpacity, steepness, numSteps } = this.getSettings();

        const fade = shapeRecency(fadeType, this.recencyOf(mtime), { steepness, numSteps });

        return minOpacity + fade * (maxOpacity - minOpacity);
    }

    /**
     * Where a note falls between the two ends of the range being measured, 0
     * for the old end and 1 for the new one.
     *
     * Against the whole vault, one note from years ago sets the old end for
     * everything else, so a year of recent work can land inside a few percent
     * of the range and come out looking identical. A window throws that away
     * and spends the entire range on the last so many days instead, which is
     * usually the only part anyone is reading.
     */
    private recencyOf(mtime: number): number {
        const { ageScale } = this.getSettings();

        if (ageScale === 'rank') {
            return this.rankOf(mtime);
        }

        // Measured against the calendar rather than against the other notes,
        // which is the one scale nothing else in the vault can move. Every
        // other scale is relative: a single note from years ago stretches the
        // range and darkens everything, and deleting it brightens the whole
        // vault for no reason anyone would guess.
        if (ageScale === 'halflife') {
            return Math.pow(2, -days(this.anchor - mtime) / this.getSettings().halfLifeDays);
        }

        const { oldest, newest } = this.normalizingRange();
        const span = newest - oldest;

        if (span <= 0) {
            return 1;
        }

        if (ageScale === 'log') {
            return clamp(1 - Math.log1p(days(newest - mtime)) / Math.log1p(days(span)), 0, 1);
        }

        return clamp((mtime - oldest) / span, 0, 1);
    }

    /**
     * Where a note sits in the running order rather than on the calendar, so
     * half the notes are always above the halfway mark however the edits fall
     * in time. It is the one scale a lopsided history cannot flatten.
     */
    private rankOf(mtime: number): number {
        const places = this.ranking.length;
        if (places <= 1) {
            return 1;
        }

        // Lower bound, so notes sharing an mtime share a place.
        let low = 0;
        let high = places;

        while (low < high) {
            const middle = (low + high) >> 1;

            if (this.ranking[middle] < mtime) {
                low = middle + 1;
            } else {
                high = middle;
            }
        }

        return low / (places - 1);
    }

    /**
     * Collects the mtimes rank counts, which is every note, or every note
     * inside the window when one is set. A note older than the window is not
     * given a place, and falls out at 0.
     */
    private rebuildRanking(): void {
        if (this.getSettings().ageScale !== 'rank') {
            this.ranking = [];
            return;
        }

        const { oldest } = this.normalizingRange();
        const inRange: number[] = [];

        for (const mtime of this.mtimes.values()) {
            if (mtime >= oldest) {
                inRange.push(mtime);
            }
        }

        this.ranking = inRange.sort((a, b) => a - b);
    }

    /** The two ends of the range opacity is currently measured against. */
    private normalizingRange(): { oldest: number; newest: number } {
        const { normalizeBy, windowDays, ageScale } = this.getSettings();

        // A half-life needs no range at all. The vault's own is still what the
        // settings preview should walk, so a leftover window setting does not
        // quietly narrow the ages it shows.
        if (ageScale === 'halflife') {
            return { oldest: this.oldestMtime, newest: this.newestMtime };
        }

        if (normalizeBy === 'window') {
            return { oldest: this.anchor - windowDays * MS_PER_DAY, newest: this.anchor };
        }

        return { oldest: this.oldestMtime, newest: this.newestMtime };
    }

    /**
     * True when a clock-anchored cache has aged enough to be worth redoing. The
     * vault range does not move with the clock, so the scales measured against
     * it never drift; a window and a half-life both do.
     */
    private anchorHasDrifted(): boolean {
        const { normalizeBy, windowDays, ageScale, halfLifeDays } = this.getSettings();
        const span = ageScale === 'halflife' ? halfLifeDays : normalizeBy === 'window' ? windowDays : 0;

        if (span <= 0) {
            return false;
        }

        return Date.now() - this.anchor > span * MS_PER_DAY * ANCHOR_DRIFT_FRACTION;
    }

    private recalculateRange(): void {
        if (this.mtimes.size === 0) {
            this.oldestMtime = Date.now();
            this.newestMtime = 0;
            this.newestNotePath = undefined;
            return;
        }

        let oldest = Date.now();
        let newest = 0;
        let newestPath: string | undefined;

        for (const [path, mtime] of this.mtimes) {
            if (mtime < oldest) oldest = mtime;
            if (mtime > newest) {
                newest = mtime;
                newestPath = path;
            }
        }

        this.oldestMtime = oldest;
        this.newestMtime = newest;
        this.newestNotePath = newestPath;
    }
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(Math.max(value, lowest), highest);
}

/**
 * Milliseconds as days, which is the unit the logarithmic scale is shaped in.
 * Taking the log of a span in milliseconds would put the whole vault inside a
 * couple of units of each other and undo the point of it; a day is also a fair
 * floor, since two edits an hour apart are equally fresh.
 */
function days(milliseconds: number): number {
    return Math.max(0, milliseconds) / MS_PER_DAY;
}
