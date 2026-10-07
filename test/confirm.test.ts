import { describe, expect, it } from 'vitest';
import { CONFIRM_WINDOW_MS, confirmTwice, Timers } from '../src/confirm';

/** A clock that only moves when told to. */
function clock(): { timers: Timers; advance: (ms: number) => void } {
    let now = 0;
    let next = 1;
    const pending = new Map<number, { at: number; callback: () => void }>();

    return {
        timers: {
            setTimeout: (callback, ms) => {
                const handle = next++;
                pending.set(handle, { at: now + ms, callback });
                return handle;
            },
            clearTimeout: (handle) => {
                pending.delete(handle);
            }
        },
        advance: (ms) => {
            now += ms;

            for (const [handle, timer] of [...pending]) {
                if (timer.at <= now) {
                    pending.delete(handle);
                    timer.callback();
                }
            }
        }
    };
}

describe('confirmTwice', () => {
    it('only arms on the first click', () => {
        const { timers } = clock();
        const shown: boolean[] = [];
        let done = 0;
        const click = confirmTwice((armed) => shown.push(armed), () => done++, timers);

        click();

        expect(done).toBe(0);
        expect(shown).toEqual([true]);
    });

    it('acts on a second click inside the window, and disarms', () => {
        const { timers, advance } = clock();
        const shown: boolean[] = [];
        let done = 0;
        const click = confirmTwice((armed) => shown.push(armed), () => done++, timers);

        click();
        advance(CONFIRM_WINDOW_MS - 1);
        click();

        expect(done).toBe(1);
        expect(shown).toEqual([true, false]);

        // Disarmed: running out the clock changes nothing more.
        advance(CONFIRM_WINDOW_MS);
        expect(shown).toEqual([true, false]);
    });

    it('goes back to normal when the second click does not come', () => {
        const { timers, advance } = clock();
        const shown: boolean[] = [];
        let done = 0;
        const click = confirmTwice((armed) => shown.push(armed), () => done++, timers);

        click();
        advance(CONFIRM_WINDOW_MS);

        expect(shown).toEqual([true, false]);

        // A click after that starts over rather than acting.
        click();

        expect(done).toBe(0);
        expect(shown).toEqual([true, false, true]);
    });
});
