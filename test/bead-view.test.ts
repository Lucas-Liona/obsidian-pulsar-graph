import { describe, expect, it } from 'vitest';
import { axisOffset, layoutRail } from '../src/bead-view';
import { Bead } from '../src/history';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

const NOW = Date.UTC(2026, 9, 8, 12);

/** A sitting that ended `ago` before now and ran for `ran`. */
function bead(ago: number, ran = 0): Bead {
    return { start: NOW - ago - ran, end: NOW - ago, sizeStart: 0, sizeEnd: 0 };
}

describe('axisOffset', () => {
    it('puts now at the top and a year where the old rail ended', () => {
        expect(axisOffset(0)).toBe(0);
        expect(axisOffset(YEAR)).toBeCloseTo(420);
    });

    it('spends the rail across minutes, days and months alike', () => {
        expect(axisOffset(5 * MINUTE)).toBeCloseTo(25.2, 1);
        expect(axisOffset(HOUR)).toBeCloseTo(93.2, 1);
        expect(axisOffset(DAY)).toBeCloseTo(205.8, 1);
        expect(axisOffset(7 * DAY)).toBeCloseTo(276.4, 1);
        expect(axisOffset(30 * DAY)).toBeCloseTo(329.2, 1);
    });

    it('only ever moves down as age grows', () => {
        let last = -1;

        for (let age = 0; age < 3 * YEAR; age = age * 1.7 + MINUTE) {
            const here = axisOffset(age);
            expect(here).toBeGreaterThan(last);
            last = here;
        }
    });

    it('puts a sitting from a clock that has since moved back at now', () => {
        expect(axisOffset(-HOUR)).toBe(0);
    });
});

describe('layoutRail', () => {
    // The rail used to be each note's own span, so one sitting had nowhere to
    // go but the top of an empty line. On one scale for every note it sits at
    // its age, on a rail that runs to the next label past it.
    it('gives a note with one sitting the axis like any other', () => {
        const layout = layoutRail([bead(4 * HOUR, 40 * MINUTE)], NOW);

        expect(layout.beads[0]).toBeCloseTo(axisOffset(4 * HOUR));
        expect(layout.ticks.map((tick) => tick.label)).toEqual(['now', '1 hour', '1 day']);
        expect(layout.length).toBeCloseTo(axisOffset(DAY));
    });

    it('runs the rail an hour even for a sitting just finished', () => {
        const layout = layoutRail([bead(0)], NOW);

        expect(layout.beads[0]).toBe(0);
        expect(layout.ticks.map((tick) => tick.label)).toEqual(['now', '1 hour']);
        expect(layout.length).toBeCloseTo(axisOffset(HOUR));
    });

    it('labels down to the first round age at or past the oldest sitting', () => {
        expect(layoutRail([bead(DAY)], NOW).ticks.at(-1)?.label).toBe('1 day');
        expect(layoutRail([bead(DAY + MINUTE)], NOW).ticks.at(-1)?.label).toBe('1 week');
    });

    it('places each label where its age falls', () => {
        const ticks = layoutRail([bead(2 * YEAR + DAY)], NOW).ticks;

        expect(ticks.map((tick) => tick.label)).toEqual(['now', '1 hour', '1 day', '1 week', '1 month', '1 year', '2 years', '5 years']);
        expect(ticks.find((tick) => tick.label === '1 year')?.at).toBeCloseTo(420);

        for (let i = 1; i < ticks.length; i++) {
            expect(ticks[i].at).toBeGreaterThan(ticks[i - 1].at);
        }
    });

    it('keeps the beads in the order of their sittings, newest highest', () => {
        const beads = [bead(40 * DAY), bead(3 * DAY), bead(5 * HOUR), bead(20 * MINUTE), bead(2 * MINUTE)];
        const placed = layoutRail(beads, NOW).beads;

        for (let i = 1; i < placed.length; i++) {
            expect(placed[i]).toBeLessThan(placed[i - 1]);
        }
    });

    // The point of one scale: two notes can be read against each other.
    it('draws a note of five minutes short and a note of three years long, on the same scale', () => {
        const brief = layoutRail([bead(6 * MINUTE), bead(3 * MINUTE), bead(MINUTE)], NOW);
        const long = layoutRail([bead(3 * YEAR), bead(YEAR), bead(DAY), bead(MINUTE)], NOW);

        expect(brief.length).toBeCloseTo(axisOffset(HOUR));
        expect(long.length).toBeCloseTo(axisOffset(5 * YEAR));
        expect(brief.beads.at(-1)).toBeCloseTo(long.beads.at(-1) ?? NaN);

        // This morning still spreads out rather than sharing a pixel.
        expect(brief.beads[0] - brief.beads[2]).toBeGreaterThan(20);
    });

    it('runs past the last label to a sitting older than all of them', () => {
        const layout = layoutRail([bead(30 * YEAR)], NOW);

        expect(layout.ticks.at(-1)?.label).toBe('20 years');
        expect(layout.length).toBeCloseTo(axisOffset(30 * YEAR));
    });

    it('lays out nothing for a note with no sittings', () => {
        const layout = layoutRail([], NOW);

        expect(layout.beads).toEqual([]);
        expect(layout.length).toBeCloseTo(axisOffset(HOUR));
    });
});
