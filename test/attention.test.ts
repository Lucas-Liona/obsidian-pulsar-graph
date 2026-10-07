import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { Attention } from '../src/tabs';

const MINUTE = 60 * 1000;

/** A workspace with one note in front, which is all the clock asks about. */
function workspace(): { app: App; open: (path: string | null) => void } {
    let active: string | null = null;

    return {
        app: {
            workspace: {
                getActiveFile: () => (active === null ? null : { path: active }),
                iterateAllLeaves: () => undefined
            }
        } as unknown as App,
        open: (path) => {
            active = path;
        }
    };
}

describe('Attention', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 9, 7, 12, 0));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // The bug: a note sat in for fifteen minutes was stamped when it was
    // entered, so the moment it was left it read as fifteen minutes ignored.
    it('counts a note left behind from when it was left, not when it was entered', () => {
        const { app, open } = workspace();
        const attention = new Attention(app);

        open('a.md');
        attention.focus('a.md');
        vi.advanceTimersByTime(15 * MINUTE);

        open('b.md');
        attention.focus('b.md');

        expect(attention.minutesSince('a.md')).toBe(0);

        vi.advanceTimersByTime(5 * MINUTE);

        expect(attention.minutesSince('a.md')).toBe(5);
    });

    it('reads the note in front as being looked at however long it has been', () => {
        const { app, open } = workspace();
        const attention = new Attention(app);

        open('a.md');
        attention.focus('a.md');
        vi.advanceTimersByTime(40 * MINUTE);

        expect(attention.minutesSince('a.md')).toBe(0);
    });

    it('hands back the note left, and nothing when the note stays the same', () => {
        const { app } = workspace();
        const attention = new Attention(app);

        expect(attention.focus('a.md')).toBeNull();
        expect(attention.focus('a.md')).toBeNull();
        expect(attention.focus('b.md')).toBe('a.md');
        expect(attention.focus(null)).toBe('b.md');
        expect(attention.focus(null)).toBeNull();
    });

    // Moving to a graph or an empty tab, or the app quitting, all leave the
    // note behind just as switching to another note does.
    it('stamps the note left when attention moves to no note at all', () => {
        const { app, open } = workspace();
        const attention = new Attention(app);

        open('a.md');
        attention.focus('a.md');
        vi.advanceTimersByTime(15 * MINUTE);

        open(null);
        attention.focus(null);
        vi.advanceTimersByTime(2 * MINUTE);

        expect(attention.minutesSince('a.md')).toBe(2);
    });

    it('leaves notes that were not in front alone', () => {
        const { app, open } = workspace();
        const attention = new Attention(app);

        open('a.md');
        attention.focus('a.md');
        vi.advanceTimersByTime(10 * MINUTE);
        open('b.md');
        attention.focus('b.md');
        vi.advanceTimersByTime(10 * MINUTE);
        open('c.md');
        attention.focus('c.md');

        expect(attention.minutesSince('a.md')).toBe(10);
        expect(attention.minutesSince('b.md')).toBe(0);
    });

    // A deleted note stamped on the way out would come back into the record.
    it('does not stamp a note forgotten while it was in front', () => {
        const { app } = workspace();
        const attention = new Attention(app);

        attention.focus('a.md');
        attention.forget('a.md');

        expect(attention.focus('b.md')).toBeNull();
        expect(attention.minutesSince('a.md')).toBeUndefined();
    });
});
