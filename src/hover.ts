import { GraphRenderer, Unhook } from './graph';

/** Keeps the label clear of the cursor and of the node under it. */
const CURSOR_OFFSET_PX = 14;

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

    const hover = function (this: GraphRenderer, event: MouseEvent, id: string, type: string): void {
        originalHover?.call(this, event, id, type);
        handlers.onHover(id);
    };

    const unhover = function (this: GraphRenderer): void {
        originalUnhover?.call(this);
        handlers.onUnhover();
    };

    renderer.onNodeHover = hover;
    renderer.onNodeUnhover = unhover;

    return () => {
        if (renderer.onNodeHover === hover) {
            renderer.onNodeHover = originalHover;
        }

        if (renderer.onNodeUnhover === unhover) {
            renderer.onNodeUnhover = originalUnhover;
        }
    };
}

/**
 * A small label that follows the cursor inside one graph view. Obsidian draws
 * the graph to a canvas, so there is no element per node to attach a tooltip
 * to; the renderer's own cursor position is what places this.
 */
export class AgeLabel {
    private element: HTMLElement | null = null;

    constructor(private readonly renderer: GraphRenderer) {}

    show(text: string): void {
        const container = this.renderer.containerEl;
        if (!container) {
            return;
        }

        this.element ??= container.createDiv({ cls: 'pulsar-graph-age' });
        this.element.setText(text);
        this.element.style.left = `${(this.renderer.mouseX ?? 0) + CURSOR_OFFSET_PX}px`;
        this.element.style.top = `${(this.renderer.mouseY ?? 0) + CURSOR_OFFSET_PX}px`;
        this.element.toggleClass('is-visible', true);
    }

    hide(): void {
        this.element?.toggleClass('is-visible', false);
    }

    destroy(): void {
        this.element?.remove();
        this.element = null;
    }
}
