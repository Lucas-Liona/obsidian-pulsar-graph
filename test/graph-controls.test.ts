import { describe, expect, it } from 'vitest';
import { panelGroups, QuickControl } from '../src/graph-controls';
import { BLEED_RANGE, DEFAULT_SETTINGS, parseSettings, PulsarGraphSettings } from '../src/settings';

function panel(overrides: Partial<PulsarGraphSettings> = {}) {
    const settings = { ...parseSettings({}), ...overrides };
    let changes = 0;
    const groups = panelGroups(() => settings, (apply) => {
        changes++;
        apply();
    });

    const control = (name: string): QuickControl => {
        const found = groups.flatMap((group) => group.controls).find((each) => each.name === name);

        if (!found) {
            throw new Error(`no control named ${name}`);
        }

        return found;
    };

    return { settings, groups, control, changes: () => changes };
}

describe('the graph panel', () => {
    it('groups its controls as nodes, links and text', () => {
        const { groups } = panel();

        expect(groups.map((group) => [group.heading, group.controls.map((each) => each.name)])).toEqual([
            ['Nodes', ['Dimmest', 'Brightest', 'Curve', 'Glow', 'Size by age', 'Stars', 'Spotlight']],
            ['Links', ['Age', 'Trace sittings']],
            ['Text', ['Title size', 'Ages']]
        ]);
    });

    it('switches stars on and off, and they start off', () => {
        const { settings, control, changes } = panel();
        const stars = control('Stars');
        if (stars.kind !== 'toggle') throw new Error('not a toggle');

        expect(stars.value()).toBe(false);

        stars.onChange(true);
        expect(settings.stars).toBe(true);
        expect(stars.value()).toBe(true);

        stars.onChange(false);
        expect(settings.stars).toBe(false);
        expect(changes()).toBe(2);
    });

    it('switches trails on and off, through the one path that applies and saves', () => {
        const { settings, control, changes } = panel({ sessionTrails: false });
        const trails = control('Trace sittings');
        if (trails.kind !== 'toggle') throw new Error('not a toggle');

        trails.onChange(true);
        expect(settings.sessionTrails).toBe(true);
        expect(trails.value()).toBe(true);

        trails.onChange(false);
        expect(settings.sessionTrails).toBe(false);
        expect(changes()).toBe(2);
    });

    it('reads and writes the spotlight, size and glow it is named for', () => {
        const { settings, control } = panel({ spotlightNewest: false, nodeSizeByAge: false, neighbourBleed: 0 });
        const spotlight = control('Spotlight');
        const size = control('Size by age');
        const glow = control('Glow');
        if (spotlight.kind !== 'toggle' || size.kind !== 'toggle' || glow.kind !== 'slider') throw new Error('wrong kinds');

        spotlight.onChange(true);
        size.onChange(true);
        glow.onChange(0.5);

        expect([settings.spotlightNewest, settings.nodeSizeByAge, settings.neighbourBleed]).toEqual([true, true, 0.5]);
        expect([spotlight.value(), size.value(), glow.value()]).toEqual([true, true, 0.5]);
    });

    // The settings tab's limits, so the panel can reach every glow the tab can.
    it('lets the glow go exactly as far as the settings tab does', () => {
        const glow = panel().control('Glow');
        if (glow.kind !== 'slider') throw new Error('not a slider');

        expect(glow.limits).toEqual(BLEED_RANGE);
    });

    it('offers every way a link can be aged, and writes the one picked', () => {
        const { settings, control } = panel({ linkRecency: 'off' });
        const age = control('Age');
        if (age.kind !== 'dropdown') throw new Error('not a dropdown');

        expect(Object.keys(age.options).sort()).toEqual(['gradient', 'off', 'uniform']);

        age.onChange('uniform');
        expect(settings.linkRecency).toBe('uniform');
    });

    it('carries the brightest along when the dimmest passes it, and back', () => {
        const { settings, control } = panel({ minOpacity: 0.1, maxOpacity: 0.5 });
        const dimmest = control('Dimmest');
        const brightest = control('Brightest');
        if (dimmest.kind !== 'slider' || brightest.kind !== 'slider') throw new Error('not sliders');

        dimmest.onChange(0.8);
        expect([settings.minOpacity, settings.maxOpacity]).toEqual([0.8, 0.8]);

        brightest.onChange(0.3);
        expect([settings.minOpacity, settings.maxOpacity]).toEqual([0.3, 0.3]);
    });

    // A control that wrote its setting directly would change the picture only
    // on the next unrelated repaint, and never save.
    it('changes nothing except through the change it is handed', () => {
        const settings = { ...DEFAULT_SETTINGS, saved: [], pins: [], collapsed: [], filterRanges: [] };
        const before = JSON.stringify(settings);
        const groups = panelGroups(() => settings, () => undefined);

        for (const each of groups.flatMap((group) => group.controls)) {
            if (each.kind === 'toggle') {
                each.onChange(!each.value());
            } else if (each.kind === 'slider') {
                each.onChange(each.limits.highest);
            } else {
                each.onChange(Object.keys(each.options).find((key) => key !== each.value()) ?? each.value());
            }
        }

        expect(JSON.stringify(settings)).toBe(before);
    });
});
