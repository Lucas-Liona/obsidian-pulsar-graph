import { Setting, setIcon } from 'obsidian';
import { OpacityRange } from './filter';
import { RangeBar, Spread } from './range-bar';
import { writeStats } from './stats-text';

/**
 * One control in the graph's own panel. Kept to the handful of things worth
 * reaching for while looking at a graph — the rest live in the settings.
 */
export type QuickControl =
    | {
        kind: 'slider';
        name: string;
        limits: { lowest: number; highest: number; step: number };
        value: () => number;
        onChange: (value: number) => void;
    }
    | {
        kind: 'dropdown';
        name: string;
        options: Record<string, string>;
        value: () => string;
        onChange: (value: string) => void;
    };

/** A small heading inside the section, and the controls under it. */
export interface QuickGroup {
    heading: string;
    controls: QuickControl[];
}

export interface PanelOptions {
    groups: QuickGroup[];
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
 * The plugin's section in the graph's own control panel, beside Filters,
 * Groups, Display and Forces, and named for the plugin like theirs are named
 * for what they hold.
 *
 * The quick controls are built once and only have their values put back when
 * a setting changes elsewhere. Rebuilding them would replace a slider part way
 * through being dragged, and the drag would end on the spot. Only the age
 * filter is redrawn, since switching it on and off changes what is in it.
 */
export class PulsarPanel {
    private readonly section: HTMLElement;
    private readonly syncs: (() => void)[] = [];
    private age: HTMLElement | null = null;

    constructor(controls: HTMLElement, private readonly options: PanelOptions) {
        this.section = controls.createDiv({ cls: 'tree-item graph-control-section mod-pulsar' });
        this.build();
    }

    /** Puts every value back from the settings, after a change made elsewhere. */
    refresh(): void {
        for (const sync of this.syncs) {
            sync();
        }

        this.renderAge();
    }

    destroy(): void {
        this.section.remove();
    }

    private build(): void {
        const header = this.section.createDiv({ cls: 'tree-item-self mod-collapsible' });
        const chevron = header.createDiv({ cls: 'tree-item-icon collapse-icon' });
        setIcon(chevron, 'chevron-down');

        header.createDiv({ cls: 'tree-item-inner', text: 'Pulsar' });

        header.addEventListener('click', () => {
            this.section.toggleClass('is-collapsed', !this.section.hasClass('is-collapsed'));
        });

        const body = this.section.createDiv({ cls: 'tree-item-children' });

        for (const group of this.options.groups) {
            body.createDiv({ cls: 'pulsar-graph-subheading', text: group.heading });

            for (const control of group.controls) {
                this.buildControl(body, control);
            }
        }

        body.createDiv({ cls: 'pulsar-graph-subheading', text: 'Age filter' });
        this.age = body.createDiv();
        this.renderAge();
    }

    /**
     * Putting a value back must never count as a change. Some of Obsidian's
     * components report a change when their value is set, and a change here
     * saves, which refreshes this panel, which sets the value again: a loop
     * that rewrote data.json every second for as long as a graph was open.
     * So a sync is skipped when nothing differs, and a change reported while
     * syncing is ignored.
     */
    private buildControl(body: HTMLElement, control: QuickControl): void {
        const setting = new Setting(body).setName(control.name);
        setting.settingEl.addClass('pulsar-graph-quick');

        let syncing = false;

        if (control.kind === 'slider') {
            setting.settingEl.addClass('mod-slider');
            setting.addSlider((slider) => {
                slider
                    .setLimits(control.limits.lowest, control.limits.highest, control.limits.step)
                    .setValue(control.value())
                    .setDynamicTooltip()
                    // While dragging, not on release: these are for watching
                    // the graph change under your hand.
                    .setInstant(true)
                    .onChange((value) => {
                        if (!syncing) {
                            control.onChange(value);
                        }
                    });

                this.syncs.push(() => {
                    const value = control.value();

                    if (Math.abs(slider.getValue() - value) >= control.limits.step / 2) {
                        syncing = true;
                        slider.setValue(value);
                        syncing = false;
                    }
                });
            });
            return;
        }

        setting.addDropdown((dropdown) => {
            dropdown
                .addOptions(control.options)
                .setValue(control.value())
                .onChange((value) => {
                    if (!syncing) {
                        control.onChange(value);
                    }
                });

            this.syncs.push(() => {
                const value = control.value();

                if (dropdown.getValue() !== value) {
                    syncing = true;
                    dropdown.setValue(value);
                    syncing = false;
                }
            });
        });
    }

    private renderAge(): void {
        const body = this.age;
        if (!body) {
            return;
        }

        body.empty();

        // Above the filter, because it changes what the brightnesses on screen
        // mean and the filter only changes which of them are there.
        if (this.options.anchor) {
            const anchorRow = body.createDiv({ cls: 'pulsar-graph-control-row' });
            anchorRow.createSpan({ text: 'Measure from this note' });

            const anchorToggle = anchorRow.createDiv({ cls: 'checkbox-container' });
            anchorToggle.toggleClass('is-enabled', this.options.anchor.enabled());

            anchorToggle.addEventListener('click', () => {
                this.options.anchor?.onToggle(!this.options.anchor.enabled());
                this.renderAge();
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
            this.renderAge();
        });

        if (!this.options.enabled()) {
            return;
        }

        const bar = new RangeBar(body, {
            histogram: (buckets) => this.options.histogram(buckets),
            describe: (ranges) => this.options.describe(ranges),
            describeHover: (ranges) => this.options.describeHover(ranges),
            onPreview: (ranges) => this.options.onPreview(ranges),
            onChange: (ranges) => {
                this.options.onPreview(null);
                this.options.onChange(ranges);
            }
        });

        bar.setRanges(this.options.ranges());
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
