import { setIcon } from 'obsidian';
import { OpacityRange } from './filter';
import { RangeBar, Spread } from './range-bar';
import { writeStats } from './stats-text';

export interface ScrubberOptions {
    /**
     * The anchored-brightness toggle, for a graph that has a note in the
     * middle. Null for the global graph, which has no centre to measure from.
     */
    anchor: { enabled: () => boolean; onToggle: (on: boolean) => void } | null;
    /** True while the vault has nothing pinned, which is when the hint shows. */
    unpinned: () => boolean;
    enabled: () => boolean;
    ranges: () => OpacityRange[];
    histogram: (buckets: number) => Spread;
    describe: (ranges: OpacityRange[]) => string;
    describeHover: (ranges: OpacityRange[]) => string;
    onToggle: (enabled: boolean) => void;
    onPreview: (ranges: OpacityRange[] | null) => void;
    onChange: (ranges: OpacityRange[]) => void;
}

/**
 * A section in the graph's own control panel, beside Filters, Groups, Display
 * and Forces.
 *
 * Filtering by age is a view rather than a preference: you reach for it to look
 * at something and then you put it back. Making it live only in the settings
 * dialog would mean leaving the graph to change what the graph shows, which is
 * the wrong shape for something used that way. It is the same setting either
 * place, so moving one moves the other.
 */
export class GraphScrubber {
    private readonly section: HTMLElement;
    private bar: RangeBar | null = null;
    private body: HTMLElement | null = null;

    constructor(controls: HTMLElement, private readonly options: ScrubberOptions) {
        this.section = controls.createDiv({ cls: 'tree-item graph-control-section mod-pulsar' });
        this.render();
    }

    /** Redraws from the settings, so a change made elsewhere shows up here. */
    refresh(): void {
        this.render();
    }

    destroy(): void {
        this.section.remove();
    }

    private render(): void {
        this.section.empty();

        const header = this.section.createDiv({ cls: 'tree-item-self mod-collapsible' });
        const chevron = header.createDiv({ cls: 'tree-item-icon collapse-icon' });
        setIcon(chevron, 'chevron-down');

        header.createDiv({ cls: 'tree-item-inner', text: 'Age' });

        header.addEventListener('click', () => {
            this.section.toggleClass('is-collapsed', !this.section.hasClass('is-collapsed'));
        });

        const body = this.section.createDiv({ cls: 'tree-item-children' });
        this.body = body;

        // Above the filter, because it changes what the brightnesses on screen
        // mean and the filter only changes which of them are there.
        if (this.options.anchor) {
            const anchorRow = body.createDiv({ cls: 'pulsar-graph-control-row' });
            anchorRow.createSpan({ text: 'Measure from this note' });

            const anchorToggle = anchorRow.createDiv({ cls: 'checkbox-container' });
            anchorToggle.toggleClass('is-enabled', this.options.anchor.enabled());

            anchorToggle.addEventListener('click', () => {
                this.options.anchor?.onToggle(!this.options.anchor.enabled());
                this.render();
            });
        }

        // One line, only while there is nothing pinned, in the panel someone
        // already has open when they notice a note sinking. Pinning has three
        // ways in and all of them are invisible until you know they are there.
        if (this.options.unpinned()) {
            body.createDiv({ cls: 'pulsar-graph-hint', text: 'Right-click a node to pin it.' });
        }

        const toggleRow = body.createDiv({ cls: 'pulsar-graph-control-row' });
        toggleRow.createSpan({ text: 'Hide notes outside a range' });

        const toggle = toggleRow.createDiv({ cls: 'checkbox-container' });
        toggle.toggleClass('is-enabled', this.options.enabled());

        toggle.addEventListener('click', () => {
            this.options.onToggle(!this.options.enabled());
            this.render();
        });

        if (!this.options.enabled()) {
            return;
        }

        this.bar = new RangeBar(body, {
            histogram: (buckets) => this.options.histogram(buckets),
            describe: (ranges) => this.options.describe(ranges),
            describeHover: (ranges) => this.options.describeHover(ranges),
            onPreview: (ranges) => this.options.onPreview(ranges),
            onChange: (ranges) => {
                this.options.onPreview(null);
                this.options.onChange(ranges);
            }
        });

        this.bar.setRanges(this.options.ranges());
    }
}

/** Finds the panel Obsidian puts its own graph sections in. */
export function findGraphControls(container: HTMLElement): HTMLElement | null {
    return container.querySelector('.graph-controls');
}

/**
 * A line across the top of the graph saying what is being looked at.
 *
 * The filter is the one setting whose effect is invisible once it is made: a
 * graph with half its notes taken out looks exactly like a graph. This says so
 * where you are already looking, and it is not there at all when nothing is
 * being hidden.
 */
export class FilterCaption {
    private readonly element: HTMLElement;

    constructor(container: HTMLElement) {
        this.element = container.createDiv({ cls: 'pulsar-graph-caption' });
        this.element.hide();
    }

    set(text: string | null): void {
        if (text === null) {
            this.element.hide();
            return;
        }

        writeStats(this.element, text);
        this.element.show();
    }

    destroy(): void {
        this.element.remove();
    }
}
