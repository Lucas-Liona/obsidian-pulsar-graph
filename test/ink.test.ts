import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorSelection, EditorState, TransactionSpec } from '@codemirror/state';
import { EditorView, ViewUpdate } from '@codemirror/view';
import { coolInk, forgetInk, InkClock, InkColours, inkCounts, inkExtension, pinInk, setInkColours, setInkOptions, unpinInk } from '../src/ink';

/**
 * Just enough of an editor for the functions under test, which only read its
 * state and dispatch to it. The view plugins never run without a DOM, so the
 * clock and the dimmer are out of reach here; the state field is the part
 * that decides what is lit.
 */
function editor(doc = ''): EditorView {
    const fake = {
        state: EditorState.create({ doc, extensions: inkExtension() }),
        dispatch(spec: TransactionSpec) {
            fake.state = fake.state.update(spec).state;
        }
    };

    return fake as unknown as EditorView;
}

function type(view: EditorView, text: string): void {
    view.dispatch({ changes: { from: view.state.doc.length, insert: text } });
}

function select(view: EditorView, from: number, to: number): void {
    view.dispatch({ selection: EditorSelection.single(from, to) });
}

describe('fresh writing', () => {
    beforeEach(() => {
        setInkOptions({ enabled: true, minutes: 5, mode: 'colour' }, []);
    });

    afterEach(() => {
        setInkOptions({ enabled: false, minutes: 5, mode: 'colour' }, []);
    });

    it('counts what was written', () => {
        const view = editor('old text. ');
        type(view, 'new');

        expect(inkCounts(view)).toEqual({ lit: 3, pinned: 0 });
    });

    // Pins were set on purpose; cooling is about what was written.
    it('cools one note without touching its pins', () => {
        const view = editor();
        type(view, 'keep this. ');
        select(view, 0, 9);
        pinInk(view);
        type(view, 'and this cools');

        coolInk(view);

        expect(inkCounts(view)).toEqual({ lit: 0, pinned: 9 });
    });

    it('cools every open note without touching their pins', () => {
        const first = editor();
        const second = editor();
        type(first, 'abc');
        type(second, 'pinned');
        select(second, 0, 6);
        pinInk(second);

        forgetInk([first, second]);

        expect(inkCounts(first)).toEqual({ lit: 0, pinned: 0 });
        expect(inkCounts(second)).toEqual({ lit: 0, pinned: 6 });
    });

    it('unpins one note and leaves its fresh writing lit', () => {
        const view = editor();
        type(view, 'pinned ');
        select(view, 0, 6);
        pinInk(view);
        type(view, 'fresh');

        expect(unpinInk(view)).toBe(true);
        expect(inkCounts(view)).toEqual({ lit: 5, pinned: 0 });
    });

    it('says so when there is nothing to unpin', () => {
        const view = editor();
        type(view, 'fresh');

        expect(unpinInk(view)).toBe(false);
        expect(inkCounts(view).lit).toBe(5);
    });

    it('lights nothing while switched off', () => {
        setInkOptions({ enabled: false, minutes: 5, mode: 'colour' }, []);
        const view = editor();
        type(view, 'written while off');

        expect(inkCounts(view)).toEqual({ lit: 0, pinned: 0 });
    });
});

describe('fresh writing colours', () => {
    const COLOURS: InkColours = { '--pulsar-ink': '#ff8800', '--pulsar-ink-pin': '#8888ff', '--pulsar-ink-dim': '45%' };

    /** An editor element's inline style, which is all the colours touch. */
    function withStyle(view: EditorView): Map<string, string> {
        const style = new Map<string, string>();
        Object.assign(view, {
            dom: {
                style: {
                    setProperty: (name: string, value: string) => style.set(name, value),
                    removeProperty: (name: string) => style.delete(name)
                }
            }
        });

        return style;
    }

    afterEach(() => {
        setInkColours(null, []);
    });

    // A custom property on the body restyles the whole window; these are only
    // ever read inside an editor.
    it('puts the colours on each editor', () => {
        const view = editor();
        const style = withStyle(view);

        setInkColours(COLOURS, [view]);

        expect(Object.fromEntries(style)).toEqual(COLOURS);
    });

    it('leaves an editor without fresh writing alone', () => {
        const plain = { state: EditorState.create({ doc: '' }) } as unknown as EditorView;
        const style = withStyle(plain);

        setInkColours(COLOURS, [plain]);

        expect(style.size).toBe(0);
    });

    it('takes the colours off again', () => {
        const view = editor();
        const style = withStyle(view);

        setInkColours(COLOURS, [view]);
        setInkColours(null, [view]);

        expect(style.size).toBe(0);
    });
});

describe('fresh writing, cooling', () => {
    const SECOND = 1 / 60;

    afterEach(() => {
        setInkOptions({ enabled: false, minutes: 5, mode: 'colour' }, []);
        vi.useRealTimers();
    });

    /**
     * An editor with its clock running: the clock's window is the test's own,
     * so fake time reaches it, and every dispatch is handed to it as an update
     * the way CodeMirror would.
     */
    function clocked(minutes: number) {
        vi.useFakeTimers();
        setInkOptions({ enabled: true, minutes, mode: 'colour' }, []);

        const style = new Map<string, string>();
        let clock: InkClock | undefined;
        const fake = {
            state: EditorState.create({ doc: '', extensions: inkExtension() }),
            dom: {
                win: window,
                style: {
                    setProperty: (name: string, value: string) => style.set(name, value),
                    removeProperty: (name: string) => style.delete(name)
                }
            },
            dispatch(spec: TransactionSpec) {
                const transaction = fake.state.update(spec);
                fake.state = transaction.state;
                clock?.update({ docChanged: transaction.docChanged, transactions: [transaction] } as unknown as ViewUpdate);
            }
        };
        const view = fake as unknown as EditorView;
        clock = new InkClock(view);

        return { view, clock, style };
    }

    // With each shade floored at a second, as it was while a minute was the
    // shortest setting, this took eight.
    it('cools a second of writing in a second', () => {
        const { view } = clocked(SECOND);
        type(view, 'flash');

        vi.advanceTimersByTime(500);
        expect(inkCounts(view).lit).toBe(5);

        vi.advanceTimersByTime(500);
        expect(inkCounts(view).lit).toBe(0);
    });

    it('stops its clock once nothing is left to cool', () => {
        const { view } = clocked(SECOND);
        type(view, 'flash');
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(1000);

        expect(vi.getTimerCount()).toBe(0);
    });

    it('runs no clock in a note nobody is writing in', () => {
        clocked(SECOND);

        expect(vi.getTimerCount()).toBe(0);
    });

    it('stops its clock when the editor goes', () => {
        const { view, clock } = clocked(SECOND);
        type(view, 'flash');

        clock.destroy();

        expect(vi.getTimerCount()).toBe(0);
    });

    // The tick length is fixed when the clock starts; a new one has to replace it.
    it('starts again at the new pace when cools over changes', () => {
        const { view } = clocked(240);
        type(view, 'slow');

        setInkOptions({ enabled: true, minutes: SECOND, mode: 'colour' }, [view]);
        vi.advanceTimersByTime(1000);

        expect(inkCounts(view).lit).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });

    // Easing for longer than a shade lasts would leave a second's writing lit after it was dropped.
    it('eases each shade for no longer than it lasts', () => {
        const { view, style } = clocked(5);

        setInkOptions({ enabled: true, minutes: 5, mode: 'colour' }, [view]);
        expect(style.get('--pulsar-ink-ease')).toBe('1500ms');

        setInkOptions({ enabled: true, minutes: SECOND, mode: 'colour' }, [view]);
        expect(style.get('--pulsar-ink-ease')).toBe('125ms');
    });
});
