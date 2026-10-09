import type { PulsarGraphSettings } from '../src/settings';

/**
 * The defaults from before a new install started with most features on, for
 * the tests and benches written against them, curve included.
 *
 * A test that asserts what the age filter keeps, what is labelled or what
 * colour a node is drawn pins these: the newer defaults change all three on
 * purpose (the spotlit newest note is spared by the filter and painted, and a
 * local graph writes every age), so each test still checks the one thing it was
 * written to rather than being loosened. A bench pins them so its numbers stay
 * comparable with the baseline recorded before.
 */
export const FEATURES_OFF: Partial<PulsarGraphSettings> = {
    ageScale: 'even',
    maxOpacity: 3,
    neighbourBleed: 0,
    sessionTrails: false,
    spotlightNewest: false,
    nodeSizeByAge: false,
    linkRecency: 'off',
    linkDots: false,
    ink: false,
    tabDot: false,
    tabFade: 'off',
    tabFadeScope: 'tab',
    staleTabs: false,
    staleTabMark: 'line',
    replay: false,
    localScope: 'vault',
    localLabels: false
};
