import { App, Menu, TFile } from 'obsidian';

/**
 * The notes you have chosen to keep an eye on, regardless of their dates.
 *
 * Everything else here grades a note by time, which answers "what have I been
 * working on" and nothing else. It cannot answer "where was that thing I need
 * to come back to", because the note you are heading towards is by definition
 * one you have not touched lately — the longer you leave it, the fainter the
 * graph draws it, right up until it is gone. A pin is the one place the user
 * overrules the clock.
 *
 * Pins are a list of paths rather than anything stored in the note, so pinning
 * writes nothing into a vault and leaves no frontmatter behind. The cost of that
 * is that a path is not an identity: a note moved by something that does not
 * announce it keeps its pin only because the rename event is listened for.
 */
export class Pins {
    private paths = new Set<string>();

    constructor(private readonly save: (paths: string[]) => void) {}

    /**
     * Takes the stored list, dropping anything the vault no longer has.
     *
     * A pin on a note that was deleted while the plugin was off would otherwise
     * sit in the list for good, un-unpinnable from the settings tab because
     * nothing draws a row for a file that is not there.
     */
    load(stored: readonly string[], app: App): void {
        this.paths = new Set(stored.filter((path) => app.vault.getAbstractFileByPath(path) instanceof TFile));

        if (this.paths.size !== stored.length) {
            this.persist();
        }
    }

    has(path: string): boolean {
        return this.paths.has(path);
    }

    get size(): number {
        return this.paths.size;
    }

    /** The live set, for the per-node loop. Not to be held across a change. */
    all(): ReadonlySet<string> {
        return this.paths;
    }

    /** Sorted, for anything a person reads. */
    list(): string[] {
        return [...this.paths].sort((left, right) => left.localeCompare(right));
    }

    /** Returns what the pin became, so a caller can say which way it went. */
    toggle(path: string): boolean {
        const pinned = !this.paths.has(path);

        if (pinned) {
            this.paths.add(path);
        } else {
            this.paths.delete(path);
        }

        this.persist();
        return pinned;
    }

    remove(path: string): void {
        if (this.paths.delete(path)) {
            this.persist();
        }
    }

    clear(): void {
        if (this.paths.size > 0) {
            this.paths.clear();
            this.persist();
        }
    }

    /**
     * Follows a note that moved. Without this a pin is silently lost by the one
     * action most likely to happen to a note you are keeping for later: filing
     * it somewhere permanent.
     */
    rename(oldPath: string, newPath: string): void {
        if (this.paths.delete(oldPath)) {
            this.paths.add(newPath);
            this.persist();
        }
    }

    forget(path: string): void {
        this.remove(path);
    }

    private persist(): void {
        this.save([...this.paths]);
    }
}

/**
 * Adds the pin item to a file menu.
 *
 * Obsidian's graph fires the public `file-menu` event when a node is
 * right-clicked, with a source of `graph-context-menu`, so one listener puts the
 * item on a graph node and in the file explorer both — no part of the renderer
 * needs patching to reach it. The alternative was wrapping the renderer's own
 * `onNodeRightClick`, which builds and shows its menu in one synchronous call
 * and so leaves nothing to add to.
 */
export function addPinMenuItem(menu: Menu, path: string, pinned: boolean, toggle: () => void): void {
    menu.addItem((item) => {
        item.setTitle(pinned ? 'Unpin from the graph' : 'Pin in the graph')
            .setIcon(pinned ? 'pin-off' : 'pin')
            .setSection('pulsar')
            .onClick(toggle);
    });
}
