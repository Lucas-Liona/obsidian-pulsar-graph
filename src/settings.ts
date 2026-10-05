import { App, PluginSettingTab, Setting, SliderComponent } from 'obsidian';
import { AgeMode } from './age-label';
import { FADE_TYPES, FADE_TYPE_LABELS, FadeType } from './fade';
import PulsarGraphPlugin from './main';

export interface PulsarGraphSettings {
    fadeType: FadeType;
    minOpacity: number;
    maxOpacity: number;
    steepness: number;
    numSteps: number;
    ageLabels: AgeMode;
    spotlightNewest: boolean;
    spotlightColor: string;
    spotlightStrength: number;
}

const AGE_MODES = ['off', 'hover', 'titles'] as const;

const AGE_MODE_LABELS: Record<AgeMode, string> = {
    off: 'Never',
    hover: 'On hover',
    titles: 'Whenever titles are shown'
};

export const DEFAULT_SETTINGS: PulsarGraphSettings = {
    fadeType: 'linear',
    minOpacity: 0.1,
    maxOpacity: 3.0,
    steepness: 2.0,
    numSteps: 5,
    ageLabels: 'hover',
    spotlightNewest: false,
    spotlightColor: '#ffffff',
    spotlightStrength: 1
};

const STRENGTH_RANGE = { lowest: 0, highest: 1, step: 0.05 };

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
        fadeType: parseFadeType(data.fadeType),
        minOpacity: Math.min(minOpacity, maxOpacity),
        maxOpacity: Math.max(minOpacity, maxOpacity),
        steepness: clamp(parseNumber(data.steepness, DEFAULT_SETTINGS.steepness), STEEPNESS_RANGE.lowest, STEEPNESS_RANGE.highest),
        numSteps: Math.round(clamp(parseNumber(data.numSteps, DEFAULT_SETTINGS.numSteps), STEPS_RANGE.lowest, STEPS_RANGE.highest)),
        ageLabels: parseAgeMode(data.ageLabels, data.showAgeOnHover),
        spotlightNewest: parseBoolean(data.spotlightNewest, DEFAULT_SETTINGS.spotlightNewest),
        spotlightColor: parseColor(data.spotlightColor),
        spotlightStrength: clamp(parseNumber(data.spotlightStrength, DEFAULT_SETTINGS.spotlightStrength), STRENGTH_RANGE.lowest, STRENGTH_RANGE.highest)
    };
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
    constructor(app: App, private readonly plugin: PulsarGraphPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        const { settings } = this.plugin;

        containerEl.empty();

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

        // Each slider carries the other along rather than refusing to move, so
        // the range can never invert and the correction is visible as it happens.
        let minOpacitySlider: SliderComponent | undefined;
        let maxOpacitySlider: SliderComponent | undefined;

        new Setting(containerEl)
            .setName('Minimum opacity')
            .setDesc('How faint the oldest note becomes')
            .addSlider((slider) => {
                minOpacitySlider = slider
                    .setLimits(0, MIN_OPACITY_LIMIT, OPACITY_STEP)
                    .setValue(settings.minOpacity)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.minOpacity = value;

                        if (settings.maxOpacity < value) {
                            settings.maxOpacity = value;
                            maxOpacitySlider?.setValue(value);
                        }

                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Maximum opacity')
            .setDesc('How bright the newest note becomes. Above 1.0 holds it at full strength as the rest of the graph fades')
            .addSlider((slider) => {
                maxOpacitySlider = slider
                    .setLimits(0, MAX_OPACITY_LIMIT, OPACITY_STEP)
                    .setValue(settings.maxOpacity)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.maxOpacity = value;

                        if (settings.minOpacity > value) {
                            settings.minOpacity = value;
                            minOpacitySlider?.setValue(value);
                        }

                        await this.plugin.saveSettings();
                    });
            });

        if (settings.fadeType === 'exponential') {
            new Setting(containerEl)
                .setName('Steepness')
                .setDesc('Higher values keep only the newest notes bright')
                .addSlider((slider) => slider
                    .setLimits(STEEPNESS_RANGE.lowest, STEEPNESS_RANGE.highest, STEEPNESS_RANGE.step)
                    .setValue(settings.steepness)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.steepness = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        if (settings.fadeType === 'step') {
            new Setting(containerEl)
                .setName('Number of steps')
                .setDesc('How many distinct bands of age the graph is divided into')
                .addSlider((slider) => slider
                    .setLimits(STEPS_RANGE.lowest, STEPS_RANGE.highest, STEPS_RANGE.step)
                    .setValue(settings.numSteps)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.numSteps = value;
                        await this.plugin.saveSettings();
                    })
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

            new Setting(containerEl)
                .setName('Spotlight strength')
                .setDesc("How far the colour overrides the node's own. Below full strength it mixes with whatever colour your graph groups gave it")
                .addSlider((slider) => slider
                    .setLimits(STRENGTH_RANGE.lowest, STRENGTH_RANGE.highest, STRENGTH_RANGE.step)
                    .setValue(settings.spotlightStrength)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.spotlightStrength = value;
                        await this.plugin.saveSettings();
                    })
                );
        }

        new Setting(containerEl)
            .setName('Reset to defaults')
            .setDesc('Put every setting above back to its original value')
            .addButton((button) => button
                .setButtonText('Reset')
                .onClick(async () => {
                    Object.assign(settings, DEFAULT_SETTINGS);
                    await this.plugin.saveSettings();
                    this.display();
                })
            );
    }
}
