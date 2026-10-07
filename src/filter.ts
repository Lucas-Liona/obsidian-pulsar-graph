/** A stretch of the brightness range that survives the filter. */
export interface OpacityRange {
    from: number;
    to: number;
}

/** The whole range, which is what a filter that hides nothing looks like. */
export const WHOLE_RANGE: OpacityRange = { from: 0, to: 1 };

/** What the graph data the renderer is handed looks like, in the part we touch. */
export interface GraphData {
    nodes: Record<string, unknown>;
}

export interface FilterOptions {
    ranges: OpacityRange[];
    /** A note's own brightness, before neighbours or groups have their say. */
    strengthOf: (path: string) => number | undefined;
    /**
     * Never hidden. The note you have open, so a local graph cannot go blank
     * under you, and the spotlit note, because a filter quietly removing the
     * one node the graph is pointing at is the graph disagreeing with itself.
     */
    keep: ReadonlySet<string>;
    /**
     * How many notes this pass took out, reported because this is the only
     * place that knows. The nodes are gone before the renderer sees them, so
     * afterwards nothing can tell a panel of nine from a panel of thirteen with
     * four hidden.
     */
    counted?: (dropped: number) => void;
}

export function isWholeRange(ranges: OpacityRange[]): boolean {
    return ranges.length === 1 && ranges[0].from <= 0 && ranges[0].to >= 1;
}

export function withinRanges(value: number, ranges: OpacityRange[]): boolean {
    return ranges.some((range) => value >= range.from && value <= range.to);
}

/**
 * Drops the notes a filter excludes before the renderer ever sees them.
 *
 * Opacity 0 does not hide a node: its title still draws, its links still draw,
 * and it still pushes its neighbours around in the simulation. Removing it from
 * the data is the only thing that actually takes it out of the graph, and it is
 * safe to do — the renderer only builds a link when both ends exist, and it
 * leaves the positions of surviving nodes alone, so the map does not jump.
 *
 * Nodes with no modification time, meaning attachments and unresolved links, are
 * never filtered. The question being asked is about the age of notes, and those
 * have no age to answer with.
 *
 * The brightness read here is a note's own, not the one it ends up drawn at.
 * Whether a note is old should not depend on whether something next to it is
 * new, and reading the pooled value would be circular anyway: pooling is
 * computed from the adjacency that this filter decides.
 */
export function filterGraphData(data: unknown, options: FilterOptions): unknown {
    if (isWholeRange(options.ranges) || !isGraphData(data)) {
        options.counted?.(0);
        return data;
    }

    const kept: Record<string, unknown> = {};
    let dropped = 0;

    for (const [path, node] of Object.entries(data.nodes)) {
        const strength = options.strengthOf(path);

        if (strength === undefined || options.keep.has(path) || withinRanges(Math.min(1, Math.max(0, strength)), options.ranges)) {
            kept[path] = node;
        } else {
            dropped++;
        }
    }

    options.counted?.(dropped);

    return { ...data, nodes: kept };
}

function isGraphData(data: unknown): data is GraphData {
    return typeof data === 'object' && data !== null && typeof (data as GraphData).nodes === 'object';
}
