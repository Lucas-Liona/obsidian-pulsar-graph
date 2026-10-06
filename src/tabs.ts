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
 * It is not persisted. "How long since you looked at this" is a fact about a
 * session, and carrying it across a restart would claim knowledge of time the
 * app was not running for. Everything open at load starts level and diverges as
 * you work.
 */
export class Attention {
    private readonly seen = new Map<string, number>();

    constructor(private readonly app: App) {}

    /** Starts everything already open at the same point, which is now. */
    seed(): void {
        const now = Date.now();

        this.app.workspace.iterateAllLeaves((leaf) => {
            const path = pathOf(leaf);

            if (path !== undefined && !this.seen.has(path)) {
                this.seen.set(path, now);
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

export interface TabFadeOptions {
    mode: TabFade;
    /** Minutes of being ignored before a tab is as faint as it will get. */
    after: number;
    /** How faint that is. A tab you cannot read is a tab you cannot get back to. */
    floor: number;
    /** A note's brightness in the graph, for keeping the two in step. */
    graphStrength: (path: string) => number | undefined;
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

    constructor(private readonly app: App, private readonly attention: Attention) {}

    apply(options: TabFadeOptions): void {
        if (options.mode === 'off') {
            this.clear();
            return;
        }

        this.app.workspace.iterateAllLeaves((leaf) => {
            const path = pathOf(leaf);
            const header = (leaf as LeafWithTab).tabHeaderEl;

            if (path === undefined || !header) {
                return;
            }

            this.paint(header, this.strengthFor(path, options));
        });
    }

    /** Hands every tab its appearance back. */
    clear(): void {
        for (const part of this.touched) {
            part.style.removeProperty('opacity');
        }

        this.touched.clear();
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
        for (const selector of ['.workspace-tab-header-inner-icon', '.workspace-tab-header-inner-title']) {
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
