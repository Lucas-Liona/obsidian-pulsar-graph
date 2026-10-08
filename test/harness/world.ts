import { TFile, type App } from 'obsidian';
import { FakeEvents } from './events';
import { FakeRenderer, HookSlot, type GraphData, type NodeData } from './renderer';

/**
 * A fake Obsidian app: a vault of notes with timestamps and links, a workspace
 * of leaves, the view registry graphs are built through, and graph views whose
 * engines hand their renderer data the way Obsidian's do.
 *
 * Driven from the test, synchronously: every method that changes something
 * fires the events Obsidian would and returns; nothing settles on its own. A
 * test awaits `settle()` or `wait(ms)` from ./plugin when it wants what the
 * plugin queued to run.
 *
 * Choices Obsidian's own behaviour does not settle, made here and written down:
 * - Focusing a different leaf fires `active-leaf-change` before `file-open`.
 * - A graph's engine renders when the graph opens and when a test asks it to
 *   (`renderGraphs`, `replayTo`, `showNote`), not on its own after vault events.
 * - The config folder is called `config`, which also catches anything that
 *   assumes `.obsidian`.
 */

/** A note as a test describes it. Times are epoch milliseconds. */
export interface NoteSpec {
    path: string;
    mtime: number;
    /** Defaults to the modification time. */
    ctime?: number;
    size?: number;
    /** Paths this note links to, resolved. */
    links?: string[];
}

/** A colour group from the graph's settings: every note under a path prefix. */
export interface ColourGroup {
    prefix: string;
    rgb: number;
}

export interface WorldOptions {
    notes: NoteSpec[];
    groups?: ColourGroup[];
    /** False to start before the layout is ready, as Obsidian is when plugins load. */
    layoutReady?: boolean;
}

/** A file adapter over a map. Writes can be held, to stand in for a slow disk. */
export class FakeAdapter {
    readonly files = new Map<string, string>();
    /** Every path written, in the order the writes landed. */
    readonly written: string[] = [];
    private readonly holds: Array<{ pattern: RegExp; waiting: Array<() => void> }> = [];

    async exists(path: string): Promise<boolean> {
        return this.files.has(path);
    }

    async read(path: string): Promise<string> {
        const text = this.files.get(path);

        if (text === undefined) {
            throw new Error(`ENOENT: ${path}`);
        }

        return text;
    }

    async write(path: string, data: string): Promise<void> {
        const hold = this.holds.find(({ pattern }) => pattern.test(path));

        if (hold) {
            await new Promise<void>((resume) => hold.waiting.push(resume));
        }

        this.files.set(path, data);
        this.written.push(path);
    }

    async remove(path: string): Promise<void> {
        this.files.delete(path);
    }

    /**
     * Holds every write to a matching path until the returned function is
     * called, then lets them land in the order they were made.
     */
    hold(pattern: RegExp): () => void {
        const hold = { pattern, waiting: [] as Array<() => void> };
        this.holds.push(hold);

        return () => {
            this.holds.splice(this.holds.indexOf(hold), 1);
            hold.waiting.splice(0).forEach((resume) => resume());
        };
    }

    /** A file's contents parsed, or undefined when there is no such file. */
    json(path: string): unknown {
        const text = this.files.get(path);
        return text === undefined ? undefined : JSON.parse(text);
    }
}

export class FakeMetadataCache extends FakeEvents {
    /** Source path to target path to count, as Obsidian keeps it. */
    readonly resolvedLinks: Record<string, Record<string, number>> = {};
    readonly unresolvedLinks: Record<string, Record<string, number>> = {};

    constructor(private readonly vault: FakeVault) {
        super();
    }

    getFirstLinkpathDest(linkpath: string): TFile | null {
        const wanted = linkpath.endsWith('.md') ? linkpath : `${linkpath}.md`;

        return this.vault.getMarkdownFiles().find((file) => file.path === wanted || file.name === wanted) ?? null;
    }
}

function makeFile(spec: NoteSpec): TFile {
    const file = new TFile();
    const name = spec.path.split('/').pop() ?? spec.path;
    const dot = name.lastIndexOf('.');

    file.path = spec.path;
    file.name = name;
    file.basename = dot > 0 ? name.slice(0, dot) : name;
    file.extension = dot > 0 ? name.slice(dot + 1) : '';
    file.stat = { mtime: spec.mtime, ctime: spec.ctime ?? spec.mtime, size: spec.size ?? 100 };
    file.parent = null;

    return file;
}

export class FakeVault extends FakeEvents {
    readonly configDir = 'config';
    readonly adapter = new FakeAdapter();
    readonly metadataCache: FakeMetadataCache;
    private readonly files = new Map<string, TFile>();

    constructor() {
        super();
        this.metadataCache = new FakeMetadataCache(this);
    }

    getName(): string {
        return 'harness';
    }

    getFiles(): TFile[] {
        return [...this.files.values()];
    }

    getMarkdownFiles(): TFile[] {
        return this.getFiles().filter((file) => file.extension === 'md');
    }

    getAbstractFileByPath(path: string): TFile | null {
        return this.files.get(path) ?? null;
    }

    /** A file that has to be there, for tests. */
    file(path: string): TFile {
        const file = this.files.get(path);

        if (!file) {
            throw new Error(`No ${path} in the vault`);
        }

        return file;
    }

    /** Puts a note in the vault without telling anyone, as one already there. */
    add(spec: NoteSpec): TFile {
        const file = makeFile(spec);
        this.files.set(spec.path, file);
        this.metadataCache.resolvedLinks[spec.path] = Object.fromEntries((spec.links ?? []).map((target) => [target, 1]));
        return file;
    }

    create(spec: NoteSpec): TFile {
        const file = this.add(spec);
        this.trigger('create', file);
        return file;
    }

    /** A write to a note, from Obsidian's autosave or from sync. */
    modify(path: string, change: { mtime: number; size?: number }): TFile {
        const file = this.file(path);
        file.stat = { ...file.stat, mtime: change.mtime, size: change.size ?? file.stat.size };
        this.trigger('modify', file);
        return file;
    }

    delete(path: string): TFile {
        const file = this.file(path);
        this.files.delete(path);
        delete this.metadataCache.resolvedLinks[path];
        this.trigger('delete', file);
        return file;
    }

    rename(path: string, newPath: string): TFile {
        const file = this.file(path);
        const links = this.metadataCache.resolvedLinks[path] ?? {};
        const moved = makeFile({ path: newPath, mtime: file.stat.mtime, ctime: file.stat.ctime, size: file.stat.size });

        // The same object, moved, as Obsidian moves it.
        file.path = moved.path;
        file.name = moved.name;
        file.basename = moved.basename;
        file.extension = moved.extension;

        this.files.delete(path);
        this.files.set(newPath, file);
        delete this.metadataCache.resolvedLinks[path];
        this.metadataCache.resolvedLinks[newPath] = links;

        for (const targets of Object.values(this.metadataCache.resolvedLinks)) {
            if (path in targets) {
                targets[newPath] = targets[path];
                delete targets[path];
            }
        }

        this.trigger('rename', file, path);
        return file;
    }
}

/** What a graph's engine reads the vault through. */
interface GraphSource {
    data(kind: GraphKind, options: EngineOptions, reached: number | null): GraphData;
}

export type GraphKind = 'global' | 'local';

export interface EngineOptions {
    localFile?: string;
    localJumps?: number;
}

/**
 * A graph view's engine: builds the graph's data from the vault and hands it
 * to the renderer, a fresh object every time.
 */
export class FakeEngine {
    readonly options: EngineOptions = {};
    /** How far the timelapse has run. Zero until one is started, and never back to zero after. */
    progression = 0;
    renders = 0;
    /** The newest creation a running timelapse has reached; null once it has caught up. */
    private reached: number | null = null;

    constructor(private readonly source: GraphSource, private readonly renderer: FakeRenderer, readonly kind: GraphKind) {}

    render(): void {
        this.renders++;
        this.renderer.setData(this.source.data(this.kind, this.options, this.reached));
    }

    /**
     * One step of the graph's own timelapse: the notes created by `moment`, or
     * every note once it has caught up (null). The counter only climbs.
     */
    replayTo(moment: number | null): void {
        this.progression++;
        this.reached = moment;
        this.render();
    }
}

type ViewType = 'graph' | 'localgraph';

/** A global or local graph view, built by the registry when a leaf opens one. */
export class FakeGraphView {
    readonly renderer = new FakeRenderer();
    /** The global graph's engine. Obsidian's local graph has none by this name. */
    readonly dataEngine: FakeEngine | undefined;
    /** The local graph's engine. */
    readonly engine: FakeEngine | undefined;
    /** The note a local graph is showing; it is a file view. Null for the global graph. */
    file: TFile | null = null;
    /** No graph controls, so the plugin builds no panel or caption: those need a DOM. */
    readonly containerEl = { querySelector: (_selector: string): null => null };
    closed = false;
    private readonly closing: Array<() => void> = [];

    constructor(private readonly vault: FakeVault, source: GraphSource, readonly type: ViewType) {
        const engine = new FakeEngine(source, this.renderer, type === 'localgraph' ? 'local' : 'global');
        this.dataEngine = type === 'graph' ? engine : undefined;
        this.engine = type === 'localgraph' ? engine : undefined;
    }

    get graphEngine(): FakeEngine {
        const engine = this.dataEngine ?? this.engine;

        if (!engine) {
            throw new Error('A graph view always has an engine');
        }

        return engine;
    }

    getViewType(): ViewType {
        return this.type;
    }

    getState(): Record<string, unknown> {
        return this.file ? { file: this.file.path } : {};
    }

    /** Runs when the view closes, as every Obsidian component's `register` does. */
    register(callback: () => void): void {
        this.closing.push(callback);
    }

    /** Points a local graph at a note and rebuilds it, as following the active note does. */
    showNote(path: string, jumps = 1): void {
        if (this.type !== 'localgraph') {
            throw new Error('Only a local graph has a centre');
        }

        this.file = this.vault.file(path);
        this.graphEngine.options.localFile = path;
        this.graphEngine.options.localJumps = jumps;
        this.graphEngine.render();
    }

    open(): void {
        this.graphEngine.render();
    }

    close(): void {
        this.closed = true;
        this.closing.splice(0).forEach((callback) => callback());
        this.renderer.destroyGraphics();
    }
}

export class FakeMarkdownView {
    constructor(public file: TFile | null) {}

    getViewType(): string {
        return 'markdown';
    }

    getState(): Record<string, unknown> {
        return this.file ? { file: this.file.path } : {};
    }

    getMode(): string {
        return 'source';
    }
}

/** What a leaf shows before a view is built for it. */
export class FakeEmptyView {
    readonly file = null;

    getViewType(): string {
        return 'empty';
    }

    getState(): Record<string, unknown> {
        return {};
    }
}

export type FakeView = FakeGraphView | FakeMarkdownView | FakeEmptyView;

export class FakeLeaf {
    view: FakeView = new FakeEmptyView();
    pinned = false;

    constructor(private readonly workspace: FakeWorkspace, readonly root: object) {}

    getRoot(): object {
        return this.root;
    }

    getViewState(): { type: string; pinned: boolean } {
        return { type: this.view.getViewType(), pinned: this.pinned };
    }

    detach(): void {
        this.workspace.close(this);
    }
}

type ViewCreator = (leaf: unknown) => unknown;

/**
 * `app.viewRegistry`. A leaf looks its view's creator up afresh every time it
 * opens one, so wrapping a creator reaches every view built afterwards. The
 * graph creators are tracked like the renderer's hooks, so a test can count
 * what is wrapped around them.
 */
export class FakeViewRegistry {
    readonly viewByType: Record<string, ViewCreator | undefined> = {};
    private readonly slots = new Map<ViewType, HookSlot<ViewCreator>>();
    private built: FakeGraphView | null = null;

    constructor(build: (type: ViewType) => FakeGraphView) {
        for (const type of ['graph', 'localgraph'] as const) {
            const slot = new HookSlot<ViewCreator>(() => {
                this.built = build(type);
                return this.built;
            });

            this.slots.set(type, slot);
            Object.defineProperty(this.viewByType, type, {
                get: (): ViewCreator => slot.current,
                set: (creator: ViewCreator): void => slot.assign(creator),
                enumerable: true,
                configurable: true
            });
        }
    }

    wrappers(type: ViewType): number {
        return this.slots.get(type)?.wrappers ?? 0;
    }

    /** Builds a view the way a leaf does, through whatever is registered now. */
    create(type: ViewType, leaf: FakeLeaf): FakeGraphView {
        this.built = null;
        const returned = this.viewByType[type]?.(leaf);
        const built = this.built;

        if (!built || returned !== built) {
            throw new Error(`The ${type} creator did not hand back the view it built`);
        }

        return built;
    }
}

export class FakeWorkspace extends FakeEvents {
    layoutReady: boolean;
    readonly rootSplit = { side: 'main' };
    readonly leftSplit = { side: 'left' };
    readonly rightSplit = { side: 'right' };
    /** How many times editors were asked to reconfigure. */
    optionUpdates = 0;
    private readonly leaves: FakeLeaf[] = [];
    /** Closed leaves getLeavesOfType goes on returning; see detachLingering. */
    private readonly lingering: FakeLeaf[] = [];
    private activeLeaf: FakeLeaf | null = null;
    private activeFile: TFile | null = null;
    private readonly waiting: Array<() => void> = [];

    constructor(private readonly vault: FakeVault, private readonly registry: FakeViewRegistry, layoutReady: boolean) {
        super();
        this.layoutReady = layoutReady;
    }

    getActiveFile(): TFile | null {
        return this.activeFile;
    }

    getLeavesOfType(type: string): FakeLeaf[] {
        return [...this.leaves, ...this.lingering].filter((leaf) => leaf.view.getViewType() === type);
    }

    iterateAllLeaves(callback: (leaf: FakeLeaf) => unknown): void {
        for (const leaf of [...this.leaves]) {
            callback(leaf);
        }
    }

    onLayoutReady(callback: () => void): void {
        if (this.layoutReady) {
            callback();
        } else {
            this.waiting.push(callback);
        }
    }

    getActiveViewOfType(): null {
        return null;
    }

    getMostRecentLeaf(): FakeLeaf | null {
        return this.activeLeaf;
    }

    getRightLeaf(): null {
        return null;
    }

    async revealLeaf(): Promise<void> {
        // Every leaf is always revealed here.
    }

    updateOptions(): void {
        this.optionUpdates++;
    }

    /** The layout has finished loading: what waited for it runs, then the layout says so. */
    ready(): void {
        this.layoutReady = true;
        this.waiting.splice(0).forEach((callback) => callback());
        this.trigger('layout-change');
    }

    /**
     * Opens a note and makes it the active file: in the leaf already showing
     * it, or in the active markdown leaf, or in a new one when asked.
     */
    openNote(path: string, options: { newLeaf?: boolean } = {}): FakeLeaf {
        const file = this.vault.file(path);
        const showing = this.leaves.find((leaf) => leaf.view instanceof FakeMarkdownView && leaf.view.file === file);
        const current = this.activeLeaf?.view instanceof FakeMarkdownView ? this.activeLeaf : null;
        const leaf = showing ?? (options.newLeaf ? null : current) ?? this.addLeaf(this.rootSplit);

        if (leaf.view instanceof FakeMarkdownView) {
            leaf.view.file = file;
        } else {
            leaf.view = new FakeMarkdownView(file);
        }

        this.activate(leaf, file);
        return leaf;
    }

    /** Focuses a leaf that is already open, such as a graph in the sidebar. */
    focus(leaf: FakeLeaf): void {
        // A view that is not a file view leaves the active file alone, as
        // getActiveFile() goes on reporting the most recent one.
        const file = leaf.view instanceof FakeMarkdownView ? leaf.view.file : this.activeFile;
        this.activate(leaf, file);
    }

    /** Opens a global graph in the main area, built through the registry. */
    openGraph(): FakeGraphView {
        return this.openView('graph', this.rootSplit, (view) => view.open());
    }

    /** Opens a local graph in the sidebar, built around a note. */
    openLocalGraph(centre: string, jumps = 1): FakeGraphView {
        return this.openView('localgraph', this.rightSplit, (view) => view.showNote(centre, jumps));
    }

    /** The leaf a view is in. */
    leafOf(view: FakeView): FakeLeaf {
        const leaf = this.leaves.find((candidate) => candidate.view === view);

        if (!leaf) {
            throw new Error('That view is not in any leaf');
        }

        return leaf;
    }

    close(leaf: FakeLeaf): void {
        const at = this.leaves.indexOf(leaf);

        if (at < 0) {
            return;
        }

        this.leaves.splice(at, 1);

        if (leaf.view instanceof FakeGraphView) {
            leaf.view.close();
        }

        if (this.activeLeaf === leaf) {
            this.activeLeaf = null;
        }

        if (this.layoutReady) {
            this.trigger('layout-change');
        }
    }

    /**
     * What a programmatic `detach()` was seen to do (#98): the leaf closes and
     * the workspace stops walking it, but getLeavesOfType goes on returning it.
     */
    detachLingering(leaf: FakeLeaf): void {
        this.lingering.push(leaf);
        this.close(leaf);
    }

    /**
     * What the workspace does about a note deleted while open: every leaf
     * showing it is emptied, and if one was in front, `file-open` says that
     * nothing is open now.
     */
    letGo(file: TFile): void {
        let wasActive = false;

        for (const leaf of this.leaves) {
            if (leaf.view instanceof FakeMarkdownView && leaf.view.file === file) {
                leaf.view.file = null;
                wasActive ||= leaf === this.activeLeaf;
            }
        }

        if (wasActive) {
            this.activeFile = null;
            this.trigger('file-open', null);
        }
    }

    private openView(type: ViewType, root: object, build: (view: FakeGraphView) => void): FakeGraphView {
        const leaf = new FakeLeaf(this, root);
        const view = this.registry.create(type, leaf);

        leaf.view = view;
        this.leaves.push(leaf);

        // The engine hands the renderer every note as the view opens,
        // before the layout says anything has changed.
        build(view);

        if (this.layoutReady) {
            this.trigger('layout-change');
        }

        return view;
    }

    private addLeaf(root: object): FakeLeaf {
        const leaf = new FakeLeaf(this, root);
        this.leaves.push(leaf);

        if (this.layoutReady) {
            this.trigger('layout-change');
        }

        return leaf;
    }

    private activate(leaf: FakeLeaf, file: TFile | null): void {
        if (this.activeLeaf !== leaf) {
            this.activeLeaf = leaf;
            this.activeFile = file;
            this.trigger('active-leaf-change', leaf);
        }

        this.activeFile = file;
        this.trigger('file-open', file);
    }
}

export class World {
    readonly vault = new FakeVault();
    readonly registry: FakeViewRegistry;
    readonly workspace: FakeWorkspace;
    readonly app: App;
    private readonly groups: ColourGroup[];
    private dark = true;

    constructor(options: WorldOptions) {
        this.groups = options.groups ?? [];

        for (const note of options.notes) {
            this.vault.add(note);
        }

        const source: GraphSource = { data: (kind, engineOptions, reached) => this.graphData(kind, engineOptions, reached) };
        this.registry = new FakeViewRegistry((type) => new FakeGraphView(this.vault, source, type));
        this.workspace = new FakeWorkspace(this.vault, this.registry, options.layoutReady ?? true);

        // The one cast: these fakes are the parts of App the plugin reaches.
        this.app = {
            vault: this.vault,
            workspace: this.workspace,
            metadataCache: this.vault.metadataCache,
            viewRegistry: this.registry,
            // Public since 1.10. Obsidian's default theme is the dark one.
            isDarkMode: () => this.dark
        } as unknown as App;
    }

    /** Switches theme as Obsidian does: the answer changes, then the workspace says so. */
    setTheme(theme: 'dark' | 'light'): void {
        this.dark = theme === 'dark';
        this.workspace.trigger('css-change');
    }

    get adapter(): FakeAdapter {
        return this.vault.adapter;
    }

    /** Every graph view open now. */
    graphs(): FakeGraphView[] {
        return [...this.workspace.getLeavesOfType('graph'), ...this.workspace.getLeavesOfType('localgraph')]
            .map((leaf) => leaf.view)
            .filter((view): view is FakeGraphView => view instanceof FakeGraphView);
    }

    /** Each open graph's engine builds again, as it does after the vault changes. */
    renderGraphs(): void {
        for (const view of this.graphs()) {
            view.graphEngine.render();
        }
    }

    /**
     * Deletes a note that is open in front. The vault and the workspace both
     * hear about it, and which goes first is not settled; the audit flagged
     * the order where the vault does.
     */
    deleteOpenNote(path: string, first: 'vault' | 'workspace'): void {
        const file = this.vault.file(path);

        if (first === 'workspace') {
            this.workspace.letGo(file);
            this.vault.delete(path);
        } else {
            this.vault.delete(path);
            this.workspace.letGo(file);
        }
    }

    /** The colour a group gives a note, as the engine puts it in the data. */
    groupColour(path: string): NodeData['color'] {
        const group = this.groups.find(({ prefix }) => path.startsWith(prefix));
        return group ? { a: 1, rgb: group.rgb } : undefined;
    }

    private graphData(kind: GraphKind, options: EngineOptions, reached: number | null): GraphData {
        const links = this.vault.metadataCache.resolvedLinks;
        let paths = this.vault.getMarkdownFiles()
            .filter((file) => reached === null || Math.min(file.stat.ctime, file.stat.mtime) <= reached)
            .map((file) => file.path);

        if (kind === 'local') {
            paths = this.around(options.localFile, options.localJumps ?? 1, new Set(paths));
        }

        const included = new Set(paths);
        const nodes: Record<string, NodeData> = {};
        let numLinks = 0;

        for (const path of paths) {
            const targets = Object.keys(links[path] ?? {}).filter((target) => included.has(target));
            numLinks += targets.length;

            const node: NodeData = { type: '', links: Object.fromEntries(targets.map((target) => [target, true])) };
            const color = this.groupColour(path);

            if (color) {
                node.color = color;
            }

            nodes[path] = node;
        }

        return { nodes, numLinks };
    }

    /** A local graph's notes: its centre and everything within so many links, either way. */
    private around(centre: string | undefined, jumps: number, available: Set<string>): string[] {
        if (centre === undefined || !available.has(centre)) {
            return [];
        }

        const links = this.vault.metadataCache.resolvedLinks;
        const reached = new Set([centre]);
        let edge = [centre];

        for (let jump = 0; jump < jumps; jump++) {
            const next: string[] = [];

            for (const path of edge) {
                const out = Object.keys(links[path] ?? {});
                const back = Object.keys(links).filter((source) => path in (links[source] ?? {}));

                for (const other of [...out, ...back]) {
                    if (available.has(other) && !reached.has(other)) {
                        reached.add(other);
                        next.push(other);
                    }
                }
            }

            edge = next;
        }

        return [...reached];
    }
}

export function createWorld(options: WorldOptions): World {
    return new World(options);
}
