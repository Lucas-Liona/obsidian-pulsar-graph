import { GraphRenderer, Unhook } from './graph';

export interface HoverHandlers {
    onHover: (path: string) => void;
    onUnhover: () => void;
}

/**
 * Calls back when the cursor enters or leaves a node.
 *
 * `onNodeHover` and `onNodeUnhover` are plain properties on each renderer,
 * assigned by the graph view to drive its own page-preview popover, so these
 * wrappers are per renderer rather than a patch on anything shared. The
 * originals are always called first, leaving the popover working.
 */
export function hookNodeHover(renderer: GraphRenderer, handlers: HoverHandlers): Unhook {
    const originalHover = renderer.onNodeHover;
    const originalUnhover = renderer.onNodeUnhover;

    // Off once released, for the same reason as the frame hook: a wrapper
    // something else has wrapped since cannot be taken out, only silenced.
    let live = true;

    const hover = function (this: GraphRenderer, event: MouseEvent, id: string, type: string): void {
        originalHover?.call(this, event, id, type);

        if (live) {
            handlers.onHover(id);
        }
    };

    const unhover = function (this: GraphRenderer): void {
        originalUnhover?.call(this);

        if (live) {
            handlers.onUnhover();
        }
    };

    renderer.onNodeHover = hover;
    renderer.onNodeUnhover = unhover;

    return () => {
        live = false;

        if (renderer.onNodeHover === hover) {
            renderer.onNodeHover = originalHover;
        }

        if (renderer.onNodeUnhover === unhover) {
            renderer.onNodeUnhover = originalUnhover;
        }
    };
}
