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
    'normalizeBy' | 'windowDays' | 'ageScale' | 'fadeType' | 'steepness' | 'numSteps' | 'minOpacity' | 'maxOpacity'
>;

export interface Preset {
    id: string;
    name: string;
    description: string;
    settings: FadeSettings;
}

const SHARED = { steepness: 2, numSteps: 5, windowDays: 30 };

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
    }
];
