import { ItemView, TFile, WorkspaceLeaf } from 'obsidian';
import { formatAge } from './age';
import { Bead } from './history';

export const BEAD_VIEW_TYPE = 'pulsar-history';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

/**
 * Where a year back falls on the rail, in pixels: the height the whole rail
 * used to be, so a year of history is as tall as it was. Fixed rather than
 * filling the pane, because the position of a bead means something, and a
 * rail that resized would move every bead whenever the sidebar did.
 */
const YEAR_PX = 420;

/**
 * The age the axis is logarithmic over: it runs as `log(1 + age / unit)`, so
 * anything much younger than this is close to linear and anything much older
 * is logarithmic.
 *
 * Five minutes. At one minute the first hour took 131 px of the 420 a year
 * gets, and a sitting five minutes old already sat 57 px down, so the minutes
 * just gone ate the rail. At ten, the first five minutes got 16 px and a
 * sitting just finished sat on top of the "now" label. At five, five minutes
 * is 25 px, an hour 93, a day 206, a week 276, a month 329 and a year 420.
 */
const AXIS_UNIT = 5 * MINUTE;

/**
 * The ages the rail is labelled at. Past a year the log squeezes each further
 * year into a few pixels (2 and 3 years are 15 px apart), so the labels thin
 * out rather than land on each other.
 */
const TICKS: readonly { age: number; label: string }[] = [
    { age: 0, label: 'now' },
    { age: HOUR, label: '1 hour' },
    { age: DAY, label: '1 day' },
    { age: 7 * DAY, label: '1 week' },
    { age: 30 * DAY, label: '1 month' },
    { age: YEAR, label: '1 year' },
    { age: 2 * YEAR, label: '2 years' },
    { age: 5 * YEAR, label: '5 years' },
    { age: 10 * YEAR, label: '10 years' },
    { age: 20 * YEAR, label: '20 years' }
];

/**
 * How often an open view redraws itself while nothing else asks it to. A
 * bead's place is its age, and ages grow: one drawn at five minutes old is at
 * 25 px, and an hour later belongs at 93. A minute moves a bead within the
 * first hour by a few pixels at most, and a redraw costs about a tenth of a
 * millisecond.
 */
const REDRAW_MS = 60 * 1000;

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
    private name: string | null = null;

    constructor(leaf: WorkspaceLeaf, private readonly source: BeadSource) {
        super(leaf);
    }

    async onOpen(): Promise<void> {
        // Only while the view is open, since a registered interval is cleared
        // when it closes, and only while it is on screen. Nothing changes but
        // the clock, so it redraws what it already shows.
        this.registerInterval(window.setInterval(() => {
            if (this.path !== null && this.containerEl.isShown()) {
                this.render(this.path, this.name);
            }
        }, REDRAW_MS));
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
        this.name = name;

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
     * **One scale for every note**, logarithmic back from now. Each note used
     * to be scaled to its own history, which kept a busy morning from
     * collapsing into a pixel but made a rail covering twenty minutes look
     * exactly like one covering a year. On a log axis this morning still
     * spreads out, since the first hour is 93 px and the first day 206, while
     * a year is 420 px in every note, so two notes can be compared at a glance.
     * The trade is at the old end: a month of daily sittings a year ago spans
     * about 3 px.
     *
     * The rail runs from now to the first labelled age at or past the oldest
     * sitting, so a short history stays short and the scale stays the same.
     *
     * Colour still comes from the vault-wide curve, so a bead's brightness is
     * the brightness the graph is drawing that note at.
     */
    private drawRail(root: HTMLElement, beads: readonly Bead[]): void {
        const now = Date.now();
        const layout = layoutRail(beads, now);
        const rail = root.createDiv({ cls: 'pulsar-graph-history-rail' });
        rail.style.height = `${layout.length + RAIL_INSET * 2}px`;
        rail.style.setProperty('--pulsar-rail-inset', `${RAIL_INSET}px`);

        for (const tick of layout.ticks) {
            const label = rail.createDiv({ cls: 'pulsar-graph-history-tick', text: tick.label });
            label.style.top = `${RAIL_INSET + tick.at}px`;
        }

        for (const [index, bead] of beads.entries()) {
            const size = beadSize(bead);

            const dot = rail.createDiv({ cls: 'pulsar-graph-history-bead' });
            dot.style.top = `${RAIL_INSET + layout.beads[index]}px`;
            dot.style.width = `${size}px`;
            dot.style.height = `${size}px`;
            const strength = BEAD_FAINTEST + clamp01(this.source.opacityAt(bead.end)) * (1 - BEAD_FAINTEST);
            dot.style.opacity = strength.toFixed(3);
            dot.setAttr('aria-label', describe(bead, now));
        }
    }
}

/**
 * How far down the rail something that long ago falls, in pixels from now.
 * The same for every note. Anything in the future, from a clock that moved,
 * sits at now.
 */
export function axisOffset(age: number): number {
    return YEAR_PX * Math.log1p(Math.max(0, age) / AXIS_UNIT) / Math.log1p(YEAR / AXIS_UNIT);
}

export interface RailLayout {
    /** Each bead's distance down from now, in the order given. */
    beads: number[];
    /** The labelled ages the rail runs past, and where each falls. */
    ticks: { label: string; at: number }[];
    /** How far down the rail runs. */
    length: number;
}

/**
 * Where everything on a note's rail goes.
 *
 * A bead is placed by when its sitting ended. That is the same moment a note's
 * own modification time records, so the topmost bead and the note's node in the
 * graph are talking about the same thing.
 *
 * The rail ends at the first labelled age at or past the oldest sitting, never
 * at "now" itself, so even a sitting a minute old has an hour of rail to sit
 * on. A note with one sitting gets the axis like any other: with one scale for
 * every note, where that sitting falls says something, which it did not when
 * the rail was the note's own span and a single sitting had none.
 */
export function layoutRail(beads: readonly Bead[], now: number): RailLayout {
    const ages = beads.map((bead) => Math.max(0, now - bead.end));
    const oldest = ages.reduce((most, age) => Math.max(most, age), 0);
    const last = TICKS.find((tick) => tick.age > 0 && tick.age >= oldest) ?? TICKS[TICKS.length - 1];

    return {
        beads: ages.map(axisOffset),
        ticks: TICKS.filter((tick) => tick.age <= last.age).map((tick) => ({ label: tick.label, at: axisOffset(tick.age) })),
        // Past the last label, for a history older than twenty years, the rail
        // runs on to the oldest bead rather than leaving it off the end.
        length: Math.max(axisOffset(last.age), axisOffset(oldest))
    };
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
