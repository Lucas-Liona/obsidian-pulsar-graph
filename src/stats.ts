import { formatAge } from './age';
import { GraphRenderer } from './graph';
import { Coverage } from './history';
import { OpacityStore } from './opacity-store';
import { PulsarGraphSettings } from './settings';
import { joinStats } from './stats-text';

/**
 * How many columns the brightness spread is counted into by default.
 *
 * Fifths read as a shape but are useless to aim at. The range bar asks for far
 * more than this — one column every few pixels of its own width — because a
 * handle that can sit anywhere inside a column without the picture under it
 * changing is a handle with nothing to aim at.
 */
const BANDS = 20;

export interface Stat {
    label: string;
    value: string;
}

export interface VaultStats {
    /** How many notes land in each fifth of the brightness range. */
    spread: number[];
    rows: Stat[];
}

/**
 * What the current settings are actually doing to this vault.
 *
 * Every design decision in this plugin was settled by measuring rather than by
 * arguing, and the measurements turned out to say more about the vault than
 * about the plugin: which folders are alive, whether a history has a long tail,
 * whether notes were written in bursts. There is no reason to keep that to
 * whoever happens to be holding a debugger.
 */
export function describeVault(
    store: OpacityStore,
    settings: PulsarGraphSettings,
    renderer: GraphRenderer | null,
    strengthOf: (path: string) => number | undefined,
    history: Coverage | null,
    bands: number = BANDS
): VaultStats {
    const columns = Math.max(1, Math.floor(bands));
    const spread = new Array<number>(columns).fill(0);
    const levels = new Set<string>();

    let graded = 0;
    let full = 0;
    let oldest = Number.POSITIVE_INFINITY;
    let newest = 0;

    for (const [path, mtime] of store.entries()) {
        const opacity = Math.min(1, Math.max(0, strengthOf(path) ?? 0));

        graded++;
        spread[Math.min(columns - 1, Math.floor(opacity * columns))]++;
        levels.add(opacity.toFixed(2));

        if (opacity >= 0.99) {
            full++;
        }

        oldest = Math.min(oldest, mtime);
        newest = Math.max(newest, mtime);
    }

    const now = Date.now();
    const rows: Stat[] = [
        { label: 'Notes graded', value: String(graded) },
        { label: 'Oldest', value: graded === 0 ? '—' : formatAge(oldest, now) },
        { label: 'Newest', value: graded === 0 ? '—' : formatAge(newest, now) },
        { label: 'Distinct brightnesses', value: String(levels.size) },
        { label: 'At full brightness', value: `${full} of ${graded}` }
    ];

    rows.push(...describeFolders(store));

    if (history) {
        rows.push(describeHistory(history, now));
    }

    if (renderer) {
        rows.push(...describeGraph(store, settings, renderer));
    }

    return { spread, rows };
}

/**
 * How much history has accumulated. Worth showing plainly, because this is the
 * one feature whose whole value is that it has been running a while: someone
 * who cannot see it filling has no way to tell it apart from doing nothing.
 */
function describeHistory(history: Coverage, now: number): Stat {
    if (history.beads === 0 || history.oldest === undefined) {
        return { label: 'Edit history', value: 'nothing recorded yet' };
    }

    const span = formatAge(history.oldest, now);

    return {
        label: 'Edit history',
        value: joinStats(`${history.beads} sittings across ${history.notes} notes`, `since ${span}`)
    };
}

/**
 * The spread of folder sizes, which is what decides whether grouping by folder
 * can say anything. One folder holding everything cannot.
 */
function describeFolders(store: OpacityStore): Stat[] {
    const sizes = new Map<string, number>();

    for (const [path] of store.entries()) {
        const cut = path.lastIndexOf('/');
        const folder = cut < 0 ? '' : path.slice(0, cut);

        sizes.set(folder, (sizes.get(folder) ?? 0) + 1);
    }

    const largest = Math.max(0, ...sizes.values());

    return [{ label: 'Folders', value: sizes.size === 0 ? '—' : joinStats(`${sizes.size}`, `largest holds ${largest}`) }];
}

/**
 * What the open graph is showing. Islands and trails are properties of the
 * drawn graph rather than of the vault, so they are only knowable here.
 */
function describeGraph(store: OpacityStore, settings: PulsarGraphSettings, renderer: GraphRenderer): Stat[] {
    const nodes = Object.keys(renderer.nodeLookup);
    const islands = measureIslands(renderer, nodes);

    const links = renderer.links ?? [];
    const gap = settings.sessionGapMinutes * 60 * 1000;

    let together = 0;

    for (const link of links) {
        const source = link.source?.id === undefined ? undefined : store.mtimeFor(link.source.id);
        const target = link.target?.id === undefined ? undefined : store.mtimeFor(link.target.id);

        if (source !== undefined && target !== undefined && Math.abs(source - target) <= gap) {
            together++;
        }
    }

    return [
        { label: 'In the open graph', value: joinStats(`${nodes.length} nodes`, `${links.length} links`) },
        { label: 'Islands of linked notes', value: joinStats(`${islands.count}`, `largest holds ${islands.largest}`) },
        { label: `Written together, within ${settings.sessionGapMinutes}m`, value: `${together} of ${links.length} links` }
    ];
}

function measureIslands(renderer: GraphRenderer, nodes: string[]): { count: number; largest: number } {
    const seen = new Set<string>();
    let count = 0;
    let largest = 0;

    for (const start of nodes) {
        if (seen.has(start)) {
            continue;
        }

        let size = 0;
        const pending = [start];
        seen.add(start);

        while (pending.length > 0) {
            const path = pending.pop();
            if (path === undefined) {
                break;
            }

            size++;

            const node = renderer.nodeLookup[path];
            if (!node) {
                continue;
            }

            for (const id in node.forward) {
                if (!seen.has(id) && renderer.nodeLookup[id]) {
                    seen.add(id);
                    pending.push(id);
                }
            }

            for (const id in node.reverse) {
                if (!seen.has(id) && renderer.nodeLookup[id]) {
                    seen.add(id);
                    pending.push(id);
                }
            }
        }

        count++;
        largest = Math.max(largest, size);
    }

    return { count, largest };
}
