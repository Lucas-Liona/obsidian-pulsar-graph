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
export interface GraphNode {
    color?: {
        a: number;
        rgb: number;
    };
}

export interface GraphNodeLookup {
    [path: string]: GraphNode;
}

export interface GraphRenderer {
    nodeLookup: GraphNodeLookup;
    /** The element the graph canvas is drawn into. */
    containerEl?: HTMLElement;
    /** Cursor position within that element, or null when it is outside. */
    mouseX?: number | null;
    mouseY?: number | null;
    /** Theme colours the renderer reads from CSS. */
    colors?: {
        fill?: { rgb: number };
        /** What Obsidian tints a node with while the cursor is on it. */
        fillHighlight?: { rgb: number };
    };
    /** Assigned by the graph view; see hookNodeHover. */
    onNodeHover?: ((event: MouseEvent, id: string, type: string) => void) | null;
    onNodeUnhover?: (() => void) | null;
    /** Rebuilds nodes and links, resetting every node colour on the way. */
    setData?: (data: unknown) => unknown;
    /** Wakes the render loop and queues a frame. */
    changed?: () => void;
}

interface GraphView {
    renderer?: GraphRenderer;
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

export interface OpacityOptions {
    /** Tints the single most recently modified note with the theme's accent. */
    spotlightNewest: boolean;
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
}

/** Writes each node's cached opacity into the colour the renderer draws with. */
export function applyOpacity(renderer: GraphRenderer, store: OpacityStore, options: OpacityOptions): void {
    const fallbackRgb = renderer.colors?.fill?.rgb ?? FALLBACK_COLOR_RGB;
    const spotlightRgb = renderer.colors?.fillHighlight?.rgb;
    const spotlitPath = options.spotlightNewest && spotlightRgb !== undefined ? store.newestPath() : undefined;

    releaseSpotlight(renderer, options.spotlight, spotlitPath);

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const mtime = store.mtimeFor(path);
        if (mtime === undefined) {
            continue;
        }

        const opacity = store.opacityFor(path) ?? store.cacheOpacityFor(path, mtime);
        const currentRgb = node.color?.rgb ?? fallbackRgb;

        if (path === spotlitPath && spotlightRgb !== undefined) {
            options.spotlight.path ??= path;
            options.spotlight.originalRgb ??= currentRgb;

            node.color = { a: opacity, rgb: spotlightRgb };
            continue;
        }

        node.color = { a: opacity, rgb: currentRgb };
    }
}

/** Puts back the colour the spotlight painted over, once it moves elsewhere. */
function releaseSpotlight(renderer: GraphRenderer, spotlight: SpotlightState, nextPath: string | undefined): void {
    if (spotlight.path === undefined || spotlight.path === nextPath) {
        return;
    }

    const node = renderer.nodeLookup[spotlight.path];
    if (node?.color && spotlight.originalRgb !== undefined) {
        node.color = { a: node.color.a, rgb: spotlight.originalRgb };
    }

    spotlight.path = undefined;
    spotlight.originalRgb = undefined;
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
export function hookRendererData(renderer: GraphRenderer, onData: () => void): Unhook | null {
    const original = renderer.setData;
    if (typeof original !== 'function') {
        return null;
    }

    const patched = function (this: GraphRenderer, data: unknown): unknown {
        const result = original.call(this, data);
        onData();
        return result;
    };

    renderer.setData = patched;

    return () => {
        if (renderer.setData === patched) {
            renderer.setData = original;
        }
    };
}
