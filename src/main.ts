import { debounce, Plugin, TAbstractFile, TFile } from 'obsidian';
import { formatAge } from './age';
import { AgeLabels, AgeText } from './age-label';
import { filterGraphData, isWholeRange, OpacityRange, withinRanges } from './filter';
import { GraphScrubber } from './graph-controls';
import { LinkShading } from './links';
import { applyOpacity, clearSpotlight, controlsFor, DataHook, forgetSpotlightColor, FrameHook, getGraphRenderers, GraphRenderer, holdSpotlightTint, hookRendererData, hookRendererFrame, previewFilter, rebuildGraphData, repaint, SpotlightState, syncLabelFonts, Unhook } from './graph';
import { readSnapshots } from './file-recovery';
import { Coverage, EditHistory } from './history';
import { hookNodeHover } from './hover';
import { OpacityStore, Sample } from './opacity-store';
import { Attention, TabFading } from './tabs';
import { describeVault, VaultStats } from './stats';
import { DEFAULT_SETTINGS, PulsarGraphSettings, PulsarSettingTab, parseSettings } from './settings';

/** Everything this plugin owns for one open graph view. */
interface AttachedGraph {
    release: Unhook;
    labels: AgeLabels;
    links: LinkShading;
    /** What each node was last drawn at, once neighbours have had their say. */
    pooled: { byPath: Map<string, number> | null };
    /** Kept so it can be re-installed when Obsidian rebuilds its graphics. */
    frames: FrameHook | null;
    data: DataHook | null;
    scrubber: GraphScrubber | null;
    /** Ranges being dragged right now, shown by hiding rather than rebuilding. */
    preview: { ranges: OpacityRange[] | null };
    spotlight: SpotlightState;
}

/** Coalesces the burst of modify events Obsidian fires while a note is typed. */
const UPDATE_DELAY_MS = 150;

/**
 * How often the status bar re-reads the clock. Its text is relative, so it goes
 * stale on its own while a note sits open and nothing in the vault changes.
 * One line of text a minute, and only while the setting is on.
 */
const STATUS_REFRESH_MS = 60 * 1000;

/**
 * How often the tabs are redrawn. They fade against the clock, so nothing else
 * would ever prompt it; half a minute is far finer than the shortest fade anyone
 * would set and costs a handful of style writes.
 */
const TAB_REFRESH_MS = 30 * 1000;

export default class PulsarGraphPlugin extends Plugin {
    settings: PulsarGraphSettings = DEFAULT_SETTINGS;

    private readonly store = new OpacityStore(() => this.settings);
    private readonly attached = new Map<GraphRenderer, AttachedGraph>();
    private statusBarEl: HTMLElement | null = null;
    private readonly attention = new Attention(this.app);
    private readonly tabs = new TabFading(this.app, this.attention);
    private readonly history = new EditHistory(this.app, this);

    private readonly updateSoon = debounce(() => this.syncRenderers(), UPDATE_DELAY_MS, true);

    async onload(): Promise<void> {
        await this.loadSettings();
        await this.history.load();
        this.store.setSittingSource((path) => (this.settings.history ? this.history.sittings(path) : 0));
        this.addSettingTab(new PulsarSettingTab(this.app, this));

        this.store.build(this.app.vault.getMarkdownFiles());

        this.registerEvent(this.app.vault.on('create', (file) => this.onFileChanged(file)));
        this.registerEvent(this.app.vault.on('modify', (file) => this.onFileChanged(file)));

        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (isNote(file)) {
                this.store.recordDelete(file);
                this.history.forget(file.path);
                this.updateSoon();
            }
        }));

        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            this.store.forget(oldPath);
            this.attention.forget(oldPath);
            this.history.rename(oldPath, file.path);
            this.onFileChanged(file);
        }));

        this.registerInterval(window.setInterval(() => {
            this.paintTabs();

            // Lets the next session tell idle time from time the app was shut.
            if (this.settings.history) {
                this.history.heartbeat();
            }
        }, TAB_REFRESH_MS));

        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                this.attention.touch(file.path);
                this.noteSeen(file.path);
            }

            this.paintTabs();
            this.updateStatusBar();

            // The open note is exempt from the filter, so which note that is
            // changes what the graph should contain.
            if (this.settings.filterEnabled && !isWholeRange(this.settings.filterRanges)) {
                this.refilter();
            }
        }));
        this.registerInterval(window.setInterval(() => this.updateStatusBar(), STATUS_REFRESH_MS));

        // Graph views come and go, and each brings its own renderer to hook.
        this.registerEvent(this.app.workspace.on('layout-change', () => this.syncRenderers()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            const active = this.app.workspace.getActiveFile();

            if (active) {
                this.attention.touch(active.path);
                this.noteSeen(active.path);
            }

            this.syncRenderers();
            this.updateStatusBar();
            this.paintTabs();
        }));

        this.registerEvent(this.app.workspace.on('layout-change', () => this.paintTabs()));

        this.app.workspace.onLayoutReady(() => {
            this.syncRenderers();
            this.syncStatusBar();
            this.attention.seed((path) => this.history.seenAt(path));
            this.paintTabs();
        });

        // Best effort by Obsidian's own admission, so it is a backstop for the
        // debounced write rather than the thing relied on.
        this.registerEvent(this.app.workspace.on('quit', (tasks) => {
            tasks.addPromise(this.history.flush());
        }));
    }

    onunload(): void {
        for (const graph of this.attached.values()) {
            graph.release();
        }

        this.attached.clear();
        this.tabs.clear();
        void this.history.flush();
    }

    /** What has been recorded so far, for the settings tab and the statistics. */
    historyCoverage(): Coverage {
        return this.history.coverage();
    }

    async forgetHistory(): Promise<void> {
        await this.history.clear();
    }

    /**
     * Seeds the history from core File Recovery's snapshots, which is the only
     * local record of anything from before this plugin was switched on. One
     * import, by hand: it is capped at a week by default and gone on iOS, so it
     * is a head start rather than a source.
     */
    async importFileRecovery(): Promise<{ records: number; notes: number; skipped: number; gained: number } | null> {
        const found = await readSnapshots(this.app);
        if (!found) {
            return null;
        }

        const before = this.history.coverage().beads;
        const gap = this.settings.sessionGapMinutes * 60 * 1000;

        for (const [path, times] of found.byPath) {
            this.history.merge(path, times, gap, this.settings.historyCap);
        }

        await this.history.flush();

        return {
            records: found.records,
            notes: found.byPath.size,
            skipped: found.skipped,
            gained: this.history.coverage().beads - before
        };
    }

    /**
     * Notes that a file was looked at. Only the timestamp is kept, not a count:
     * opens are far noisier than edits — a quick-switcher fly-by is an open —
     * and mixing them into the sittings would turn the record of how a note was
     * written into a record of navigation.
     */
    private noteSeen(path: string): void {
        if (this.settings.history) {
            this.history.markSeen(path, Date.now());
        }
    }

    /** Dims the tabs that have gone untouched, if that is switched on. */
    private paintTabs(): void {
        this.store.refresh();

        this.tabs.apply({
            mode: this.settings.tabFade,
            dot: this.settings.tabDot,
            after: this.settings.tabFadeAfter,
            floor: this.settings.tabFadeFloor,
            spotlight: this.settings.spotlightNewest
                ? { path: this.store.newestPath(), color: this.settings.spotlightColor }
                : null,
            graphStrength: (path) => this.store.opacityFor(path)
        });
    }

    async loadSettings(): Promise<void> {
        this.settings = parseSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.store.markStale();
        this.store.refresh();
        this.refilter();
        this.syncRenderers();
        this.syncStatusBar();
        this.paintTabs();

        for (const graph of this.attached.values()) {
            graph.scrubber?.refresh();
        }
    }

    /**
     * Shows ranges without committing to them, across every open graph. Used
     * while a handle is being dragged, from the settings dialog as much as from
     * the graph's own panel, since the graph is usually visible behind it.
     */
    previewRanges(ranges: OpacityRange[] | null): void {
        for (const [renderer, graph] of this.attached) {
            graph.preview.ranges = this.settings.filterEnabled ? ranges : null;
            repaint(renderer);
        }
    }

    /** Whether a note is inside the kept ranges, or exempt from them. */
    private survives(path: string, ranges: OpacityRange[]): boolean {
        const strength = this.store.opacityFor(path);

        if (strength === undefined || path === this.app.workspace.getActiveFile()?.path) {
            return true;
        }

        return withinRanges(Math.min(1, Math.max(0, strength)), ranges);
    }

    /** Adds the age section to a graph's own control panel, where it has one. */
    private buildScrubber(renderer: GraphRenderer, preview: { ranges: OpacityRange[] | null }): GraphScrubber | null {
        const controls = controlsFor(this.app, renderer);
        if (!controls) {
            return null;
        }

        return new GraphScrubber(controls, {
            enabled: () => this.settings.filterEnabled,
            ranges: () => this.settings.filterRanges,
            histogram: () => this.measureVault().spread,
            onToggle: (enabled) => {
                this.settings.filterEnabled = enabled;
                void this.saveSettings();
            },
            onPreview: (ranges) => {
                preview.ranges = ranges;

                if (!ranges) {
                    // Whatever was hidden has to be drawn again, and only a
                    // frame can do that.
                    repaint(renderer);
                }

                repaint(renderer);
            },
            onChange: (ranges) => {
                this.settings.filterRanges = ranges;
                void this.saveSettings();
            }
        });
    }

    /**
     * Rebuilds every attached graph from the engine's own data, which is what a
     * change to the filter needs: the nodes it would bring back are not in the
     * graph to be updated, they have to be put back.
     */
    refilter(): void {
        let primed = true;

        for (const graph of this.attached.values()) {
            if (graph.data?.reapply() !== true) {
                primed = false;
            }
        }

        // A graph that was already open when the plugin attached has handed it
        // no data to rebuild from, so the engine is asked for some. This happens
        // once per graph, not once per change.
        if (!primed) {
            rebuildGraphData(this.app);
        }
    }

    /**
     * Adds or removes the status bar item to match the setting. Obsidian has no
     * way to take one back, so the element is held and removed by hand.
     */
    private syncStatusBar(): void {
        if (this.settings.statusBarAge && !this.statusBarEl) {
            this.statusBarEl = this.addStatusBarItem();
        } else if (!this.settings.statusBarAge && this.statusBarEl) {
            this.statusBarEl.remove();
            this.statusBarEl = null;
        }

        this.updateStatusBar();
    }

    /**
     * Shows how long ago the open note was modified. Anything that is not a
     * note has no age worth reporting, so the item goes empty rather than
     * showing something misleading about an attachment.
     */
    private updateStatusBar(): void {
        const element = this.statusBarEl;
        if (!element) {
            return;
        }

        const file = this.app.workspace.getActiveFile();
        const mtime = file && isNote(file) ? this.store.mtimeFor(file.path) ?? file.stat.mtime : undefined;

        if (mtime === undefined || !file) {
            element.setText('');
            return;
        }

        const sittings = this.settings.history ? this.history.sittings(file.path) : 0;
        const worked = sittings > 1 ? ` · ${sittings} sittings` : '';

        element.setText(`Edited ${formatAge(mtime, Date.now())}${worked}`);
    }

    /**
     * What the current settings are doing to this vault, read from the graph
     * that is open if there is one.
     */
    measureVault(): VaultStats {
        this.store.refresh();

        const [first] = this.attached.entries();
        const renderer = first?.[0] ?? null;
        const graph = first?.[1];

        return describeVault(
            this.store,
            this.settings,
            renderer,
            (path) => graph?.pooled.byPath?.get(path) ?? this.store.opacityFor(path),
            this.settings.history ? this.history.coverage() : null
        );
    }

    /** Walks the current curve across this vault's ages, for the settings preview. */
    sampleCurve(count: number): Sample[] {
        return this.store.sample(count);
    }

    private onFileChanged(file: TAbstractFile): void {
        if (!isNote(file)) {
            return;
        }

        this.store.recordChange(file);

        if (this.settings.history) {
            this.history.record(
                file.path,
                file.stat.mtime,
                file.stat.size,
                this.settings.sessionGapMinutes * 60 * 1000,
                this.settings.historyCap
            );
        }

        this.updateSoon();
        this.updateStatusBar();
    }

    /**
     * Attaches to renderers that have appeared and releases ones whose view is
     * gone, so no graph keeps a patched setData or a stray label after its leaf
     * closes.
     */
    private syncRenderers(): void {
        const open = new Set(getGraphRenderers(this.app));

        for (const [renderer, graph] of this.attached) {
            if (!open.has(renderer)) {
                graph.release();
                this.attached.delete(renderer);
            }
        }

        for (const renderer of open) {
            if (!this.attached.has(renderer)) {
                this.attached.set(renderer, this.attach(renderer));
            }

            this.applyTo(renderer);
        }
    }

    private attach(renderer: GraphRenderer): AttachedGraph {
        // Labels, links and nodes all read the same number, so a node lifted by
        // a neighbour carries its date and its links up with it.
        const pooled: { byPath: Map<string, number> | null } = { byPath: null };
        const strengthOf = (path: string): number | undefined => pooled.byPath?.get(path) ?? this.store.opacityFor(path);

        const labels = new AgeLabels(renderer, (path) => this.describeAge(path, strengthOf));
        labels.setMode(this.settings.ageLabels);

        const spotlight: SpotlightState = {};
        const links = new LinkShading(renderer, strengthOf, (id) => this.store.mtimeFor(id));
        links.setMode(this.settings.linkRecency);
        links.setTrails(this.settings.sessionTrails
            ? { gapMs: this.settings.sessionGapMinutes * 60 * 1000, rgb: parseHexColor(this.settings.trailColor), strength: this.settings.trailStrength }
            : null);

        const data = hookRendererData(
            renderer,
            () => {
                // Obsidian has just rewritten every colour from group data, so
                // the colour the spotlight was preserving is stale.
                forgetSpotlightColor(spotlight);
                this.applyTo(renderer);
            },
            (supplied) => filterGraphData(supplied, {
                ranges: this.settings.filterRanges,
                strengthOf: (path) => (this.settings.filterEnabled ? this.store.opacityFor(path) : undefined),
                keep: this.app.workspace.getActiveFile()?.path
            })
        );
        const preview: { ranges: OpacityRange[] | null } = { ranges: null };
        const fonts: { multiplier?: number } = {};

        const frames = hookRendererFrame(renderer, () => {
            // The ages are drawn at the size the node implies, so they are
            // rebuilt alongside the titles rather than left behind with them.
            if (syncLabelFonts(renderer, fonts)) {
                labels.clear();
            }

            labels.sync();
            links.sync();
            holdSpotlightTint(renderer, spotlight);

            if (preview.ranges) {
                previewFilter(renderer, (path) => this.survives(path, preview.ranges ?? []));
            }
        });

        const scrubber = this.buildScrubber(renderer, preview);

        const releaseHover = hookNodeHover(renderer, {
            onHover: (path) => {
                labels.setHovered(renderer.nodeLookup[path] ?? null);
                repaint(renderer);
            },
            onUnhover: () => {
                labels.setHovered(null);
                repaint(renderer);
            }
        });

        return {
            labels,
            links,
            pooled,
            frames,
            data,
            scrubber,
            preview,
            spotlight,
            release: () => {
                data?.release();
                releaseHover();
                frames?.release();
                labels.destroy();
                links.destroy();
                scrubber?.destroy();
                clearSpotlight(renderer, spotlight);
                repaint(renderer);
            }
        };
    }

    /**
     * Nodes exist for attachments and unresolved links too, and those carry no
     * modification time worth showing, so they get no label at all.
     *
     * The strength returned is the note's own opacity, so an age fades along
     * with the node it belongs to rather than sitting bright over a dim one.
     */
    private describeAge(path: string, strengthOf: (path: string) => number | undefined): AgeText | undefined {
        const mtime = this.store.mtimeFor(path);
        if (mtime === undefined) {
            return undefined;
        }

        const opacity = strengthOf(path) ?? this.store.cacheOpacityFor(path, mtime);

        return {
            text: formatAge(mtime, Date.now()),
            strength: Math.min(1, Math.max(0, opacity))
        };
    }

    private applyTo(renderer: GraphRenderer): void {
        const graph = this.attached.get(renderer);
        if (!graph) {
            return;
        }

        // Obsidian assigns a new render callback whenever it rebuilds a
        // graph's graphics, which drops the wrapper the labels are driven by.
        if (graph.frames && !graph.frames.isInstalled()) {
            graph.frames = hookRendererFrame(renderer, () => {
                graph.labels.sync();
                graph.links.sync();
                holdSpotlightTint(renderer, graph.spotlight);
            });
        }

        graph.labels.setMode(this.settings.ageLabels);
        graph.links.setMode(this.settings.linkRecency);
        graph.links.setTrails(this.settings.sessionTrails
            ? { gapMs: this.settings.sessionGapMinutes * 60 * 1000, rgb: parseHexColor(this.settings.trailColor), strength: this.settings.trailStrength }
            : null);

        this.store.refresh();
        graph.pooled.byPath = applyOpacity(renderer, this.store, {
            spotlightNewest: this.settings.spotlightNewest,
            spotlightRgb: parseHexColor(this.settings.spotlightColor),
            spotlightStrength: this.settings.spotlightStrength,
            spotlight: graph.spotlight,
            neighbourBleed: this.settings.neighbourBleed,
            neighbourHops: this.settings.neighbourHops,
            clusterWarmth: this.settings.clusterWarmth,
            clusterBy: this.settings.clusterBy
        });
        repaint(renderer);
    }
}

/** Turns a '#rrggbb' setting into the packed number the renderer tints with. */
function parseHexColor(value: string): number {
    return Number.parseInt(value.slice(1), 16) || 0xffffff;
}

/**
 * Only notes are graded. Attachments can appear as graph nodes, but their
 * timestamps say nothing about when a note was worked on, and they would
 * stretch the range every opacity is normalized against.
 */
function isNote(file: TAbstractFile): file is TFile {
    return file instanceof TFile && file.extension === 'md';
}
