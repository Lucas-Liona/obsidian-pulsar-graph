import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { formatAge } from './age';
import { Bead } from './history';

export const BEAD_VIEW_TYPE = 'pulsar-history';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How tall the rail is, in pixels. Fixed rather than filling the pane, because
 * the position of a bead means something — it is where that sitting falls in
 * the vault's history — and a rail that resized would move every bead whenever
 * the sidebar did.
 */
const RAIL_HEIGHT = 420;

/** Kept clear at each end so a bead at the very edge is still a whole circle. */
const RAIL_INSET = 14;

/** A bead's diameter at its smallest and largest, by how long the sitting ran. */
const BEAD_SMALLEST = 7;
const BEAD_LARGEST = 20;

/** A sitting at or above this length draws at full size. */
const LONGEST_SITTING = 2 * HOUR;

/**
 * How faint the oldest bead is allowed to get.
 *
 * The graph can afford to take a node to nearly nothing, because a thousand
 * other nodes carry the picture and a faint one is *receding* rather than
 * missing. Seven beads on a rail cannot: at the vault's own opacity the oldest
 * three drew at 0.099 and were, in practice, not there — and a bead you cannot
 * see is a bead you cannot hover for its date. The order still reads; only the
 * bottom of the range is lifted.
 */
const BEAD_FAINTEST = 0.35;

/**
 * Everything the view needs from the plugin, passed in rather than reached for.
 * The view knows how to draw a history and nothing about where one comes from.
 */
export interface BeadSource {
    beadsFor: (path: string) => readonly Bead[];
    /** Whether the record is being kept at all. */
    recording: () => boolean;
    /** What a note modified at that moment would be drawn at. */
    opacityAt: (at: number) => number;
}

/**
 * A note's history, drawn as beads down the sidebar.
 *
 * Obsidian keeps one modification time per note and throws the rest away, so
 * the graph can tell you a note was touched this morning and never that it was
 * touched every morning for a month and then abandoned. This is that second
 * thing: one bead per sitting, down a rail, positioned by when it happened.
 *
 * Positioned, not listed. A list of dates is easier to draw and answers a
 * different question — the whole point is the shape, which is what tells
 * "edited three times today" from "appended to once a month" without reading a
 * single number. Beads bunch where you were busy and leave gaps where you were
 * not, and the gaps say as much as the beads.
 */
export class BeadView extends ItemView {
    private path: string | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly source: BeadSource) {
        super(leaf);
    }

    getViewType(): string {
        return BEAD_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Note history';
    }

    getIcon(): string {
        return 'history';
    }

    /** Which note is being shown, so the plugin can redraw only when it needs to. */
    showing(): string | null {
        return this.path;
    }

    /**
     * Draws a note's history, or the reason there is none to draw.
     *
     * A null path is not an error state: with no note open there is nothing to
     * show a history of, and saying so is better than an empty rail that looks
     * like a note with no history.
     */
    render(path: string | null, name: string | null): void {
        this.path = path;

        const root = this.contentEl;
        root.empty();
        root.addClass('pulsar-graph-history');

        if (!this.source.recording()) {
            this.sayNothing(root, 'The edit history is switched off', 'Pulsar keeps its own record of when each note was worked on, because Obsidian keeps only the most recent time. Switch it on in the settings and this fills in as you work.');
            return;
        }

        if (path === null || name === null) {
            this.sayNothing(root, 'No note open', 'Open a note to see when it was worked on.');
            return;
        }

        root.createDiv({ cls: 'pulsar-graph-history-title', text: name });

        const beads = this.source.beadsFor(path);

        if (beads.length === 0) {
            this.sayNothing(root, 'Nothing recorded yet', 'This note has not been edited since the history started. It fills in as you work, and the settings can import what Obsidian’s own file recovery already holds.');
            return;
        }

        this.drawSummary(root, beads);
        this.drawRail(root, beads);
    }

    private sayNothing(root: HTMLElement, title: string, about: string): void {
        const empty = root.createDiv({ cls: 'pulsar-graph-history-empty' });
        empty.createDiv({ cls: 'pulsar-graph-history-empty-title', text: title });
        empty.createDiv({ text: about });
    }

    private drawSummary(root: HTMLElement, beads: readonly Bead[]): void {
        const now = Date.now();
        const first = beads[0];
        const grown = beads.reduce((total, bead) => total + (bead.sizeEnd - bead.sizeStart), 0);

        const parts = [
            `${beads.length} ${beads.length === 1 ? 'sitting' : 'sittings'}`,
            `first ${formatAge(first.start, now)}`
        ];

        // Only worth saying when some sitting was watched happen. An imported
        // one carries no sizes, so a vault of those would read as 0 bytes.
        if (grown !== 0) {
            parts.push(`${grown > 0 ? '+' : '−'}${formatBytes(Math.abs(grown))}`);
        }

        root.createDiv({ cls: 'pulsar-graph-history-summary', text: parts.join(' · ') });
    }

    /**
     * The rail, newest at the top, each bead where its sitting falls.
     *
     * Measured across **this note's own history**, not the vault's. Against the
     * vault the view collapses: a note worked on three times this morning, in a
     * vault with a year of history in it, puts all three beads inside the same
     * pixel — measured, two sittings three hours apart both landed at 14px — and
     * the shape the view exists to show is gone. One note is the subject here,
     * so one note is the scale, and the axis labels say which span that is so a
     * rail covering twenty minutes cannot be mistaken for one covering a year.
     *
     * Colour still comes from the vault-wide curve, so a bead's brightness is
     * the brightness the graph is drawing that note at. Position answers "when,
     * within this note's life"; brightness answers "how old, in the vault".
     */
    private drawRail(root: HTMLElement, beads: readonly Bead[]): void {
        const now = Date.now();
        const rail = root.createDiv({ cls: 'pulsar-graph-history-rail' });

        const first = beads[0].end;
        const last = beads[beads.length - 1].end;
        const usable = RAIL_HEIGHT - RAIL_INSET * 2;

        // One sitting, or several ending inside one instant, has no span to
        // draw across. A label at the bottom of an empty rail would suggest a
        // gap that is not there, and so would the rail, so it is one bead
        // high and says the one thing it knows.
        const spans = last > first;
        rail.style.height = `${spans ? RAIL_HEIGHT : RAIL_INSET * 2}px`;
        rail.toggleClass('is-single', !spans);

        rail.createDiv({ cls: 'pulsar-graph-history-tick is-top', text: formatAge(last, now) });

        if (spans) {
            rail.createDiv({ cls: 'pulsar-graph-history-tick is-bottom', text: formatAge(first, now) });
        }

        const placed = placeBeads(beads);

        for (const [index, bead] of beads.entries()) {
            const along = placed[index];
            const size = beadSize(bead);

            const dot = rail.createDiv({ cls: 'pulsar-graph-history-bead' });
            dot.style.top = `${RAIL_INSET + (1 - clamp01(along)) * usable}px`;
            dot.style.width = `${size}px`;
            dot.style.height = `${size}px`;
            const strength = BEAD_FAINTEST + clamp01(this.source.opacityAt(bead.end)) * (1 - BEAD_FAINTEST);
            dot.style.opacity = strength.toFixed(3);
            dot.setAttr('aria-label', describe(bead, now));
        }
    }
}

/**
 * Where each bead falls on the rail, from 0 at the bottom to 1 at the top.
 *
 * A bead is placed by when its sitting ended. That is the same moment a note's
 * own modification time records, so the topmost bead and the note's node in the
 * graph are talking about the same thing — and it is why the rail is measured
 * from the first sitting's end as well. Measured from its start, the bottom of
 * every rail was a moment nothing was drawn at: a note with one forty-minute
 * sitting got its bead at the top, an empty rail under it, and a label at the
 * bottom for when that same sitting began.
 */
export function placeBeads(beads: readonly Bead[]): number[] {
    if (beads.length === 0) {
        return [];
    }

    const first = beads[0].end;
    const span = beads[beads.length - 1].end - first;

    return beads.map((bead) => span > 0 ? (bead.end - first) / span : 1);
}

/**
 * How long the sitting ran, as a diameter.
 *
 * Duration rather than how much was written, because a bead is a picture of
 * time spent and because an imported sitting has no sizes to read. A sitting
 * recorded from a single write has no duration at all and still has to be
 * visible, which is what the floor is for.
 */
function beadSize(bead: Bead): number {
    const spent = clamp01((bead.end - bead.start) / LONGEST_SITTING);

    // Square-rooted, because most sittings are short and a linear reading puts
    // nearly all of them on the floor: three minutes against a two-hour top end
    // is 2.5% of the range, which came out a third of a pixel bigger than a
    // single write. The root spends the size channel where the sittings are.
    return BEAD_SMALLEST + Math.sqrt(spent) * (BEAD_LARGEST - BEAD_SMALLEST);
}

/** What a bead says when hovered: when, how long, and what it did to the note. */
function describe(bead: Bead, now: number): string {
    const parts = [formatAge(bead.end, now)];
    const ran = bead.end - bead.start;

    if (ran >= MINUTE) {
        parts.push(`${formatDuration(ran)} of writing`);
    }

    const grew = bead.sizeEnd - bead.sizeStart;

    if (grew !== 0) {
        parts.push(`${grew > 0 ? '+' : '−'}${formatBytes(Math.abs(grew))}`);
    }

    return parts.join(' · ');
}

function formatDuration(span: number): string {
    if (span >= DAY) {
        return `${Math.round(span / DAY)}d`;
    }

    if (span >= HOUR) {
        const hours = span / HOUR;
        return `${hours >= 10 ? Math.round(hours) : hours.toFixed(1)}h`;
    }

    return `${Math.max(1, Math.round(span / MINUTE))}m`;
}

function formatBytes(size: number): string {
    return size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${Math.round(size)} B`;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** The note a leaf is showing, for keeping the view pointed at the right one. */
export function fileOf(leaf: WorkspaceLeaf | null): TFile | null {
    const file = (leaf?.view as { file?: TFile } | undefined)?.file;
    return file instanceof TFile && file.extension === 'md' ? file : null;
}
