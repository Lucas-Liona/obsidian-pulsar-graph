import { TFile } from 'obsidian';
import { shapeRecency } from './fade';
import { PulsarGraphSettings } from './settings';

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
            this.newestMtime = Math.max(this.newestMtime, mtime);
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
        if (!this.opacitiesStale) {
            return;
        }

        this.opacities.clear();
        for (const [path, mtime] of this.mtimes) {
            this.opacities.set(path, this.calculateOpacity(mtime));
        }

        this.opacitiesStale = false;
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

        const timeRange = this.newestMtime - this.oldestMtime;
        if (timeRange === 0) {
            return maxOpacity;
        }

        const recency = (mtime - this.oldestMtime) / timeRange;
        const fade = shapeRecency(fadeType, recency, { steepness, numSteps });

        return minOpacity + fade * (maxOpacity - minOpacity);
    }

    private recalculateRange(): void {
        if (this.mtimes.size === 0) {
            this.oldestMtime = Date.now();
            this.newestMtime = 0;
            return;
        }

        let oldest = Date.now();
        let newest = 0;

        for (const mtime of this.mtimes.values()) {
            if (mtime < oldest) oldest = mtime;
            if (mtime > newest) newest = mtime;
        }

        this.oldestMtime = oldest;
        this.newestMtime = newest;
    }
}
