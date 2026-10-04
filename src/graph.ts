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
    /** Theme colours the renderer reads from CSS. */
    colors?: {
        fill?: { rgb: number };
    };
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

/** Writes each node's cached opacity into the colour the renderer draws with. */
export function applyOpacity(renderer: GraphRenderer, store: OpacityStore): void {
    const fallbackRgb = renderer.colors?.fill?.rgb ?? FALLBACK_COLOR_RGB;

    for (const [path, node] of Object.entries(renderer.nodeLookup)) {
        const mtime = store.mtimeFor(path);
        if (mtime === undefined) {
            continue;
        }

        const opacity = store.opacityFor(path) ?? store.cacheOpacityFor(path, mtime);

        node.color = {
            a: opacity,
            rgb: node.color?.rgb ?? fallbackRgb
        };
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
