import { OpacityRange } from './filter';

/** Dragging snaps to this, fine enough to land on a value worth having. */
const STEP = 0.01;

/** Keeps a range from collapsing to nothing, which cannot be dragged back open. */
const MINIMUM_WIDTH = 0.02;

export interface RangeBarOptions {
    /** Drawn behind the ranges, so the ranges can be aimed at something real. */
    histogram?: number[];
    onChange: (ranges: OpacityRange[]) => void;
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
    private ranges: OpacityRange[] = [];

    constructor(parent: HTMLElement, private readonly options: RangeBarOptions) {
        this.element = parent.createDiv({ cls: 'pulsar-graph-range' });
    }

    setRanges(ranges: OpacityRange[]): void {
        this.ranges = ranges.map((range) => ({ ...range }));
        this.render();
    }

    private render(): void {
        this.element.empty();

        const track = this.element.createDiv({ cls: 'pulsar-graph-range-track' });
        this.renderHistogram(track);

        this.ranges.forEach((range, index) => {
            const span = track.createDiv({ cls: 'pulsar-graph-range-span' });
            span.style.left = `${range.from * 100}%`;
            span.style.width = `${(range.to - range.from) * 100}%`;

            this.addHandle(track, index, 'from');
            this.addHandle(track, index, 'to');
        });

        const scale = this.element.createDiv({ cls: 'pulsar-graph-range-scale' });
        scale.createSpan({ text: 'dimmest' });
        scale.createSpan({ text: 'brightest' });
    }

    private renderHistogram(track: HTMLElement): void {
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

    private addHandle(track: HTMLElement, index: number, edge: 'from' | 'to'): void {
        const handle = track.createDiv({ cls: 'pulsar-graph-range-handle' });
        handle.style.left = `${this.ranges[index][edge] * 100}%`;
        handle.tabIndex = 0;

        handle.setAttr('role', 'slider');
        handle.setAttr('aria-valuemin', '0');
        handle.setAttr('aria-valuemax', '1');
        handle.setAttr('aria-valuenow', this.ranges[index][edge].toFixed(2));
        handle.setAttr('aria-label', edge === 'from' ? 'Range start' : 'Range end');

        handle.addEventListener('pointerdown', (event: PointerEvent) => {
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);

            const move = (moved: PointerEvent): void => {
                const bounds = track.getBoundingClientRect();
                this.moveTo(index, edge, (moved.clientX - bounds.left) / bounds.width);
            };

            const release = (): void => {
                handle.removeEventListener('pointermove', move);
                handle.removeEventListener('pointerup', release);
                handle.removeEventListener('pointercancel', release);
            };

            handle.addEventListener('pointermove', move);
            handle.addEventListener('pointerup', release);
            handle.addEventListener('pointercancel', release);
        });

        handle.addEventListener('keydown', (event: KeyboardEvent) => {
            const nudge = event.key === 'ArrowLeft' ? -STEP : event.key === 'ArrowRight' ? STEP : 0;

            if (nudge !== 0) {
                event.preventDefault();
                this.moveTo(index, edge, this.ranges[index][edge] + nudge);
            }
        });
    }

    /** Each edge is held clear of the other, so a range can always be reopened. */
    private moveTo(index: number, edge: 'from' | 'to', raw: number): void {
        const range = this.ranges[index];
        const snapped = Math.round(Math.min(1, Math.max(0, raw)) / STEP) * STEP;

        if (edge === 'from') {
            range.from = Math.min(snapped, range.to - MINIMUM_WIDTH);
        } else {
            range.to = Math.max(snapped, range.from + MINIMUM_WIDTH);
        }

        range.from = Math.max(0, range.from);
        range.to = Math.min(1, range.to);

        this.render();
        this.options.onChange(this.ranges.map((kept) => ({ ...kept })));
    }
}
