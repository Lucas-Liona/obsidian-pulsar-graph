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

/** Opacity above 1.0 keeps a node at full strength as the graph fades it. */
const MAX_OPACITY_LIMIT = 12;

/** The oldest note should never be boosted, only dimmed. */
const MIN_OPACITY_LIMIT = 1;

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

interface OpacityField {
    name: string;
    description: string;
    placeholder: number;
    read: () => number;
    write: (opacity: number) => void;
    bounds: () => { lowest: number; highest: number };
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

        this.addOpacityField({
            name: 'Minimum opacity',
            description: `Opacity for the oldest note (0.0 to ${MIN_OPACITY_LIMIT.toFixed(1)}), and never above the maximum`,
            placeholder: DEFAULT_SETTINGS.minOpacity,
            read: () => settings.minOpacity,
            write: (opacity) => { settings.minOpacity = opacity; },
            bounds: () => ({ lowest: 0, highest: Math.min(MIN_OPACITY_LIMIT, settings.maxOpacity) })
        });

        this.addOpacityField({
            name: 'Maximum opacity',
            description: `Opacity for the newest note (0.0 to ${MAX_OPACITY_LIMIT.toFixed(1)}), and never below the minimum`,
            placeholder: DEFAULT_SETTINGS.maxOpacity,
            read: () => settings.maxOpacity,
            write: (opacity) => { settings.maxOpacity = opacity; },
            bounds: () => ({ lowest: settings.minOpacity, highest: MAX_OPACITY_LIMIT })
        });

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

    /**
     * An opacity field, clamped into its allowed range so the two values cannot
     * cross. Entries are text rather than a slider because the useful range
     * depends on the theme and on how far the vault's note ages spread.
     */
    private addOpacityField(field: OpacityField): void {
        new Setting(this.containerEl)
            .setName(field.name)
            .setDesc(field.description)
            .addText((text) => {
                text
                    .setPlaceholder(String(field.placeholder))
                    .setValue(String(field.read()))
                    .onChange(async (value) => {
                        const entered = Number.parseFloat(value);
                        if (!Number.isFinite(entered)) {
                            return;
                        }

                        const { lowest, highest } = field.bounds();
                        field.write(Math.min(Math.max(entered, lowest), highest));
                        await this.plugin.saveSettings();
                    });

                // Entries are clamped and unparseable ones are ignored, so the
                // field is rewritten once editing stops: what is shown is then
                // always what is stored.
                text.inputEl.addEventListener('blur', () => {
                    text.setValue(String(field.read()));
                });
            });
    }
}
