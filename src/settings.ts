import { App, Notice, PluginSettingTab, Setting, SliderComponent, TextComponent } from 'obsidian';
import { formatAge } from './age';
import { readSnapshots } from './file-recovery';
import { AgeMode } from './age-label';
import { InkMode } from './ink';
import { LinkRecency } from './links';
import { OpacityRange, WHOLE_RANGE } from './filter';
import { parseSharedPresets, PresetSettings, PRESETS, SavedPreset, snapshot } from './presets';
import { RangeBar } from './range-bar';
import { TabFade, TabFadeCurve, TabFadeScope } from './tabs';
import { FADE_TYPES, FADE_TYPE_LABELS, FadeType } from './fade';
import PulsarGraphPlugin from './main';

export type NormalizeBy = 'vault' | 'window';

const NORMALIZE_MODES = ['vault', 'window'] as const;

const NORMALIZE_LABELS: Record<NormalizeBy, string> = {
    vault: "The vault's whole history",
    window: 'A recent window'
};

export type AgeScale = 'even' | 'rank' | 'log' | 'halflife';

/**
 * How a sitting count becomes a 0-1 figure. A half-life is missing on purpose:
 * it measures elapsed days, and a count is not a date.
 */
export type IntensityScale = 'even' | 'rank' | 'log';

const INTENSITY_SCALES = ['even', 'rank', 'log'] as const;

const INTENSITY_LABELS: Record<IntensityScale, string> = {
    even: 'Against the busiest note',
    rank: 'By rank',
    log: 'Logarithmic'
};

const AGE_SCALES = ['even', 'rank', 'log', 'halflife'] as const;

const AGE_SCALE_LABELS: Record<AgeScale, string> = {
    even: 'Even',
    rank: 'By rank',
    log: 'Logarithmic',
    halflife: 'By half-life'
};

export interface PulsarGraphSettings {
    normalizeBy: NormalizeBy;
    windowDays: number;
    ageScale: AgeScale;
    halfLifeDays: number;
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
    sessionTrails: boolean;
    sessionGapMinutes: number;
    trailColor: string;
    trailStrength: number;
    saved: SavedPreset[];
    ink: boolean;
    inkMode: InkMode;
    inkMinutes: number;
    inkColor: string;
    inkPinColor: string;
    inkDim: number;
    nodeSizeByAge: boolean;
    nodeSizeSmallest: number;
    nodeSizeLargest: number;
    titleScale: number;
    filterEnabled: boolean;
    filterCaption: boolean;
    filterRanges: OpacityRange[];
    tabFade: TabFade;
    tabFadeScope: TabFadeScope;
    tabFadeCurve: TabFadeCurve;
    tabFadeAfter: number;
    tabFadeFloor: number;
    tabDot: boolean;
    staleTabs: boolean;
    staleTabAfter: number;
    history: boolean;
    historyCap: number;
    intensityBlend: number;
    intensityScale: IntensityScale;
}

const TAB_MODES = ['off', 'attention', 'modified'] as const;

const TAB_MODE_LABELS: Record<TabFade, string> = {
    off: 'Never',
    attention: 'By how long since you looked at it',
    modified: 'By how long since it was edited'
};

const TAB_SCOPES = ['title', 'tab'] as const;

const TAB_SCOPE_LABELS: Record<TabFadeScope, string> = {
    title: 'The icon and title',
    tab: 'The whole tab'
};

const TAB_CURVES = ['over', 'at'] as const;

const TAB_CURVE_LABELS: Record<TabFadeCurve, string> = {
    over: 'Gradually, over that long',
    at: 'All at once, at that point'
};

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
    halfLifeDays: 14,
    fadeType: 'linear',
    minOpacity: 0.1,
    maxOpacity: 3.0,
    steepness: 2.0,
    numSteps: 5,
    ageLabels: 'hover',
    linkRecency: 'off',
    statusBarAge: true,
    spotlightNewest: false,
    spotlightColor: '#ffffff',
    spotlightStrength: 1,
    neighbourBleed: 0,
    neighbourHops: 1,
    clusterWarmth: 0,
    clusterBy: 'folder',
    sessionTrails: false,
    sessionGapMinutes: 30,
    trailColor: '#5ac8fa',
    trailStrength: 0.55,
    saved: [],
    ink: false,
    inkMode: 'colour',
    inkMinutes: 5,
    inkColor: '#ff7a45',
    inkPinColor: '#ffc53d',
    inkDim: 0.45,
    nodeSizeByAge: false,
    nodeSizeSmallest: 0.7,
    nodeSizeLargest: 1.8,
    titleScale: 1,
    filterEnabled: false,
    filterCaption: true,
    filterRanges: [{ ...WHOLE_RANGE }],
    tabFade: 'off',
    tabFadeScope: 'tab',
    tabFadeCurve: 'over',
    tabFadeAfter: 60,
    tabFadeFloor: 0.35,
    tabDot: false,
    staleTabs: false,
    staleTabAfter: 240,
    // On by default, unlike everything else past the core fade. The rule that
    // keeps extras off exists so nothing changes the look of someone's Obsidian
    // uninvited; this changes nothing on screen, writes only numbers, and into
    // a file of this plugin's own. It is also worth nothing until it has been
    // running a while, so starting it off would mean nobody ever has history.
    history: true,
    historyCap: 100,
    intensityBlend: 0,
    intensityScale: 'rank'
};

/** A minute is twitchy; a day never arrives while you are looking. */
const TAB_AFTER_RANGE = { lowest: 1, highest: 480, step: 1 };

const STALE_AFTER_RANGE = { lowest: 5, highest: 2880, step: 5 };

const TAB_FLOOR_RANGE = { lowest: 0.1, highest: 1, step: 0.05 };

const STRENGTH_RANGE = { lowest: 0, highest: 1, step: 0.05 };

/** A day at the short end, a year at the long one. */
const WINDOW_RANGE = { lowest: 1, highest: 365, step: 1 };

const HALF_LIFE_RANGE = { lowest: 1, highest: 365, step: 1 };

/** Stops short of 1, where a single fresh note would light the whole graph. */
const BLEED_RANGE = { lowest: 0, highest: 0.95, step: 0.05 };

const HOPS_RANGE = { lowest: 1, highest: 3, step: 1 };

const WARMTH_RANGE = { lowest: 0, highest: 1, step: 0.05 };

/** Five minutes is one distracted pass; four hours is a long sitting. */
const SESSION_RANGE = { lowest: 1, highest: 240, step: 1 };

const HISTORY_CAP_RANGE = { lowest: 10, highest: 1000, step: 10 };

const BLEND_RANGE = { lowest: 0, highest: 1, step: 0.05 };

/** What a node's own size is multiplied by. Obsidian's own slider is separate. */
const NODE_SIZE_RANGE = { lowest: 0.2, highest: 3, step: 0.1 };

/** Minutes for fresh writing to cool back to ordinary text. */
const INK_RANGE = { lowest: 1, highest: 240, step: 1 };

/** How far the rest of the page dims, as a fraction of the way to the background. */
const INK_DIM_RANGE = { lowest: 0.1, highest: 0.9, step: 0.05 };

const INK_MODES = ['colour', 'dim'] as const;

const INK_MODE_LABELS: Record<InkMode, string> = {
    colour: 'Colour what is new',
    dim: 'Dim everything else'
};

/** What a title's font is multiplied by. Obsidian offers no control at all. */
const TITLE_SCALE_RANGE = { lowest: 0.5, highest: 2.5, step: 0.05 };

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
        halfLifeDays: Math.round(clamp(parseNumber(data.halfLifeDays, DEFAULT_SETTINGS.halfLifeDays), HALF_LIFE_RANGE.lowest, HALF_LIFE_RANGE.highest)),
        fadeType: parseFadeType(data.fadeType),
        minOpacity: Math.min(minOpacity, maxOpacity),
        maxOpacity: Math.max(minOpacity, maxOpacity),
        steepness: clamp(parseNumber(data.steepness, DEFAULT_SETTINGS.steepness), STEEPNESS_RANGE.lowest, STEEPNESS_RANGE.highest),
        numSteps: Math.round(clamp(parseNumber(data.numSteps, DEFAULT_SETTINGS.numSteps), STEPS_RANGE.lowest, STEPS_RANGE.highest)),
        ageLabels: parseAgeMode(data.ageLabels, data.showAgeOnHover),
        linkRecency: LINK_MODES.find((mode) => mode === data.linkRecency) ?? DEFAULT_SETTINGS.linkRecency,
        statusBarAge: parseBoolean(data.statusBarAge, DEFAULT_SETTINGS.statusBarAge),
        spotlightNewest: parseBoolean(data.spotlightNewest, DEFAULT_SETTINGS.spotlightNewest),
        spotlightColor: parseColor(data.spotlightColor, DEFAULT_SETTINGS.spotlightColor),
        spotlightStrength: clamp(parseNumber(data.spotlightStrength, DEFAULT_SETTINGS.spotlightStrength), STRENGTH_RANGE.lowest, STRENGTH_RANGE.highest),
        neighbourBleed: clamp(parseNumber(data.neighbourBleed, DEFAULT_SETTINGS.neighbourBleed), BLEED_RANGE.lowest, BLEED_RANGE.highest),
        neighbourHops: Math.round(clamp(parseNumber(data.neighbourHops, DEFAULT_SETTINGS.neighbourHops), HOPS_RANGE.lowest, HOPS_RANGE.highest)),
        clusterWarmth: clamp(parseNumber(data.clusterWarmth, DEFAULT_SETTINGS.clusterWarmth), WARMTH_RANGE.lowest, WARMTH_RANGE.highest),
        clusterBy: CLUSTER_MODES.find((mode) => mode === data.clusterBy) ?? DEFAULT_SETTINGS.clusterBy,
        sessionTrails: parseBoolean(data.sessionTrails, DEFAULT_SETTINGS.sessionTrails),
        sessionGapMinutes: Math.round(clamp(parseNumber(data.sessionGapMinutes, DEFAULT_SETTINGS.sessionGapMinutes), SESSION_RANGE.lowest, SESSION_RANGE.highest)),
        trailColor: parseColor(data.trailColor, DEFAULT_SETTINGS.trailColor),
        trailStrength: clamp(parseNumber(data.trailStrength, DEFAULT_SETTINGS.trailStrength), STRENGTH_RANGE.lowest, STRENGTH_RANGE.highest),
        saved: parseSaved(data.saved),
        ink: parseBoolean(data.ink, DEFAULT_SETTINGS.ink),
        inkMode: INK_MODES.find((mode) => mode === data.inkMode) ?? DEFAULT_SETTINGS.inkMode,
        inkPinColor: parseColor(data.inkPinColor, DEFAULT_SETTINGS.inkPinColor),
        inkDim: clamp(parseNumber(data.inkDim, DEFAULT_SETTINGS.inkDim), INK_DIM_RANGE.lowest, INK_DIM_RANGE.highest),
        inkMinutes: clamp(parseNumber(data.inkMinutes, DEFAULT_SETTINGS.inkMinutes), INK_RANGE.lowest, INK_RANGE.highest),
        inkColor: parseColor(data.inkColor, DEFAULT_SETTINGS.inkColor),
        nodeSizeByAge: parseBoolean(data.nodeSizeByAge, DEFAULT_SETTINGS.nodeSizeByAge),
        nodeSizeSmallest: clamp(parseNumber(data.nodeSizeSmallest, DEFAULT_SETTINGS.nodeSizeSmallest), NODE_SIZE_RANGE.lowest, NODE_SIZE_RANGE.highest),
        nodeSizeLargest: clamp(parseNumber(data.nodeSizeLargest, DEFAULT_SETTINGS.nodeSizeLargest), NODE_SIZE_RANGE.lowest, NODE_SIZE_RANGE.highest),
        titleScale: clamp(parseNumber(data.titleScale, DEFAULT_SETTINGS.titleScale), TITLE_SCALE_RANGE.lowest, TITLE_SCALE_RANGE.highest),
        filterEnabled: parseBoolean(data.filterEnabled, DEFAULT_SETTINGS.filterEnabled),
        filterCaption: parseBoolean(data.filterCaption, DEFAULT_SETTINGS.filterCaption),
        filterRanges: parseRanges(data.filterRanges),
        tabFade: TAB_MODES.find((mode) => mode === data.tabFade) ?? DEFAULT_SETTINGS.tabFade,
        tabFadeScope: TAB_SCOPES.find((scope) => scope === data.tabFadeScope) ?? DEFAULT_SETTINGS.tabFadeScope,
        tabFadeCurve: TAB_CURVES.find((curve) => curve === data.tabFadeCurve) ?? DEFAULT_SETTINGS.tabFadeCurve,
        tabFadeAfter: Math.round(clamp(parseNumber(data.tabFadeAfter, DEFAULT_SETTINGS.tabFadeAfter), TAB_AFTER_RANGE.lowest, TAB_AFTER_RANGE.highest)),
        tabFadeFloor: clamp(parseNumber(data.tabFadeFloor, DEFAULT_SETTINGS.tabFadeFloor), TAB_FLOOR_RANGE.lowest, TAB_FLOOR_RANGE.highest),
        tabDot: parseBoolean(data.tabDot, DEFAULT_SETTINGS.tabDot),
        staleTabs: parseBoolean(data.staleTabs, DEFAULT_SETTINGS.staleTabs),
        staleTabAfter: Math.round(clamp(parseNumber(data.staleTabAfter, DEFAULT_SETTINGS.staleTabAfter), STALE_AFTER_RANGE.lowest, STALE_AFTER_RANGE.highest)),
        history: parseBoolean(data.history, DEFAULT_SETTINGS.history),
        historyCap: Math.round(clamp(parseNumber(data.historyCap, DEFAULT_SETTINGS.historyCap), HISTORY_CAP_RANGE.lowest, HISTORY_CAP_RANGE.highest)),
        intensityBlend: clamp(parseNumber(data.intensityBlend, DEFAULT_SETTINGS.intensityBlend), BLEND_RANGE.lowest, BLEND_RANGE.highest),
        intensityScale: INTENSITY_SCALES.find((scale) => scale === data.intensityScale) ?? DEFAULT_SETTINGS.intensityScale
    };
}

/**
 * Saved presets arrive from a file someone may have hand-edited or pasted from
 * elsewhere, so every one is put back through the same repair the live settings
 * get. A preset can be incomplete or wrong; it cannot be dangerous.
 */
/** A range is only kept if it is a real stretch of the line, in order. */
function parseRanges(value: unknown): OpacityRange[] {
    if (!Array.isArray(value)) {
        return [{ ...WHOLE_RANGE }];
    }

    const ranges: OpacityRange[] = [];

    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }

        const { from, to } = entry as { from?: unknown; to?: unknown };
        const low = clamp(parseNumber(from, 0), 0, 1);
        const high = clamp(parseNumber(to, 1), 0, 1);

        if (high > low) {
            ranges.push({ from: low, to: high });
        }
    }

    return ranges.length > 0 ? ranges : [{ ...WHOLE_RANGE }];
}

function parseSaved(value: unknown): SavedPreset[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const presets: SavedPreset[] = [];

    for (const entry of value) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }

        const { name, settings } = entry as { name?: unknown; settings?: unknown };

        if (typeof name === 'string' && name.trim().length > 0) {
            presets.push({ name: name.trim().slice(0, 60), settings: repairPreset(settings) });
        }
    }

    return presets;
}

/** Repairs a stored snapshot the same way live settings are repaired. */
export function repairPreset(stored: unknown): PresetSettings {
    return snapshot(parseSettings(stored));
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
function parseColor(value: unknown, fallback: string): string {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;
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
    private statsEl: HTMLElement | null = null;

    constructor(app: App, private readonly plugin: PulsarGraphPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        const { settings } = this.plugin;

        // Turning a setting on rebuilds the tab to reveal what it unlocks, and
        // this element is the one that scrolls, so emptying it would otherwise
        // throw the reader back to the top mid-thought.
        const scroll = containerEl.scrollTop;

        containerEl.empty();
        this.previewEl = containerEl.createDiv({ cls: 'pulsar-graph-preview' });
        this.renderPreview();

        const section = (name: string): void => {
            new Setting(containerEl).setName(name).setHeading();
        };

        section('Time');

        // The scale comes first because it decides what the rest of this
        // section is even for: a half-life is measured against the calendar,
        // so the range every other scale needs does not apply to it.
        new Setting(containerEl)
            .setName('Age scale')
            .setDesc('How a gap between two notes becomes a gap in opacity. Rank spreads them evenly however lopsided your editing has been; logarithmic magnifies recent differences and flattens old ones; a half-life measures each note against the clock instead of against the others')
            .addDropdown((dropdown) => {
                for (const scale of AGE_SCALES) {
                    dropdown.addOption(scale, AGE_SCALE_LABELS[scale]);
                }

                dropdown.setValue(settings.ageScale).onChange(async (value) => {
                    settings.ageScale = value as AgeScale;
                    await this.plugin.saveSettings();
                    // A half-life replaces the range settings below rather than
                    // adding to them.
                    this.display();
                });
            });

        if (settings.ageScale === 'halflife') {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Half-life')
                    .setDesc('Days for a note to fade halfway. Twice that and it is a quarter as bright, and so on. Nothing else in the vault changes what a note is worth, so adding or deleting notes leaves every other brightness exactly where it was'),
                HALF_LIFE_RANGE,
                settings.halfLifeDays,
                (value) => {
                    settings.halfLifeDays = Math.round(value);
                    this.save();
                }
            );
        } else {
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
        }

        section('Fade');

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

        section('Clusters');

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

        section('Links');

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
            .setName('Trace what was written together')
            .setDesc('Colour the link between two notes that were saved close enough together to have been open in the same sitting. It says nothing about how long ago, which the fade is already for')
            .addToggle((toggle) => toggle
                .setValue(settings.sessionTrails)
                .onChange(async (value) => {
                    settings.sessionTrails = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (settings.sessionTrails) {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Counts as one sitting')
                    .setDesc('How many minutes apart two notes can be saved and still be treated as worked on together'),
                SESSION_RANGE,
                settings.sessionGapMinutes,
                (value) => {
                    settings.sessionGapMinutes = Math.round(value);
                    this.save();
                }
            );

            new Setting(containerEl)
                .setName('Trail colour')
                .setDesc('Kept clear of the spotlight colour by default, so the two mean different things on sight')
                .addColorPicker((picker) => picker
                    .setValue(settings.trailColor)
                    .onChange(async (value) => {
                        settings.trailColor = value;
                        await this.plugin.saveSettings();
                    })
                );

            new NumberControl(
                new Setting(containerEl)
                    .setName('Trail strength')
                    .setDesc('How far a trail goes toward that colour. Below full it is mixed with the colour links are normally drawn in, which keeps it off the eye'),
                STRENGTH_RANGE,
                settings.trailStrength,
                (value) => {
                    settings.trailStrength = value;
                    this.save();
                }
            );
        }

        section('Fresh writing');

        new Setting(containerEl)
            .setName('Light up what you just wrote')
            .setDesc('Text takes a colour as you type it and cools back to normal over the next few minutes, so a page you have been working in shows where the work was. Nothing is written to the note — it is a colour in the editor and the file on disk is untouched')
            .addToggle((toggle) => toggle
                .setValue(settings.ink)
                .onChange(async (value) => {
                    settings.ink = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (settings.ink) {
            new Setting(containerEl)
                .setName('How it shows')
                .setDesc('Colour the new writing and leave the page alone, or leave the writing alone and dim everything around it. Dimming never replaces a colour you chose, so it suits working; colouring reads better in a screenshot')
                .addDropdown((dropdown) => {
                    for (const mode of INK_MODES) {
                        dropdown.addOption(mode, INK_MODE_LABELS[mode]);
                    }

                    dropdown.setValue(settings.inkMode).onChange(async (value) => {
                        settings.inkMode = value as InkMode;
                        await this.plugin.saveSettings();
                        this.display();
                    });
                });

            if (settings.inkMode === 'dim') {
                new NumberControl(
                    new Setting(containerEl)
                        .setName('How far it dims')
                        .setDesc('How much of the way toward the background the rest of the page goes. A note with nothing lit in it is never dimmed at all'),
                    INK_DIM_RANGE,
                    settings.inkDim,
                    (value) => {
                        settings.inkDim = value;
                        this.save();
                    }
                );
            }

            new NumberControl(
                new Setting(containerEl)
                    .setName('Cools over')
                    .setDesc('Minutes for fresh writing to fade all the way back. Longer makes a whole session legible; shorter keeps it to what you are doing right now'),
                INK_RANGE,
                settings.inkMinutes,
                (value) => {
                    settings.inkMinutes = Math.round(value);
                    this.save();
                }
            );

            new Setting(containerEl)
                .setName('Colour')
                .setDesc('What the newest writing is drawn in. It cools toward whatever colour that text would otherwise be, so a heading ends up its own colour rather than your body text colour')
                .addColorPicker((picker) => picker
                    .setValue(settings.inkColor)
                    .onChange(async (value) => {
                        settings.inkColor = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName('Pinned colour')
                .setDesc('What a stretch you have pinned is drawn in. A pin does not cool — it is a marker rather than a timestamp, and one that faded is one you would miss')
                .addColorPicker((picker) => picker
                    .setValue(settings.inkPinColor)
                    .onChange(async (value) => {
                        settings.inkPinColor = value;
                        await this.plugin.saveSettings();
                    })
                );

            new Setting(containerEl)
                .setName('Start again')
                .setDesc('Cools everything at once, so what is on the page counts as old and the next thing you write stands on its own. Also a command')
                .addButton((button) => button
                    .setButtonText('Cool it all')
                    .onClick(() => this.plugin.forgetInk())
                );
        }

        section('Size');

        new Setting(containerEl)
            .setName('Size nodes by age')
            .setDesc("Obsidian sizes a node by how many links it has and nothing else, and that formula does not leave its floor until a note has seven of them — in this vault most notes are all exactly the same size. This multiplies Obsidian's own number rather than replacing it, so a hub still reads as a hub")
            .addToggle((toggle) => toggle
                .setValue(settings.nodeSizeByAge)
                .onChange(async (value) => {
                    settings.nodeSizeByAge = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (settings.nodeSizeByAge) {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Oldest at')
                    .setDesc('What the dimmest note is multiplied by'),
                NODE_SIZE_RANGE,
                settings.nodeSizeSmallest,
                (value) => {
                    settings.nodeSizeSmallest = value;
                    this.save();
                }
            );

            new NumberControl(
                new Setting(containerEl)
                    .setName('Newest at')
                    .setDesc('What the brightest note is multiplied by. Below the oldest is allowed, which runs it the other way round'),
                NODE_SIZE_RANGE,
                settings.nodeSizeLargest,
                (value) => {
                    settings.nodeSizeLargest = value;
                    this.save();
                }
            );
        }

        new NumberControl(
            new Setting(containerEl)
                .setName('Title size')
                .setDesc('What every name on the graph is multiplied by. Obsidian offers no control over this at all, and its default is tied to the node size, so a small-node graph has titles to match whether or not you wanted that'),
            TITLE_SCALE_RANGE,
            settings.titleScale,
            (value) => {
                settings.titleScale = value;
                this.save();
            }
        );

        section('Age filter');

        new Setting(containerEl)
            .setName('Hide notes outside a range')
            .setDesc('Takes them out of the graph entirely rather than dimming them, so what is left re-packs. The note you have open is always kept')
            .addToggle((toggle) => toggle
                .setValue(settings.filterEnabled)
                .onChange(async (value) => {
                    settings.filterEnabled = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (settings.filterEnabled) {
            new Setting(containerEl)
                .setName('Say so on the graph')
                .setDesc('A line across the top of the graph naming what is left, since a graph with half its notes taken out looks exactly like a graph. It is only there while something is actually being hidden')
                .addToggle((toggle) => toggle
                    .setValue(settings.filterCaption)
                    .onChange(async (value) => {
                        settings.filterCaption = value;
                        await this.plugin.saveSettings();
                    })
                );

            const bar = new Setting(containerEl)
                .setName('Keep')
                .setDesc('Drag a handle to move one edge, or the lit stretch between them to move the whole range without changing its width. Several ranges are allowed, so you can keep the oldest and the newest and nothing in between');

            const holder = containerEl.createDiv();

            const rangeBar = new RangeBar(holder, {
                histogram: this.plugin.measureVault().spread,
                describe: (ranges) => this.plugin.describeRange(ranges),
                onPreview: (ranges) => this.plugin.previewRanges(ranges),
                onChange: (ranges) => {
                    this.plugin.previewRanges(null);
                    settings.filterRanges = ranges;
                    this.save();
                }
            });

            rangeBar.setRanges(settings.filterRanges);

            bar.addExtraButton((button) => button
                .setIcon('plus')
                .setTooltip('Add another range')
                .onClick(async () => {
                    settings.filterRanges.push({ from: 0, to: 0.2 });
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

            if (settings.filterRanges.length > 1) {
                bar.addExtraButton((button) => button
                    .setIcon('minus')
                    .setTooltip('Remove the last range')
                    .onClick(async () => {
                        settings.filterRanges.pop();
                        await this.plugin.saveSettings();
                        this.display();
                    })
                );
            }
        }

        section('Labels');

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
            .setName('Show the open note\'s age in the status bar')
            .setDesc('Reads the note you have open rather than the graph, so it works with no graph view in sight')
            .addToggle((toggle) => toggle
                .setValue(settings.statusBarAge)
                .onChange(async (value) => {
                    settings.statusBarAge = value;
                    await this.plugin.saveSettings();
                })
            );

        section('Tabs');

        new Setting(containerEl)
            .setName('Show a dot beside each tab')
            .setDesc("A filled circle at that note's brightness in the graph, so its age reads at a glance without opening the graph at all. The newest note takes the spotlight colour when the spotlight is on")
            .addToggle((toggle) => toggle
                .setValue(settings.tabDot)
                .onChange(async (value) => {
                    settings.tabDot = value;
                    await this.plugin.saveSettings();
                })
            );

        new Setting(containerEl)
            .setName('Fade tabs')
            .setDesc('Dims a tab the longer it goes untouched, so the tab bar reads as attention rather than a pile of things you opened once. The close button keeps its strength, and the tab you are in never fades')
            .addDropdown((dropdown) => {
                for (const mode of TAB_MODES) {
                    dropdown.addOption(mode, TAB_MODE_LABELS[mode]);
                }

                dropdown.setValue(settings.tabFade).onChange(async (value) => {
                    settings.tabFade = value as TabFade;
                    await this.plugin.saveSettings();
                    this.display();
                });
            });

        if (settings.tabFade !== 'off') {
            new Setting(containerEl)
                .setName('What fades')
                .setDesc('Just the icon and title, or the whole tab with its background. Either way, hovering a faded tab brings it back to full strength, which is what keeps its close button reachable')
                .addDropdown((dropdown) => {
                    for (const scope of TAB_SCOPES) {
                        dropdown.addOption(scope, TAB_SCOPE_LABELS[scope]);
                    }

                    dropdown.setValue(settings.tabFadeScope).onChange(async (value) => {
                        settings.tabFadeScope = value as TabFadeScope;
                        await this.plugin.saveSettings();
                    });
                });
        }

        if (settings.tabFade === 'attention') {
            new Setting(containerEl)
                .setName('How it fades')
                .setDesc('Gradually reads as how long ago; all at once reads as past the line or not. A gradient over a short span saturates almost immediately, so if everything looks equally faint this is the setting to change — or the one below it')
                .addDropdown((dropdown) => {
                    for (const curve of TAB_CURVES) {
                        dropdown.addOption(curve, TAB_CURVE_LABELS[curve]);
                    }

                    dropdown.setValue(settings.tabFadeCurve).onChange(async (value) => {
                        settings.tabFadeCurve = value as TabFadeCurve;
                        await this.plugin.saveSettings();
                    });
                });

            new NumberControl(
                new Setting(containerEl)
                    .setName('Faded after')
                    .setDesc('Minutes of being ignored before a tab is as faint as it gets. Time spent in a note does not count against it'),
                TAB_AFTER_RANGE,
                settings.tabFadeAfter,
                (value) => {
                    settings.tabFadeAfter = Math.round(value);
                    this.save();
                }
            );
        }

        if (settings.tabFade !== 'off') {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Faintest a tab gets')
                    .setDesc('A tab you cannot read is a tab you cannot get back to, so this does not go to zero'),
                TAB_FLOOR_RANGE,
                settings.tabFadeFloor,
                (value) => {
                    settings.tabFadeFloor = value;
                    this.save();
                }
            );
        }

        section('Spotlight');

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

        new Setting(containerEl)
            .setName('Mark tabs you have left alone')
            .setDesc('A quiet line down the edge of a tab once you have not looked at it for a while, and a command to close the marked ones all at once. Nothing closes on its own — a tab that shuts itself feels like data loss even when nothing is lost. Pinned tabs and the tab you are in are never marked')
            .addToggle((toggle) => toggle
                .setValue(settings.staleTabs)
                .onChange(async (value) => {
                    settings.staleTabs = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            );

        if (settings.staleTabs) {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Marked after')
                    .setDesc('Minutes of being ignored before a tab is marked. Time spent in a note does not count against it'),
                STALE_AFTER_RANGE,
                settings.staleTabAfter,
                (value) => {
                    settings.staleTabAfter = Math.round(value);
                    this.save();
                }
            );
        }

        section('History');

        new Setting(containerEl)
            .setName('Keep a record of when notes were worked on')
            .setDesc('Obsidian keeps only the latest modification time and throws the rest away. This writes each sitting down, in a file of its own, so the graph can one day show how a note was worked on rather than only when it was last touched. Timestamps and file sizes, never any part of what a note says')
            .addToggle((toggle) => toggle
                .setValue(settings.history)
                .onChange(async (value) => {
                    settings.history = value;
                    await this.plugin.saveSettings();
                    // What it has collected, and the cap, only matter when on.
                    this.display();
                })
            );

        if (settings.history) {
            new NumberControl(
                new Setting(containerEl)
                    .setName('Sittings kept per note')
                    .setDesc('The oldest are dropped past this. A note is a sitting at a time rather than a write at a time, so a note worked on weekly reaches this in two years'),
                HISTORY_CAP_RANGE,
                settings.historyCap,
                (value) => {
                    settings.historyCap = Math.round(value);
                    this.save();
                }
            );

            new NumberControl(
                new Setting(containerEl)
                    .setName('Blend in edit intensity')
                    .setDesc('How much of a node\'s brightness comes from how often you return to a note rather than from how recently you touched it. At 0 nothing changes at all. Added to recency rather than multiplied by it, so a note with nothing recorded yet keeps a share of what its date earns instead of vanishing. Worth little until the history has been running a while, and a steep fade curve will magnify it sharply. The curve preview above shows age alone'),
                BLEND_RANGE,
                settings.intensityBlend,
                (value) => {
                    settings.intensityBlend = value;
                    this.save();
                }
            );

            // Shown whatever the blend is, rather than appearing when it
            // leaves zero. Revealing it would mean redrawing the tab from a
            // slider's own change handler, which destroys the element being
            // dragged — the bug that made the age filter handles move a step
            // at a time.
            new Setting(containerEl)
                .setName('Measure intensity')
                .setDesc('Sitting counts are far more lopsided than dates — most notes have one or two and a handful have dozens — so measuring against the busiest note leaves almost everything at the bottom. Rank is the one a lopsided spread cannot flatten')
                .addDropdown((dropdown) => {
                    for (const scale of INTENSITY_SCALES) {
                        dropdown.addOption(scale, INTENSITY_LABELS[scale]);
                    }

                    dropdown.setValue(settings.intensityScale).onChange(async (value) => {
                        settings.intensityScale = value as IntensityScale;
                        await this.plugin.saveSettings();
                    });
                });

            // Core File Recovery holds the only local record of anything from
            // before this was switched on. Reading another plugin's private
            // database unasked would read badly however harmless it is, so it
            // is a button, and the button names what it found first.
            const recovery = new Setting(containerEl)
                .setName('Import earlier history')
                .setDesc('Reading what core file recovery has…')
                .addButton((button) => button
                    .setButtonText('Import')
                    .onClick(async () => {
                        button.setDisabled(true);
                        const result = await this.plugin.importFileRecovery();
                        button.setDisabled(false);

                        if (!result) {
                            new Notice('Core file recovery has nothing to read in this vault.');
                            return;
                        }

                        new Notice(`Imported ${result.records} snapshots across ${result.notes} notes, adding ${result.gained} sittings.`);
                        this.display();
                    })
                );

            void readSnapshots(this.app).then((found) => {
                // The tab may have been redrawn or closed while this was read.
                if (!recovery.descEl.isConnected) {
                    return;
                }

                if (!found) {
                    recovery.setDesc('Core file recovery has nothing to read in this vault. It may be switched off, or this may be a platform without it');
                    return;
                }

                const skipped = found.skipped === 0 ? '' : `, ignoring ${found.skipped} for notes you no longer have`;

                recovery.setDesc(`Core file recovery holds ${found.records} snapshots across ${found.byPath.size} notes${skipped}. Only their timestamps are read — never any part of what a note says. Safe to run more than once`);
            });

            const coverage = this.plugin.historyCoverage();

            new Setting(containerEl)
                .setName('Forget everything recorded')
                .setDesc(coverage.beads === 0
                    ? 'Nothing has been recorded yet'
                    : `${coverage.beads} sittings across ${coverage.notes} notes. This cannot be undone, and nothing can bring the history back`)
                .addButton((button) => button
                    .setButtonText('Forget')
                    .setWarning()
                    .onClick(async () => {
                        await this.plugin.forgetHistory();
                        new Notice('Pulsar has forgotten its edit history.');
                        this.display();
                    })
                );
        }

        section('Presets');

        // Presets move only the settings that shape the fade. What you have
        // chosen to show — labels, status bar, spotlight colour — is left alone.
        // One you save yourself keeps the lot, because that is what saving means.
        const presets = new Setting(containerEl)
            .setName('Presets')
            .setDesc(PRESETS.map((preset) => `${preset.name}: ${preset.description.toLowerCase()}`).join('. ') + '.')
            .addDropdown((dropdown) => {
                dropdown.addOption('', 'Choose a preset\u2026');

                for (const preset of PRESETS) {
                    dropdown.addOption(`built-in:${preset.id}`, preset.name);
                }

                settings.saved.forEach((preset, index) => {
                    dropdown.addOption(`saved:${index}`, `${preset.name} (yours)`);
                });

                dropdown.setValue('').onChange(async (value) => {
                    const [kind, key] = value.split(':');

                    if (kind === 'built-in') {
                        const preset = PRESETS.find((candidate) => candidate.id === key);
                        if (preset) {
                            Object.assign(settings, preset.settings);
                        }
                    } else if (kind === 'saved') {
                        const preset = settings.saved[Number(key)];
                        if (preset) {
                            Object.assign(settings, preset.settings);
                        }
                    } else {
                        return;
                    }

                    await this.plugin.saveSettings();
                    this.display();
                });
            });

        presets.addButton((button) => button
            .setButtonText('Reset')
            .setTooltip('Put every setting back to its original value')
            .onClick(async () => {
                // Reset is about the settings, not about throwing away work.
                const saved = settings.saved;
                Object.assign(settings, DEFAULT_SETTINGS, { saved });
                await this.plugin.saveSettings();
                this.display();
            })
        );

        let name = '';

        new Setting(containerEl)
            .setName('Save these settings')
            .setDesc('Keeps everything above under a name of your own, so a setup you have tuned to your vault can be come back to')
            .addText((text) => text
                .setPlaceholder('Name')
                .onChange((value) => {
                    name = value;
                })
            )
            .addButton((button) => button
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    const trimmed = name.trim();
                    if (trimmed.length === 0) {
                        new Notice('Give the preset a name first.');
                        return;
                    }

                    const kept: SavedPreset = { name: trimmed.slice(0, 60), settings: snapshot(settings) };
                    const existing = settings.saved.findIndex((preset) => preset.name === kept.name);

                    if (existing >= 0) {
                        settings.saved[existing] = kept;
                    } else {
                        settings.saved.push(kept);
                    }

                    await this.plugin.saveSettings();
                    new Notice(`Saved "${kept.name}".`);
                    this.display();
                })
            );

        for (const [index, preset] of settings.saved.entries()) {
            new Setting(containerEl)
                .setName(preset.name)
                .setDesc('Saved by you')
                .addExtraButton((button) => button
                    .setIcon('clipboard-copy')
                    .setTooltip('Copy this preset, to keep or to pass on')
                    .onClick(() => {
                        void this.copy([preset], `Copied "${preset.name}".`);
                    })
                )
                .addExtraButton((button) => button
                    .setIcon('trash-2')
                    .setTooltip('Delete')
                    .onClick(async () => {
                        settings.saved.splice(index, 1);
                        await this.plugin.saveSettings();
                        this.display();
                    })
                );
        }

        new Setting(containerEl)
            .setName('Share presets')
            .setDesc('Copies every preset you have saved to the clipboard, or reads presets from whatever is on it')
            .addButton((button) => button
                .setButtonText('Copy all')
                .onClick(() => {
                    if (settings.saved.length === 0) {
                        new Notice('Nothing saved yet.');
                        return;
                    }

                    void this.copy(settings.saved, `Copied ${settings.saved.length} preset(s).`);
                })
            )
            .addButton((button) => button
                .setButtonText('Paste')
                .onClick(() => {
                    void this.paste();
                })
            );

        section('What this is doing to your vault');

        this.statsEl = containerEl.createDiv({ cls: 'pulsar-graph-stats' });
        this.renderStats();

        containerEl.scrollTop = scroll;
    }

    hide(): void {
        this.previewEl = null;
        this.statsEl = null;
    }

    /** Presets travel as plain JSON, through the clipboard rather than a server. */
    private async copy(presets: SavedPreset[], message: string): Promise<void> {
        try {
            await navigator.clipboard.writeText(JSON.stringify(presets, null, 2));
            new Notice(message);
        } catch {
            new Notice('Could not reach the clipboard.');
        }
    }

    private async paste(): Promise<void> {
        const { settings } = this.plugin;

        try {
            const arriving = parseSharedPresets(await navigator.clipboard.readText(), repairPreset);

            if (arriving.length === 0) {
                new Notice('No presets found on the clipboard.');
                return;
            }

            for (const preset of arriving) {
                const existing = settings.saved.findIndex((candidate) => candidate.name === preset.name);

                if (existing >= 0) {
                    settings.saved[existing] = preset;
                } else {
                    settings.saved.push(preset);
                }
            }

            await this.plugin.saveSettings();
            new Notice(`Added ${arriving.length} preset(s).`);
            this.display();
        } catch {
            new Notice('That did not look like a saved preset.');
        }
    }

    private save(): void {
        void this.plugin.saveSettings();
        this.renderPreview();
        this.renderStats();
    }

    /**
     * The numbers behind every choice above. A fade is only as good as the
     * distribution it is shaping, and a vault's distribution is not something
     * anyone can guess at from the outside.
     */
    private renderStats(): void {
        const stats = this.statsEl;
        if (!stats) {
            return;
        }

        stats.empty();

        const measured = this.plugin.measureVault();
        const tallest = Math.max(1, ...measured.spread);

        const chart = stats.createDiv({ cls: 'pulsar-graph-bars' });

        for (const count of measured.spread) {
            const column = chart.createDiv({ cls: 'pulsar-graph-bar' });
            column.setAttr('aria-label', `${count} notes`);
            column.createDiv({ cls: 'pulsar-graph-bar-fill' }).style.height = `${(count / tallest) * 100}%`;
        }

        chart.createDiv({ cls: 'pulsar-graph-bars-caption', text: 'dimmest to brightest' });

        for (const row of measured.rows) {
            const line = stats.createDiv({ cls: 'pulsar-graph-stat' });
            line.createDiv({ cls: 'pulsar-graph-stat-label', text: row.label });
            line.createDiv({ cls: 'pulsar-graph-stat-value', text: row.value });
        }
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
