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
        const { normalizeBy, windowDays } = this.getSettings();

        if (normalizeBy === 'window') {
            const span = windowDays * MS_PER_DAY;
            return clamp((mtime - (this.anchor - span)) / span, 0, 1);
        }

        const span = this.newestMtime - this.oldestMtime;
        return span <= 0 ? 1 : (mtime - this.oldestMtime) / span;
    }

    /** The two ends of the range opacity is currently measured against. */
    private normalizingRange(): { oldest: number; newest: number } {
        const { normalizeBy, windowDays } = this.getSettings();

        if (normalizeBy === 'window') {
            return { oldest: this.anchor - windowDays * MS_PER_DAY, newest: this.anchor };
        }

        return { oldest: this.oldestMtime, newest: this.newestMtime };
    }

    /**
     * True when a window-anchored cache has aged enough to be worth redoing.
     * The vault range does not move with the clock, so it never drifts.
     */
    private anchorHasDrifted(): boolean {
        const { normalizeBy, windowDays } = this.getSettings();

        if (normalizeBy !== 'window') {
            return false;
        }

        return Date.now() - this.anchor > windowDays * MS_PER_DAY * ANCHOR_DRIFT_FRACTION;
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
