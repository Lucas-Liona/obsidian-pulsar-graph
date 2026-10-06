import type { PulsarGraphSettings } from './settings';

/**
 * The settings that decide how the graph fades. A preset sets all of them, so
 * applying one lands somewhere predictable rather than on top of whatever was
 * left behind.
 *
 * Deliberately not included: the age labels, the status bar and the spotlight.
 * Those are what you want shown, not how age is read, and a preset has no
 * business resetting a colour someone picked.
 */
export type FadeSettings = Pick<
    PulsarGraphSettings,
    'normalizeBy' | 'windowDays' | 'ageScale' | 'halfLifeDays' | 'fadeType' | 'steepness' | 'numSteps' | 'minOpacity' | 'maxOpacity'
>;

export interface Preset {
    id: string;
    name: string;
    description: string;
    settings: FadeSettings;
}

/**
 * Everything a saved preset carries, which is every setting that decides how
 * the vault looks. A built-in preset is a curated fade shape; one you save is
 * "how I have this set up", so it keeps the whole look rather than a chosen
 * slice of it. Leaving the preset list out is what stops a preset containing
 * itself.
 *
 * The history settings are left out for the same reason the list is: they are
 * not a look. Someone else's preset has no business switching off the record of
 * how you work, and a preset that silently emptied it would be worse still.
 *
 * The pinned notes are left out because they are not settings at all — they are
 * a list of paths in this vault. A preset shared between two people would carry
 * one of them's note paths into the other's vault, and applying it would throw
 * away whatever they had pinned. How a pin is *drawn* is a look, and stays.
 */
export type PresetSettings = Omit<PulsarGraphSettings, 'saved' | 'history' | 'historyCap' | 'enabled' | 'pins'>;

export interface SavedPreset {
    name: string;
    settings: PresetSettings;
}

/** Strips out what a preset does not carry, leaving a snapshot to keep. */
export function snapshot(settings: PulsarGraphSettings): PresetSettings {
    const { saved: _saved, history: _history, historyCap: _cap, enabled: _enabled, pins: _pins, ...rest } = settings;
    return rest;
}

/** Reads presets back off the clipboard, refusing anything malformed. */
export function parseSharedPresets(text: string, repair: (stored: unknown) => PresetSettings): SavedPreset[] {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const presets: SavedPreset[] = [];

    for (const entry of list) {
        if (typeof entry !== 'object' || entry === null) {
            continue;
        }

        const { name, settings } = entry as { name?: unknown; settings?: unknown };

        if (typeof name === 'string' && name.trim().length > 0) {
            presets.push({ name: name.trim().slice(0, 60), settings: repair(settings) });
        }
    }

    return presets;
}

const SHARED = { steepness: 2, numSteps: 5, windowDays: 30, halfLifeDays: 14 };

export const PRESETS: Preset[] = [
    {
        id: 'gentle',
        name: 'Gentle',
        description: 'Everything stays readable. Age is a hint rather than a filter',
        settings: { ...SHARED, normalizeBy: 'vault', ageScale: 'even', fadeType: 'linear', minOpacity: 0.45, maxOpacity: 1 }
    },
    {
        id: 'even-spread',
        name: 'Even spread',
        description: 'Ranks notes against each other, so the graph has full contrast whatever your history looks like',
        settings: { ...SHARED, normalizeBy: 'vault', ageScale: 'rank', fadeType: 'linear', minOpacity: 0.08, maxOpacity: 1 }
    },
    {
        id: 'bands',
        name: 'Bands of age',
        description: 'Five distinct steps by rank, so the graph reads as layers rather than a gradient',
        settings: { ...SHARED, normalizeBy: 'vault', ageScale: 'rank', fadeType: 'step', minOpacity: 0.1, maxOpacity: 1 }
    },
    {
        id: 'this-month',
        name: 'This month',
        description: 'The last 30 days get the whole range. Everything older drops away',
        settings: { ...SHARED, normalizeBy: 'window', ageScale: 'even', fadeType: 'linear', minOpacity: 0.05, maxOpacity: 1 }
    },
    {
        id: 'this-week',
        name: 'This week',
        description: 'Seven days on a log scale, so today separates sharply from Tuesday',
        settings: { ...SHARED, windowDays: 7, normalizeBy: 'window', ageScale: 'log', fadeType: 'linear', minOpacity: 0.03, maxOpacity: 1 }
    },
    {
        id: 'steady-decay',
        name: 'Steady decay',
        description: 'A note halves in brightness every two weeks, measured against the calendar. The only preset where adding or deleting notes changes nothing else',
        settings: { ...SHARED, normalizeBy: 'vault', ageScale: 'halflife', fadeType: 'linear', minOpacity: 0.04, maxOpacity: 1 }
    }
];
