import { App } from 'obsidian';
import { OpacityStore } from './opacity-store';

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
    resolution: number;
    y: number;
    scale: { x: number; y: number };
    style: { fontFamily?: unknown };
    anchor: { set: (x: number, y: number) => void };
    children: GraphText[];
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
    /** The displayed adjacency, keyed by the id at the other end. */
    forward?: Record<string, unknown>;
    reverse?: Record<string, unknown>;
    text?: GraphText | null;
    circle?: { tint: number; visible: boolean } | null;
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
}

interface GraphView {
    renderer?: GraphRenderer;
    containerEl?: HTMLElement;
    /** The global graph calls it dataEngine; the local graph calls it engine. */
    dataEngine?: GraphEngine;
    engine?: GraphEngine;
}

/**
 * Asks each open graph to rebuild its data from the vault.
 *
 * Only needed to prime a graph that was already open when the plugin attached,
 * since nothing has handed it any data to keep since. Every rebuild after that
 * is served from what was kept.
 */
export function rebuildGraphData(app: App): void {
    for (const viewType of GRAPH_VIEW_TYPES) {
        for (const leaf of app.workspace.getLeavesOfType(viewType)) {
            const view = leaf.view as GraphView;
            const engine = view.dataEngine ?? view.engine;

            engine?.render?.();
        }
    }
}

export function getGraphRenderers(app: App): GraphRenderer[] {
    const renderers: GraphRenderer[] = [];

    for (const viewType of GRAPH_VIEW_TYPES) {
        for (const leaf of app.workspace.getLeavesOfType(viewType)) {
            const renderer = (leaf.view as GraphView).renderer;
            if (renderer?.nodeLookup) {
                renderers.push(renderer);
            }
        }
    }

    return renderers;
}

/** The element a graph view draws its own controls into, if it has one. */
export function controlsFor(app: App, renderer: GraphRenderer): HTMLElement | null {
    for (const viewType of GRAPH_VIEW_TYPES) {
        for (const leaf of app.workspace.getLeavesOfType(viewType)) {
            const view = leaf.view as GraphView;

            if (view.renderer === renderer) {
                return view.containerEl?.querySelector('.graph-controls') ?? null;
            }
        }
    }

    return null;
}

export interface OpacityOptions {
    /** Picks the single most recently modified note out of the graph. */
    spotlightNewest: boolean;
    /** The colour to paint it, as a packed 0xRRGGBB. */
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
    /**
     * The node the spotlight is currently painted over, and the colour it had
     * before. Node colour is the only place a graph group's colour lives, so
     * the spotlight has to be able to put it back when the newest note changes
     * or the setting is turned off.
     */
    spotlight: SpotlightState;
}

export interface SpotlightState {
    path?: string;
    originalRgb?: number;
    /** What the spotlight settled on, so a frame can hold the tint there. */
    paintedRgb?: number;
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
    const spotlitPath = options.spotlightNewest ? store.newestPath() : undefined;

    releaseSpotlight(renderer, options.spotlight, spotlitPath);

    const own = new Map<string, number>();

    for (const path of Object.keys(renderer.nodeLookup)) {
        const mtime = store.mtimeFor(path);

        if (mtime !== undefined) {
            own.set(path, store.opacityFor(path) ?? store.cacheOpacityFor(path, mtime));
        }
    }

    // The glow runs first. It carries brightness along links, and grouping by
    // island draws its boundaries along those same links, so warming first
    // would hand every node neighbours identical to itself and leave the glow
    // with nothing to lift. Spreading locally and then taking the regional view
    // keeps both settings meaning something together.
    const glowed = options.neighbourBleed > 0
        ? poolNeighbours(renderer, own, options.neighbourBleed, options.neighbourHops)
        : null;

    const pooled = options.clusterWarmth > 0
        ? warmByGroup(renderer, glowed ?? own, options.clusterWarmth, options.clusterBy)
        : glowed;

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const opacity = (pooled ?? own).get(path);
        if (opacity === undefined) {
            continue;
        }

        const currentRgb = node.color?.rgb ?? fallbackRgb;

        if (path === spotlitPath) {
            options.spotlight.path ??= path;
            options.spotlight.originalRgb ??= currentRgb;

            const painted = blendRgb(options.spotlight.originalRgb, options.spotlightRgb, options.spotlightStrength);
            options.spotlight.paintedRgb = painted;

            node.color = { a: opacity, rgb: painted };
            continue;
        }

        node.color = { a: opacity, rgb: currentRgb };
    }

    holdSpotlightTint(renderer, options.spotlight);

    return pooled;
}

/**
 * Pins the spotlit node's drawn tint to the colour it was given.
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
export function holdSpotlightTint(renderer: GraphRenderer, spotlight: SpotlightState): void {
    const { path, paintedRgb } = spotlight;
    if (path === undefined || paintedRgb === undefined) {
        return;
    }

    const node = renderer.nodeLookup[path];
    if (!node?.circle || renderer.getHighlightNode?.() === node) {
        return;
    }

    node.circle.tint = paintedRgb;
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

/** Puts back the colour the spotlight painted over, once it moves elsewhere. */
function releaseSpotlight(renderer: GraphRenderer, spotlight: SpotlightState, nextPath: string | undefined): void {
    if (spotlight.path === undefined || spotlight.path === nextPath) {
        return;
    }

    clearSpotlight(renderer, spotlight);
}

/**
 * Hands the spotlit node its own colour back, tint included.
 *
 * Unloading without this would leave the node painted, and the next load would
 * read that paint as the colour to preserve, losing the real one for good.
 */
export function clearSpotlight(renderer: GraphRenderer, spotlight: SpotlightState): void {
    const { path, originalRgb } = spotlight;

    if (path !== undefined && originalRgb !== undefined) {
        const node = renderer.nodeLookup[path];

        if (node?.color) {
            node.color = { a: node.color.a, rgb: originalRgb };
        }

        if (node?.circle) {
            node.circle.tint = originalRgb;
        }
    }

    spotlight.path = undefined;
    spotlight.originalRgb = undefined;
    spotlight.paintedRgb = undefined;
}

/**
 * Forgets the colour the spotlight is preserving, without disturbing the node.
 *
 * Called when Obsidian has just rewritten every node's colour from group data,
 * which makes what is on the node authoritative again and anything remembered
 * from before it stale.
 */
export function forgetSpotlightColor(spotlight: SpotlightState): void {
    spotlight.originalRgb = undefined;
    spotlight.paintedRgb = undefined;
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

    const patched = function (this: GraphRenderer, data: unknown): unknown {
        supplied = data;

        const result = original.call(this, transform(data));
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
 */
export function hookRendererFrame(renderer: GraphRenderer, onFrame: () => void): FrameHook | null {
    const original = renderer.renderCallback;
    if (typeof original !== 'function') {
        return null;
    }

    const patched = function (this: GraphRenderer): void {
        original.call(this);
        onFrame();
    };

    renderer.renderCallback = patched;

    return {
        isInstalled: () => renderer.renderCallback === patched,
        release: () => {
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
 */
export function previewFilter(
    renderer: GraphRenderer,
    keeps: (path: string) => boolean
): void {
    const hidden = new Set<string>();

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        if (keeps(path)) {
            continue;
        }

        hidden.add(path);

        if (node.circle) {
            node.circle.visible = false;
        }

        if (node.text) {
            node.text.visible = false;
        }
    }

    for (const link of renderer.links ?? []) {
        const source = link.source?.id;
        const target = link.target?.id;

        if (link.line && ((source !== undefined && hidden.has(source)) || (target !== undefined && hidden.has(target)))) {
            link.line.visible = false;
        }
    }
}
