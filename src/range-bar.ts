import { bandwidthFor, niceCeiling, smoothCounts, smoothPath } from './density';
import { OpacityRange, withinRanges } from './filter';
import { writeStats } from './stats-text';

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

/**
 * Bars across the line, each a fortieth of it. Fixed rather than fitted to the
 * width the bar happens to be drawn at, so that "notes per bar" — what the
 * axis counts in — means the same thing in the settings as in a graph panel.
 */
const BARS = 40;

/** What the curve is computed from: ten bins under every bar. */
const FINE = BARS * 10;

/** The SVG is drawn in a 1000 by 100 box and stretched to fit. */
const CHART_WIDTH = 1000;
const CHART_HEIGHT = 100;

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
    histogram?: (buckets: number) => Spread;
    /**
     * What the current ranges actually select, in words, drawn under the bar.
     * Brightness is not a quantity anyone has an intuition for, so a position
     * on the line needs saying in the units the question was asked in: how old
     * the notes still on screen are.
     */
    describe?: (ranges: OpacityRange[]) => string;
    /**
     * The same sentence for one hovered column. Separate because the question
     * is narrower — what is in this stretch — and because it is asked on every
     * pointer move, so it must not do more work than that question needs.
     */
    describeHover?: (ranges: OpacityRange[]) => string;
    /**
     * Called continuously while a handle is held. Rebuilding a graph on every
     * frame of a drag would be unusable, so this is where a cheap preview goes
     * and onChange is where the real work goes.
     */
    onPreview?: (ranges: OpacityRange[]) => void;
    onChange: (ranges: OpacityRange[]) => void;
}

/**
 * Where the notes are along the line, counted into equal bins, with the notes
 * held at either end of the curve counted separately as well.
 *
 * Those are the notes the fade has run out on: everything older than the
 * curve reaches sits at its floor, and on a vault with a steep fade that is a
 * third of it. They are real and are drawn, but they are a pile rather than a
 * spread, and a curve fitted through them would be a cliff that flattens
 * everything else.
 */
export interface Spread {
    counts: number[];
    floor: number;
    ceiling: number;
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
    private bars: SVGRectElement[] = [];
    private hovered: SVGRectElement | null = null;

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

        const plot = this.element.createDiv({ cls: 'pulsar-graph-range-plot' });
        const axis = plot.createDiv({ cls: 'pulsar-graph-range-axis' });
        const track = plot.createDiv({ cls: 'pulsar-graph-range-track' });
        this.buildHistogram(track, axis);

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

            const hovered = [{ from: column * width, to: (column + 1) * width }];
            if (this.caption) {
                writeStats(this.caption, (this.options.describeHover ?? describe)(hovered));
            }

            this.hover(this.bars[column] ?? null);
        });

        track.addEventListener('pointerleave', () => {
            this.hover(null);

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

        // The bars inside what is kept are drawn brighter, so the selection
        // shows in the picture of the notes rather than only as a tint over it.
        this.bars.forEach((bar, index) => {
            bar.toggleClass('is-kept', withinRanges((index + 0.5) / BARS, this.ranges));
        });

        if (this.caption && this.options.describe) {
            writeStats(this.caption, this.options.describe(this.copy()));
        }
    }

    private hover(bar: SVGRectElement | null): void {
        this.hovered?.toggleClass('is-hovered', false);
        this.hovered = bar;
        bar?.toggleClass('is-hovered', true);
    }

    /**
     * The spread of the vault behind the handles: bars for the counts, and a
     * red curve for the shape.
     *
     * The axis is notes per bar, topped at a round number with a dotted line
     * half way up, both labelled, so a bar's height can be read as a count
     * rather than only compared with its neighbours. It is scaled to the curve rather than to
     * the tallest bar: the notes piled at the floor of the fade would
     * otherwise set the scale and press every other bar flat — which is what
     * made the previous picture look empty. A bar taller than the axis is
     * drawn to the top with a cap, and hovering it gives its count.
     */
    private buildHistogram(track: HTMLElement, axis: HTMLElement): void {
        const histogram = this.options.histogram;
        this.counts = [];
        this.bars = [];
        this.hovered = null;

        if (!histogram) {
            return;
        }

        const spread = histogram(FINE);
        if (spread.counts.length !== FINE) {
            return;
        }

        const per = FINE / BARS;
        const counts = Array.from({ length: BARS }, (_, bar) => sum(spread.counts.slice(bar * per, (bar + 1) * per)));
        this.counts = counts;

        // The fit leaves the piles at either end out, for the reason Spread
        // gives, and so does the choice of scale.
        const body = [...spread.counts];
        body[0] -= spread.floor;
        body[FINE - 1] -= spread.ceiling;

        const curve = smoothCounts(body, bandwidthFor(body)).map((density) => density / BARS);
        const between = [...counts];
        between[0] -= spread.floor;
        between[BARS - 1] -= spread.ceiling;

        const top = niceCeiling(Math.max(...curve, quantile(between, 0.9), sum(body) === 0 ? Math.max(...counts) : 0));
        // Square root, not linear. A fade that crowds old notes toward the
        // floor puts half of a vault in the first few bars — 250 notes a bar
        // against a tail of 5 to 15 on the vault this was drawn against — and
        // a linear axis draws that tail as a flat line. The root keeps the
        // order and the shape and shows both ends; the dotted line is labelled
        // with what it actually stands for, a quarter of the top.
        const height = (count: number): number => Math.min(1, Math.sqrt(Math.max(0, count) / top)) * CHART_HEIGHT;

        const chart = track.createSvg('svg', { cls: 'pulsar-graph-range-chart' });
        chart.setAttr('viewBox', `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`);
        chart.setAttr('preserveAspectRatio', 'none');

        const slot = CHART_WIDTH / BARS;
        counts.forEach((count, bar) => {
            const drawn = height(count);
            const rect = chart.createSvg('rect', {
                cls: 'pulsar-graph-range-bar',
                attr: { x: bar * slot + slot * 0.12, width: slot * 0.76, y: CHART_HEIGHT - drawn, height: drawn }
            });
            this.bars.push(rect);

            if (count > top) {
                chart.createSvg('rect', {
                    cls: 'pulsar-graph-range-cap',
                    attr: { x: bar * slot + slot * 0.12, width: slot * 0.76, y: 0, height: 4 }
                });
            }
        });

        chart.createSvg('line', {
            cls: 'pulsar-graph-range-grid',
            attr: { x1: 0, x2: CHART_WIDTH, y1: CHART_HEIGHT / 2, y2: CHART_HEIGHT / 2 }
        });

        if (sum(body) > 0) {
            // Every other fine bin is plenty for a smooth line; the ends are
            // carried out to the edges, where reflection has made it level.
            const points: [number, number][] = [[0, CHART_HEIGHT - height(curve[0])]];
            for (let bin = 0; bin < FINE; bin += 2) {
                points.push([((bin + 0.5) / FINE) * CHART_WIDTH, CHART_HEIGHT - height(curve[bin])]);
            }
            points.push([CHART_WIDTH, CHART_HEIGHT - height(curve[FINE - 1])]);

            chart.createSvg('path', { cls: 'pulsar-graph-range-curve', attr: { d: smoothPath(points) } });
        }

        axis.createDiv({ cls: 'pulsar-graph-range-tick pulsar-graph-range-tick-top', text: `${top}` });
        axis.createDiv({ cls: 'pulsar-graph-range-tick pulsar-graph-range-tick-half', text: `${Math.round(top / 4)}` });
        axis.setAttr('aria-label', `Notes per bar. Each bar is ${100 / BARS}% of the line.`);
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

function sum(values: number[]): number {
    return values.reduce((total, value) => total + value, 0);
}

/** The value a share of the others fall at or below. */
function quantile(values: number[], share: number): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0;
}
