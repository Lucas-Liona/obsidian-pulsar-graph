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

/**
 * Moves a range from the old axis, raw opacity clamped to 1, onto the curve.
 *
 * Exact rather than approximate: the old axis is a monotonic function of the
 * new one below 1, and everything at or above 1 sat on its last point, which
 * is the top of the curve. A range keeps selecting the same notes.
 */
export function rangeOntoCurve(range: OpacityRange, minOpacity: number, maxOpacity: number): OpacityRange {
    const span = maxOpacity - minOpacity;
    const move = (value: number): number => {
        if (value >= 1 || span <= 0) {
            return value >= 1 ? 1 : value;
        }

        return Math.min(1, Math.max(0, (value - minOpacity) / span));
    };

    return { from: move(range.from), to: move(range.to) };
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

/**
 * Whether two sets of graph data build the same graph: the same nodes, of the
 * same types and colours, linked the same way.
 *
 * The engine hands over a fresh object every time it renders, whether or not
 * anything changed. Its timelapse does that about nine times a second for as
 * long as the view stays open, so identity says nothing and only the contents
 * can. Key order is ignored; the engine's is stable, but nothing promises it.
 */
export function sameGraphData(a: unknown, b: unknown): boolean {
    if (a === b) {
        return true;
    }

    if (!isGraphData(a) || !isGraphData(b)) {
        return false;
    }

    // numLinks and anything else beside the nodes, all of them plain values.
    if (!sameFields(a, b, 'nodes')) {
        return false;
    }

    const theirs = b.nodes;
    let count = 0;

    for (const id of Object.keys(a.nodes)) {
        count++;

        if (!Object.prototype.hasOwnProperty.call(theirs, id) || !sameFields(a.nodes[id], theirs[id])) {
            return false;
        }
    }

    return count === Object.keys(theirs).length;
}

/** How many nodes a set of graph data holds; zero when it is not graph data. */
export function nodeCount(data: unknown): number {
    return isGraphData(data) ? Object.keys(data.nodes).length : 0;
}

/**
 * Field-by-field equality one level deep, which is as deep as a node goes: a
 * type, a colour of { a, rgb }, and links as { path: true }.
 */
function sameFields(a: unknown, b: unknown, skip?: string): boolean {
    if (a === b) {
        return true;
    }

    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
        return false;
    }

    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);

    if (keys.length !== Object.keys(right).length) {
        return false;
    }

    for (const key of keys) {
        if (key === skip) {
            continue;
        }

        if (!Object.prototype.hasOwnProperty.call(right, key)) {
            return false;
        }

        const mine = left[key];
        const yours = right[key];

        if (mine === yours) {
            continue;
        }

        if (typeof mine !== 'object' || typeof yours !== 'object' || mine === null || yours === null || !sameValues(mine, yours)) {
            return false;
        }
    }

    return true;
}

function sameValues(a: object, b: object): boolean {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = Object.keys(left);

    return keys.length === Object.keys(right).length
        && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && left[key] === right[key]);
}

function isGraphData(data: unknown): data is GraphData {
    return typeof data === 'object' && data !== null && typeof (data as GraphData).nodes === 'object';
}
