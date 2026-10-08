import { App, WorkspaceLeaf } from 'obsidian';
import { OpacityStore } from './opacity-store';
import { nodeCount, sameGraphData } from './filter';

/**
 * Used when a renderer does not expose its theme colours. Obsidian falls back
 * to the same grey when it cannot read them from CSS.
 */
const FALLBACK_COLOR_RGB = 0x888888;

const GRAPH_VIEW_TYPES = ['graph', 'localgraph'] as const;

// Obsidian's graph internals are undocumented, so these describe only the
// parts this plugin touches.

/**
 * The text object Obsidian draws a node's title with. It is a PIXI display
 * object, and anything added to its children is drawn in the same space, so a
 * label parented to it inherits the title's position, zoom and visibility for
 * free.
 */
export interface GraphText {
    text: string;
    alpha: number;
    visible: boolean;
    /** PIXI's own switch; Obsidian never touches it, so it is the one to hide with. */
    renderable?: boolean;
    resolution: number;
    y: number;
    scale: { x: number; y: number };
    style: { fontFamily?: unknown };
    anchor: { set: (x: number, y: number) => void };
    children: GraphText[];
    /** What it is drawn inside. Null once removed, which destroying a parent does. */
    parent?: GraphText | null;
    addChild: (child: GraphText) => void;
    removeChild: (child: GraphText) => void;
    destroy: () => void;
}

/** Builds one of the above. Obtained from an existing title, never a global. */
export type GraphTextConstructor = new (text: string, style: unknown) => GraphText;

/** The image a link's line is drawn from. Swapped to fade one along its length. */
export interface GraphTexture {
    width: number;
}

/** Builds one from a canvas. Reached through an existing texture, never a global. */
export interface GraphTextureFactory {
    from: (source: HTMLCanvasElement) => GraphTexture;
}

/** One link between two nodes, drawn as a stretched and rotated sprite. */
export interface GraphLink {
    source?: GraphNode;
    target?: GraphNode;
    rendered?: boolean;
    line?: {
        alpha: number;
        tint: number;
        visible: boolean;
        renderable?: boolean;
        texture?: GraphTexture;
    } | null;
}

export interface GraphNode {
    id: string;
    color?: {
        a: number;
        rgb: number;
    };
    /** False until the node is close enough to the viewport to be drawn. */
    rendered?: boolean;
    /** How far the title is nudged clear of the node while it is hovered. */
    moveText?: number;
    /** Set to have the title's font rebuilt on the next frame. */
    fontDirty?: boolean;
    /** The displayed adjacency, keyed by the id at the other end. */
    forward?: Record<string, unknown>;
    reverse?: Record<string, unknown>;
    text?: GraphText | null;
    circle?: { tint: number; visible: boolean; renderable?: boolean } | null;
    getSize?: () => number;
}

export interface GraphNodeLookup {
    [path: string]: GraphNode;
}

export interface GraphRenderer {
    nodeLookup: GraphNodeLookup;
    /** Every node, drawn or not. nodeLookup holds the same objects by path. */
    nodes?: GraphNode[];
    links?: GraphLink[];
    /** Zoom, and the sqrt(1/scale) nodes and titles are drawn at. */
    scale?: number;
    nodeScale?: number;
    /** The graph's own node size slider, which feeds every node's size. */
    fNodeSizeMult?: number;
    /** The element the graph canvas is drawn into. */
    containerEl?: HTMLElement;
    /** Cursor position within that element, or null when it is outside. */
    mouseX?: number | null;
    mouseY?: number | null;
    /** Theme colours the renderer reads from CSS. */
    colors?: {
        fill?: { rgb: number };
        /** What titles are drawn in. */
        text?: { rgb: number };
        /** What links are drawn in, and what an attached one becomes. */
        line?: { a: number; rgb: number };
        lineHighlight?: { a: number };
    };
    /** The per-frame draw, reassigned whenever graphics are rebuilt. */
    renderCallback?: (() => void) | null;
    /** The node under the cursor, which Obsidian colours for itself. */
    getHighlightNode?: () => GraphNode | null | undefined;
    /** Assigned by the graph view; see hookNodeHover. */
    onNodeHover?: ((event: MouseEvent, id: string, type: string) => void) | null;
    onNodeUnhover?: (() => void) | null;
    /** Rebuilds nodes and links, resetting every node colour on the way. */
    setData?: (data: unknown) => unknown;
    /** Wakes the render loop and queues a frame. */
    changed?: () => void;
}

interface GraphEngine {
    render?: () => void;
    /**
     * How far the graph's own timelapse has run. Zero while nothing is
     * replaying. Not an index into anything — it climbs past the number of
     * files in the vault — so it is only ever read as a yes or no.
     */
    progression?: number;
    /**
     * The local graph's own settings. `localFile` is the note it was built
     * around and `localJumps` how many links out it reached.
     */
    options?: { localFile?: string; localJumps?: number };
}

interface GraphView {
    renderer?: GraphRenderer;
    containerEl?: HTMLElement;
    /** The global graph calls it dataEngine; the local graph calls it engine. */
    dataEngine?: GraphEngine;
    engine?: GraphEngine;
    /** The local graph is a file view, so it reports the note it is showing. */
    file?: { path?: string } | null;
    /** Runs a callback when the view closes, as every Obsidian component can. */
    register?: (callback: () => void) => void;
}

/** What Obsidian's view registry builds a view of each type with. */
type ViewCreator = (leaf: unknown) => unknown;

/** Which of Obsidian's two graphs a renderer belongs to. */
export type GraphKind = 'global' | 'local';

/**
 * One open graph view and the two things that differ between the kinds.
 *
 * A local graph is not a smaller global graph: it is a question about one note,
 * and every node in it is there because of its relationship to that note. Most
 * of this plugin does not care, but anything asking "compared to what" does.
 */
export interface OpenGraph {
    renderer: GraphRenderer;
    kind: GraphKind;
    /**
     * The note a local graph is built around, read fresh each time because a
     * local graph follows the active note without its view being replaced.
     * Always null for the global graph, which has no centre.
     */
    centre: () => string | null;
    /** Whether the graph's own timelapse is running right now. */
    replaying: () => boolean;
}

/**
 * What the local graph was built around.
 *
 * The engine's own `localFile` is preferred over the view's file: it is the one
 * the graph was actually built from, so a view mid-switch cannot report a
 * centre that none of the drawn nodes are related to.
 */
function centreOf(view: GraphView): string | null {
    const built = view.engine?.options?.localFile;

    if (typeof built === 'string' && built.length > 0) {
        return built;
    }

    const showing = view.file?.path;

    return typeof showing === 'string' && showing.length > 0 ? showing : null;
}

/** A way to ask a view for its centre later, since a local graph's moves. */
function centreFinder(view: GraphView, kind: GraphKind): () => string | null {
    return kind === 'local' ? () => centreOf(view) : () => null;
}

/**
 * Every open graph view, paired with the kind of graph it is.
 *
 * Only leaves the workspace still walks. getLeavesOfType was seen to go on
 * returning a graph leaf after it was detached (#98), and every graph it
 * handed back stayed attached, hooks and all, and was rebuilt with the rest
 * on every refilter, though nothing would ever draw it again.
 */
function* graphViews(app: App): Generator<{ view: GraphView; kind: GraphKind }> {
    const live = new Set<WorkspaceLeaf>();
    app.workspace.iterateAllLeaves((leaf) => {
        live.add(leaf);
    });

    for (const viewType of GRAPH_VIEW_TYPES) {
        const kind: GraphKind = viewType === 'localgraph' ? 'local' : 'global';

        for (const leaf of app.workspace.getLeavesOfType(viewType)) {
            if (live.has(leaf)) {
                yield { view: leaf.view, kind };
            }
        }
    }
}

/**
 * Asks each open graph to rebuild its data from the vault.
 *
 * Only needed to prime a graph that was already open when the plugin attached,
 * since nothing has handed it any data to keep since. Every rebuild after that
 * is served from what was kept.
 */
export function rebuildGraphData(app: App): void {
    for (const { view } of graphViews(app)) {
        const engine = view.dataEngine ?? view.engine;

        engine?.render?.();
    }
}

export function openGraphs(app: App): OpenGraph[] {
    const open: OpenGraph[] = [];

    for (const { view, kind } of graphViews(app)) {
        const renderer = view.renderer;

        if (renderer?.nodeLookup) {
            const engine = view.dataEngine ?? view.engine;

            open.push({
                renderer,
                kind,
                centre: centreFinder(view, kind),
                replaying: () => (engine?.progression ?? 0) > 0
            });
        }
    }

    return open;
}

/** Every path the graph is currently drawing a node for. */
export function pathsIn(renderer: GraphRenderer): string[] {
    return Object.keys(renderer.nodeLookup);
}

/** The element a graph view draws its own controls into, if it has one. */
export function controlsFor(app: App, renderer: GraphRenderer): HTMLElement | null {
    for (const { view } of graphViews(app)) {
        if (view.renderer === renderer) {
            return view.containerEl?.querySelector('.graph-controls') ?? null;
        }
    }

    return null;
}

export interface OpacityOptions {
    /** Spreads brightness across the notes the graph is drawing, not the vault. */
    adaptive: boolean;
    /**
     * The moment the graph's own replay has reached, or null when nothing is
     * replaying. Replaces everything else that decides brightness: a replay is
     * a question about one moment in the past, and a glow, a group average or a
     * pin are all answers about the present.
     */
    replayAt: number | null;
    /** How long a note stays lit behind the replay's wave, in vault days. */
    replayTrailDays: number;
    /**
     * The note to measure time from instead of from now, which only a graph
     * with a centre has. Replaces the spread when set: both are a
     * re-measurement, and running one after the other would measure a number
     * that had already been measured.
     */
    anchorPath: string | null;
    /** How far the range is held open when what is shown covers almost no time. */
    spreadFloorHours: number;
    /**
     * The notes to spotlight, already chosen. Handed in rather than looked up
     * here because the node sizes read the same list, and which notes are the
     * newest depends on whether this graph is measured against the vault or
     * against itself — a question only the caller knows the answer to.
     */
    spotlit: readonly string[];
    /** The colour to paint them, as a packed 0xRRGGBB. */
    spotlightRgb: number;
    /** 0 leaves the node's own colour alone, 1 replaces it outright. */
    spotlightStrength: number;
    /** How much of a neighbour's brightness carries over. 0 switches it off. */
    neighbourBleed: number;
    /** How many links the carry travels along. */
    neighbourHops: number;
    /** How far each note is pulled toward its group's middle. 0 switches it off. */
    clusterWarmth: number;
    clusterBy: 'folder' | 'component';
    /** The notes held bright and marked whatever their dates say. */
    pinned: ReadonlySet<string>;
    /** What a pinned note is held at, which is the top of the opacity range. */
    pinOpacity: number;
    /** Whether a pin is also given a colour of its own. */
    pinMark: boolean;
    /** That colour, as a packed 0xRRGGBB. */
    pinRgb: number;
    /** 0 leaves the node's own colour alone, 1 replaces it outright. */
    pinStrength: number;
    /**
     * Whether the theme is a light one. Above full alpha the renderer lightens
     * a circle channel by channel, which on a dark background reads as
     * brighter and on a light one is a step toward the background — a note at
     * 3 was drawn white on white. So on a light theme a node past 1 is drawn
     * at 1 and deepened toward black instead, the mirror of what the renderer
     * does on a dark one.
     */
    lightTheme: boolean;
    /**
     * Every node this plugin has painted over, and the colour each had before.
     *
     * Node colour is the only place a graph group's colour lives, so anything
     * that paints a node has to be able to put the real one back — when the
     * newest note moves on, when a pin is taken off, or when either setting is
     * switched off.
     *
     * Both the spotlight and pins paint, and they share this one record on
     * purpose. Two of these, each saving and restoring the same node's colour,
     * is how a group colour gets lost for good: whichever saved second saves
     * the first one's paint and then faithfully restores it.
     */
    paint: PaintState;
}

/** What one painted node looked like before, and what it was painted. */
export interface PaintedNode {
    originalRgb: number;
    paintedRgb: number;
}

/** Every node currently carrying a colour of ours. */
export interface PaintState {
    painted: Map<string, PaintedNode>;
    /**
     * Nodes whose colour has just been handed back, each with the tint it is
     * owed and a budget of frames to keep being given it.
     *
     * Assigning the tint once is not enough, and the reason took measuring.
     * Unpinning a note put its colour back correctly and still left it drawn at
     * #b3aab3 against a colour of #b3b3b3 — frozen there, not drifting, across
     * 124 frames.
     *
     * Two things were going on. Taking a pin off changes what the filter keeps,
     * so Obsidian rebuilds the graph, and the rebuild is what dropped the
     * record of the paint before anything could hand the colour back — the
     * node kept wearing the pin tint with nothing left that knew to take it
     * off. And the renderer cannot ease its way out of that on its own: it
     * steps a tenth of the gap per frame and truncates, so a channel climbing
     * the last few units moves by `9 * 0.1 = 0` and stalls, permanently, a
     * whisker short. That is the asymmetry — easing a channel *down* converges,
     * easing it *up* stops about nine units out.
     *
     * So a released node is handed its colour on every pass until two passes
     * running find it already right, which is the only evidence that the
     * assignment stuck. Counting frames instead does not work: a rebuild
     * replaces the circle object, so a budget spent before the new one exists
     * is spent on the old one and the new one eases up from the old paint and
     * stalls. The flip side of the stall is that an assignment which does land
     * is permanent — at zero gap there is nothing left to step.
     */
    releasing: Map<string, Releasing>;
    /**
     * The theme's node colour as the last pass found it, which is what a node
     * with no colour of its own was handed.
     *
     * Every node is given a colour here, so one that had none — no group, the
     * theme's grey — carries that grey from then on, and the renderer never
     * looks at the theme for it again. Switching from a dark theme to a light
     * one left every such node in the dark theme's #b3b3b3 against a fill of
     * #5c5c5c, measured, through any number of repaints. A colour equal to this
     * one is read as "the theme's", and follows the theme when it changes.
     */
    fallback: number | null;
}

/** A tint owed to a node, and how many passes have found it already correct. */
interface Releasing {
    rgb: number;
    stable: number;
    /** Passes spent on this node, against the hard stop. */
    seen: number;
}

/**
 * How many consecutive passes have to agree before a node is let go. More than
 * one, because one is what a fresh assignment produces on its own and says
 * nothing about whether it survived; three frames in a row on which the
 * renderer left the colour where it was put is when it has stopped moving it.
 */
const RELEASE_STABLE = 3;

/**
 * A hard stop, so a node that can never be satisfied cannot be held forever.
 * Far beyond anything legitimate — a release normally settles within a frame or
 * two of the rebuild that caused it.
 */
const RELEASE_LIMIT = 600;

export function newPaint(): PaintState {
    return { painted: new Map(), releasing: new Map(), fallback: null };
}

/**
 * Lets a bright note lift the notes it links to, so an area being worked in
 * reads as a region rather than as scattered points.
 *
 * Each pass takes the best of a node's own brightness and a fraction of its
 * brightest neighbour, so a second pass carries the fraction again and the glow
 * falls away with distance. The adjacency is the renderer's, not the vault's,
 * which is what keeps a local graph honest about what it is showing.
 */
function poolNeighbours(renderer: GraphRenderer, own: Map<string, number>, bleed: number, hops: number): Map<string, number> {
    let current = own;

    for (let hop = 0; hop < hops; hop++) {
        const next = new Map(current);

        for (const [path, node] of Object.entries(renderer.nodeLookup)) {
            const here = current.get(path);
            if (here === undefined) {
                continue;
            }

            let best = here;

            for (const id of neighboursOf(node)) {
                const there = current.get(id);

                if (there !== undefined) {
                    best = Math.max(best, there * bleed);
                }
            }

            next.set(path, best);
        }

        current = next;
    }

    return current;
}

/**
 * Pulls every note toward the middle of the group it belongs to, so a part of
 * the vault reads as alive or as cold at a glance rather than having to be
 * picked out note by note.
 *
 * Unlike the neighbour carry this moves notes both ways: a stale note in a busy
 * folder comes up, a fresh one in an abandoned corner goes down. That is the
 * point of it, and it is why it is a separate setting rather than more of the
 * same.
 */
function warmByGroup(renderer: GraphRenderer, own: Map<string, number>, warmth: number, by: 'folder' | 'component'): Map<string, number> {
    const groups = by === 'folder' ? groupByFolder(own) : groupByComponent(renderer, own);
    const middles = new Map<string, number>();

    for (const [group, paths] of groups) {
        const values = paths.map((path) => own.get(path) ?? 0).sort((a, b) => a - b);
        middles.set(group, values[values.length >> 1]);
    }

    const warmed = new Map<string, number>();

    for (const [path, value] of own) {
        const middle = middles.get(groupOf(groups, path) ?? '') ?? value;
        warmed.set(path, value * (1 - warmth) + middle * warmth);
    }

    return warmed;
}

/** Which group a path landed in. Built once rather than searched per note. */
const membership = new WeakMap<Map<string, string[]>, Map<string, string>>();

function groupOf(groups: Map<string, string[]>, path: string): string | undefined {
    let index = membership.get(groups);

    if (!index) {
        index = new Map<string, string>();

        for (const [group, paths] of groups) {
            for (const member of paths) {
                index.set(member, group);
            }
        }

        membership.set(groups, index);
    }

    return index.get(path);
}

/** The folder a note sits in directly, which is how people group their own work. */
function groupByFolder(own: Map<string, number>): Map<string, string[]> {
    const groups = new Map<string, string[]>();

    for (const path of own.keys()) {
        const cut = path.lastIndexOf('/');
        const folder = cut < 0 ? '' : path.slice(0, cut);

        const members = groups.get(folder) ?? [];
        members.push(path);
        groups.set(folder, members);
    }

    return groups;
}

/** Islands of linked notes, for vaults organized by link rather than by folder. */
function groupByComponent(renderer: GraphRenderer, own: Map<string, number>): Map<string, string[]> {
    const groups = new Map<string, string[]>();
    const seen = new Set<string>();

    for (const start of own.keys()) {
        if (seen.has(start)) {
            continue;
        }

        const members: string[] = [];
        const pending = [start];
        seen.add(start);

        while (pending.length > 0) {
            const path = pending.pop();
            if (path === undefined) {
                break;
            }

            members.push(path);

            const node = renderer.nodeLookup[path];
            if (!node) {
                continue;
            }

            for (const id of neighboursOf(node)) {
                if (!seen.has(id) && own.has(id)) {
                    seen.add(id);
                    pending.push(id);
                }
            }
        }

        groups.set(start, members);
    }

    return groups;
}

function* neighboursOf(node: GraphNode): Generator<string> {
    for (const id in node.forward) {
        yield id;
    }

    for (const id in node.reverse) {
        yield id;
    }
}

/**
 * Writes each node's cached opacity into the colour the renderer draws with,
 * and reports what each node ended up at so labels and links can agree with it.
 */
export function applyOpacity(renderer: GraphRenderer, store: OpacityStore, options: OpacityOptions): Map<string, number> | null {
    const fallbackRgb = renderer.colors?.fill?.rgb ?? FALLBACK_COLOR_RGB;
    const replaying = options.replayAt !== null;
    const own = new Map<string, number>();

    if (options.replayAt !== null) {
        for (const [path, opacity] of store.replayedAt(Object.keys(renderer.nodeLookup), options.replayAt, options.replayTrailDays)) {
            own.set(path, opacity);
        }
    } else {
        for (const path of Object.keys(renderer.nodeLookup)) {
            const mtime = store.mtimeFor(path);

            if (mtime !== undefined) {
                own.set(path, store.opacityFor(path) ?? store.cacheOpacityFor(path, mtime));
            }
        }
    }

    // Re-spread before anything pools. The glow and the folder warmth both
    // average over this number, so handing them the absolute one and then
    // re-spreading afterwards would spread a number that was already mixed.
    //
    // None of it runs during a replay. A replay is a question about one moment
    // in the past; a glow, a group average and a pin are all answers about the
    // present, and averaging across the wave is what would flatten it.
    const anchored = !replaying && options.anchorPath !== null
        ? store.aroundAnchor(own.keys(), options.anchorPath, options.spreadFloorHours)
        : null;

    const spread = anchored ?? (!replaying && options.adaptive ? store.spreadAcross(own.keys(), options.spreadFloorHours) : null);

    if (spread) {
        for (const [path, opacity] of spread) {
            own.set(path, opacity);
        }
    }

    // The glow runs first. It carries brightness along links, and grouping by
    // island draws its boundaries along those same links, so warming first
    // would hand every node neighbours identical to itself and leave the glow
    // with nothing to lift. Spreading locally and then taking the regional view
    // keeps both settings meaning something together.
    const glowed = !replaying && options.neighbourBleed > 0
        ? poolNeighbours(renderer, own, options.neighbourBleed, options.neighbourHops)
        : null;

    const pooled = !replaying && options.clusterWarmth > 0
        ? warmByGroup(renderer, glowed ?? own, options.clusterWarmth, options.clusterBy)
        : glowed;

    // A pin is held bright after everything that averages has run. Pinning is
    // a statement about one note, not evidence about the vault: letting it
    // through the glow would have a pin brighten its neighbours, and letting it
    // through the spread would have one pin squash the curve every other note
    // is measured on.
    const held = replaying ? (pooled ?? own) : holdPins(pooled ?? own, options);

    // Nothing of ours is painted during a replay. The spotlight points at the
    // vault's newest note, which has not been written yet at the moment being
    // shown, and a pin is a statement about today. Both would be the present
    // intruding on a picture of the past. Deepening is neither: it is how a
    // light theme draws what a dark one would draw past full alpha, so a
    // replay's wave gets it too.
    const wanted = replaying ? new Map<string, WantedPaint>() : wantedPaint(renderer, options);

    if (options.lightTheme) {
        for (const [path, opacity] of held) {
            if (opacity > 1 && !wanted.has(path) && renderer.nodeLookup[path]) {
                wanted.set(path, { deepen: opacity });
            }
        }
    }

    const themed = followTheme(options.paint, fallbackRgb);

    releasePaint(renderer, options.paint, wanted);

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const opacity = held.get(path);
        if (opacity === undefined) {
            continue;
        }

        const currentRgb = themed(node.color?.rgb);
        const target = wanted.get(path);

        if (target !== undefined) {
            const kept = options.paint.painted.get(path);
            const originalRgb = kept?.originalRgb ?? currentRgb;
            const paintedRgb = 'deepen' in target
                ? deepenRgb(originalRgb, target.deepen)
                : blendRgb(originalRgb, target.rgb, target.strength);

            // Never past 1. The renderer multiplies a circle's colour by its
            // alpha and clamps each channel, so above 1 every channel is pushed
            // up separately: #4dff91 at 1.85 was drawn #8effff. Grey only gets
            // whiter, which is what a high maximum is for, but a colour someone
            // picked comes out a different colour. A deepened node has had the
            // strength past 1 put into its colour already.
            options.paint.painted.set(path, { originalRgb, paintedRgb });
            node.color = { a: Math.min(opacity, 1), rgb: paintedRgb };
            continue;
        }

        node.color = { a: opacity, rgb: currentRgb };
    }

    holdPaintTint(renderer, options.paint);

    // What each node was actually drawn at, so sizes and the tab dot agree with
    // the picture rather than with what the curve would have said.
    return held;
}

/**
 * Carries everything that was wearing the theme's old node colour onto its new
 * one: the colours painted nodes will be handed back, the ones owed to nodes
 * being released, and — through the function returned — every other node's.
 */
function followTheme(paint: PaintState, fill: number): (rgb: number | undefined) => number {
    const stale = paint.fallback !== null && paint.fallback !== fill ? paint.fallback : null;
    paint.fallback = fill;

    if (stale !== null) {
        for (const marked of paint.painted.values()) {
            if (marked.originalRgb === stale) {
                marked.originalRgb = fill;
            }
        }

        for (const owed of paint.releasing.values()) {
            if (owed.rgb === stale) {
                owed.rgb = fill;
            }
        }
    }

    return (rgb) => rgb === undefined || rgb === stale ? fill : rgb;
}

/**
 * One colour a node is to be painted: a colour of ours and how much of it to
 * use, or how far past full strength a light theme deepens the node's own.
 */
type WantedPaint = { rgb: number; strength: number } | { deepen: number };

/**
 * Which nodes get a colour of ours this pass, and what.
 *
 * A pin wins. It is the one deliberate statement in the whole plugin — the user
 * said this note matters whatever its date says — and a colour that quietly
 * stops meaning "pinned" because the note was also edited this morning is a
 * colour nobody can read.
 *
 * The two do not have to fight over a node at all, though, which is the better
 * half of this: the spotlight is told to skip anything pinned and lands on the
 * next newest note instead. Both facts stay visible, and the question "which of
 * these wins" only arises for a graph with nothing left to promote.
 */
function wantedPaint(renderer: GraphRenderer, options: OpacityOptions): Map<string, WantedPaint> {
    const wanted = new Map<string, WantedPaint>();

    for (const path of options.spotlit) {
        if (renderer.nodeLookup[path]) {
            wanted.set(path, { rgb: options.spotlightRgb, strength: options.spotlightStrength });
        }
    }

    if (options.pinMark) {
        for (const path of options.pinned) {
            if (renderer.nodeLookup[path]) {
                wanted.set(path, { rgb: options.pinRgb, strength: options.pinStrength });
            }
        }
    }

    return wanted;
}

/**
 * Holds every pinned note at the top of the range.
 *
 * This is the whole point of a pin. The note you are heading back to is by
 * definition one you have not touched lately, so the longer you leave it the
 * fainter this plugin draws it — right up until the filter takes it out of the
 * graph altogether. A pin is where the user overrules the clock.
 */
function holdPins(drawn: Map<string, number>, options: OpacityOptions): Map<string, number> {
    if (options.pinned.size === 0) {
        return drawn;
    }

    const held = new Map(drawn);

    for (const path of options.pinned) {
        if (held.has(path)) {
            held.set(path, options.pinOpacity);
        }
    }

    return held;
}

/**
 * Holds a painted node's drawn tint at the colour it was given.
 *
 * Obsidian eases a node's tint toward its colour by a tenth each frame and
 * stops drawing once the graph has been idle for sixty frames, so a tint that
 * started on a graph group's colour freezes part way and the spotlight comes out
 * as a blend of the two. Assigning it outright is what makes the chosen colour
 * the colour you actually see.
 *
 * Skipped while the node is hovered, where Obsidian owns the colour and the
 * feedback is worth more than the spotlight.
 */
export function holdPaintTint(renderer: GraphRenderer, paint: PaintState): void {
    // Asked once rather than per node: on a light theme every note past full
    // strength is painted, which is thousands of them in a large vault.
    const hovered = renderer.getHighlightNode?.() ?? null;

    for (const [path, marked] of paint.painted) {
        const node = renderer.nodeLookup[path];

        // Written only when it has moved. The tint is a setter on the
        // renderer's side, and a node that has landed has nothing to correct.
        if (node?.circle && node !== hovered && node.circle.tint !== marked.paintedRgb) {
            node.circle.tint = marked.paintedRgb;
        }
    }

    // Nodes on the way back to their own colour. Held for a bounded number of
    // frames rather than until the tint first matches: it matches immediately,
    // because releasing one assigns it, and the drift happens afterwards.
}

/**
 * Hands back the colour of every node that has stopped being painted, once per
 * frame, until the renderer is drawing it.
 *
 * Only ever called from the frame hook, and that is the whole point of it being
 * a function of its own. Assigning the tint from wherever the release happened
 * does not hold: taking a pin off changes what the age filter keeps, so
 * Obsidian rebuilds the graph and builds a *new* circle for the node, and
 * anything written before that lands on the object being thrown away. Nor can
 * the evidence be gathered by counting calls — several passes run inside the
 * one settings change, all of them before the rebuild, so the tint looks
 * settled while the object that will actually be drawn does not exist yet.
 *
 * A frame is the only pass that means anything here, because a frame is when
 * the easing that undoes this runs.
 */
export function settleReleases(renderer: GraphRenderer, paint: PaintState): void {
    for (const [path, owed] of paint.releasing) {
        // Something wants this node painted again, so it is no longer being
        // released. Without this the two would fight over one node's tint.
        if (paint.painted.has(path)) {
            paint.releasing.delete(path);
            continue;
        }

        const node = renderer.nodeLookup[path];

        if (!node?.circle) {
            paint.releasing.delete(path);
            continue;
        }

        // Obsidian owns a hovered node's colour outright, so this neither
        // reads nor writes it; the frame after the cursor leaves settles it.
        if (renderer.getHighlightNode?.() === node) {
            continue;
        }

        owed.stable = node.circle.tint === owed.rgb ? owed.stable + 1 : 0;
        node.circle.tint = owed.rgb;

        if (owed.stable >= RELEASE_STABLE || ++owed.seen > RELEASE_LIMIT) {
            paint.releasing.delete(path);
        }
    }
}

/**
 * What the renderer does to a colour past full alpha on a dark background,
 * mirrored for a light one: there each channel is multiplied and clamped, so
 * grey climbs to white; here each channel's distance from white is, so grey
 * sinks to black. Moonstone's #5c5c5c is itself at 1, #0a0a0a at 1.5 and black
 * from 2.
 */
export function deepenRgb(rgb: number, strength: number): number {
    const sink = (shift: number): number => {
        const channel = (rgb >> shift) & 0xff;
        return 255 - Math.min(255, Math.round((255 - channel) * strength));
    };

    return (sink(16) << 16) | (sink(8) << 8) | sink(0);
}

/** Mixes two packed colours channel by channel. */
export function blendRgb(from: number, to: number, amount: number): number {
    const mix = (shift: number): number => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * amount) & 0xff;
    };

    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Puts back the colour we painted over, once it is no longer wanted. */
function releasePaint(renderer: GraphRenderer, paint: PaintState, next: Map<string, WantedPaint>): void {
    for (const [path, marked] of paint.painted) {
        if (!next.has(path)) {
            releaseNode(renderer, path, marked.originalRgb);
            paint.releasing.set(path, { rgb: marked.originalRgb, stable: 0, seen: 0 });
            paint.painted.delete(path);
        }
    }
}

/**
 * Hands every painted node its own colour back, tint included.
 *
 * Unloading without this would leave the node painted, and the next load would
 * read that paint as the colour to preserve, losing the real one for good.
 */
export function clearPaint(renderer: GraphRenderer, paint: PaintState): void {
    for (const [path, marked] of paint.painted) {
        releaseNode(renderer, path, marked.originalRgb);
    }

    paint.painted.clear();
    paint.releasing.clear();

    // Nothing will be holding the tint after this — it is called on unload and
    // when a view closes — so the one chance to land it is now, and a repaint
    // is what gets the assignment drawn rather than eased away from.
    repaint(renderer);
}

function releaseNode(renderer: GraphRenderer, path: string, originalRgb: number): void {
    const node = renderer.nodeLookup[path];

    if (node?.color) {
        node.color = { a: node.color.a, rgb: originalRgb };
    }

    if (node?.circle) {
        node.circle.tint = originalRgb;
    }
}

/**
 * Forgets the colours being preserved, now that Obsidian has rewritten every
 * node's colour from group data and what is on the node is authoritative again.
 *
 * What it does *not* do is forget the nodes. A rebuild restores `node.color`
 * and leaves `circle.tint` alone, so a node that was painted a moment ago is
 * still wearing that paint with nothing left that remembers to take it off.
 * Each one is handed to the release queue against the colour Obsidian has just
 * given it, which is by definition the right one. Clearing the map outright is
 * what left an unpinned node drawn in the pin colour.
 */
export function forgetPaintedColors(renderer: GraphRenderer, paint: PaintState): void {
    for (const [path, marked] of paint.painted) {
        // What Obsidian has just put back, or failing that what the node had
        // before it was painted. The fallback is not a nicety: mid-rebuild a
        // node's colour is not assigned yet, so reading it comes back
        // undefined for every node at once — and skipping them there is what
        // dropped the record and left a node wearing paint nothing owned.
        const restored = renderer.nodeLookup[path]?.color?.rgb ?? marked.originalRgb;

        paint.releasing.set(path, { rgb: restored, stable: 0, seen: 0 });
    }

    paint.painted.clear();

    // A rebuild is exactly what displaces a tint, so any node already waiting
    // to be let go has to prove itself again afterwards. Keeping the evidence
    // from before would release it against a circle that no longer exists.
    for (const owed of paint.releasing.values()) {
        owed.stable = 0;
    }
}

/**
 * Repaints a graph. The renderer's own render callback draws nothing once the
 * graph has been idle for more than 60 frames, so going through changed() is
 * what makes an update visible without the user moving the mouse first.
 */
export function repaint(renderer: GraphRenderer): void {
    renderer.changed?.();
}

export type Unhook = () => void;

/**
 * Calls back with each graph view Obsidian builds from now on, as it is built:
 * the renderer, a way to run something when that view closes, and a way to ask
 * a local graph what it is built around.
 *
 * A graph view creates its renderer in its constructor and is handed the vault
 * as it opens, before anything that waits for the layout to change can reach
 * it. So the first build of a new graph used to be every note, whatever the
 * filter said, and in a large vault that build is most of the cost of opening
 * the graph. A leaf asks the registry for a creator each time it opens a view,
 * so wrapping the two a core plugin registered reaches every graph built after
 * this, and nothing else.
 *
 * Released like every hook here: put back where still on top, and switched off
 * where something has wrapped it since.
 */
export function hookGraphCreation(
    app: App,
    onCreated: (renderer: GraphRenderer, onClose: (callback: () => void) => void, centre: () => string | null) => void
): Unhook {
    const registry = (app as unknown as { viewRegistry?: { viewByType?: Record<string, ViewCreator | undefined> } })
        .viewRegistry?.viewByType;

    if (!registry) {
        return () => undefined;
    }

    let live = true;
    const restores: Unhook[] = [];

    for (const viewType of GRAPH_VIEW_TYPES) {
        const original = registry[viewType];
        if (typeof original !== 'function') {
            continue;
        }

        const kind: GraphKind = viewType === 'localgraph' ? 'local' : 'global';

        const wrapped = function (this: unknown, leaf: unknown): unknown {
            const view = original.call(this, leaf) as GraphView | null | undefined;
            const renderer = view?.renderer;

            if (live && view && renderer && typeof renderer.setData === 'function') {
                try {
                    onCreated(renderer, (callback) => view.register?.(callback), centreFinder(view, kind));
                } catch {
                    // Never at the cost of the graph opening. One that is not
                    // reached here is attached once it is open, as before.
                }
            }

            return view;
        };

        registry[viewType] = wrapped;
        restores.push(() => {
            if (registry[viewType] === wrapped) {
                registry[viewType] = original;
            }
        });
    }

    return () => {
        live = false;

        for (const restore of restores) {
            restore();
        }
    };
}

/**
 * Calls back whenever a renderer rebuilds its data.
 *
 * Obsidian reassigns every node's colour from group data inside setData, which
 * wipes the opacity applied here. Reacting to that is what lets the plugin sit
 * idle instead of reapplying opacity on a timer.
 */
export interface DataHook {
    release: Unhook;
    /**
     * Rebuilds the graph from the last data the engine supplied. False when
     * none has been seen yet, which is the case for a graph that was already
     * open when the plugin attached to it.
     */
    reapply: () => boolean;
}

export function hookRendererData(
    renderer: GraphRenderer,
    onData: () => void,
    transform: (data: unknown) => unknown
): DataHook | null {
    const original = renderer.setData;
    if (typeof original !== 'function') {
        return null;
    }

    // The engine's own data, kept whole. A filter is a view of it, so changing
    // one has to start from everything rather than from what last survived.
    let supplied: unknown = null;
    // What the renderer was last actually given, after the filter.
    let handed: unknown = null;
    let live = true;

    const patched = function (this: GraphRenderer, data: unknown): unknown {
        // Released but still wrapped by something installed after it, so it
        // can only step aside: an unloaded plugin must not keep filtering.
        if (!live) {
            return original.call(this, data);
        }

        supplied = data;
        const next = transform(data);

        // The same graph again. Passing it on would have Obsidian reset every
        // colour from group data and wake the renderer, and the repaint that
        // follows wakes it again. The engine's timelapse sends the same data
        // about nine times a second and only steps while the graph draws, so
        // those two wake-ups were enough to keep a settled graph drawing at
        // full rate indefinitely. Nothing has changed, so nothing is done. The
        // node count is checked too, in case something rebuilt the renderer
        // behind this hook's back.
        if (handed !== null && sameGraphData(handed, next) && this.nodes?.length === nodeCount(next)) {
            return undefined;
        }

        handed = next;

        const result = original.call(this, next);
        onData();

        return result;
    };

    renderer.setData = patched;

    return {
        reapply: () => {
            if (supplied === null) {
                return false;
            }

            patched.call(renderer, supplied);
            return true;
        },
        release: () => {
            live = false;

            if (renderer.setData === patched) {
                renderer.setData = original;
            }
        }
    };
}

/** A frame hook that can report whether it is still the installed callback. */
export interface FrameHook {
    release: Unhook;
    isInstalled: () => boolean;
}

/**
 * Calls back after every frame a renderer draws.
 *
 * The callback is an instance property Obsidian assigns in initGraphics and
 * reads back through requestAnimationFrame, so wrapping it reaches one graph
 * only. It stops being called once the graph settles, which is exactly when
 * nothing needs repositioning. Obsidian assigns a fresh one whenever it rebuilds
 * graphics, so callers re-install when isInstalled stops holding.
 *
 * Releasing can only unlink a wrapper that is still on top. One that anything
 * has wrapped since — another plugin, or this plugin loaded again — is that
 * wrapper's original now, and stays in the chain for as long as the graph
 * lives. So release also switches onFrame off. Without that, an unloaded
 * plugin kept drawing age labels from its frozen copy of the vault, one more
 * set per reload, stacked on the same titles.
 */
export function hookRendererFrame(renderer: GraphRenderer, onFrame: () => void): FrameHook | null {
    const original = renderer.renderCallback;
    if (typeof original !== 'function') {
        return null;
    }

    let live = true;

    const patched = function (this: GraphRenderer): void {
        original.call(this);

        if (live) {
            onFrame();
        }
    };

    renderer.renderCallback = patched;

    return {
        isInstalled: () => renderer.renderCallback === patched,
        release: () => {
            live = false;

            if (renderer.renderCallback === patched) {
                renderer.renderCallback = original;
            }
        }
    };
}

/**
 * Hides nodes without taking them out of the graph, for the length of a drag.
 *
 * A real filter rebuilds the data and lets the simulation re-pack, which is
 * what you want when a choice has been made and badly wrong while it is being
 * made: every frame of a scrub would re-pack, and the thing being aimed at would
 * crawl away from the cursor. Hiding leaves every position untouched, so the
 * graph holds still and only the contents change.
 *
 * Hidden with `renderable`, not `visible`. Obsidian sets `visible` itself on
 * every frame, to skip what is outside the viewport, so a node hidden that way
 * was drawn again before the frame was: the preview flagged 56 nodes hidden in
 * the demo vault and the screen did not change at all. Every node is set either
 * way on each pass, so one dragged back into the range comes back with it.
 */
export function previewFilter(
    renderer: GraphRenderer,
    keeps: (path: string) => boolean
): void {
    const hidden = new Set<string>();

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const kept = keeps(path);

        if (!kept) {
            hidden.add(path);
        }

        if (node.circle) {
            node.circle.renderable = kept;
        }

        if (node.text) {
            node.text.renderable = kept;
        }
    }

    for (const link of renderer.links ?? []) {
        const source = link.source?.id;
        const target = link.target?.id;

        if (link.line) {
            link.line.renderable = !((source !== undefined && hidden.has(source)) || (target !== undefined && hidden.has(target)));
        }
    }
}

/** Draws everything a preview hid, once the drag is over. */
export function clearPreviewFilter(renderer: GraphRenderer): void {
    previewFilter(renderer, () => true);
}

/**
 * Keeps node titles the size their nodes imply.
 *
 * A title's font is `14 + size / 4`, but the text is only re-rasterised when a
 * node is flagged dirty, and nothing flags it when the graph's node size slider
 * moves. So the circles grow and their names stay where they were, which is
 * Obsidian's bug rather than this plugin's — but this plugin draws text beside
 * those names and sizes it the same way, so it cannot leave it alone.
 *
 * Returns true on the frame the size changed, so anything else drawn at that
 * size can be rebuilt with it.
 */
export function syncLabelFonts(renderer: GraphRenderer, state: { multiplier?: number }): boolean {
    const multiplier = renderer.fNodeSizeMult ?? 1;

    if (state.multiplier === multiplier) {
        return false;
    }

    const first = state.multiplier === undefined;
    state.multiplier = multiplier;

    // Nothing has gone stale yet on the very first frame.
    if (first) {
        return false;
    }

    for (const node of renderer.nodes ?? []) {
        node.fontDirty = true;
    }

    return true;
}

/** What a node's size and title are scaled by, or nothing to leave both alone. */
export interface SizeOptions {
    /** The spotlit notes, drawn larger so the ones you always want are findable. */
    spotlit: Set<string>;
    spotlightSize: number;
    /** A note's own brightness, 0 to 1, or undefined for one with no age. */
    strengthOf: (path: string) => number | undefined;
    /** What the dimmest note's circle is multiplied by. */
    smallest: number;
    /** What the brightest note's circle is multiplied by. */
    largest: number;
    /** Whether sizing by age is on at all. */
    byAge: boolean;
    /** What every title's font is multiplied by, 1 to leave it alone. */
    titleScale: number;
}

/**
 * Sizes nodes and titles.
 *
 * Node size is Obsidian's, not this plugin's: `getSize()` is
 * `fNodeSizeMult * clamp(3 * sqrt(links + 1), 8, 30)`, so a node grows with how
 * many links it has and nothing else. That sounds like a useful channel until
 * you measure it — in a real 1088-note vault, 381 of the first 400 nodes sat at
 * the floor of 8, because the formula does not leave the floor until a note has
 * seven links. The size channel is almost entirely unused, which is what makes
 * it worth spending on age.
 *
 * The override multiplies Obsidian's own number rather than replacing it, so a
 * hub still reads as a hub. It is an own property shadowing the prototype
 * method, which is also how it is undone: deleting it hands the node back.
 *
 * A title's font is `14 + size / 4`, so changing the size changes the title with
 * it — the node has to be flagged `fontDirty` for the renderer to re-rasterise
 * it. Title scale is applied on top of that, by wrapping `getTextStyle` the
 * same way, so the two are separable.
 *
 * Nothing here reaches the simulation. Obsidian's own node size slider does not
 * either: the physics run in a worker with their own copy of the graph, so a
 * bigger circle does not push harder.
 */
export function applySizes(renderer: GraphRenderer, options: SizeOptions): boolean {
    let changed = false;

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const strength = options.byAge ? options.strengthOf(path) : undefined;
        let scale = strength === undefined
            ? 1
            : options.smallest + clamp01(strength) * (options.largest - options.smallest);

        // Multiplied rather than substituted. The spotlight is a flag on top of
        // whatever sizing is in force, so overriding it would mean switching
        // sizing on could make the spotlight shrink.
        if (options.spotlit.has(path)) {
            scale *= options.spotlightSize;
        }

        changed = sizeNode(node, scale, options.titleScale) || changed;
    }

    if (changed) {
        repaint(renderer);
    }

    return changed;
}

/** Hands every node its own size and title back, for unload. */
export function clearSizes(renderer: GraphRenderer): void {
    for (const node of Object.values(renderer.nodeLookup)) {
        sizeNode(node, 1, 1);
    }

    repaint(renderer);
}

interface SizedNode extends GraphNode {
    getTextStyle?: () => { fontSize?: number };
    /** What this node is currently scaled by, so a no-op costs nothing. */
    pulsarSize?: number;
    pulsarTitle?: number;
}

function sizeNode(node: GraphNode, scale: number, titleScale: number): boolean {
    const sized = node as SizedNode;

    if (sized.pulsarSize === scale && sized.pulsarTitle === titleScale) {
        return false;
    }

    const proto = Object.getPrototypeOf(node) as SizedNode;

    // Always re-derive from the prototype rather than from whatever is on the
    // node, so repeated passes cannot compound into something far larger than
    // asked for.
    if (scale === 1) {
        delete sized.getSize;
    } else {
        const base = proto.getSize;
        sized.getSize = function (this: GraphNode): number {
            return (base?.call(this) ?? 8) * scale;
        };
    }

    if (titleScale === 1) {
        delete sized.getTextStyle;
    } else {
        const baseStyle = proto.getTextStyle;
        sized.getTextStyle = function (this: GraphNode): { fontSize?: number } {
            const style = baseStyle?.call(this) ?? {};

            if (typeof style.fontSize === 'number') {
                style.fontSize *= titleScale;
            }

            return style;
        };
    }

    sized.pulsarSize = scale;
    sized.pulsarTitle = titleScale;

    // The title's font is derived from the size and is only rebuilt for a node
    // flagged dirty, so without this the circles resize and the names do not.
    node.fontDirty = true;

    return true;
}

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}
