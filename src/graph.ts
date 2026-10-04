import { App } from 'obsidian';
import { OpacityStore } from './opacity-store';

/** Fallback for nodes with no group colour of their own. */
const DEFAULT_COLOR_RGB = 0xFFFFFF;

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
    renderCallback?: () => void;
}

interface GraphView {
    renderer?: GraphRenderer;
}

export function countGraphLeaves(app: App): number {
    return GRAPH_VIEW_TYPES.reduce(
        (total, viewType) => total + app.workspace.getLeavesOfType(viewType).length,
        0
    );
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
export function applyOpacity(nodeLookup: GraphNodeLookup, store: OpacityStore): void {
    for (const [path, node] of Object.entries(nodeLookup)) {
        const mtime = store.mtimeFor(path);
        if (mtime === undefined) {
            continue;
        }

        const opacity = store.opacityFor(path);
        if (opacity === undefined) {
            // Not seen before; graded from the next pass onwards.
            store.cacheOpacityFor(path, mtime);
            continue;
        }

        node.color = {
            a: opacity,
            rgb: node.color?.rgb ?? DEFAULT_COLOR_RGB
        };
    }
}
