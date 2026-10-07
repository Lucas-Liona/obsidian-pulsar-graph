import { App, WorkspaceLeaf } from 'obsidian';

/** The tab a leaf is drawn in. Not part of the public type, but always there. */
interface LeafWithTab extends WorkspaceLeaf {
    tabHeaderEl?: HTMLElement;
    view: WorkspaceLeaf['view'] & { file?: { path?: string } };
}

const MS_PER_MINUTE = 60 * 1000;

export type TabFade = 'off' | 'attention' | 'modified';

/** Whether the dimming takes the icon and title, or the whole tab with them. */
export type TabFadeScope = 'title' | 'tab';

/**
 * Whether a tab slides down to its faintest across the whole span, or holds
 * full strength and drops at the end of it. Both are useful and they answer
 * different questions: a gradient reads as "how long ago", a step reads as
 * "past the line or not".
 */
export type TabFadeCurve = 'over' | 'at';

/** How a tab that has gone quiet is marked. */
export type StaleMark = 'line' | 'zzz';

/**
 * How long since you last looked at each note.
 *
 * This is deliberately not a note's modification time. For a tab the question
 * is not when the file was last written but when you last had your eyes on it,
 * and an hour is a long time for something sitting open in front of you. Nothing
 * in Obsidian records that, so it is kept here.
 *
 * It survives a restart, but the time the app was shut does not count. Being
 * away from Obsidian for a week is not a week of ignoring a note, so the stored
 * gaps are frozen while it is closed and resume where they left off. A note
 * with nothing on record starts level with the rest, which is now.
 */
export class Attention {
    private readonly seen = new Map<string, number>();
    /** The note in front, which is being looked at for as long as it stays there. */
    private current: string | null = null;

    constructor(private readonly app: App) {}

    /**
     * Starts everything already open from what was last written down, falling
     * back to now for anything with no record.
     */
    seed(stored: (path: string) => number | undefined): void {
        const now = Date.now();

        this.app.workspace.iterateAllLeaves((leaf) => {
            const path = pathOf(leaf);

            if (path !== undefined && !this.seen.has(path)) {
                this.seen.set(path, Math.min(now, stored(path) ?? now));
            }
        });
    }

    /**
     * Moves attention to a note, or away from every note, and returns the note
     * left behind if there was one. Both are stamped: the one arrived at
     * because it is being looked at, and the one left because it was being
     * looked at until now. Stamping only on arrival read a note sat in for
     * fifteen minutes as fifteen minutes ignored the moment it was left.
     */
    focus(path: string | null): string | null {
        const now = Date.now();
        const left = this.current !== null && this.current !== path ? this.current : null;

        if (left !== null) {
            this.seen.set(left, now);
        }

        if (path !== null) {
            this.seen.set(path, now);
        }

        this.current = path;
        return left;
    }

    forget(path: string): void {
        this.seen.delete(path);

        // A deleted or renamed note is not one to stamp on the way out.
        if (this.current === path) {
            this.current = null;
        }
    }

    /**
     * Minutes since you last looked. The note you are in is always zero: it is
     * being looked at right now, however long you have been sitting in it.
     */
    minutesSince(path: string): number | undefined {
        if (this.app.workspace.getActiveFile()?.path === path) {
            return 0;
        }

        const seen = this.seen.get(path);
        return seen === undefined ? undefined : (Date.now() - seen) / MS_PER_MINUTE;
    }
}

/** The class the dot carries, so it can be found again and taken away. */
const DOT_CLASS = 'pulsar-graph-tab-dot';

/** The class a tab wears once it has gone quiet long enough to be let go. */
const STALE_CLASS = 'pulsar-graph-tab-stale';

/** Worn alongside it when the mark is a 💤 rather than a line. */
const ZZZ_CLASS = 'pulsar-graph-tab-zzz';

/** The class a dimmed tab wears, so the stylesheet decides what dims. */
const FADED_CLASS = 'pulsar-graph-tab-faded';

/** Worn alongside it when the whole tab dims rather than its icon and title. */
const WHOLE_CLASS = 'pulsar-graph-tab-whole';

/**
 * How faint, as a custom property rather than as an opacity.
 *
 * Setting the strength itself inline would win against every rule in the
 * stylesheet, and two things depend on a rule being able to beat it: the close
 * button has to stay usable when the whole tab dims, and hovering a faded tab
 * has to bring it back. A variable the stylesheet reads gives both for free.
 */
const FADE_VAR = '--pulsar-tab-fade';

export interface TabFadeOptions {
    mode: TabFade;
    /** Whether the icon and title dim, or the whole tab does. */
    scope: TabFadeScope;
    /** Whether it slides down across `after`, or drops at the end of it. */
    curve: TabFadeCurve;
    /** Shows a filled circle beside each title at that note's own brightness. */
    dot: boolean;
    /**
     * What to paint one note's dot, or null to leave it the stylesheet's
     * colour. The tab bar is the one place a pin can be seen without opening
     * the graph, and a pinned note held at full brightness with nothing to say
     * why reads as one edited this morning — which is the whole reason the
     * graph marks it.
     */
    dotColor: (path: string) => string | null;
    /** Minutes of being ignored before a tab is as faint as it will get. */
    after: number;
    /** How faint that is. A tab you cannot read is a tab you cannot get back to. */
    floor: number;
    /** A note's brightness in the graph, for keeping the two in step. */
    graphStrength: (path: string) => number | undefined;
    /** Minutes of being ignored before a tab is marked as closeable. */
    stale: number | null;
    /** What that mark looks like. */
    staleMark: StaleMark;
}

/**
 * Dims a tab the longer it goes untouched, so the tab bar reads as attention
 * rather than as a pile of things opened once.
 *
 * Either the icon and title dim, or the whole tab does, which is a question of
 * taste and so a setting. Either way hovering a faded tab brings it back to
 * full strength: a tab too faint to read is one you cannot get back to, and a
 * whole tab dimmed to a tenth takes its close button down with it.
 */
export class TabFading {
    private readonly faded = new Set<HTMLElement>();
    private readonly dots = new Set<HTMLElement>();
    private readonly staled = new Set<HTMLElement>();

    constructor(private readonly app: App, private readonly attention: Attention) {}

    apply(options: TabFadeOptions): void {
        if (options.mode === 'off' && !options.dot && options.stale === null) {
            this.clear();
            return;
        }

        if (options.mode === 'off') {
            for (const header of [...this.faded]) {
                this.unpaint(header);
            }
        }

        this.app.workspace.iterateAllLeaves((leaf) => {
            const path = pathOf(leaf);
            const header = (leaf as LeafWithTab).tabHeaderEl;

            if (path === undefined || !header) {
                return;
            }

            // Nothing in the sidebar is a tab in the sense this feature means.
            // The outline, backlinks, local graph and a Bases view each report a
            // file of their own, so without this the sidebar's own tabs dim,
            // grow dots and get offered up for closing — and the file they
            // report is not even always the one being looked at, which is why
            // they appeared to change at random.
            if (leaf.getRoot() !== this.app.workspace.rootSplit) {
                this.reset(header);
                return;
            }

            if (options.mode !== 'off') {
                this.paint(header, this.strengthFor(path, options), options.scope);
            }

            this.markDot(header, path, options);

            const pinned = leaf.getViewState().pinned === true;

            this.markStale(header, path, pinned ? null : options.stale, options.staleMark);
        });
    }

    /**
     * Hands one tab its appearance back, for a header that should never have
     * been touched. Needed on upgrade as much as at runtime: a sidebar panel
     * dimmed by an earlier version keeps that inline opacity until something
     * takes it off.
     */
    private reset(header: HTMLElement): void {
        this.unpaint(header);

        const dot = header.querySelector<HTMLElement>(`.${DOT_CLASS}`);

        if (dot) {
            this.dots.delete(dot);
            dot.remove();
        }

        if (this.staled.delete(header)) {
            this.unmark(header);
        }
    }

    /** Hands every tab its appearance back. */
    clear(): void {
        for (const header of [...this.faded]) {
            this.unpaint(header);
        }

        this.clearDots();

        for (const header of this.staled) {
            this.unmark(header);
        }

        this.staled.clear();
    }

    /**
     * Marks a tab that has gone quiet long enough to be worth closing. Marking
     * only: a tab that shuts itself feels like data loss even when nothing is
     * lost, and it is the plugin that gets blamed for losing someone's place.
     * Closing them is a command the user runs.
     *
     * A pinned tab is never marked. Pinning is a deliberate statement that it
     * should stay, and offering to close it argues with the user.
     */
    private markStale(header: HTMLElement, path: string, after: number | null, mark: StaleMark): void {
        if (after === null) {
            if (this.staled.delete(header)) {
                this.unmark(header);
            }

            return;
        }

        const minutes = this.attention.minutesSince(path);

        if (minutes !== undefined && minutes >= after) {
            header.addClass(STALE_CLASS);
            header.toggleClass(ZZZ_CLASS, mark === 'zzz');
            this.staled.add(header);
            return;
        }

        this.unmark(header);
        this.staled.delete(header);
    }

    private unmark(header: HTMLElement): void {
        header.removeClass(STALE_CLASS);
        header.removeClass(ZZZ_CLASS);
    }

    private clearDots(): void {
        for (const dot of this.dots) {
            dot.remove();
        }

        this.dots.clear();
    }

    /**
     * A filled circle beside the title, at the brightness that note has in the
     * graph. It is the cheapest way to put the idea in front of someone who
     * never opens the graph, and it reads at a glance where a date does not.
     */
    private markDot(header: HTMLElement, path: string, options: TabFadeOptions): void {
        const existing = header.querySelector<HTMLElement>(`.${DOT_CLASS}`);

        if (!options.dot) {
            existing?.remove();
            return;
        }

        const strength = options.graphStrength(path);
        if (strength === undefined) {
            existing?.remove();
            return;
        }

        const inner = header.querySelector('.workspace-tab-header-inner-title');
        if (!inner?.parentElement) {
            return;
        }

        const dot = existing ?? inner.parentElement.createDiv({ cls: DOT_CLASS });

        // Only moved when it is actually in the wrong place.
        // insertAdjacentElement detaches and re-inserts even when the node is
        // already where it is being put, and a single tab switch runs three
        // passes over every tab: 42 needless re-insertions, counted with a
        // MutationObserver, which is what the flickering was.
        if (inner.nextElementSibling !== dot) {
            inner.insertAdjacentElement('afterend', dot);
        }

        dot.style.opacity = clamp(strength, 0, 1).toFixed(3);

        // The colour belongs to the stylesheet, never to currentColor: that
        // inherits the tab header's own text colour, which Obsidian sets muted
        // for an inactive tab and normal for the active one. Every dot but the
        // one you were sitting in came out the same shade of grey.
        const colour = options.dotColor(path);

        if (colour === null) {
            dot.style.removeProperty('background-color');
        } else {
            dot.style.backgroundColor = colour;
        }

        this.dots.add(dot);
    }

    private strengthFor(path: string, options: TabFadeOptions): number {
        if (options.mode === 'modified') {
            const strength = options.graphStrength(path);
            return strength === undefined ? 1 : clamp(strength, options.floor, 1);
        }

        const minutes = this.attention.minutesSince(path);
        if (minutes === undefined) {
            return 1;
        }

        if (options.curve === 'at') {
            return minutes >= options.after ? options.floor : 1;
        }

        const spent = options.after <= 0 ? 1 : Math.min(1, minutes / options.after);
        return clamp(1 - spent * (1 - options.floor), options.floor, 1);
    }

    private paint(header: HTMLElement, strength: number, scope: TabFadeScope): void {
        if (strength >= 1) {
            this.unpaint(header);
            return;
        }

        header.addClass(FADED_CLASS);
        header.toggleClass(WHOLE_CLASS, scope === 'tab');
        header.style.setProperty(FADE_VAR, strength.toFixed(3));
        this.faded.add(header);
    }

    private unpaint(header: HTMLElement): void {
        header.removeClass(FADED_CLASS);
        header.removeClass(WHOLE_CLASS);
        header.style.removeProperty(FADE_VAR);
        this.faded.delete(header);
    }
}

function pathOf(leaf: WorkspaceLeaf): string | undefined {
    const file = (leaf as LeafWithTab).view.file;
    return typeof file?.path === 'string' ? file.path : undefined;
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(Math.max(value, lowest), highest);
}
