import { Extension, Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';

/**
 * How many shades a piece of writing passes through on its way back to normal.
 *
 * Eight is enough that the cooling reads as continuous and few enough that the
 * stylesheet can name every one of them.
 */
const STEPS = 8;

/**
 * Whether fresh writing is coloured in, or everything else is dimmed down.
 *
 * They answer the same question from opposite ends and suit different moments:
 * colouring reads better over a shoulder and in a screenshot, dimming reads
 * better while actually working, because it never replaces a colour you chose.
 */
export type InkMode = 'colour' | 'dim';

export interface InkOptions {
    enabled: boolean;
    /** Minutes for fresh writing to cool all the way back to ordinary text. */
    minutes: number;
    mode: InkMode;
}

/**
 * Shared by every editor, because the settings are one object and an editor
 * extension is installed once for all of them.
 */
const options: InkOptions = { enabled: false, minutes: 5, mode: 'colour' };

/** The custom properties the stylesheet draws fresh writing with. */
export interface InkColours {
    '--pulsar-ink': string;
    '--pulsar-ink-pin': string;
    '--pulsar-ink-dim': string;
}

let colours: InkColours | null = null;

/** Moves every mark one shade colder. */
const cool = StateEffect.define<null>();

/**
 * Drops every mark that is cooling, so whatever is on the page now counts as
 * old. Pins stay: they were set on purpose, and cooling is about what was
 * written, not about what was marked.
 */
const forget = StateEffect.define<null>();

/** Drops every pin, which is the one thing cooling leaves alone. */
const unpin = StateEffect.define<null>();

/** Holds a stretch at full strength until it is cleared. */
const pin = StateEffect.define<{ from: number; to: number }>();

/**
 * Nothing in the document changed, but the settings did.
 *
 * The parts of this that are not the state field — the dimmer, and the tick
 * length — only ever recompute inside an editor update, and a settings change
 * happens entirely outside the editor. Without a transaction to hang it on, a
 * mode switched back left the dimming it had already drawn on the page.
 */
const refresh = StateEffect.define<null>();

/**
 * A stretch marked to come back to.
 *
 * It does not cool. A pin answers "deal with this", and a marker that quietly
 * fades is one you will miss — which also makes it the clear opposite of fresh
 * writing: what cools is new, what does not is deliberate.
 */
const pinMark = Decoration.mark({ class: 'pulsar-ink-pin', pinned: true });

/** Everything on screen that is neither fresh nor pinned, for the dim mode. */
const coldMark = Decoration.mark({ class: 'pulsar-ink-cold' });

function isPin(decoration: Decoration): boolean {
    return (decoration.spec as { pinned?: boolean }).pinned === true;
}

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
        if (isPin(iter.value)) {
            next.push(iter.value.range(iter.from, iter.to));
            continue;
        }

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
        set = set.map(transaction.changes);

        for (const effect of transaction.effects) {
            if (effect.is(forget)) {
                return set.update({ filter: (_from, _to, value) => isPin(value) });
            }

            if (effect.is(unpin)) {
                set = set.update({ filter: (_from, _to, value) => !isPin(value) });
            }
        }

        for (const effect of transaction.effects) {
            if (!effect.is(pin)) {
                continue;
            }

            const { from, to } = effect.value;

            // Anything already lit under the pin is dropped rather than left
            // nested inside it, since the innermost span wins and a pin whose
            // middle is a different colour reads as two marks.
            set = set.update({
                filter: (at, until, value) => isPin(value) || until <= from || at >= to,
                add: [pinMark.range(from, to)],
                sort: true
            });
        }

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
            if (update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refresh)))) {
                // The tick length is baked in when the interval is made, so a
                // changed "cools over" needs the old one thrown away.
                this.stop();
            }

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

/**
 * Everything on screen that is not lit, so the page can be dimmed around fresh
 * writing rather than the writing coloured on top of the page.
 *
 * The complement is built from `visibleRanges`, so the cost is in what is on
 * screen and not in the length of the note. It dims with `currentColor` toward
 * the background, which keeps a heading's own colour instead of flattening
 * everything to one grey.
 *
 * A note with nothing lit in it gets none of this. Opening a vault and finding
 * every note greyed is a bug report, however faithful it is to the rule.
 */
const dimmer = ViewPlugin.fromClass(
    class {
        decorations: DecorationSet = Decoration.none;

        constructor(private readonly view: EditorView) {
            this.decorations = this.build();
        }

        update(update: ViewUpdate): void {
            if (update.docChanged || update.viewportChanged || update.transactions.length > 0) {
                this.decorations = this.build();
            }
        }

        private build(): DecorationSet {
            const lit = this.view.state.field(inkField, false);

            if (!options.enabled || options.mode !== 'dim' || !lit || lit.size === 0) {
                return Decoration.none;
            }

            const cold: Range<Decoration>[] = [];

            for (const { from, to } of this.view.visibleRanges) {
                let at = from;

                lit.between(from, to, (start, end) => {
                    if (start > at) {
                        cold.push(coldMark.range(at, Math.min(start, to)));
                    }

                    at = Math.max(at, end);
                });

                if (at < to) {
                    cold.push(coldMark.range(at, to));
                }
            }

            return Decoration.set(cold, true);
        }
    },
    { decorations: (plugin) => plugin.decorations }
);

/** Told whenever an editor's marks change, so a count shown elsewhere can follow. */
let listener: ((view: EditorView) => void) | null = null;

/**
 * Reports changes to the marks: writing, a cooling step, a pin. A field that
 * did not change is the same object afterwards, so everything else — moving
 * the cursor, scrolling — costs one comparison.
 */
const watcher = EditorView.updateListener.of((update) => {
    if (listener && update.startState.field(inkField, false) !== update.state.field(inkField, false)) {
        listener(update.view);
    }
});

/**
 * Puts the colours on each editor as it is built, and takes them off when
 * fresh writing is taken out of it.
 *
 * On the editor, not the document body. A custom property is inherited, so one
 * changed on the body restyles every element in the window: 15.4 ± 1.0 ms in
 * the demo vault, on every load with fresh writing on and every change of
 * colour, against 0.04 ms for its six editors. Nothing outside an editor reads
 * them.
 */
const painter = ViewPlugin.define((view) => {
    paintColours(view.dom);

    return {
        destroy: () => paintColours(view.dom, null)
    };
});

function paintColours(element: HTMLElement, using: InkColours | null = colours): void {
    for (const property of ['--pulsar-ink', '--pulsar-ink-pin', '--pulsar-ink-dim'] as const) {
        if (using) {
            element.style.setProperty(property, using[property]);
        } else {
            element.style.removeProperty(property);
        }
    }
}

export function inkExtension(): Extension {
    return [inkField, ticker, dimmer, watcher, painter];
}

/**
 * Sets the colours for every editor fresh writing is installed in, and for
 * every one built after. Null takes them off again.
 */
export function setInkColours(next: InkColours | null, editors: EditorView[]): void {
    colours = next;

    for (const editor of editors) {
        if (editor.state.field(inkField, false) !== undefined) {
            paintColours(editor.dom);
        }
    }
}

export function setInkListener(next: ((view: EditorView) => void) | null): void {
    listener = next;
}

/** Marks a stretch to come back to. Returns false when there was nothing to mark. */
export function pinInk(editor: EditorView): boolean {
    const { state } = editor;

    if (state.field(inkField, false) === undefined) {
        return false;
    }

    const selection = state.selection.main;
    let from = selection.from;
    let to = selection.to;

    if (from === to) {
        // Nothing selected: the lit stretch under the cursor, or failing that
        // the line, which is what makes this usable on text you did not just
        // write.
        let found = false;

        state.field(inkField).between(from, to, (start, end) => {
            from = start;
            to = end;
            found = true;
        });

        if (!found) {
            const line = state.doc.lineAt(selection.head);
            from = line.from;
            to = line.to;
        }
    }

    if (to <= from) {
        return false;
    }

    editor.dispatch({ effects: pin.of({ from, to }) });
    return true;
}

/**
 * How many characters still look lit, and how many are pinned.
 *
 * The last shade is left out: it is a step away from ordinary text and reads
 * as ordinary text, so counting it reported writing nobody could see.
 */
export function inkCounts(editor: EditorView): { lit: number; pinned: number } {
    const set = editor.state.field(inkField, false);
    let lit = 0;
    let pinned = 0;

    if (set) {
        for (const iter = set.iter(); iter.value !== null; iter.next()) {
            const width = iter.to - iter.from;

            if (isPin(iter.value)) {
                pinned += width;
            } else if (shadeOf(iter.value) < STEPS - 1) {
                lit += width;
            }
        }
    }

    return { lit, pinned };
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
    options.mode = next.mode;

    if (wasEnabled && !next.enabled) {
        forgetInk(editors);
        return;
    }

    for (const editor of editors) {
        if (editor.state.field(inkField, false) !== undefined) {
            editor.dispatch({ effects: refresh.of(null) });
        }
    }
}

/** Cools every editor at once. Pins stay. */
export function forgetInk(editors: EditorView[]): void {
    for (const editor of editors) {
        if (editor.state.field(inkField, false) !== undefined) {
            editor.dispatch({ effects: forget.of(null) });
        }
    }
}

/** Cools one editor, for a count that is only about that note. Pins stay. */
export function coolInk(editor: EditorView): void {
    forgetInk([editor]);
}

/** Takes every pin out of one editor. Returns false when it had none. */
export function unpinInk(editor: EditorView): boolean {
    if (inkCounts(editor).pinned === 0) {
        return false;
    }

    editor.dispatch({ effects: unpin.of(null) });
    return true;
}

