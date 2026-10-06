import { GraphNode, GraphRenderer, GraphText, GraphTextConstructor } from './graph';

/**
 * Obsidian draws a node's title centred below it, its top edge at
 *
 *     node.y + (size + PADDING) * nodeScale + moveText / scale
 *
 * The age is that mirrored: centred above the node, bottom edge the same
 * distance away. Both constants come from Obsidian's own node render.
 */
const TITLE_PADDING = 5;

/** The age reads as the title's quieter companion, not as a second title. */
const AGE_ALPHA = 0.65;

/** What the plugin shows above a node, and how strongly. */
export interface AgeText {
    text: string;
    /** 0 to 1, so an old note's age fades along with its node. */
    strength: number;
}

export type AgeMode = 'off' | 'hover' | 'titles';

/**
 * Draws a note's age above its node, inside the graph rather than over it.
 *
 * Each label is a child of the node's own title, which is what makes it match:
 * it inherits the title's font, position, zoom scaling and visibility, so it
 * appears and disappears on exactly the same zoom threshold and never has to be
 * kept in step with the canvas by hand.
 */
export class AgeLabels {
    private readonly labels = new Map<GraphNode, GraphText>();
    private mode: AgeMode = 'off';
    private hovered: GraphNode | null = null;
    /**
     * What every name on the graph is scaled by.
     *
     * Obsidian derives a title's font from its node's size and offers no control
     * over either, so the plugin's own control has to reach here too — the age
     * is drawn beside a title at the title's size, and a title that moved
     * without it would leave the age behind.
     */
    private titleScale = 1;

    private buildText: GraphTextConstructor | null = null;

    constructor(
        private readonly renderer: GraphRenderer,
        private readonly describe: (path: string) => AgeText | undefined
    ) {}

    /** Returns true when the scale moved, so the labels can be rebuilt at it. */
    setTitleScale(scale: number): boolean {
        if (this.titleScale === scale) {
            return false;
        }

        this.titleScale = scale;
        return true;
    }

    setMode(mode: AgeMode): void {
        this.mode = mode;
    }

    setHovered(node: GraphNode | null): void {
        this.hovered = node;
    }

    /**
     * Brings the labels in line with the frame just drawn. Nodes render lazily
     * as they near the viewport, and titles appear and vanish with zoom, so
     * which nodes deserve a label is only knowable per frame.
     */
    sync(): void {
        if (this.mode === 'off') {
            this.clear();
            return;
        }

        for (const [node, label] of this.labels) {
            if (!this.wants(node)) {
                detach(node, label);
                this.labels.delete(node);
            }
        }

        if (this.mode === 'hover') {
            if (this.hovered) {
                this.place(this.hovered);
            }

            return;
        }

        for (const node of this.renderer.nodes ?? []) {
            if (this.wants(node)) {
                this.place(node);
            }
        }
    }

    clear(): void {
        for (const [node, label] of this.labels) {
            detach(node, label);
        }

        this.labels.clear();
    }

    destroy(): void {
        this.clear();
        this.hovered = null;
    }

    /**
     * On hover the label follows the one node under the cursor, whose title
     * Obsidian forces visible at any zoom. Otherwise it follows the titles, so
     * the ages arrive exactly when the names do.
     */
    private wants(node: GraphNode): boolean {
        if (this.mode === 'hover') {
            return node === this.hovered;
        }

        return this.mode === 'titles' && node.text?.visible === true;
    }

    private place(node: GraphNode): void {
        const title = node.text;
        const age = this.describe(node.id);

        if (!title || !age) {
            return;
        }

        const label = this.labels.get(node) ?? this.create(node, title, age.text);
        if (!label) {
            return;
        }

        if (label.text !== age.text) {
            label.text = age.text;
        }

        // Hovering dims every unrelated node, and the age should dim with its
        // own node rather than stay lit over a graph that has receded.
        label.alpha = AGE_ALPHA * age.strength;
        label.y = this.offsetWithin(node, title);
    }

    /**
     * How far above the title's own origin the label sits, in the title's local
     * units. Two gaps up: one to climb back to the node, one to mirror it.
     */
    private offsetWithin(node: GraphNode, title: GraphText): number {
        const size = node.getSize?.() ?? 0;
        const nodeScale = this.renderer.nodeScale ?? 1;
        const scale = this.renderer.scale ?? 1;

        const gap = (size + TITLE_PADDING) * nodeScale + (node.moveText ?? 0) / scale;
        const titleScale = title.scale.x || nodeScale;

        return (-2 * gap) / titleScale;
    }

    private create(node: GraphNode, title: GraphText, text: string): GraphText | null {
        const build = this.textConstructor(title);
        if (!build) {
            return null;
        }

        const label = new build(text, {
            fontSize: (14 + (node.getSize?.() ?? 0) / 4) * this.titleScale,
            fill: this.renderer.colors?.text?.rgb ?? 0xffffff,
            fontFamily: title.style.fontFamily,
            align: 'center'
        });

        // Anchored at its bottom edge, so its distance from the node is the
        // gap itself rather than the gap plus however tall the text happens
        // to be.
        label.anchor.set(0.5, 1);
        label.resolution = title.resolution;

        title.addChild(label);
        this.labels.set(node, label);

        return label;
    }

    /**
     * Obsidian bundles its own renderer and exposes no constructor, so the one
     * it built the title with is the only honest way to build a matching label.
     * If that ever stops being usable the ages simply do not appear.
     */
    private textConstructor(title: GraphText): GraphTextConstructor | null {
        this.buildText ??= (title.constructor as GraphTextConstructor | undefined) ?? null;
        return this.buildText;
    }
}

function detach(node: GraphNode, label: GraphText): void {
    node.text?.removeChild(label);
    label.destroy();
}
