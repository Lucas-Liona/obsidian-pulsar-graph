import { Setting, setIcon } from 'obsidian';
import { AgeMode } from './age-label';
import { curveAt, formatSharpness, SHARPNESS_STOPS, sharpnessOf } from './fade';
import { nearestStop } from './duration';
import { OpacityRange } from './filter';
import { LinkRecency } from './links';
import { RangeBar, Spread } from './range-bar';
import { BLEED_RANGE, MAX_OPACITY_RANGE, MIN_OPACITY_LIMIT, PulsarGraphSettings, TITLE_SCALE_RANGE } from './settings';
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
        /** A slider over a few chosen values, the value written beside it. */
        kind: 'stops';
        name: string;
        stops: readonly number[];
        label: (value: number) => string;
        value: () => number;
        onChange: (value: number) => void;
    }
    | {
        kind: 'dropdown';
        name: string;
        options: Record<string, string>;
        value: () => string;
        onChange: (value: string) => void;
    }
    | {
        kind: 'toggle';
        name: string;
        value: () => boolean;
        onChange: (value: boolean) => void;
    };

/** A small heading inside the section, and the controls under it. */
export interface QuickGroup {
    heading: string;
    controls: QuickControl[];
}

/**
 * What the panel holds, as data: each control reads its setting and writes it
 * through `change`, which applies the result to every graph and saves. Nothing
 * here touches the page, so what each control is wired to can be checked
 * without one.
 *
 * Names are short because the panel is narrow; the settings tab has the
 * sentences.
 */
export function panelGroups(settings: () => PulsarGraphSettings, change: (apply: () => void) => void): QuickGroup[] {
    return [
        {
            heading: 'Nodes',
            controls: [
                {
                    kind: 'slider',
                    name: 'Dimmest',
                    limits: { lowest: 0, highest: MIN_OPACITY_LIMIT, step: 0.01 },
                    value: () => settings().minOpacity,
                    onChange: (value) => change(() => {
                        settings().minOpacity = value;
                        settings().maxOpacity = Math.max(settings().maxOpacity, value);
                    })
                },
                {
                    kind: 'slider',
                    name: 'Brightest',
                    limits: MAX_OPACITY_RANGE,
                    value: () => settings().maxOpacity,
                    onChange: (value) => change(() => {
                        settings().maxOpacity = value;
                        settings().minOpacity = Math.min(settings().minOpacity, value);
                    })
                },
                {
                    // Moving it asks for a smooth curve of that sharpness, so it
                    // also leaves bands, which the settings tab switches on.
                    kind: 'stops',
                    name: 'Sharpness',
                    stops: SHARPNESS_STOPS,
                    label: formatSharpness,
                    value: () => sharpnessOf(settings()),
                    onChange: (value) => change(() => {
                        Object.assign(settings(), curveAt(value));
                    })
                },
                {
                    kind: 'slider',
                    name: 'Glow',
                    limits: BLEED_RANGE,
                    value: () => settings().neighbourBleed,
                    onChange: (value) => change(() => {
                        settings().neighbourBleed = value;
                    })
                },
                {
                    kind: 'toggle',
                    name: 'Size by age',
                    value: () => settings().nodeSizeByAge,
                    onChange: (value) => change(() => {
                        settings().nodeSizeByAge = value;
                    })
                },
                {
                    kind: 'toggle',
                    name: 'Stars',
                    value: () => settings().stars,
                    onChange: (value) => change(() => {
                        settings().stars = value;
                    })
                },
                {
                    kind: 'toggle',
                    name: 'Spotlight',
                    value: () => settings().spotlightNewest,
                    onChange: (value) => change(() => {
                        settings().spotlightNewest = value;
                    })
                }
            ]
        },
        {
            heading: 'Links',
            controls: [
                {
                    kind: 'dropdown',
                    name: 'Age',
                    options: { off: 'Off', uniform: 'Match newer', gradient: 'Fade' } satisfies Record<LinkRecency, string>,
                    value: () => settings().linkRecency,
                    onChange: (value) => change(() => {
                        settings().linkRecency = value as LinkRecency;
                    })
                },
                {
                    kind: 'toggle',
                    name: 'Trace sittings',
                    value: () => settings().sessionTrails,
                    onChange: (value) => change(() => {
                        settings().sessionTrails = value;
                    })
                }
            ]
        },
        {
            heading: 'Text',
            controls: [
                {
                    kind: 'slider',
                    name: 'Title size',
                    limits: TITLE_SCALE_RANGE,
                    value: () => settings().titleScale,
                    onChange: (value) => change(() => {
                        settings().titleScale = value;
                    })
                },
                {
                    kind: 'dropdown',
                    name: 'Ages',
                    // Shorter than the settings' wording, which is a sentence
                    // and pushed the name out of a narrow panel.
                    options: { off: 'Never', hover: 'On hover', titles: 'With titles' } satisfies Record<AgeMode, string>,
                    value: () => settings().ageLabels,
                    onChange: (value) => change(() => {
                        settings().ageLabels = value as AgeMode;
                    })
                }
            ]
        }
    ];
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

        if (control.kind === 'stops') {
            setting.settingEl.addClass('mod-slider');

            setting.addSlider((slider) => {
                slider
                    .setLimits(0, control.stops.length - 1, 1)
                    .setValue(nearestStop(control.stops, control.value()))
                    .setInstant(true)
                    .onChange((index) => {
                        if (!syncing) {
                            control.onChange(control.stops[index]);
                        }
                    });

                // The slider's value is only the index of a stop.
                setting.controlEl.querySelector(':scope > .slider-value')?.remove();
                const readout = setting.controlEl.createSpan({ cls: 'pulsar-stops-readout', text: control.label(control.value()) });
                slider.sliderEl.addEventListener('input', () => {
                    readout.setText(control.label(control.stops[Number(slider.sliderEl.value)]));
                });

                this.syncs.push(() => {
                    const value = control.value();
                    const index = nearestStop(control.stops, value);

                    readout.setText(control.label(value));
                    if (slider.getValue() !== index) {
                        syncing = true;
                        slider.setValue(index);
                        syncing = false;
                    }
                });
            });
            return;
        }

        if (control.kind === 'toggle') {
            setting.addToggle((toggle) => {
                toggle
                    .setValue(control.value())
                    .onChange((value) => {
                        if (!syncing) {
                            control.onChange(value);
                        }
                    });

                this.syncs.push(() => {
                    const value = control.value();

                    if (toggle.getValue() !== value) {
                        syncing = true;
                        toggle.setValue(value);
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
