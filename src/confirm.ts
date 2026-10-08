/** How long a first click stays armed before the button goes back to normal. */
export const CONFIRM_WINDOW_MS = 4000;

/** The two timer calls this needs, so a test can hand over fake ones. */
export interface Timers {
    setTimeout: (callback: () => void, ms: number) => number;
    clearTimeout: (handle: number) => void;
}

/**
 * Holds back something that cannot be undone until it is asked for twice.
 *
 * The first click only changes the button to say what a second one will do. A
 * second within a few seconds does it, and otherwise the button goes back to
 * how it was. Nothing here opens a dialog: a box that asks "are you sure" on
 * every click is one people learn to click through, while a button that
 * changes its own words is read at the moment it matters.
 *
 * Returns the click handler. `show` draws the button armed or not.
 */
export function confirmTwice(show: (armed: boolean) => void, act: () => void, timers: Timers): () => void {
    let armed: number | null = null;

    return () => {
        if (armed !== null) {
            timers.clearTimeout(armed);
            armed = null;
            show(false);
            act();
            return;
        }

        show(true);
        armed = timers.setTimeout(() => {
            armed = null;
            show(false);
        }, CONFIRM_WINDOW_MS);
    };
}
