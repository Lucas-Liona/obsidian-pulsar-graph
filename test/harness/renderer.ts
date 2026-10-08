import type { GraphLink, GraphNode, GraphRenderer, GraphText } from '../../src/graph';

/**
 * A graph renderer that behaves like Obsidian's where AGENTS.md says how
 * Obsidian's behaves ("Working with Obsidian's graph"), and nowhere else:
 *
 * - `setData` keeps the node objects, and so the `x`/`y`, of every node that
 *   survives; a new node is placed at the average of the nodes it links to.
 * - `setData` reassigns every node's colour from the data, which is undefined
 *   for a note no group colours. That is the wipe the plugin's hook repairs.
 * - A link is built only when both of its ends exist.
 * - `renderCallback`, `setData`, `onNodeHover` and `onNodeUnhover` belong to
 *   one renderer each, so wrapping one reaches that graph only, and every
 *   assignment to them is tracked, so a test can count the wrappers on each.
 * - A circle's tint and a link's alpha and tint ease a tenth of the gap per
 *   frame, floored, so a channel climbing the last nine units never arrives.
 * - The frame loop stops once the graph has been idle for 60 frames, and
 *   `changed()` wakes it.
 * - `getFillColor` ignores the node's colour while it is hovered, and for a
 *   `focused` node when `fillFocused` has any alpha.
 * - A title is a text object that labels can be parented to; rebuilding the
 *   graphics destroys every title and assigns a fresh render callback.
 *
 * There is no simulation, no viewport culling (every node is rendered) and no
 * zoom threshold for titles beyond a switch.
 */

/** A colour as Obsidian keeps one: alpha, and a packed 0xRRGGBB. */
export interface Rgba {
    a: number;
    rgb: number;
}

/** One node as the engine hands it over. */
export interface NodeData {
    type: string;
    links: Record<string, boolean>;
    color?: Rgba;
}

export interface GraphData {
    nodes: Record<string, NodeData>;
    numLinks: number;
}

/** One step of the renderer's easing: a tenth of the gap, floored. */
export function easeChannel(current: number, target: number): number {
    return current + Math.floor((target - current) * 0.1);
}

export function easeRgb(current: number, target: number): number {
    const at = (shift: number): number => easeChannel((current >> shift) & 0xff, (target >> shift) & 0xff) & 0xff;

    return (at(16) << 16) | (at(8) << 8) | at(0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

/** The engine's data, read defensively, since the plugin's filter is what produced it. */
function nodesOf(data: unknown): Record<string, NodeData> {
    if (!isRecord(data) || !isRecord(data.nodes)) {
        throw new Error('setData was handed something that is not graph data');
    }

    const nodes: Record<string, NodeData> = {};

    for (const [id, raw] of Object.entries(data.nodes)) {
        if (!isRecord(raw)) {
            throw new Error(`Node ${id} is not an object`);
        }

        const links: Record<string, boolean> = {};

        if (isRecord(raw.links)) {
            for (const target of Object.keys(raw.links)) {
                links[target] = true;
            }
        }

        const color = isRecord(raw.color) && typeof raw.color.a === 'number' && typeof raw.color.rgb === 'number'
            ? { a: raw.color.a, rgb: raw.color.rgb }
            : undefined;

        nodes[id] = { type: typeof raw.type === 'string' ? raw.type : '', links, color };
    }

    return nodes;
}

/**
 * A PIXI text object, in the part a title is used for. A label added to its
 * children inherits it; destroying it drops them.
 */
export class FakeText implements GraphText {
    alpha = 1;
    visible = true;
    resolution = 2;
    x = 0;
    y = 0;
    readonly scale = { x: 1, y: 1 };
    readonly style: Record<string, unknown>;
    readonly anchor = {
        x: 0,
        y: 0,
        set: (x: number, y: number): void => {
            this.anchor.x = x;
            this.anchor.y = y;
        }
    };
    children: GraphText[] = [];
    parent: GraphText | null = null;
    destroyed = false;

    constructor(public text: string, style: unknown) {
        this.style = isRecord(style) ? { ...style } : {};
    }

    addChild(child: GraphText): void {
        child.parent?.removeChild(child);
        this.children.push(child);
        child.parent = this;
    }

    removeChild(child: GraphText): void {
        const at = this.children.indexOf(child);

        if (at >= 0) {
            this.children.splice(at, 1);
            child.parent = null;
        }
    }

    destroy(): void {
        this.destroyed = true;
        this.parent?.removeChild(this);

        for (const child of this.children) {
            child.parent = null;
        }

        this.children = [];
    }
}

export interface FakeCircle {
    tint: number;
    alpha: number;
    visible: boolean;
    destroyed: boolean;
}

export interface FakeLine {
    alpha: number;
    tint: number;
    visible: boolean;
}

export interface FakeLink extends GraphLink {
    source: FakeNode;
    target: FakeNode;
    rendered: boolean;
    line: FakeLine | null;
}

export class FakeNode implements GraphNode {
    type = '';
    color: Rgba | undefined = undefined;
    x = 0;
    y = 0;
    rendered = true;
    moveText = 0;
    fontDirty = false;
    forward: Record<string, FakeLink> = {};
    reverse: Record<string, FakeLink> = {};
    text: FakeText | null = null;
    circle: FakeCircle | null = null;

    constructor(readonly renderer: FakeRenderer, readonly id: string) {}

    /** Obsidian's: grows with how many links a node has and nothing else. */
    getSize(): number {
        const weight = Object.keys(this.forward).length + Object.keys(this.reverse).length;

        return this.renderer.fNodeSizeMult * Math.min(30, Math.max(8, 3 * Math.sqrt(weight + 1)));
    }

    getTextStyle(): { fontSize: number; fill: number } {
        return { fontSize: 14 + this.getSize() / 4, fill: this.renderer.colors.text.rgb };
    }

    /** What the circle is drawn toward this frame. */
    getFillColor(): Rgba {
        const colors = this.renderer.colors;

        if (this.renderer.getHighlightNode() === this) {
            return colors.fillHighlight;
        }

        if (this.type === 'focused' && colors.fillFocused.a > 0) {
            return colors.fillFocused;
        }

        if (this.color) {
            return this.color;
        }

        return this.type === 'unresolved' ? colors.fillUnresolved : colors.fill;
    }
}

/**
 * One of the four instance properties hooks are put on, with every function
 * assigned to it remembered in order.
 *
 * A function never seen before wraps whatever was on top; assigning one that
 * is already in the chain puts it back on top, which is what releasing a hook
 * that is still on top does. A rebuild of the graphics replaces the base and
 * drops everything that wrapped the old one.
 */
export class HookSlot<F> {
    private chain: F[];
    /** Every assignment, for telling a release that unlinked from one that could not. */
    assignments = 0;

    constructor(base: F) {
        this.chain = [base];
    }

    get current(): F {
        return this.chain[this.chain.length - 1];
    }

    assign(fn: F): void {
        this.assignments++;
        const at = this.chain.indexOf(fn);

        if (at >= 0) {
            this.chain.length = at + 1;
        } else {
            this.chain.push(fn);
        }
    }

    replaceBase(base: F): void {
        this.chain = [base];
    }

    /** How many functions are wrapped around the renderer's own. */
    get wrappers(): number {
        return this.chain.length - 1;
    }
}

export type HookName = 'renderCallback' | 'setData' | 'onNodeHover' | 'onNodeUnhover';

/** How long a renderer goes on drawing after the last change. */
const IDLE_FRAMES = 60;

export class FakeRenderer implements GraphRenderer {
    nodeLookup: Record<string, FakeNode> = {};
    nodes: FakeNode[] = [];
    links: FakeLink[] = [];
    scale = 1;
    nodeScale = 1;
    fNodeSizeMult = 1;
    width = 800;
    height = 600;
    mouseX: number | null = null;
    mouseY: number | null = null;
    readonly colors = {
        fill: { a: 1, rgb: 0x888888 },
        fillHighlight: { a: 1, rgb: 0x7f6df2 },
        fillFocused: { a: 1, rgb: 0xdadada },
        fillUnresolved: { a: 0.6, rgb: 0x666666 },
        text: { a: 1, rgb: 0xdadada },
        line: { a: 1, rgb: 0x3f3f3f },
        lineHighlight: { a: 1, rgb: 0x7f6df2 }
    };

    /** Whether titles are drawn at this zoom. */
    titlesVisible = true;
    /** Every `setData` that reached the renderer itself, by how many nodes it was handed. */
    readonly built: number[] = [];
    /** Frames actually drawn, and wake-ups asked for. */
    drawn = 0;
    changes = 0;
    /** What the view's own hover handlers were told, as its page preview would be. */
    readonly previews: string[] = [];

    private idleFrames = 0;
    private queued = false;
    private hovered: FakeNode | null = null;
    private graphics = true;
    private placed = 0;

    private readonly slots: {
        renderCallback: HookSlot<() => void>;
        setData: HookSlot<(data: unknown) => unknown>;
        onNodeHover: HookSlot<(event: unknown, id: string, type: string) => void>;
        onNodeUnhover: HookSlot<() => void>;
    };

    constructor() {
        this.slots = {
            renderCallback: new HookSlot(() => this.draw()),
            setData: new HookSlot((data: unknown): unknown => {
                this.build(data);
                return undefined;
            }),
            onNodeHover: new HookSlot((_event: unknown, id: string) => {
                this.previews.push(id);
            }),
            onNodeUnhover: new HookSlot(() => {
                this.previews.push('-');
            })
        };
    }

    get renderCallback(): () => void {
        return this.slots.renderCallback.current;
    }

    set renderCallback(fn: () => void) {
        this.slots.renderCallback.assign(fn);
    }

    get setData(): (data: unknown) => unknown {
        return this.slots.setData.current;
    }

    set setData(fn: (data: unknown) => unknown) {
        this.slots.setData.assign(fn);
    }

    get onNodeHover(): (event: unknown, id: string, type: string) => void {
        return this.slots.onNodeHover.current;
    }

    set onNodeHover(fn: (event: unknown, id: string, type: string) => void) {
        this.slots.onNodeHover.assign(fn);
    }

    get onNodeUnhover(): () => void {
        return this.slots.onNodeUnhover.current;
    }

    set onNodeUnhover(fn: () => void) {
        this.slots.onNodeUnhover.assign(fn);
    }

    /** How many wrappers sit on one of the hooked properties. */
    wrappers(name: HookName): number {
        return this.slots[name].wrappers;
    }

    getHighlightNode(): FakeNode | null {
        return this.hovered;
    }

    changed(): void {
        this.changes++;
        this.idleFrames = 0;
        this.queued = true;
    }

    /**
     * One turn of the frame loop: the render callback is called if a frame is
     * queued, and the renderer's own queues the next unless it has gone idle.
     * Returns whether anything was called.
     */
    frame(): boolean {
        if (!this.queued) {
            return false;
        }

        this.queued = false;
        this.renderCallback.call(this);

        return true;
    }

    /** Runs the loop for up to `count` frames, or until it stops. */
    frames(count: number): number {
        let ran = 0;

        while (ran < count && this.frame()) {
            ran++;
        }

        return ran;
    }

    hover(id: string): void {
        const node = this.nodeLookup[id];

        if (!node) {
            throw new Error(`No node ${id} to hover`);
        }

        this.hovered = node;
        this.onNodeHover.call(this, {}, id, 'file');
        this.changed();
    }

    unhover(): void {
        this.hovered = null;
        this.onNodeUnhover.call(this);
        this.changed();
    }

    /** What Obsidian does when a graph is hidden and shown again, or the theme changes. */
    rebuildGraphics(): void {
        this.destroyGraphics();
        this.initGraphics();
    }

    destroyGraphics(): void {
        this.graphics = false;

        for (const node of this.nodes) {
            node.text?.destroy();
            node.text = null;

            if (node.circle) {
                node.circle.destroyed = true;
                node.circle = null;
            }
        }

        for (const link of this.links) {
            link.line = null;
        }
    }

    initGraphics(): void {
        this.graphics = true;

        for (const node of this.nodes) {
            this.drawNode(node);
        }

        for (const link of this.links) {
            link.line = this.newLine();
        }

        this.slots.renderCallback.replaceBase(() => this.draw());
        this.changed();
    }

    /** Every path drawn, sorted, for comparing against a list. */
    ids(): string[] {
        return Object.keys(this.nodeLookup).sort();
    }

    node(id: string): FakeNode {
        const node = this.nodeLookup[id];

        if (!node) {
            throw new Error(`${id} is not in the graph; it holds ${this.ids().join(', ')}`);
        }

        return node;
    }

    /** The renderer's own frame. */
    private draw(): void {
        if (this.idleFrames > IDLE_FRAMES) {
            return;
        }

        this.idleFrames++;
        this.drawn++;

        for (const node of this.nodes) {
            if (node.circle) {
                const fill = node.getFillColor();
                node.circle.tint = easeRgb(node.circle.tint, fill.rgb);
                node.circle.alpha = Math.min(1, Math.max(0, fill.a));
            }

            if (node.text) {
                node.text.visible = this.titlesVisible;
            }
        }

        const highlight = this.hovered;

        for (const link of this.links) {
            if (!link.line) {
                continue;
            }

            const attached = highlight !== null && (link.source === highlight || link.target === highlight);
            const color = attached ? this.colors.lineHighlight : this.colors.line;
            const target = highlight !== null && !attached ? 0.2 * color.a : color.a;

            link.line.alpha += (target - link.line.alpha) * 0.1;
            link.line.tint = easeRgb(link.line.tint, attached ? this.colors.lineHighlight.rgb : this.colors.line.rgb);
        }

        this.queued = true;
    }

    /** The renderer's own setData. */
    private build(data: unknown): void {
        const wanted = nodesOf(data);
        const ids = Object.keys(wanted);
        this.built.push(ids.length);

        for (const id of Object.keys(this.nodeLookup)) {
            if (!Object.prototype.hasOwnProperty.call(wanted, id)) {
                this.removeNode(id);
            }
        }

        const fresh: FakeNode[] = [];

        for (const id of ids) {
            let node = this.nodeLookup[id];

            if (!node) {
                node = new FakeNode(this, id);
                this.nodeLookup[id] = node;
                this.nodes.push(node);
                fresh.push(node);
            }

            node.type = wanted[id].type;
            // Reassigned whether or not a group colours it: the wipe.
            node.color = wanted[id].color;
        }

        for (const link of this.links) {
            link.line = null;
        }

        this.links = [];

        for (const node of this.nodes) {
            node.forward = {};
            node.reverse = {};
        }

        for (const id of ids) {
            for (const targetId of Object.keys(wanted[id].links)) {
                const source = this.nodeLookup[id];
                const target = this.nodeLookup[targetId];

                if (!source || !target || source === target) {
                    continue;
                }

                const link: FakeLink = { source, target, rendered: true, line: this.graphics ? this.newLine() : null };
                source.forward[targetId] = link;
                target.reverse[id] = link;
                this.links.push(link);
            }
        }

        for (const node of fresh) {
            this.place(node, fresh);

            if (this.graphics) {
                this.drawNode(node);
            }
        }

        this.changed();
    }

    /** At the average of the nodes it links to that were already there. */
    private place(node: FakeNode, fresh: FakeNode[]): void {
        const related = [...Object.values(node.forward).map((link) => link.target), ...Object.values(node.reverse).map((link) => link.source)]
            .filter((other) => !fresh.includes(other));

        if (related.length > 0) {
            node.x = related.reduce((sum, other) => sum + other.x, 0) / related.length;
            node.y = related.reduce((sum, other) => sum + other.y, 0) / related.length;
            return;
        }

        // Anywhere, as long as it is somewhere new and repeatable.
        this.placed++;
        node.x = 40 * this.placed;
        node.y = -25 * this.placed;
    }

    private removeNode(id: string): void {
        const node = this.nodeLookup[id];
        node.text?.destroy();

        if (node.circle) {
            node.circle.destroyed = true;
        }

        if (this.hovered === node) {
            this.hovered = null;
        }

        delete this.nodeLookup[id];
        this.nodes.splice(this.nodes.indexOf(node), 1);
    }

    private drawNode(node: FakeNode): void {
        node.circle = { tint: node.getFillColor().rgb, alpha: 1, visible: true, destroyed: false };
        node.text = new FakeText(id(node), { fontFamily: 'sans-serif', fontSize: 14 + node.getSize() / 4 });
        node.text.visible = this.titlesVisible;
    }

    private newLine(): FakeLine {
        return { alpha: this.colors.line.a, tint: this.colors.line.rgb, visible: true };
    }
}

/** What a title says: the file name without its folder or extension. */
function id(node: FakeNode): string {
    return node.id.split('/').pop()?.replace(/\.md$/, '') ?? node.id;
}
