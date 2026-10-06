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

export interface RangeBarOptions {
    /** Drawn behind the ranges, so the ranges can be aimed at something real. */
    histogram?: number[];
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
            this.drawn.push({
                span: this.buildSpan(track, index),
                from: this.buildHandle(track, index, 'from'),
                to: this.buildHandle(track, index, 'to')
            });
        });

        const scale = this.element.createDiv({ cls: 'pulsar-graph-range-scale' });
        scale.createSpan({ text: 'dimmest' });
        scale.createSpan({ text: 'brightest' });

        this.caption = this.options.describe
            ? this.element.createDiv({ cls: 'pulsar-graph-range-caption' })
            : null;

        this.position();
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

    private buildHistogram(track: HTMLElement): void {
        const histogram = this.options.histogram;
        if (!histogram || histogram.length === 0) {
            return;
        }

        const tallest = Math.max(1, ...histogram);
        const chart = track.createDiv({ cls: 'pulsar-graph-range-histogram' });

        for (const count of histogram) {
            chart.createDiv({ cls: 'pulsar-graph-range-tick' }).style.height = `${(count / tallest) * 100}%`;
        }
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
    ): void {
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
            element.toggleClass('is-held', false);

            const win = element.win;
            win.removeEventListener('pointermove', moveWith);
            win.removeEventListener('pointerup', finish);
            win.removeEventListener('pointercancel', finish);

            on.end();
            this.options.onChange(this.copy());
        };

        element.addEventListener('pointerdown', (event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();

            dragging = true;
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
        });
    }

    private buildHandle(track: HTMLElement, index: number, edge: 'from' | 'to'): HTMLElement {
        const handle = track.createDiv({ cls: 'pulsar-graph-range-handle' });
        handle.tabIndex = 0;

        handle.setAttr('role', 'slider');
        handle.setAttr('aria-valuemin', '0');
        handle.setAttr('aria-valuemax', '1');
        handle.setAttr('aria-label', edge === 'from' ? 'Range start' : 'Range end');

        this.holdDrag(handle, track, {
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

        return handle;
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
