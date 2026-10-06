import { TFile } from 'obsidian';
import { shapeRecency } from './fade';
import { AgeScale, PulsarGraphSettings } from './settings';

/** One point on the fade curve, at a real age from this vault. */
export interface Sample {
    mtime: number;
    opacity: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * Below this many notes there is nothing to spread. Two notes put one at each
 * end of the range whatever their dates, which says more about there being two
 * of them than about either one.
 */
const SPREAD_FLOOR_NOTES = 3;

/** A range and running order to measure against instead of the vault's. */
interface Spread {
    oldest: number;
    newest: number;
    ranking: number[];
}

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

    /** Every note's sitting count in order, for ranking edit intensity. */
    private intensityRanking: number[] = [];

    /** How many sittings a note has on record. Zero until a history exists. */
    private sittings: (path: string) => number = () => 0;

    constructor(private readonly getSettings: () => PulsarGraphSettings) {}

    /**
     * Where sitting counts come from. Kept as a callback so the store knows
     * nothing about the history file, and so a vault with the history switched
     * off reads zero everywhere rather than carrying a second empty structure.
     */
    setSittingSource(sittings: (path: string) => number): void {
        this.sittings = sittings;
    }

    build(files: TFile[]): void {
        this.mtimes.clear();

        for (const file of files) {
            this.mtimes.set(file.path, file.stat.mtime);
        }

        this.recalculateRange();
        this.opacitiesStale = true;
    }

    /** Drops every cache, for when the plugin is switched off. */
    clear(): void {
        this.mtimes.clear();
        this.opacities.clear();
        this.ranking = [];
        this.intensityRanking = [];
        this.recalculateRange();
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

        this.opacities.set(file.path, this.calculateOpacity(mtime, file.path));
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
        this.rebuildIntensityRanking();
        this.opacities.clear();
        for (const [path, mtime] of this.mtimes) {
            this.opacities.set(path, this.calculateOpacity(mtime, path));
        }

        this.opacitiesStale = false;
    }

    /**
     * The same curve, re-measured against a given set of notes.
     *
     * Filter a vault down to the brightest few per cent and every survivor is
     * at the top of the range together, which is the gradient telling you
     * nothing precisely when you have asked the most specific question. Spread
     * across what is left and the full range comes back.
     *
     * Two things keep it honest. It is only ever used for how bright to draw a
     * note, never for deciding which notes are in — the filter reads the
     * absolute scale, so this cannot feed itself. And the range is held open to
     * a floor, because three notes from the last ten minutes genuinely are all
     * recent, and drawing the nine-minute-old one as ancient would be a lie the
     * arithmetic told.
     *
     * Returns null when there is nothing worth spreading, and the caller keeps
     * the absolute numbers.
     */
    spreadAcross(paths: Iterable<string>, floorHours: number): Map<string, number> | null {
        // A half-life is measured against the calendar and nothing else.
        // Re-spreading it would undo the one property it exists for.
        if (this.getSettings().ageScale === 'halflife') {
            return null;
        }

        const present: [string, number][] = [];
        const times: number[] = [];

        for (const path of paths) {
            const mtime = this.mtimes.get(path);

            if (mtime !== undefined) {
                present.push([path, mtime]);
                times.push(mtime);
            }
        }

        if (present.length < SPREAD_FLOOR_NOTES) {
            return null;
        }

        times.sort((a, b) => a - b);

        const newest = times[times.length - 1];
        const floor = Math.max(0, floorHours) * MS_PER_HOUR;
        const oldest = Math.min(times[0], newest - floor);

        const spread: Spread = { oldest, newest, ranking: times };
        const spreadOut = new Map<string, number>();

        for (const [path, mtime] of present) {
            spreadOut.set(path, this.calculateOpacity(mtime, path, spread));
        }

        return spreadOut;
    }

    /**
     * How far either side of one note each of a set of notes was worked on.
     *
     * The same curve, with "how recent" replaced by "how close to this". A
     * local graph is a question about one note, and the useful question in it is
     * rarely how recent its neighbours are in absolute terms — it is which of
     * them you were in at the same time as the one in the middle. Both
     * directions count: a note written the day before the centre is as much
     * part of that sitting as one written the day after.
     *
     * Every age scale still means something here, because each of them is a way
     * of turning a gap in time into a gap in brightness and a distance is a
     * gap in time. A half-life needs no span at all, which is the one case this
     * can answer for a panel of two notes.
     *
     * Returns null when there is no centre to measure from or too little around
     * it to be worth measuring, and the caller keeps the absolute numbers.
     */
    aroundAnchor(paths: Iterable<string>, anchorPath: string, floorHours: number): Map<string, number> | null {
        const anchor = this.mtimes.get(anchorPath);

        if (anchor === undefined) {
            return null;
        }

        const present: [string, number][] = [];

        for (const path of paths) {
            const mtime = this.mtimes.get(path);

            if (mtime !== undefined) {
                present.push([path, Math.abs(mtime - anchor)]);
            }
        }

        if (present.length < SPREAD_FLOOR_NOTES) {
            return null;
        }

        const { ageScale, halfLifeDays } = this.getSettings();
        const span = anchorSpan(present.map(([, gap]) => gap), floorHours);

        // Ranked by distance rather than by date, so the notes nearest in time
        // to the centre are spread evenly across the range however lopsided
        // the gaps happen to be. Reversed, because a short distance is what
        // earns brightness here.
        const ranking = ageScale === 'rank' ? present.map(([, gap]) => gap).sort((a, b) => a - b) : [];

        const around = new Map<string, number>();

        for (const [path, gap] of present) {
            around.set(path, this.shapeInto(recencyAround(gap, span, ranking, ageScale, halfLifeDays, (g, r) => this.rankOf(g, r)), path));
        }

        return around;
    }

    /**
     * How far either side of the centre an anchored panel reaches, for saying
     * so in the caption. Null whenever `aroundAnchor` would also decline.
     */
    anchorSpan(paths: Iterable<string>, anchorPath: string, floorHours: number): number | null {
        const anchor = this.mtimes.get(anchorPath);

        if (anchor === undefined) {
            return null;
        }

        const gaps: number[] = [];

        for (const path of paths) {
            const mtime = this.mtimes.get(path);

            if (mtime !== undefined) {
                gaps.push(Math.abs(mtime - anchor));
            }
        }

        return gaps.length < SPREAD_FLOOR_NOTES ? null : anchorSpan(gaps, floorHours);
    }

    /** The most recently modified note, which the spotlight setting picks out. */
    newestPath(): string | undefined {
        return this.newestNotePath;
    }

    /**
     * The most recently modified notes, newest first.
     *
     * Selected in one pass rather than by sorting the vault, because this is
     * asked on every repaint and the answer is almost always a handful out of
     * thousands.
     */
    newestPaths(count: number): string[] {
        const wanted = Math.max(0, Math.floor(count));

        if (wanted <= 1) {
            return this.newestNotePath === undefined ? [] : [this.newestNotePath];
        }

        const best: [string, number][] = [];

        for (const [path, mtime] of this.mtimes) {
            if (best.length < wanted) {
                best.push([path, mtime]);
                best.sort((a, b) => b[1] - a[1]);
            } else if (mtime > best[best.length - 1][1]) {
                best[best.length - 1] = [path, mtime];
                best.sort((a, b) => b[1] - a[1]);
            }
        }

        return best.map(([path]) => path);
    }

    /**
     * The most recently modified of a given set of notes, newest first.
     *
     * The same question as `newestPaths`, asked of one graph rather than of the
     * vault. A local graph holds a dozen notes out of thousands, so the vault's
     * newest is almost never among them and a spotlight measured against the
     * vault has nothing to point at.
     *
     * Paths with no modification time are skipped: attachments and unresolved
     * links are graph nodes, but they are not notes and have no age to win on.
     */
    newestAmong(paths: Iterable<string>, count: number): string[] {
        const wanted = Math.max(0, Math.floor(count));

        if (wanted === 0) {
            return [];
        }

        const dated: [string, number][] = [];

        for (const path of paths) {
            const mtime = this.mtimes.get(path);

            if (mtime !== undefined) {
                dated.push([path, mtime]);
            }
        }

        dated.sort((a, b) => b[1] - a[1]);

        return dated.slice(0, wanted).map(([path]) => path);
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

    /**
     * What a note modified at this moment would be drawn at, against the range
     * the vault is currently measured over.
     *
     * Takes a timestamp rather than a path and caches nothing, because the
     * callers are asking about moments rather than notes: the settings preview
     * walks invented ages, and the history view asks about each past sitting
     * with a note, none of which is the note's own modification time.
     */
    opacityAt(mtime: number): number {
        return this.calculateOpacity(mtime);
    }

    cacheOpacityFor(path: string, mtime: number): number {
        const opacity = this.calculateOpacity(mtime, path);
        this.opacities.set(path, opacity);
        return opacity;
    }

    /**
     * The path is optional because the settings preview walks invented ages
     * that belong to no note. Without one there is no intensity to read, so the
     * preview shows the age curve alone — which is what it is for.
     */
    private calculateOpacity(mtime: number, path?: string, spread?: Spread): number {
        return this.shapeInto(this.recencyOf(mtime, spread), path);
    }

    /**
     * A 0-1 recency through the curve and onto the opacity range.
     *
     * Kept apart from where the recency came from, because not every one of
     * them is a position between an oldest and a newest note. An anchored
     * local graph measures a distance either side of one note instead, and
     * every setting from here on — the intensity blend, the curve, the two
     * opacity ends — applies to it exactly the same way.
     */
    private shapeInto(recency: number, path?: string): number {
        const { fadeType, minOpacity, maxOpacity, steepness, numSteps, intensityBlend } = this.getSettings();

        let shaped = recency;

        // Added to recency rather than multiplied by it. A product would make a
        // note with nothing on record vanish however recently it was edited,
        // which is every note for the first weeks after the history is switched
        // on. At a blend of 0 this is exactly the old behaviour, so the feature
        // being off by default falls out of the arithmetic.
        if (intensityBlend > 0 && path !== undefined) {
            shaped = (1 - intensityBlend) * shaped + intensityBlend * this.intensityOf(path);
        }

        const fade = shapeRecency(fadeType, shaped, { steepness, numSteps });

        return minOpacity + fade * (maxOpacity - minOpacity);
    }

    /**
     * How heavily a note has been worked on, as a 0-1 figure.
     *
     * Sitting counts are far more lopsided than dates: most notes have one or
     * two and a handful have dozens, so measuring against the busiest note
     * leaves almost everything at the bottom. Rank is the default for the same
     * reason it is the most useful age scale — it is the one a lopsided
     * distribution cannot flatten.
     */
    private intensityOf(path: string): number {
        const count = this.sittings(path);

        if (count <= 0) {
            return 0;
        }

        const { intensityScale } = this.getSettings();

        if (intensityScale === 'rank') {
            const places = this.intensityRanking.length;

            if (places <= 1) {
                return 1;
            }

            let low = 0;
            let high = places;

            while (low < high) {
                const middle = (low + high) >> 1;

                if (this.intensityRanking[middle] < count) {
                    low = middle + 1;
                } else {
                    high = middle;
                }
            }

            return low / (places - 1);
        }

        const busiest = this.intensityRanking.at(-1) ?? count;

        if (busiest <= 0) {
            return 0;
        }

        if (intensityScale === 'log') {
            return clamp(Math.log1p(count) / Math.log1p(busiest), 0, 1);
        }

        return clamp(count / busiest, 0, 1);
    }

    /** The sitting counts in order, which is what rank reads positions out of. */
    private rebuildIntensityRanking(): void {
        if (this.getSettings().intensityBlend <= 0) {
            this.intensityRanking = [];
            return;
        }

        const counts: number[] = [];

        for (const path of this.mtimes.keys()) {
            const count = this.sittings(path);

            if (count > 0) {
                counts.push(count);
            }
        }

        this.intensityRanking = counts.sort((a, b) => a - b);
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
    private recencyOf(mtime: number, spread?: Spread): number {
        const { ageScale } = this.getSettings();

        if (ageScale === 'rank') {
            return this.rankOf(mtime, spread?.ranking ?? this.ranking);
        }

        // Measured against the calendar rather than against the other notes,
        // which is the one scale nothing else in the vault can move. Every
        // other scale is relative: a single note from years ago stretches the
        // range and darkens everything, and deleting it brightens the whole
        // vault for no reason anyone would guess.
        if (ageScale === 'halflife') {
            return Math.pow(2, -days(this.anchor - mtime) / this.getSettings().halfLifeDays);
        }

        const { oldest, newest } = spread ?? this.normalizingRange();
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
    private rankOf(mtime: number, ranking: number[]): number {
        const places = ranking.length;
        if (places <= 1) {
            return 1;
        }

        // Lower bound, so notes sharing an mtime share a place.
        let low = 0;
        let high = places;

        while (low < high) {
            const middle = (low + high) >> 1;

            if (ranking[middle] < mtime) {
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

/**
 * The widest gap from the centre, held open to the same floor the vault spread
 * uses. Twelve notes all written within an hour of the centre genuinely were
 * all written around it, and drawing the one fifty minutes out as unrelated
 * would be a lie the arithmetic told.
 */
function anchorSpan(gaps: number[], floorHours: number): number {
    return Math.max(Math.max(...gaps), Math.max(0, floorHours) * MS_PER_HOUR);
}

/**
 * A distance from the centre as a 0-1 figure, 1 for the centre itself.
 *
 * Each branch is the same scale the vault uses, with a distance in place of a
 * position in a range. The subtraction from 1 is the whole difference: on this
 * measure it is closeness that earns brightness, not lateness.
 */
function recencyAround(
    gap: number,
    span: number,
    ranking: number[],
    ageScale: AgeScale,
    halfLifeDays: number,
    rank: (gap: number, ranking: number[]) => number
): number {
    if (ageScale === 'halflife') {
        return Math.pow(2, -days(gap) / halfLifeDays);
    }

    if (ageScale === 'rank') {
        return clamp(1 - rank(gap, ranking), 0, 1);
    }

    if (span <= 0) {
        return 1;
    }

    if (ageScale === 'log') {
        return clamp(1 - Math.log1p(days(gap)) / Math.log1p(days(span)), 0, 1);
    }

    return clamp(1 - gap / span, 0, 1);
}
