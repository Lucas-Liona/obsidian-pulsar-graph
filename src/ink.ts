import { Extension, Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * How many shades a piece of writing passes through on its way back to normal.
 *
 * Eight is enough that the cooling reads as continuous and few enough that the
 * stylesheet can name every one of them.
 */
const STEPS = 8;

export interface InkOptions {
    enabled: boolean;
    /** Minutes for fresh writing to cool all the way back to ordinary text. */
    minutes: number;
}

/**
 * Shared by every editor, because the settings are one object and an editor
 * extension is installed once for all of them.
 */
const options: InkOptions = { enabled: false, minutes: 5 };

/** Moves every mark one shade colder. */
const cool = StateEffect.define<null>();

/** Drops every mark, so whatever is on the page now counts as old. */
const forget = StateEffect.define<null>();

/**
 * One decoration per shade, reused.
 *
 * The shade is carried by the decoration itself rather than by a timestamp
 * stored beside it, which is what makes the whole thing cheap: a tick does not
 * have to work out how old anything is, it just moves every mark down one and
 * drops whatever falls off the end. The tick interval *is* the width of a
 * shade, so the arithmetic was done when the interval was chosen.
 */
const marks = Array.from({ length: STEPS }, (_unused, step) =>
    Decoration.mark({ class: `pulsar-ink pulsar-ink-${step}`, step })
);

function shadeOf(decoration: Decoration): number {
    return (decoration.spec as { step?: number }).step ?? 0;
}

function cooled(set: DecorationSet): DecorationSet {
    const next: Range<Decoration>[] = [];

    for (const iter = set.iter(); iter.value !== null; iter.next()) {
        const shade = shadeOf(iter.value) + 1;

        if (shade < STEPS) {
            next.push(marks[shade].range(iter.from, iter.to));
        }
    }

    return Decoration.set(next, true);
}

/**
 * Where writing happened, and how long ago.
 *
 * CodeMirror hands over the exact ranges a transaction inserted, and it maps a
 * set of ranges through later edits itself, so tracking this at the character
 * is a few lines rather than a diff: nothing is compared, and the cost is in
 * the size of the change rather than the size of the note.
 *
 * Only positions and lengths are ever read. What was written is never looked
 * at, never stored and never leaves the editor.
 */
const inkField = StateField.define<DecorationSet>({
    create: () => Decoration.none,

    update(set, transaction) {
        for (const effect of transaction.effects) {
            if (effect.is(forget)) {
                return Decoration.none;
            }
        }

        set = set.map(transaction.changes);

        if (transaction.effects.some((effect) => effect.is(cool))) {
            set = cooled(set);
        }

        if (!transaction.docChanged) {
            return set;
        }

        const added: Range<Decoration>[] = [];

        transaction.changes.iterChanges((_fromA, _toA, fromB, toB) => {
            if (options.enabled && toB > fromB) {
                added.push(marks[0].range(fromB, toB));
            }
        });

        if (added.length > 0) {
            set = set.update({ add: added, sort: true });
        }

        // Deleting the whole of a marked stretch leaves a mark with nothing
        // between its ends, which is not a decoration CodeMirror will accept.
        return set.update({ filter: (from, to) => to > from });
    },

    provide: (field) => EditorView.decorations.from(field)
});

/**
 * The clock.
 *
 * One timer per open editor, and it only runs while that editor has something
 * left to cool — a note you are not writing in costs nothing at all. New
 * writing restarts it.
 */
const ticker = ViewPlugin.fromClass(
    class {
        private timer = 0;

        constructor(private readonly view: EditorView) {
            this.sync();
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.transactions.length > 0) {
                this.sync();
            }
        }

        destroy(): void {
            this.stop();
        }

        private sync(): void {
            const live = this.view.state.field(inkField).size > 0;

            if (!live || !options.enabled) {
                this.stop();
                return;
            }

            if (this.timer === 0) {
                const every = Math.max(1000, (options.minutes * 60 * 1000) / STEPS);
                this.timer = this.view.dom.win.setInterval(() => {
                    this.view.dispatch({ effects: cool.of(null) });
                }, every);
            }
        }

        private stop(): void {
            if (this.timer !== 0) {
                this.view.dom.win.clearInterval(this.timer);
                this.timer = 0;
            }
        }
    }
);

export function inkExtension(): Extension {
    return [inkField, ticker];
}

/**
 * Hands the new settings to the extension.
 *
 * Switching it off clears what is already marked rather than freezing it,
 * because a page left half lit by a feature that is no longer running is the
 * sort of thing people report as a rendering bug.
 */
export function setInkOptions(next: InkOptions, editors: EditorView[]): void {
    const wasEnabled = options.enabled;

    options.enabled = next.enabled;
    options.minutes = next.minutes;

    if (wasEnabled && !next.enabled) {
        forgetInk(editors);
    }
}

export function forgetInk(editors: EditorView[]): void {
    for (const editor of editors) {
        if (editor.state.field(inkField, false) !== undefined) {
            editor.dispatch({ effects: forget.of(null) });
        }
    }
}

/** How many stretches are still lit, for the statistics and for testing. */
export function inkCount(editor: EditorView): number {
    return editor.state.field(inkField, false)?.size ?? 0;
}
