import { App, PluginSettingTab, Setting, SliderComponent, TextComponent } from 'obsidian';
import { formatAge } from './age';
import { AgeMode } from './age-label';
import { LinkRecency } from './links';
import { PRESETS } from './presets';
import { FADE_TYPES, FADE_TYPE_LABELS, FadeType } from './fade';
import PulsarGraphPlugin from './main';

export type NormalizeBy = 'vault' | 'window';

const NORMALIZE_MODES = ['vault', 'window'] as const;

const NORMALIZE_LABELS: Record<NormalizeBy, string> = {
    vault: "The vault's whole history",
    window: 'A recent window'
};

export type AgeScale = 'even' | 'rank' | 'log';

const AGE_SCALES = ['even', 'rank', 'log'] as const;

const AGE_SCALE_LABELS: Record<AgeScale, string> = {
    even: 'Even',
    rank: 'By rank',
    log: 'Logarithmic'
};

export interface PulsarGraphSettings {
    normalizeBy: NormalizeBy;
    windowDays: number;
    ageScale: AgeScale;
    fadeType: FadeType;
    minOpacity: number;
    maxOpacity: number;
    steepness: number;
    numSteps: number;
    ageLabels: AgeMode;
    linkRecency: LinkRecency;
    statusBarAge: boolean;
    spotlightNewest: boolean;
    spotlightColor: string;
    spotlightStrength: number;
    neighbourBleed: number;
    neighbourHops: number;
    clusterWarmth: number;
    clusterBy: ClusterBy;
}

export type ClusterBy = 'folder' | 'component';

const CLUSTER_MODES = ['folder', 'component'] as const;

const CLUSTER_LABELS: Record<ClusterBy, string> = {
    folder: 'The folder a note is in',
    component: 'The island of notes it links to'
};

const AGE_MODES = ['off', 'hover', 'titles'] as const;

const LINK_MODES = ['off', 'uniform', 'gradient'] as const;

const LINK_MODE_LABELS: Record<LinkRecency, string> = {
    off: 'Off',
    uniform: 'Match the newer note',
    gradient: 'Fade between the two'
};

const AGE_MODE_LABELS: Record<AgeMode, string> = {
    off: 'Never',
    hover: 'On hover',
    titles: 'Whenever titles are shown'
};

export const DEFAULT_SETTINGS: PulsarGraphSettings = {
    normalizeBy: 'vault',
    windowDays: 30,
    ageScale: 'even',
    fadeType: 'linear',
    minOpacity: 0.1,
    maxOpacity: 3.0,
    steepness: 2.0,
    numSteps: 5,
    ageLabels: 'hover',
    linkRecency: 'off',
    statusBarAge: false,
    spotlightNewest: false,
    spotlightColor: '#ffffff',
    spotlightStrength: 1,
    neighbourBleed: 0,
    neighbourHops: 1,
    clusterWarmth: 0,
    clusterBy: 'folder'
};

const STRENGTH_RANGE = { lowest: 0, highest: 1, step: 0.05 };

/** A day at the short end, a year at the long one. */
const WINDOW_RANGE = { lowest: 1, highest: 365, step: 1 };

/** Stops short of 1, where a single fresh note would light the whole graph. */
const BLEED_RANGE = { lowest: 0, highest: 0.95, step: 0.05 };

const HOPS_RANGE = { lowest: 1, highest: 3, step: 1 };

const WARMTH_RANGE = { lowest: 0, highest: 1, step: 0.05 };

/** Opacity above 1.0 keeps a node at full strength as the graph fades it. */
const MAX_OPACITY_LIMIT = 12;

/** The oldest note should only ever be dimmed, never boosted. */
const MIN_OPACITY_LIMIT = 1;

/**
 * Fine enough that a near-invisible minimum like 0.01 stays expressible, which
 * a coarser step would quietly round away. Both opacity sliders share it so
 * carrying one along with the other lands on an exact step.
 */
const OPACITY_STEP = 0.01;

const STEEPNESS_RANGE = { lowest: 0.1, highest: 10, step: 0.1 };
const STEPS_RANGE = { lowest: 1, highest: 20, step: 1 };

/** Enough dots to show the shape of a curve without crowding the labels. */
const PREVIEW_POINTS = 6;

interface NumberRange {
    lowest: number;
    highest: number;
    step: number;
}

/**
 * A slider and a number box over one value.
 *
 * The slider is for finding a value by eye and the box is for saying one
 * exactly, which matters at the bottom of the opacity range where a tenth of a
 * step is the difference between faint and invisible. The box is left alone
 * while it is being typed in and tidied up on the way out, so a half finished
 * number is never corrected underneath the cursor.
 */
class NumberControl {
    private slider: SliderComponent | undefined;
    private box: TextComponent | undefined;

    constructor(
        setting: Setting,
        private readonly range: NumberRange,
        value: number,
        private readonly commit: (value: number) => void
    ) {
        setting.addSlider((slider) => {
            this.slider = slider
                .setLimits(range.lowest, range.highest, range.step)
                .setValue(value)
                .setDynamicTooltip()
                .onChange((next) => {
                    this.box?.setValue(format(next));
                    this.commit(next);
                });
        });

        setting.addText((text) => {
            this.box = text.setValue(format(value)).onChange((raw) => {
                const parsed = Number.parseFloat(raw);
                if (!Number.isFinite(parsed)) {
                    return;
                }

                const next = clamp(parsed, this.range.lowest, this.range.highest);
                this.slider?.setValue(next);
                this.commit(next);
            });

            text.inputEl.addClass('pulsar-graph-number');
            text.inputEl.inputMode = 'decimal';
            text.inputEl.addEventListener('blur', () => {
                this.box?.setValue(format(this.slider?.getValue() ?? value));
            });
        });
    }

    /** Moves the control without reporting a change, for the other end of a pair. */
    setValue(value: number): void {
        this.slider?.setValue(value);
        this.box?.setValue(format(value));
    }
}

/** Trims the floating point dust a 0.01 step leaves behind. */
function format(value: number): string {
    return String(Math.round(value * 1000) / 1000);
}

/**
 * Reads saved settings, repairing anything missing, malformed or out of range.
 * Fade types used to be stored capitalized ('Linear'), so saved values are
 * matched case-insensitively, and opacity used to be free text, so a stored
 * range can be inverted or far outside what the sliders allow. Age labels used
 * to be a plain on-off toggle.
 */
export function parseSettings(stored: unknown): PulsarGraphSettings {
    const data = (stored ?? {}) as Record<string, unknown>;

    const minOpacity = clamp(parseNumber(data.minOpacity, DEFAULT_SETTINGS.minOpacity), 0, MIN_OPACITY_LIMIT);
    const maxOpacity = clamp(parseNumber(data.maxOpacity, DEFAULT_SETTINGS.maxOpacity), 0, MAX_OPACITY_LIMIT);

    return {
        normalizeBy: parseNormalizeBy(data.normalizeBy),
        windowDays: Math.round(clamp(parseNumber(data.windowDays, DEFAULT_SETTINGS.windowDays), WINDOW_RANGE.lowest, WINDOW_RANGE.highest)),
        ageScale: parseAgeScale(data.ageScale),
        fadeType: parseFadeType(data.fadeType),
        minOpacity: Math.min(minOpacity, maxOpacity),
        maxOpacity: Math.max(minOpacity, maxOpacity),
        steepness: clamp(parseNumber(data.steepness, DEFAULT_SETTINGS.steepness), STEEPNESS_RANGE.lowest, STEEPNESS_RANGE.highest),
        numSteps: Math.round(clamp(parseNumber(data.numSteps, DEFAULT_SETTINGS.numSteps), STEPS_RANGE.lowest, STEPS_RANGE.highest)),
        ageLabels: parseAgeMode(data.ageLabels, data.showAgeOnHover),
        linkRecency: LINK_MODES.find((mode) => mode === data.linkRecency) ?? DEFAULT_SETTINGS.linkRecency,
        statusBarAge: parseBoolean(data.statusBarAge, DEFAULT_SETTINGS.statusBarAge),
        spotlightNewest: parseBoolean(data.spotlightNewest, DEFAULT_SETTINGS.spotlightNewest),
        spotlightColor: parseColor(data.spotlightColor),
        spotlightStrength: clamp(parseNumber(data.spotlightStrength, DEFAULT_SETTINGS.spotlightStrength), STRENGTH_RANGE.lowest, STRENGTH_RANGE.highest),
        neighbourBleed: clamp(parseNumber(data.neighbourBleed, DEFAULT_SETTINGS.neighbourBleed), BLEED_RANGE.lowest, BLEED_RANGE.highest),
        neighbourHops: Math.round(clamp(parseNumber(data.neighbourHops, DEFAULT_SETTINGS.neighbourHops), HOPS_RANGE.lowest, HOPS_RANGE.highest)),
        clusterWarmth: clamp(parseNumber(data.clusterWarmth, DEFAULT_SETTINGS.clusterWarmth), WARMTH_RANGE.lowest, WARMTH_RANGE.highest),
        clusterBy: CLUSTER_MODES.find((mode) => mode === data.clusterBy) ?? DEFAULT_SETTINGS.clusterBy
    };
}

function parseAgeScale(value: unknown): AgeScale {
    return AGE_SCALES.find((scale) => scale === value) ?? DEFAULT_SETTINGS.ageScale;
}

function parseNormalizeBy(value: unknown): NormalizeBy {
    return NORMALIZE_MODES.find((mode) => mode === value) ?? DEFAULT_SETTINGS.normalizeBy;
}

function parseFadeType(value: unknown): FadeType {
    if (typeof value !== 'string') {
        return DEFAULT_SETTINGS.fadeType;
    }

    const normalized = value.toLowerCase();
    return FADE_TYPES.find((fadeType) => fadeType === normalized) ?? DEFAULT_SETTINGS.fadeType;
}

/** Carries the 1.1 on-off toggle onto the mode that replaced it. */
function parseAgeMode(value: unknown, legacy: unknown): AgeMode {
    if (typeof value === 'string') {
        const mode = AGE_MODES.find((candidate) => candidate === value);
        if (mode) {
            return mode;
        }
    }

    if (typeof legacy === 'boolean') {
        return legacy ? 'hover' : 'off';
    }

    return DEFAULT_SETTINGS.ageLabels;
}

/** Only a six digit hex colour survives; anything else falls back. */
function parseColor(value: unknown): string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : DEFAULT_SETTINGS.spotlightColor;
}

function parseNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, lowest: number, highest: number): number {
    return Math.min(Math.max(value, lowest), highest);
}

export class PulsarSettingTab extends PluginSettingTab {
    private previewEl: HTMLElement | null = null;

    constructor(app: App, private readonly plugin: PulsarGraphPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        const { settings } = this.plugin;

        containerEl.empty();
        this.previewEl = containerEl.createDiv({ cls: 'pulsar-graph-preview' });
        this.renderPreview();

        new Setting(containerEl)
            .setName('Measure age against')
            .setDesc("What counts as old. The whole history lets one ancient note set the far end for everything else; a window spends the entire range on the last so many days")
            .addDropdown((dropdown) => {
                for (const mode of NORMALIZE_MODES) {
                    dropdown.addOption(mode, NORMALIZE_LABELS[mode]);
                }

                dropdown.setValue(settings.normalizeBy).onChange(async (value) => {
                    settings.normalizeBy = value as NormalizeBy;
                    await this.plugin.saveSettings();
                    // The window length below only applies in window mode.
                    this.display();
                });
            });

        if (settings.normalizeBy === 'window') {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Window')
                    .setDesc('How many days back the range covers. Anything older sits at minimum opacity'),
                WINDOW_RANGE,
                settings.windowDays,
                (value) => {
                    settings.windowDays = Math.round(value);
                    this.save();
                }
            );
        }

        new Setting(containerEl)
            .setName('Age scale')
            .setDesc('How a gap between two notes becomes a gap in opacity. Rank spreads them evenly however lopsided your editing has been; logarithmic magnifies recent differences and flattens old ones')
            .addDropdown((dropdown) => {
                for (const scale of AGE_SCALES) {
                    dropdown.addOption(scale, AGE_SCALE_LABELS[scale]);
                }

                dropdown.setValue(settings.ageScale).onChange(async (value) => {
                    settings.ageScale = value as AgeScale;
                    await this.plugin.saveSettings();
                    this.renderPreview();
                });
            });

        new Setting(containerEl)
            .setName('Fade type')
            .setDesc('How opacity falls off between your oldest and newest note')
            .addDropdown((dropdown) => {
                for (const fadeType of FADE_TYPES) {
                    dropdown.addOption(fadeType, FADE_TYPE_LABELS[fadeType]);
                }

                dropdown.setValue(settings.fadeType).onChange(async (value) => {
                    settings.fadeType = value as FadeType;
                    await this.plugin.saveSettings();
                    // The curve controls below depend on the selected type.
                    this.display();
                });
            });

        // Each control carries the other along rather than refusing to move, so
        // the range can never invert and the correction is visible as it happens.
        let minOpacity: NumberControl | undefined;
        let maxOpacity: NumberControl | undefined;

        minOpacity = new NumberControl(
            new Setting(containerEl)
                .setName('Minimum opacity')
                .setDesc('How faint the oldest note becomes'),
            { lowest: 0, highest: MIN_OPACITY_LIMIT, step: OPACITY_STEP },
            settings.minOpacity,
            (value) => {
                settings.minOpacity = value;

                if (settings.maxOpacity < value) {
                    settings.maxOpacity = value;
                    maxOpacity?.setValue(value);
                }

                this.save();
            }
        );

        maxOpacity = new NumberControl(
            new Setting(containerEl)
                .setName('Maximum opacity')
                .setDesc('How bright the newest note becomes. Above 1.0 holds it at full strength as the rest of the graph fades'),
            { lowest: 0, highest: MAX_OPACITY_LIMIT, step: OPACITY_STEP },
            settings.maxOpacity,
            (value) => {
                settings.maxOpacity = value;

                if (settings.minOpacity > value) {
                    settings.minOpacity = value;
                    minOpacity?.setValue(value);
                }

                this.save();
            }
        );

        if (settings.fadeType === 'exponential') {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Steepness')
                    .setDesc('Higher values keep only the newest notes bright'),
                STEEPNESS_RANGE,
                settings.steepness,
                (value) => {
                    settings.steepness = value;
                    this.save();
                }
            );
        }

        if (settings.fadeType === 'step') {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Number of steps')
                    .setDesc('How many distinct bands of age the graph is divided into'),
                STEPS_RANGE,
                settings.numSteps,
                (value) => {
                    settings.numSteps = Math.round(value);
                    this.save();
                }
            );
        }

        new Setting(containerEl)
            .setName('Show note age')
            .setDesc('How long ago a note was modified, drawn above its node the way the title is drawn below it')
            .addDropdown((dropdown) => {
                for (const mode of AGE_MODES) {
                    dropdown.addOption(mode, AGE_MODE_LABELS[mode]);
                }

                dropdown.setValue(settings.ageLabels).onChange(async (value) => {
                    settings.ageLabels = value as AgeMode;
                    await this.plugin.saveSettings();
                });
            });

        new NumberControl(
            new Setting(containerEl)
                .setName('Group temperature')
                .setDesc('Pulls each note toward the middle of its group, so a part of the vault reads as alive or as cold at a glance. Unlike the glow below this moves notes both ways. Set it to zero to turn it off'),
            WARMTH_RANGE,
            settings.clusterWarmth,
            (value) => {
                const wasOff = settings.clusterWarmth === 0;
                settings.clusterWarmth = value;
                this.save();

                if (wasOff !== (value === 0)) {
                    this.display();
                }
            }
        );

        if (settings.clusterWarmth > 0) {
            new Setting(containerEl)
                .setName('Group notes by')
                .setDesc('Folders suit most vaults. Islands of linked notes suit a vault held together by links rather than by structure, but many vaults are one big island and a sea of unlinked notes')
                .addDropdown((dropdown) => {
                    for (const mode of CLUSTER_MODES) {
                        dropdown.addOption(mode, CLUSTER_LABELS[mode]);
                    }

                    dropdown.setValue(settings.clusterBy).onChange(async (value) => {
                        settings.clusterBy = value as ClusterBy;
                        await this.plugin.saveSettings();
                        this.renderPreview();
                    });
                });
        }

        new NumberControl(
            new Setting(containerEl)
                .setName('Neighbour glow')
                .setDesc('How much of a bright note carries to the notes it links to, so an area you are working in reads as a region rather than scattered points. Set it to zero to turn it off'),
            BLEED_RANGE,
            settings.neighbourBleed,
            (value) => {
                const wasOff = settings.neighbourBleed === 0;
                settings.neighbourBleed = value;
                this.save();

                // The reach below only applies once the glow is on.
                if (wasOff !== (value === 0)) {
                    this.display();
                }
            }
        );

        if (settings.neighbourBleed > 0) {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Glow reach')
                    .setDesc('How many links the glow travels along. Each step carries the same fraction again, so it falls away with distance'),
                HOPS_RANGE,
                settings.neighbourHops,
                (value) => {
                    settings.neighbourHops = Math.round(value);
                    this.save();
                }
            );
        }

        new Setting(containerEl)
            .setName('Age the links too')
            .setDesc('Links are drawn in one flat colour whatever their ends have been through. Give them the age of their livelier end, or fade each one along its length from the newer note to the older')
            .addDropdown((dropdown) => {
                for (const mode of LINK_MODES) {
                    dropdown.addOption(mode, LINK_MODE_LABELS[mode]);
                }

                dropdown.setValue(settings.linkRecency).onChange(async (value) => {
                    settings.linkRecency = value as LinkRecency;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('Show the open note\'s age in the status bar')
            .setDesc('Reads the note you have open rather than the graph, so it works with no graph view in sight')
            .addToggle((toggle) => toggle
                .setValue(settings.statusBarAge)
                .onChange(async (value) => {
                    settings.statusBarAge = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Spotlight the newest note')
            .setDesc('Paint the single most recently modified note a colour of your own, so the thing you touched last is findable at a glance')
            .addToggle((toggle) => toggle
                .setValue(settings.spotlightNewest)
                .onChange(async (value) => {
                    settings.spotlightNewest = value;
                    await this.plugin.saveSettings();
                    // The colour and strength below only apply when it is on.
                    this.display();
                })
            );

        if (settings.spotlightNewest) {
            new Setting(containerEl)
                .setName('Spotlight colour')
                .setDesc('White reads well on a dark theme. Pick something darker if yours is light')
                .addColorPicker((picker) => picker
                    .setValue(settings.spotlightColor)
                    .onChange(async (value) => {
                        settings.spotlightColor = value;
                        await this.plugin.saveSettings();
                    })
                );

            new NumberControl(
                new Setting(containerEl)
                    .setName('Spotlight strength')
                    .setDesc("How far the colour overrides the node's own. Below full strength it mixes with whatever colour your graph groups gave it"),
                STRENGTH_RANGE,
                settings.spotlightStrength,
                (value) => {
                    settings.spotlightStrength = value;
                    this.save();
                }
            );
        }

        // Presets move only the settings that shape the fade. What you have
        // chosen to show — labels, status bar, spotlight colour — is left alone.
        const presets = new Setting(containerEl)
            .setName('Presets')
            .setDesc(PRESETS.map((preset) => `${preset.name}: ${preset.description.toLowerCase()}`).join('. ') + '.')
            .addDropdown((dropdown) => {
                dropdown.addOption('', 'Choose a preset\u2026');

                for (const preset of PRESETS) {
                    dropdown.addOption(preset.id, preset.name);
                }

                dropdown.setValue('').onChange(async (value) => {
                    const preset = PRESETS.find((candidate) => candidate.id === value);
                    if (!preset) {
                        return;
                    }

                    Object.assign(settings, preset.settings);
                    await this.plugin.saveSettings();
                    this.display();
                });
            });

        presets.addButton((button) => button
            .setButtonText('Reset')
            .setTooltip('Put every setting back to its original value')
            .onClick(async () => {
                Object.assign(settings, DEFAULT_SETTINGS);
                await this.plugin.saveSettings();
                this.display();
            })
        );
    }

    hide(): void {
        this.previewEl = null;
    }

    private save(): void {
        void this.plugin.saveSettings();
        this.renderPreview();
    }

    /**
     * Dots at real ages from this vault, each drawn at the opacity the current
     * settings would give a note that old. It answers the question the numbers
     * on their own cannot: what does this actually look like.
     */
    private renderPreview(): void {
        const preview = this.previewEl;
        if (!preview) {
            return;
        }

        preview.empty();

        const samples = this.plugin.sampleCurve(PREVIEW_POINTS);
        if (samples.length === 0) {
            preview.createDiv({ cls: 'pulsar-graph-preview-empty', text: 'No notes to preview yet.' });
            return;
        }

        const now = Date.now();

        for (const sample of samples) {
            const point = preview.createDiv({ cls: 'pulsar-graph-preview-point' });

            // Opacity above 1 is clamped when the graph draws it, so the dot
            // tops out exactly where a real node would.
            point.createDiv({ cls: 'pulsar-graph-preview-dot' }).style.opacity = String(Math.min(1, sample.opacity));
            point.createDiv({ cls: 'pulsar-graph-preview-age', text: formatAge(sample.mtime, now) });
        }
    }
}
