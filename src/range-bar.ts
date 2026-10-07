import { OpacityRange } from './filter';

/**
 * Dragging snaps to this. Half a percent of the line, which on a bar the width
 * of the settings dialog is finer than a pixel, so the snap is never what stops
 * you landing on a value.
 */
const STEP = 0.005;

/** What an arrow key moves. Coarser than a drag, because it is one press. */
const NUDGE = 0.01;

/** Keeps a range from collapsing to nothing, which cannot be dragged back open. */
const MINIMUM_WIDTH = 0.02;

/** One histogram column per this many pixels of the bar's own width. */
const PIXELS_PER_COLUMN = 3;

const FEWEST_COLUMNS = 40;

const MOST_COLUMNS = 400;

/**
 * How far from a handle a press still counts as grabbing it, as a fraction of
 * the line. Handles are drawn narrow because at the narrowest a range is
 * allowed to be they sit eight pixels apart, and a wide handle would cover its
 * neighbour. Widening the grab box instead only moved the problem: two boxes
 * overlapping means the browser hands the press to whichever is later in the
 * document, which is not the one being aimed at. So the press is routed to the
 * nearest handle by distance, and a thin handle stops being hard to catch.
 */
const GRAB_WITHIN = 0.03;

export interface RangeBarOptions {
    /**
     * Drawn behind the ranges, so the ranges can be aimed at something real.
     *
     * Asked for a column count rather than handed an array, because the useful
     * resolution is a property of how wide this bar happens to be drawn and
     * nothing else knows that. Counting a vault into columns is one pass over
     * the notes, so asking for three hundred of them costs the same as twenty.
     */
    histogram?: (buckets: number) => number[];
    /**
     * What the current ranges actually select, in words, drawn under the bar.
     * Brightness is not a quantity anyone has an intuition for, so a position
     * on the line needs saying in the units the question was asked in: how old
     * the notes still on screen are.
     */
    describe?: (ranges: OpacityRange[]) => string;
    /**
     * Called continuously while a handle is held. Rebuilding a graph on every
     * frame of a drag would be unusable, so this is where a cheap preview goes
     * and onChange is where the real work goes.
     */
    onPreview?: (ranges: OpacityRange[]) => void;
    onChange: (ranges: OpacityRange[]) => void;
}

/** One range's elements, kept so a drag can move them rather than rebuild them. */
interface Drawn {
    span: HTMLElement;
    from: HTMLElement;
    to: HTMLElement;
    /** Starts each handle's drag, for a press the track routed to it. */
    begin: { from: (event: PointerEvent) => void; to: (event: PointerEvent) => void };
}

/** Where a whole-range drag started, so the shift is measured from one place. */
interface Grab {
    x: number;
    from: number;
    to: number;
}

/**
 * A unit line with a handle at each end of every range it holds.
 *
 * Numbers are a poor way to choose a brightness, because brightness is not a
 * quantity anyone has an intuition for — but a position on a line, over a
 * picture of where the notes actually are, is something you can aim. The
 * histogram behind it is the same spread the statistics panel shows.
 *
 * Several ranges are allowed because the interesting questions are not always
 * contiguous: the oldest and the newest but nothing between, or the middle of
 * the herd on its own.
 */
export class RangeBar {
    private readonly element: HTMLElement;
    private drawn: Drawn[] = [];
    private ranges: OpacityRange[] = [];
    private caption: HTMLElement | null = null;
    private counts: number[] = [];

    /** How many drags are in flight, so hovering does not fight with one. */
    private held = 0;

    constructor(parent: HTMLElement, private readonly options: RangeBarOptions) {
        this.element = parent.createDiv({ cls: 'pulsar-graph-range' });
    }

    setRanges(ranges: OpacityRange[]): void {
        this.ranges = ranges.map((range) => ({ ...range }));
        this.build();
    }

    /**
     * Builds the elements once.
     *
     * A drag moves them and must never rebuild them: replacing a handle part
     * way through a gesture throws away the pointer capture holding that
     * gesture together, and the handle stops following the cursor after a
     * single step.
     */
    private build(): void {
        this.element.empty();
        this.drawn = [];

        const track = this.element.createDiv({ cls: 'pulsar-graph-range-track' });
        this.buildHistogram(track);

        this.ranges.forEach((_range, index) => {
            const span = this.buildSpan(track, index);
            const from = this.buildHandle(track, index, 'from');
            const to = this.buildHandle(track, index, 'to');

            this.drawn.push({
                span,
                from: from.element,
                to: to.element,
                begin: { from: from.begin, to: to.begin }
            });
        });

        const scale = this.element.createDiv({ cls: 'pulsar-graph-range-scale' });
        scale.createSpan({ text: 'dimmest' });
        scale.createSpan({ text: 'brightest' });

        this.caption = this.options.describe
            ? this.element.createDiv({ cls: 'pulsar-graph-range-caption' })
            : null;

        // After the caption exists, since hovering writes into it.
        this.routeGrabs(track);
        this.readOnHover(track);

        this.position();
    }

    /**
     * Sends a press to the nearest handle rather than to whatever the browser
     * decided was under the cursor.
     *
     * Two handles eight pixels apart have overlapping grab boxes however the
     * boxes are sized, and an overlap is resolved by document order — so the
     * handle you aimed at loses to the one drawn after it, reliably and
     * invisibly. Distance is what the user meant, so distance is what decides.
     * It also means a press near a handle catches it, which is what lets the
     * handles stay thin enough to sit beside each other at all.
     *
     * A press with no handle near it falls through untouched, so dragging a
     * whole range by its middle still works.
     */
    private routeGrabs(track: HTMLElement): void {
        track.addEventListener('pointerdown', (event: PointerEvent) => {
            const bounds = track.getBoundingClientRect();
            if (bounds.width <= 0) {
                return;
            }

            const at = (event.clientX - bounds.left) / bounds.width;
            let best: ((event: PointerEvent) => void) | null = null;
            let nearest = GRAB_WITHIN;

            this.ranges.forEach((range, index) => {
                const drawn = this.drawn[index];
                if (!drawn) {
                    return;
                }

                for (const edge of ['from', 'to'] as const) {
                    const away = Math.abs(range[edge] - at);

                    if (away < nearest) {
                        nearest = away;
                        best = drawn.begin[edge];
                    }
                }
            });

            if (best) {
                (best as (event: PointerEvent) => void)(event);
            }
        }, true);
    }

    /**
     * Hovering a column says what is in it, in the caption the bar already has.
     *
     * The shape alone answers "where are the notes" and nothing else. The
     * question people actually arrive with is "what is that bump", and the
     * sentence under the bar can answer it for one column as easily as for a
     * selection — it is the same measurement over a narrower stretch.
     */
    private readOnHover(track: HTMLElement): void {
        const describe = this.options.describe;
        if (!describe || !this.caption) {
            return;
        }

        track.addEventListener('pointermove', (event: PointerEvent) => {
            if (this.held > 0 || this.counts.length === 0) {
                return;
            }

            const bounds = track.getBoundingClientRect();
            if (bounds.width <= 0) {
                return;
            }

            const at = Math.min(0.999999, Math.max(0, (event.clientX - bounds.left) / bounds.width));
            const column = Math.floor(at * this.counts.length);
            const width = 1 / this.counts.length;

            this.caption?.setText(describe([{ from: column * width, to: (column + 1) * width }]));
        });

        track.addEventListener('pointerleave', () => {
            if (this.held === 0) {
                this.position();
            }
        });
    }

    /** The only thing a drag touches. */
    private position(): void {
        this.ranges.forEach((range, index) => {
            const drawn = this.drawn[index];
            if (!drawn) {
                return;
            }

            drawn.span.style.left = `${range.from * 100}%`;
            drawn.span.style.width = `${(range.to - range.from) * 100}%`;
            drawn.from.style.left = `${range.from * 100}%`;
            drawn.to.style.left = `${range.to * 100}%`;

            drawn.from.setAttr('aria-valuenow', range.from.toFixed(2));
            drawn.to.setAttr('aria-valuenow', range.to.toFixed(2));
        });

        if (this.caption && this.options.describe) {
            this.caption.setText(this.options.describe(this.copy()));
        }
    }

    /**
     * The spread of the vault behind the handles, as a filled curve.
     *
     * Twenty bars read as a shape and are useless to aim at: a handle could sit
     * anywhere inside a twentieth of the line without the picture under it
     * changing. At one column every three pixels the bars turn to noise, so
     * they stop being bars — the same counts drawn as an area are legible at
     * any resolution, and the resolution is what makes the thing aimable.
     */
    private buildHistogram(track: HTMLElement): void {
        const histogram = this.options.histogram;
        if (!histogram) {
            return;
        }

        // A hidden panel measures zero, which would ask for one column.
        const width = track.getBoundingClientRect().width;
        const buckets = width > 0 ? Math.min(MOST_COLUMNS, Math.max(FEWEST_COLUMNS, Math.round(width / PIXELS_PER_COLUMN))) : FEWEST_COLUMNS;

        this.counts = histogram(buckets);
        if (this.counts.length === 0) {
            return;
        }

        const tallest = Math.max(1, ...this.counts);
        const chart = track.createSvg('svg', { cls: 'pulsar-graph-range-histogram' });

        chart.setAttr('viewBox', `0 0 ${this.counts.length - 1} 1`);
        chart.setAttr('preserveAspectRatio', 'none');

        const points = this.counts.map((count, index) => `${index},${(1 - count / tallest).toFixed(4)}`);

        chart.createSvg('polygon', {
            cls: 'pulsar-graph-range-area',
            attr: { points: `0,1 ${points.join(' ')} ${this.counts.length - 1},1` }
        });

        // The one number the shape cannot carry: how tall the tallest column
        // is. Without it the curve says where the notes are but not how many.
        track.createDiv({ cls: 'pulsar-graph-range-peak', text: `${tallest}` });
    }

    /**
     * The lit stretch between two handles, draggable as a whole.
     *
     * Moving both edges together is a different question from moving one: the
     * handles choose how wide a slice to look at, and this chooses where that
     * slice sits. Doing it by dragging each handle in turn loses the width on
     * the way, and the width is usually the part worth keeping.
     */
    private buildSpan(track: HTMLElement, index: number): HTMLElement {
        const span = track.createDiv({ cls: 'pulsar-graph-range-span' });
        span.tabIndex = 0;
        span.setAttr('aria-label', 'Move range');

        let grab: Grab | null = null;

        this.holdDrag(span, track, {
            start: (event) => {
                const range = this.ranges[index];
                grab = { x: event.clientX, from: range.from, to: range.to };
            },
            move: (event, bounds) => {
                if (grab) {
                    this.shiftTo(index, grab, (event.clientX - grab.x) / bounds.width, true);
                }
            },
            end: () => {
                grab = null;
            }
        });

        span.addEventListener('keydown', (event: KeyboardEvent) => {
            const nudge = event.key === 'ArrowLeft' ? -NUDGE : event.key === 'ArrowRight' ? NUDGE : 0;

            if (nudge !== 0) {
                event.preventDefault();

                const range = this.ranges[index];
                this.shiftTo(index, { x: 0, from: range.from, to: range.to }, nudge, false);
            }
        });

        return span;
    }

    /**
     * Holds a pointer gesture together with a flag and listeners on the window,
     * not with pointer capture. Capture is asked for because it helps, but it
     * can fail, and a control that silently stops following the cursor when it
     * does is worse than one that never used it.
     */
    private holdDrag(
        element: HTMLElement,
        track: HTMLElement,
        on: {
            start: (event: PointerEvent) => void;
            move: (event: PointerEvent, bounds: DOMRect) => void;
            end: () => void;
        }
    ): (event: PointerEvent) => void {
        let dragging = false;

        const moveWith = (event: PointerEvent): void => {
            if (dragging) {
                on.move(event, track.getBoundingClientRect());
            }
        };

        const finish = (): void => {
            if (!dragging) {
                return;
            }

            dragging = false;
            this.held--;
            element.toggleClass('is-held', false);

            const win = element.win;
            win.removeEventListener('pointermove', moveWith);
            win.removeEventListener('pointerup', finish);
            win.removeEventListener('pointercancel', finish);

            on.end();
            this.options.onChange(this.copy());
        };

        const begin = (event: PointerEvent): void => {
            event.preventDefault();
            event.stopPropagation();

            dragging = true;
            this.held++;
            element.toggleClass('is-held', true);
            on.start(event);

            try {
                element.setPointerCapture(event.pointerId);
            } catch {
                // Not available for this pointer; the window listeners cover it.
            }

            const win = element.win;
            win.addEventListener('pointermove', moveWith);
            win.addEventListener('pointerup', finish);
            win.addEventListener('pointercancel', finish);
        };

        element.addEventListener('pointerdown', begin);

        return begin;
    }

    private buildHandle(track: HTMLElement, index: number, edge: 'from' | 'to'): { element: HTMLElement; begin: (event: PointerEvent) => void } {
        const handle = track.createDiv({ cls: 'pulsar-graph-range-handle' });
        handle.tabIndex = 0;

        handle.setAttr('role', 'slider');
        handle.setAttr('aria-valuemin', '0');
        handle.setAttr('aria-valuemax', '1');
        handle.setAttr('aria-label', edge === 'from' ? 'Range start' : 'Range end');

        const begin = this.holdDrag(handle, track, {
            start: () => undefined,
            move: (event, bounds) => this.moveTo(index, edge, (event.clientX - bounds.left) / bounds.width, true),
            end: () => undefined
        });

        handle.addEventListener('keydown', (event: KeyboardEvent) => {
            const nudge = event.key === 'ArrowLeft' ? -NUDGE : event.key === 'ArrowRight' ? NUDGE : 0;

            if (nudge !== 0) {
                event.preventDefault();

                // A key press is a whole gesture, so it commits rather than
                // leaving a preview nothing will finish.
                this.moveTo(index, edge, this.ranges[index][edge] + nudge, false);
            }
        });

        return { element: handle, begin };
    }

    /** Each edge is held clear of the other, so a range can always be reopened. */
    private moveTo(index: number, edge: 'from' | 'to', raw: number, dragging: boolean): void {
        const range = this.ranges[index];
        const snapped = Math.round(Math.min(1, Math.max(0, raw)) / STEP) * STEP;

        if (edge === 'from') {
            range.from = Math.min(snapped, range.to - MINIMUM_WIDTH);
        } else {
            range.to = Math.max(snapped, range.from + MINIMUM_WIDTH);
        }

        range.from = Math.max(0, range.from);
        range.to = Math.min(1, range.to);

        this.position();
        this.report(dragging);
    }

    /**
     * Slides a whole range, keeping its width.
     *
     * Held inside the line rather than clamped edge by edge: squashing against
     * an end would narrow the range, and dragging back would not widen it
     * again, so a range dragged off the end would come back smaller than it
     * went.
     */
    private shiftTo(index: number, grab: Grab, shift: number, dragging: boolean): void {
        const width = grab.to - grab.from;
        const snapped = Math.round(shift / STEP) * STEP;
        const from = Math.min(Math.max(0, grab.from + snapped), 1 - width);

        const range = this.ranges[index];
        range.from = from;
        range.to = from + width;

        this.position();
        this.report(dragging);
    }

    private report(dragging: boolean): void {
        if (dragging && this.options.onPreview) {
            this.options.onPreview(this.copy());
        } else {
            this.options.onChange(this.copy());
        }
    }

    private copy(): OpacityRange[] {
        return this.ranges.map((kept) => ({ ...kept }));
    }
}
