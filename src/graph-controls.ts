import { setIcon } from 'obsidian';
import { OpacityRange } from './filter';
import { RangeBar } from './range-bar';

export interface ScrubberOptions {
    enabled: () => boolean;
    ranges: () => OpacityRange[];
    histogram: () => number[];
    describe: (ranges: OpacityRange[]) => string;
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

        header.createDiv({ cls: 'tree-item-inner', text: 'Age filter' });

        header.addEventListener('click', () => {
            this.section.toggleClass('is-collapsed', !this.section.hasClass('is-collapsed'));
        });

        const body = this.section.createDiv({ cls: 'tree-item-children' });
        this.body = body;

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
            histogram: this.options.histogram(),
            describe: (ranges) => this.options.describe(ranges),
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

        this.element.setText(text);
        this.element.show();
    }

    destroy(): void {
        this.element.remove();
    }
}
