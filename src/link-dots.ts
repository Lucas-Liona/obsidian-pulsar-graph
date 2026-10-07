import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from '@codemirror/view';
import { setTooltip } from 'obsidian';

/** How a linked note is drawn: the same brightness and colour as its node. */
export interface LinkLook {
    /** 0 to 1, the opacity of the dot. */
    strength: number;
    /** A colour of its own, for a pinned or spotlit note, or null for the stylesheet's. */
    colour: string | null;
    /** When the note was edited, in words, for hovering. */
    age: string;
}

/**
 * Everything the dots need from the rest of the plugin, handed in so this file
 * knows nothing about settings, the store or the graph.
 */
export interface LinkDotSource {
    /** The note a link points at from a given note, or null when it is unresolved or not a note. */
    resolve: (linkpath: string, sourcePath: string) => string | null;
    look: (path: string) => LinkLook | null;
}

/** A link found in a stretch of text: where it ends, and what it points at. */
export interface FoundLink {
    /** Just past the closing bracket, which is where the dot goes. */
    end: number;
    /** The note part only: no heading, block or alias. Never empty. */
    linkpath: string;
}

const DOT_CLASS = 'pulsar-graph-link-dot';

const WIKILINK = /(!?)\[\[([^[\]]+?)\]\]/g;
const MARKDOWN_LINK = /(!?)\[[^[\]]*\]\(([^()\s]+)\)/g;

/**
 * Every link to another note in a stretch of text.
 *
 * Embeds are left out, since an embed shows the note rather than pointing at
 * it, and so are web links: anything with a scheme. A link to a heading or
 * block in the same note has no note part and is left out too — the dot would
 * only repeat the brightness of the note it is in.
 */
export function findLinks(text: string, offset = 0): FoundLink[] {
    const found: FoundLink[] = [];

    for (const match of text.matchAll(WIKILINK)) {
        if (match[1] === '!') {
            continue;
        }

        const linkpath = notePart(match[2].split('|')[0]);

        if (linkpath.length > 0) {
            found.push({ end: offset + match.index + match[0].length, linkpath });
        }
    }

    for (const match of text.matchAll(MARKDOWN_LINK)) {
        const target = match[2];

        if (match[1] === '!' || /^[a-z][a-z0-9+.-]*:/i.test(target)) {
            continue;
        }

        let decoded = target;

        try {
            decoded = decodeURIComponent(target);
        } catch {
            // A stray percent sign; the link is matched as written.
        }

        const linkpath = notePart(decoded);

        if (linkpath.length > 0) {
            found.push({ end: offset + match.index + match[0].length, linkpath });
        }
    }

    return found.sort((a, b) => a.end - b.end);
}

/** The note a link text names, without a heading or block after it. */
function notePart(linktext: string): string {
    const cut = linktext.search(/[#^]/);
    return (cut >= 0 ? linktext.slice(0, cut) : linktext).trim();
}

/** Draws one dot. Shared by both views, so they cannot drift apart. */
function paintDot(dot: HTMLElement, look: LinkLook): void {
    dot.style.opacity = Math.min(1, Math.max(0, look.strength)).toFixed(3);

    if (look.colour === null) {
        dot.style.removeProperty('background-color');
    } else {
        dot.style.backgroundColor = look.colour;
    }

    setTooltip(dot, look.age);
}

/**
 * The dots in reading view, kept so they can be repainted when a note's age or
 * pin changes without the whole note being rendered again.
 */
export class ReadingDots {
    private readonly dots = new Set<HTMLElement>();

    /** Puts a dot after every resolved link to a note in a freshly rendered section. */
    decorate(root: HTMLElement, sourcePath: string, source: LinkDotSource): void {
        for (const link of Array.from(root.querySelectorAll<HTMLAnchorElement>('a.internal-link'))) {
            if (link.hasClass('is-unresolved') || link.closest('.internal-embed') || link.nextElementSibling?.hasClass(DOT_CLASS)) {
                continue;
            }

            const href = link.getAttribute('data-href') ?? link.getAttribute('href') ?? '';
            const linkpath = notePart(href);
            const path = linkpath.length > 0 ? source.resolve(linkpath, sourcePath) : null;
            const look = path === null ? null : source.look(path);

            if (path === null || look === null) {
                continue;
            }

            const dot = createSpan({ cls: DOT_CLASS });
            dot.dataset.path = path;
            paintDot(dot, look);
            link.insertAdjacentElement('afterend', dot);
            this.dots.add(dot);
        }
    }

    /** Repaints every dot still on screen, and forgets the ones that are not. */
    refresh(source: LinkDotSource): void {
        for (const dot of this.dots) {
            const look = dot.isConnected && dot.dataset.path ? source.look(dot.dataset.path) : null;

            if (!dot.isConnected) {
                this.dots.delete(dot);
            } else if (look) {
                paintDot(dot, look);
            }
        }
    }

    clear(): void {
        for (const dot of this.dots) {
            dot.remove();
        }

        this.dots.clear();
    }
}

class DotWidget extends WidgetType {
    constructor(private readonly path: string, private readonly look: LinkLook) {
        super();
    }

    eq(other: DotWidget): boolean {
        return other.path === this.path
            && other.look.strength === this.look.strength
            && other.look.colour === this.look.colour
            && other.look.age === this.look.age;
    }

    toDOM(): HTMLElement {
        const dot = createSpan({ cls: DOT_CLASS });
        paintDot(dot, this.look);
        return dot;
    }

    ignoreEvent(): boolean {
        return false;
    }
}

/** Something about the notes changed, though nothing in this editor did. */
const refresh = StateEffect.define<null>();

/** Whether a position sits in code, where a pair of brackets is not a link. */
function inCode(view: EditorView, pos: number): boolean {
    const name = syntaxTree(view.state).resolveInner(pos, 1).name;
    return /code|math/.test(name);
}

/**
 * The dots in the editor, live preview and source mode both.
 *
 * Only what is on screen is looked at, so the cost is in the visible lines and
 * not in the length of the note, and a keystroke that moves no link costs a
 * scan of those lines and a comparison per dot.
 */
export function linkDotsExtension(source: () => LinkDotSource | null, sourcePath: (view: EditorView) => string | null): ViewPlugin<{ decorations: DecorationSet }> {
    return ViewPlugin.fromClass(
        class {
            decorations: DecorationSet;

            constructor(private readonly view: EditorView) {
                this.decorations = this.build();
            }

            update(update: ViewUpdate): void {
                if (update.docChanged || update.viewportChanged
                    || update.transactions.some((transaction) => transaction.effects.some((effect) => effect.is(refresh)))) {
                    this.decorations = this.build();
                }
            }

            private build(): DecorationSet {
                const from = source();
                const path = sourcePath(this.view);

                if (!from || path === null) {
                    return Decoration.none;
                }

                const builder = new RangeSetBuilder<Decoration>();

                for (const { from: start, to } of this.view.visibleRanges) {
                    for (const link of findLinks(this.view.state.sliceDoc(start, to), start)) {
                        if (inCode(this.view, link.end - 1)) {
                            continue;
                        }

                        const target = from.resolve(link.linkpath, path);
                        const look = target === null ? null : from.look(target);

                        if (target !== null && look !== null) {
                            builder.add(link.end, link.end, Decoration.widget({ widget: new DotWidget(target, look), side: 1 }));
                        }
                    }
                }

                return builder.finish();
            }
        },
        { decorations: (plugin) => plugin.decorations }
    );
}

/** Asks every editor to redraw its dots, after something other than typing changed them. */
export function refreshLinkDots(editors: EditorView[]): void {
    for (const editor of editors) {
        editor.dispatch({ effects: refresh.of(null) });
    }
}
