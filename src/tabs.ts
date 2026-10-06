import { App, WorkspaceLeaf } from 'obsidian';

/** The tab a leaf is drawn in. Not part of the public type, but always there. */
interface LeafWithTab extends WorkspaceLeaf {
    tabHeaderEl?: HTMLElement;
    view: WorkspaceLeaf['view'] & { file?: { path?: string } };
}

const MS_PER_MINUTE = 60 * 1000;

export type TabFade = 'off' | 'attention' | 'modified';

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

    touch(path: string): void {
        this.seen.set(path, Date.now());
    }

    forget(path: string): void {
        this.seen.delete(path);
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

/**
 * What a dimmed tab dims. The close button is left out: the whole point of
 * noticing a stale tab is being able to act on it.
 */
const FADED = ['.workspace-tab-header-inner-icon', '.workspace-tab-header-inner-title'];

export interface TabFadeOptions {
    mode: TabFade;
    /** Shows a filled circle beside each title at that note's own brightness. */
    dot: boolean;
    /** What the newest note's dot is painted, when the spotlight is on. */
    spotlight: { path: string | undefined; color: string } | null;
    /** Minutes of being ignored before a tab is as faint as it will get. */
    after: number;
    /** How faint that is. A tab you cannot read is a tab you cannot get back to. */
    floor: number;
    /** A note's brightness in the graph, for keeping the two in step. */
    graphStrength: (path: string) => number | undefined;
    /** Minutes of being ignored before a tab is marked as closeable. */
    stale: number | null;
}

/**
 * Dims a tab the longer it goes untouched, so the tab bar reads as attention
 * rather than as a pile of things opened once.
 *
 * Only the icon and the title are dimmed. The close button keeps its full
 * strength, because the whole point of noticing a stale tab is being able to
 * act on it.
 */
export class TabFading {
    private readonly touched = new Set<HTMLElement>();
    private readonly dots = new Set<HTMLElement>();
    private readonly staled = new Set<HTMLElement>();

    constructor(private readonly app: App, private readonly attention: Attention) {}

    apply(options: TabFadeOptions): void {
        if (options.mode === 'off' && !options.dot && options.stale === null) {
            this.clear();
            return;
        }

        if (options.mode === 'off') {
            for (const part of this.touched) {
                part.style.removeProperty('opacity');
            }

            this.touched.clear();
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
                this.paint(header, this.strengthFor(path, options));
            }

            this.markDot(header, path, options);

            const pinned = leaf.getViewState().pinned === true;

            this.markStale(header, path, pinned ? null : options.stale);
        });
    }

    /**
     * Hands one tab its appearance back, for a header that should never have
     * been touched. Needed on upgrade as much as at runtime: a sidebar panel
     * dimmed by an earlier version keeps that inline opacity until something
     * takes it off.
     */
    private reset(header: HTMLElement): void {
        for (const selector of FADED) {
            const part = header.querySelector<HTMLElement>(selector);

            if (part) {
                part.style.removeProperty('opacity');
                this.touched.delete(part);
            }
        }

        const dot = header.querySelector<HTMLElement>(`.${DOT_CLASS}`);

        if (dot) {
            this.dots.delete(dot);
            dot.remove();
        }

        if (this.staled.delete(header)) {
            header.removeClass(STALE_CLASS);
        }
    }

    /** Hands every tab its appearance back. */
    clear(): void {
        for (const part of this.touched) {
            part.style.removeProperty('opacity');
        }

        this.touched.clear();
        this.clearDots();

        for (const header of this.staled) {
            header.removeClass(STALE_CLASS);
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
    private markStale(header: HTMLElement, path: string, after: number | null): void {
        if (after === null) {
            if (this.staled.delete(header)) {
                header.removeClass(STALE_CLASS);
            }

            return;
        }

        const minutes = this.attention.minutesSince(path);

        if (minutes !== undefined && minutes >= after) {
            header.addClass(STALE_CLASS);
            this.staled.add(header);
            return;
        }

        header.removeClass(STALE_CLASS);
        this.staled.delete(header);
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
        if (options.spotlight && options.spotlight.path === path) {
            dot.style.backgroundColor = options.spotlight.color;
        } else {
            dot.style.removeProperty('background-color');
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

        const spent = options.after <= 0 ? 1 : Math.min(1, minutes / options.after);
        return clamp(1 - spent * (1 - options.floor), options.floor, 1);
    }

    private paint(header: HTMLElement, strength: number): void {
        for (const selector of FADED) {
            const part = header.querySelector<HTMLElement>(selector);

            if (part) {
                part.style.opacity = strength >= 1 ? '' : strength.toFixed(3);
                this.touched.add(part);
            }
        }
    }
}

function pathOf(leaf: WorkspaceLeaf): string | undefined {
    const file = (leaf as LeafWithTab).view.file;
    return typeof file?.path === 'string' ? file.path : undefined;
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(Math.max(value, lowest), highest);
}
