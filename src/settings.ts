import { App, PluginSettingTab, Setting } from 'obsidian';
import { FADE_TYPES, FADE_TYPE_LABELS, FadeType } from './fade';
import PulsarGraphPlugin from './main';

export interface PulsarGraphSettings {
    fadeType: FadeType;
    minOpacity: number;
    maxOpacity: number;
    steepness: number;
    numSteps: number;
}

export const DEFAULT_SETTINGS: PulsarGraphSettings = {
    fadeType: 'linear',
    minOpacity: 0.1,
    maxOpacity: 3.0,
    steepness: 2.0,
    numSteps: 5
};

const MAX_OPACITY_LIMIT = 12;

/**
 * Reads saved settings, falling back to defaults for anything missing or
 * malformed. Fade types used to be stored capitalized ('Linear'), so saved
 * values are matched case-insensitively.
 */
export function parseSettings(stored: unknown): PulsarGraphSettings {
    const data = (stored ?? {}) as Record<string, unknown>;

    return {
        fadeType: parseFadeType(data.fadeType),
        minOpacity: parseNumber(data.minOpacity, DEFAULT_SETTINGS.minOpacity),
        maxOpacity: parseNumber(data.maxOpacity, DEFAULT_SETTINGS.maxOpacity),
        steepness: parseNumber(data.steepness, DEFAULT_SETTINGS.steepness),
        numSteps: parseNumber(data.numSteps, DEFAULT_SETTINGS.numSteps)
    };
}

function parseFadeType(value: unknown): FadeType {
    if (typeof value !== 'string') {
        return DEFAULT_SETTINGS.fadeType;
    }

    const normalized = value.toLowerCase();
    return FADE_TYPES.find((fadeType) => fadeType === normalized) ?? DEFAULT_SETTINGS.fadeType;
}

function parseNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
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
            .setDesc('Choose the function that determines how opacity is calculated')
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

        new Setting(containerEl)
            .setName('Minimum opacity')
            .setDesc('Opacity for oldest notes (0.0 to 1.0)')
            .addText((text) => text
                .setPlaceholder(String(DEFAULT_SETTINGS.minOpacity))
                .setValue(String(settings.minOpacity))
                .onChange(async (value) => {
                    const opacity = Number.parseFloat(value);
                    if (Number.isFinite(opacity) && opacity >= 0 && opacity <= 1) {
                        settings.minOpacity = opacity;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(containerEl)
            .setName('Maximum opacity')
            .setDesc(`Opacity for newest notes (0.0 to ${MAX_OPACITY_LIMIT.toFixed(1)})`)
            .addText((text) => text
                .setPlaceholder(String(DEFAULT_SETTINGS.maxOpacity))
                .setValue(String(settings.maxOpacity))
                .onChange(async (value) => {
                    const opacity = Number.parseFloat(value);
                    if (Number.isFinite(opacity) && opacity >= 0 && opacity <= MAX_OPACITY_LIMIT) {
                        settings.maxOpacity = opacity;
                        await this.plugin.saveSettings();
                    }
                })
            );

        if (settings.fadeType === 'exponential') {
            new Setting(containerEl)
                .setName('Steepness')
                .setDesc('Controls curve steepness (1.0 = linear, >1 = convex, <1 = concave)')
                .addSlider((slider) => slider
                    .setLimits(0.1, 10.0, 0.1)
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
                .setDesc('Controls the number of different possible opacities')
                .addSlider((slider) => slider
                    .setLimits(1, 20, 1)
                    .setValue(settings.numSteps)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        settings.numSteps = value;
                        await this.plugin.saveSettings();
                    })
                );
        }
    }
}
