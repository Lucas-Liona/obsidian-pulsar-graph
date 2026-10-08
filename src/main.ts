import { Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Component, debounce, MarkdownView, Menu, Notice, Plugin, setIcon, TAbstractFile, TFile, WorkspaceLeaf } from 'obsidian';
import { formatAge, formatSpan } from './age';
import { BEAD_VIEW_TYPE, BeadView, fileOf } from './bead-view';
import { AgeLabels, AgeMode, AgeText } from './age-label';
import { filterGraphData, isWholeRange, OpacityRange, WHOLE_RANGE } from './filter';
import { FilterCaption, PulsarPanel } from './graph-controls';
import { FADE_TYPE_LABELS, FadeType } from './fade';
import { LinkShading } from './links';
import { applySizes, clearSizes, applyOpacity, clearPaint, newPaint, controlsFor, DataHook, forgetPaintedColors, FrameHook, GraphKind, GraphRenderer, holdPaintTint, hookGraphCreation, hookRendererData, hookRendererFrame, OpenGraph, openGraphs, pathsIn, previewFilter, rebuildGraphData, repaint, PaintState, settleReleases, syncLabelFonts, Unhook } from './graph';
import { readSnapshots } from './file-recovery';
import { Coverage, EditHistory } from './history';
import { hookNodeHover } from './hover';
import { coolInk, forgetInk, inkCounts, inkExtension, pinInk, setInkColours, setInkListener, setInkOptions, unpinInk } from './ink';
import { LinkDotSource, LinkLook, linkDotsExtension, ReadingDots, refreshLinkDots } from './link-dots';
import { addPinMenuItem, Pins } from './pins';
import { OpacityStore, Sample } from './opacity-store';
import { describeSummary, keepsNote, openNoteMatters, summariseRanges } from './range-stats';
import { Spread } from './range-bar';
import { joinStats, SEPARATOR } from './stats-text';
import { Attention, TabFading } from './tabs';
import { describeVault, VaultStats } from './stats';
import { DEFAULT_SETTINGS, MIN_OPACITY_LIMIT, PulsarGraphSettings, PulsarSettingTab, parseSettings, TITLE_SCALE_RANGE } from './settings';

/** Everything this plugin owns for one open graph view. */
interface AttachedGraph {
    /** Which of Obsidian's two graphs this is. Fixed for the view's lifetime. */
    kind: GraphKind;
    /** Whether the graph's own timelapse is running. */
    replaying: () => boolean;
    /** The note a local graph is built around, read fresh each pass. */
    centre: () => string | null;
    release: Unhook;
    labels: AgeLabels;
    links: LinkShading;
    /** What each node was last drawn at, once neighbours have had their say. */
    pooled: { byPath: Map<string, number> | null };
    /** Kept so it can be re-installed when Obsidian rebuilds its graphics. */
    frames: FrameHook | null;
    /** What every frame does, installed once and again after each rebuild. */
    onFrame: () => void;
    data: DataHook | null;
    panel: PulsarPanel | null;
    caption: FilterCaption | null;
    /**
     * Which notes the ranges being dragged right now keep, shown by hiding
     * rather than rebuilding. Built once per move of a handle, not per frame.
     */
    preview: Preview;
    /** How many notes the filter took out of this graph on its last rebuild. */
    cut: { dropped: number };
    paint: PaintState;
}

/** What a drag is previewing, if anything. */
interface Preview {
    keeps: ((path: string) => boolean) | null;
}

/** A survivor test that also keeps one more note, if there is one. */
function sparing(keeps: (path: string) => boolean, spared: string | null): (path: string) => boolean {
    return spared === null ? keeps : (path) => path === spared || keeps(path);
}

/** Coalesces the burst of modify events Obsidian fires while a note is typed. */
const UPDATE_DELAY_MS = 150;

/** How long a link dot's look is trusted before it is worked out again. */
const LINK_LOOK_MS = 30 * 1000;

/** How often, at most, the fresh-writing count is redrawn while it changes. */
const INK_COUNT_DELAY_MS = 200;

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
    /** Graphs hooked while Obsidian built them and not attached yet. */
    private readonly early = new Map<GraphRenderer, { data: DataHook | null; cut: { dropped: number } }>();
    /** Graphs owed a repaint before the current task ends. */
    private readonly owed = new Set<GraphRenderer>();
    private statusBarEl: HTMLElement | null = null;
    /** Fresh writing in the open note, its own item since it has its own click. */
    private inkItemEl: HTMLElement | null = null;
    private readonly attention = new Attention(this.app);
    private readonly tabs = new TabFading(this.app, this.attention);
    private readonly history = new EditHistory(this.app, this);

    /**
     * The pinned notes, as a set, because the per-node loop asks about every
     * node in the graph on every pass and an array would make that quadratic.
     * The settings list is the stored form; this is the index over it.
     */
    private readonly pins = new Pins((paths) => {
        this.settings.pins = paths;
    });

    /** Everything that only exists while the plugin is switched on. */
    private running: Component | null = null;

    /**
     * Set once Obsidian has unloaded this instance, which is permanent: a
     * reload builds a new instance and this one is garbage, except that
     * anything already scheduled still holds it. A debounced update, a save
     * still in flight, or a settings tab left open across a reload would each
     * attach the dead instance to every open graph again, where it stayed —
     * hooks and all — fighting the live one for the top of every renderer.
     */
    private unloaded = false;
    /** The note that was open when the graphs were last filtered, and so exempt in them. */
    private filteredOpen: string | null = null;

    /** Emptied when the plugin is off, so no editor carries anything of ours. */
    private readonly editorExtensions: Extension[] = [];
    /** Whether that array has been handed to Obsidian yet. */
    private editorsRegistered = false;
    /** Made once, so the array can be compared to what is wanted by identity. */
    private readonly inkEditor: Extension = inkExtension();
    private readonly dotsEditor: Extension = linkDotsExtension(
        () => this.linkDotSource(),
        (view) => this.app.workspace.getLeavesOfType('markdown')
            .map((leaf) => leaf.view)
            .find((candidate): candidate is MarkdownView => candidate instanceof MarkdownView && (candidate.editor as { cm?: EditorView }).cm === view)
            ?.file?.path ?? null
    );
    /** Link dots drawn in reading view, kept so they can be repainted in place. */
    private readonly readingDots = new ReadingDots();
    /** Whether link dots were on at the last settings sync, to notice them switching. */
    private linkDotsShown = false;

    /**
     * Where links point and how their notes look, kept between keystrokes:
     * every keystroke redraws the dots on screen, and working all of it out
     * again each time added a third to a keystroke in a note of 24 links.
     * Emptied whenever something about the notes changes, and the
     * looks go stale on their own because they carry an age in words.
     */
    private readonly linkCache = { resolved: new Map<string, string | null>(), looks: new Map<string, LinkLook | null>(), since: 0 };

    /** What a link dot needs to know, built once. */
    private readonly linkSource: LinkDotSource = {
        resolve: (linkpath, sourcePath) => {
            const key = `${sourcePath}\n${linkpath}`;
            let path = this.linkCache.resolved.get(key);

            if (path === undefined) {
                const file = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
                path = file && isNote(file) ? file.path : null;
                this.linkCache.resolved.set(key, path);
            }

            return path;
        },
        look: (path) => {
            const now = Date.now();

            if (now - this.linkCache.since > LINK_LOOK_MS) {
                this.linkCache.looks.clear();
                this.linkCache.since = now;
            }

            let look = this.linkCache.looks.get(path);

            if (look === undefined) {
                look = this.linkLook(path);
                this.linkCache.looks.set(path, look);
            }

            return look;
        }
    };

    /**
     * The tab bar repaints with the graph. Both read the same brightness, and
     * the dot and the spotlight were only redrawn on a tab switch or on the
     * half-minute tick, so writing in a note left its own tab stale.
     */
    private readonly updateSoon = debounce(() => {
        this.syncRenderers();
        this.paintTabs();
        this.refreshBeadViews();
        this.refreshLinkDots();
    }, UPDATE_DELAY_MS, true);

    /**
     * The fresh-writing count follows every keystroke and every cooling step,
     * but at most this often: the count walks every mark in the note.
     */
    private readonly refreshInkSoon = debounce(() => this.updateInkItem(), INK_COUNT_DELAY_MS);

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new PulsarSettingTab(this.app, this));

        // Always registered, asking the settings each time it runs: a
        // post-processor cannot be taken back once added, and one that returns
        // straight away costs nothing.
        this.registerMarkdownPostProcessor((element, context) => {
            const source = this.linkDotSource();

            if (source) {
                this.readingDots.decorate(element, context.sourcePath, source);
            }
        });

        // Commands stay registered either way. They are inert data in the
        // palette until something invokes one, and a command that vanished
        // would take any hotkey assigned to it with it.
        // Registered in onload rather than with everything else that runs,
        // because Obsidian restores an open view as the layout loads and a type
        // it does not know about leaves the user staring at an error. The view
        // itself says so when there is no history being kept.
        this.registerView(BEAD_VIEW_TYPE, (leaf) => new BeadView(leaf, {
            beadsFor: (path) => this.history.beadsFor(path),
            recording: () => this.settings.enabled && this.settings.history,
            opacityAt: (at) => this.store.opacityAt(at)
        }));

        this.addCommand({
            id: 'open-note-history',
            name: 'Show this note\'s history',
            callback: () => void this.openBeadView()
        });

        this.addCommand({
            id: 'cool-fresh-writing',
            name: 'Cool fresh writing',
            callback: () => this.forgetInk()
        });

        this.addCommand({
            id: 'pin-writing',
            name: 'Pin this writing',
            editorCallback: (_editor, view) => {
                const editor = (view as { editor?: { cm?: EditorView } }).editor?.cm;

                if (!this.settings.enabled || !this.settings.ink) {
                    new Notice('Fresh writing is switched off.');
                    return;
                }

                if (editor && !pinInk(editor)) {
                    new Notice('Nothing here to pin.');
                }

                this.updateStatusBar();
            }
        });

        this.addCommand({
            id: 'unpin-writing',
            name: 'Unpin writing in this note',
            editorCallback: (_editor, view) => {
                const editor = (view as { editor?: { cm?: EditorView } }).editor?.cm;

                if (editor && !unpinInk(editor)) {
                    new Notice('Nothing pinned in this note.');
                }

                this.updateStatusBar();
            }
        });

        this.addCommand({
            id: 'close-stale-tabs',
            name: 'Close stale tabs',
            callback: () => this.closeStaleTabs()
        });

        this.addCommand({
            id: 'pin-note-in-graph',
            name: 'Pin this note in the graph',
            checkCallback: (checking) => {
                const file = this.app.workspace.getActiveFile();

                if (!file || file.extension !== 'md') {
                    return false;
                }

                if (!checking) {
                    void this.togglePin(file.path);
                }

                return true;
            }
        });

        this.addCommand({
            id: 'unpin-all-from-graph',
            name: 'Unpin every note',
            checkCallback: (checking) => {
                if (this.pins.size === 0) {
                    return false;
                }

                if (!checking) {
                    void this.unpinAll();
                }

                return true;
            }
        });

        await this.syncRunning();
    }

    /**
     * Starts or stops everything, from load and from the master switch.
     *
     * Off has to mean off. Everything that watches, caches, draws or ticks
     * hangs off one child component, so stopping is a single unload rather than
     * a list of things to remember — which is the only version of this that
     * stays true as features are added.
     */
    private async syncRunning(): Promise<void> {
        if (this.unloaded) {
            return;
        }

        if (this.settings.enabled && !this.running) {
            await this.begin();
        } else if (!this.settings.enabled && this.running) {
            this.end();
        }
    }

    private async begin(): Promise<void> {
        const running = new Component();
        this.running = running;
        this.addChild(running);

        await this.history.load();

        // Unloaded or switched off while the history was being read.
        if (this.running !== running) {
            return;
        }

        this.store.setSittingSource((path) => (this.settings.history ? this.history.sittings(path) : 0));
        this.store.build(this.app.vault.getMarkdownFiles());
        this.filteredOpen = this.app.workspace.getActiveFile()?.path ?? null;

        running.registerEvent(this.app.vault.on('create', (file) => this.onFileChanged(file)));
        running.registerEvent(this.app.vault.on('modify', (file) => this.onFileChanged(file)));

        running.registerEvent(this.app.vault.on('delete', (file) => {
            if (isNote(file)) {
                this.store.recordDelete(file);
                this.history.forget(file.path);

                if (this.pins.has(file.path)) {
                    this.pins.forget(file.path);
                    void this.saveData(this.settings);
                }

                this.updateSoon();
            }
        }));

        running.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            this.store.forget(oldPath);
            this.attention.forget(oldPath);
            this.history.rename(oldPath, file.path);

            // A pin is held against a path, so filing a note away somewhere
            // permanent is exactly the action that would otherwise lose it.
            if (this.pins.has(oldPath)) {
                this.pins.rename(oldPath, file.path);
                void this.saveData(this.settings);
            }

            this.onFileChanged(file);
        }));

        // Obsidian's graph fires this when a node is right-clicked, with a
        // source of 'graph-context-menu', so one listener reaches both the
        // graph and the file explorer and nothing in the renderer gets patched.
        running.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file: TAbstractFile) => {
            if (isNote(file)) {
                addPinMenuItem(menu, file.path, this.pins.has(file.path), () => void this.togglePin(file.path));
            }
        }));

        running.registerInterval(window.setInterval(() => {
            this.paintTabs();

            // A spotlight measured as a window empties on its own as the clock
            // moves, and nothing else would ever prompt the graph to notice.
            // A count never changes without an edit, so this costs nothing in
            // the default setting.
            if (this.settings.spotlightNewest && this.settings.spotlightBy === 'window') {
                this.syncRenderers();
            }

            // Lets the next session tell idle time from time the app was shut.
            if (this.settings.history) {
                this.history.heartbeat();
            }
        }, TAB_REFRESH_MS));

        running.registerEvent(this.app.workspace.on('file-open', (file) => {
            this.lookAt(file?.path ?? null);

            this.paintTabs();
            this.updateStatusBar();
            this.refreshBeadViews();

            // The open note is exempt from the filter, so which note that is
            // can change what the graph should contain — but only when the
            // note left or the one opened is one the ranges would drop by
            // themselves. Refiltering on every switch regardless cost a 167 ms
            // block per switch in a 20,000-note vault, for a graph that was
            // almost always the same afterwards.
            const opened = file?.path ?? null;

            if (this.settings.filterEnabled && !isWholeRange(this.settings.filterRanges)
                && openNoteMatters(this.filteredOpen, opened, this.keptWithoutOpen())) {
                this.refilter();
            }

            this.filteredOpen = opened;
        }));

        running.registerInterval(window.setInterval(() => this.updateStatusBar(), STATUS_REFRESH_MS));

        // Graph views come and go, and each brings its own renderer to hook.
        running.registerEvent(this.app.workspace.on('layout-change', () => {
            this.syncRenderers();
            this.paintTabs();
        }));

        // A graph has already drawn every note by the time the layout says it
        // is open, so it is hooked as it is built as well.
        running.register(hookGraphCreation(this.app, (renderer, onClose, centre) => this.hookEarly(renderer, onClose, centre)));

        running.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            this.lookAt(this.app.workspace.getActiveFile()?.path ?? null);

            this.syncRenderers();
            this.updateStatusBar();
            this.paintTabs();
            this.refreshBeadViews();
        }));

        // Best effort by Obsidian's own admission, so it is a backstop for the
        // debounced write rather than the thing relied on.
        running.registerEvent(this.app.workspace.on('quit', (tasks) => {
            this.lookAt(null);
            tasks.addPromise(this.history.flush());
        }));

        this.syncInk();
        setInkListener(() => this.refreshInkSoon());

        this.app.workspace.onLayoutReady(() => {
            if (!this.running) {
                return;
            }

            this.syncRenderers();
            this.syncStatusBar();
            this.attention.seed((path) => this.history.seenAt(path));
            // Whatever was in front before this started listening, so that
            // leaving it is noticed like leaving anything else.
            this.lookAt(this.app.workspace.getActiveFile()?.path ?? null);
            this.paintTabs();
            this.refreshBeadViews();
        });
    }

    /** Hands the vault back everything this plugin was holding. */
    private end(): void {
        const running = this.running;
        this.running = null;

        if (running) {
            this.removeChild(running);
        }

        this.releaseGraphs();
        this.tabs.clear();
        this.syncEditorExtensions();
        this.refreshLinkDots();

        this.statusBarEl?.remove();
        this.statusBarEl = null;

        setInkListener(null);
        this.refreshInkSoon.cancel();
        this.inkItemEl?.remove();
        this.inkItemEl = null;

        this.clearInkProperties();
        this.store.clear();
        this.lookAt(null);
        void this.history.flush();

        // Last, so an open history view says it is switched off rather than
        // keeping the beads it was showing a moment ago on screen.
        this.refreshBeadViews();
    }

    onunload(): void {
        this.unloaded = true;
        this.running = null;
        this.updateSoon.cancel();
        this.saveSoon.cancel();
        this.refreshInkSoon.cancel();
        setInkListener(null);

        this.releaseGraphs();
        this.tabs.clear();
        this.clearInkProperties();
        this.lookAt(null);
        void this.history.flush();
    }

    private releaseGraphs(): void {
        const had = this.attached.size > 0 || this.early.size > 0;

        for (const graph of this.attached.values()) {
            graph.release();
        }

        for (const { data } of this.early.values()) {
            data?.release();
        }

        this.attached.clear();
        this.early.clear();

        // Releasing the hooks does not undo what they wrote. Node colour is the
        // only place a graph group's colour lives, so the opacity written into
        // it outlives the hook, and a graph left alone would stay faded until
        // something else happened to rebuild it. Asking Obsidian to render its
        // own data again is what hands the colours back, and the notes the
        // filter took out with them.
        if (had) {
            rebuildGraphData(this.app);
        }
    }

    private clearInkProperties(): void {
        setInkColours(null, this.editors());
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

    /**
     * Moves the attention clock to the note in front, or to none. The note
     * left behind is written down as seen too, since it was being looked at
     * until now — including when the app quits with it open.
     */
    private lookAt(path: string | null): void {
        const left = this.attention.focus(path);

        if (left !== null) {
            this.noteSeen(left);
        }

        if (path !== null) {
            this.noteSeen(path);
        }
    }

    /**
     * Closes the tabs that have been marked, and only when asked. Pinned tabs
     * and the one in front of you are left alone: the note you are looking at
     * reports no idle time at all, and a pinned tab is a deliberate statement
     * that it should stay.
     *
     * Leaves are collected before any are detached, since closing one while
     * walking the list would move the rest.
     */
    private closeStaleTabs(): void {
        if (!this.settings.staleTabs) {
            new Notice('Marking stale tabs is switched off.');
            return;
        }

        const active = this.app.workspace.getActiveFile()?.path;
        const stale: { leaf: WorkspaceLeaf; path: string }[] = [];

        this.app.workspace.iterateAllLeaves((leaf) => {
            const file = leaf.view.getState().file;

            if (typeof file !== 'string' || file === active || leaf.getViewState().pinned === true) {
                return;
            }

            // Only tabs in the main area. The outline, backlinks and local
            // graph panels each report a file too, and closing someone's
            // sidebar is not what this offered to do.
            if (leaf.getRoot() !== this.app.workspace.rootSplit) {
                return;
            }

            const minutes = this.attention.minutesSince(file);

            if (minutes !== undefined && minutes >= this.settings.staleTabAfter) {
                stale.push({ leaf, path: file });
            }
        });

        for (const { leaf, path } of stale) {
            this.attention.forget(path);
            leaf.detach();
        }

        new Notice(stale.length === 0 ? 'No stale tabs to close.' : `Closed ${stale.length} stale ${stale.length === 1 ? 'tab' : 'tabs'}.`);
        this.paintTabs();
    }

    /** Dims the tabs that have gone untouched, if that is switched on. */
    private paintTabs(): void {
        if (!this.settings.tabBar) {
            this.tabs.clear();
            return;
        }

        this.store.refresh();

        // Once, not once per tab. Picking the newest notes is a pass over every
        // mtime in the vault, and this runs on a timer and on every leaf change.
        const lit = new Set(this.spotlitFrom(this.store.paths()));

        this.tabs.apply({
            mode: this.settings.tabFade,
            scope: this.settings.tabFadeScope,
            curve: this.settings.tabFadeCurve,
            dot: this.settings.tabDot,
            after: this.settings.tabFadeAfter,
            floor: this.settings.tabFadeFloor,
            dotColor: (path) => this.dotColor(path, lit),
            graphStrength: (path) => this.store.opacityFor(path),
            stale: this.settings.staleTabs ? this.settings.staleTabAfter : null,
            staleMark: this.settings.staleTabMark
        });
    }

    async loadSettings(): Promise<void> {
        this.settings = parseSettings(await this.loadData());
        this.pins.load(this.settings.pins, this.app);
    }

    /**
     * Opens the history in the right sidebar and reveals it, reusing the leaf
     * if one is already open rather than stacking a second copy.
     */
    private async openBeadView(): Promise<void> {
        const existing = this.app.workspace.getLeavesOfType(BEAD_VIEW_TYPE);
        const leaf = existing[0] ?? this.app.workspace.getRightLeaf(false);

        if (!leaf) {
            return;
        }

        if (existing.length === 0) {
            await leaf.setViewState({ type: BEAD_VIEW_TYPE, active: true });
        }

        await this.app.workspace.revealLeaf(leaf);
        this.refreshBeadViews();
    }

    /**
     * Redraws every open history view against the note being looked at.
     *
     * The active file rather than each view's own leaf, because the view is a
     * readout of what you are doing: a sidebar panel has no file of its own and
     * the question it answers is always about the note in front of you.
     */
    private refreshBeadViews(): void {
        const views = this.app.workspace.getLeavesOfType(BEAD_VIEW_TYPE);

        if (views.length === 0) {
            return;
        }

        const file = this.app.workspace.getActiveFile() ?? fileOf(this.app.workspace.getMostRecentLeaf());
        const path = file && file.extension === 'md' ? file.path : null;

        for (const leaf of views) {
            const view = leaf.view;

            if (view instanceof BeadView) {
                view.render(path, path === null ? null : (file?.basename ?? path));
            }
        }
    }

    /** Sorted pinned paths, for the settings tab. */
    pinnedNotes(): string[] {
        return this.pins.list();
    }

    /**
     * Pins or unpins one note, and says which way it went.
     *
     * The notice is worth it. The graph may not be open, the pin may be on a
     * note that is off screen, and a hotkey that appears to do nothing is one
     * nobody presses a second time.
     */
    async togglePin(path: string): Promise<void> {
        // A settings tab or a menu left over from before a reload; the pins
        // are the live instance's now.
        if (this.unloaded) {
            return;
        }

        const pinned = this.pins.toggle(path);

        new Notice(pinned
            ? 'Pinned. This note stays bright in the graph.'
            : 'Unpinned. This note fades with the rest again.');

        await this.saveSettings();
    }

    async unpin(path: string): Promise<void> {
        if (this.unloaded) {
            return;
        }

        this.pins.remove(path);
        await this.saveSettings();
    }

    async unpinAll(): Promise<void> {
        if (this.unloaded) {
            return;
        }

        this.pins.clear();
        await this.saveSettings();
    }

    /**
     * Every open editor, for the one feature that lives inside them.
     *
     * A leaf whose view has not been built yet has no editor to reach, and
     * Obsidian defers building one until its tab is looked at, so this is
     * whatever is actually open rather than every note in the vault.
     */
    private editors(): EditorView[] {
        const open: EditorView[] = [];

        this.app.workspace.iterateAllLeaves((leaf) => {
            const editor = (leaf.view as { editor?: { cm?: EditorView } }).editor?.cm;

            if (editor) {
                open.push(editor);
            }
        });

        return open;
    }

    /** Cools everything at once, from the command or the settings button. */
    forgetInk(): void {
        forgetInk(this.editors());
        this.updateStatusBar();
    }

    private syncInk(): void {
        setInkColours({
            '--pulsar-ink': this.settings.inkColor,
            '--pulsar-ink-pin': this.settings.inkPinColor,
            '--pulsar-ink-dim': `${Math.round((1 - this.settings.inkDim) * 100)}%`
        }, this.editors());

        setInkOptions({
            enabled: this.settings.ink,
            minutes: this.settings.inkMinutes,
            mode: this.settings.inkMode
        }, this.editors());

        // After the options, so that switching off clears what is lit while
        // the editors can still be reached.
        this.syncEditorExtensions();
    }

    /**
     * Puts the editor extensions in or takes them out, and only then has
     * Obsidian reconfigure every open editor — which it does by rebuilding each
     * one's configuration, 51 ms in a vault with many notes open, and about as
     * much again of CodeMirror measuring afterwards. Every load used to pay for
     * two of those whether anything needed an editor or not.
     *
     * The array is registered rather than the extensions, because a registered
     * array can still be emptied: Obsidian re-reads it on updateOptions(). It is
     * registered the first time it is needed, since registering is itself a
     * reconfiguration — so a load costs none with fresh writing and link dots
     * off, as they are by default, and one with either on.
     */
    private syncEditorExtensions(): void {
        const wanted: Extension[] = [];

        if (this.running && this.settings.ink) {
            wanted.push(this.inkEditor);
        }

        if (this.running && this.settings.linkDots) {
            wanted.push(this.dotsEditor);
        }

        if (wanted.length === this.editorExtensions.length && wanted.every((extension, index) => extension === this.editorExtensions[index])) {
            return;
        }

        this.editorExtensions.splice(0, this.editorExtensions.length, ...wanted);

        if (!this.editorsRegistered) {
            this.editorsRegistered = true;
            this.registerEditorExtension(this.editorExtensions);
            return;
        }

        this.app.workspace.updateOptions();
    }

    /** Null while link dots are off, which is how every caller knows to stop. */
    private linkDotSource(): LinkDotSource | null {
        return this.running && this.settings.linkDots ? this.linkSource : null;
    }

    /**
     * A linked note as its node is drawn: the global graph's brightness when
     * one is open, so neighbour glow and grouping come through, and the note's
     * own otherwise. A pin is drawn at full strength in its colour, as on the
     * graph and in the tab bar.
     */
    private linkLook(path: string): LinkLook | null {
        const mtime = this.store.mtimeFor(path);

        if (mtime === undefined) {
            return null;
        }

        const pinned = this.pins.has(path);
        const global = [...this.attached.values()].find((graph) => graph.kind === 'global');
        const strength = pinned ? 1 : global?.pooled.byPath?.get(path) ?? this.store.opacityFor(path);

        if (strength === undefined) {
            return null;
        }

        return {
            strength,
            colour: pinned && this.settings.pinMark ? this.settings.pinColor : null,
            age: `Edited ${formatAge(mtime, Date.now())}`
        };
    }

    /**
     * Repaints the dots after a note's age or a pin changed, which typing in
     * the note holding the links would never notice. Switched on, the notes
     * already open in reading view are rendered again so they get theirs.
     */
    private refreshLinkDots(): void {
        this.linkCache.resolved.clear();
        this.linkCache.looks.clear();

        const source = this.linkDotSource();
        const shown = source !== null;

        if (!shown) {
            this.readingDots.clear();
        } else {
            this.readingDots.refresh(source);
            refreshLinkDots(this.editors());
        }

        if (shown && !this.linkDotsShown) {
            this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
                if (leaf.view instanceof MarkdownView && leaf.view.getMode() === 'preview') {
                    leaf.view.previewMode.rerender(true);
                }
            });
        }

        this.linkDotsShown = shown;
    }

    async saveSettings(): Promise<void> {
        // A settings tab left open across a reload belongs to the instance
        // that was unloaded, and saving from it wrote that instance's settings
        // over everything the live one had saved since, pins included.
        if (this.unloaded) {
            return;
        }

        await this.saveData(this.settings);
        await this.syncRunning();

        // Nothing below this is reachable while the plugin is off, and all of
        // it would quietly rebuild the caches that being off just emptied.
        if (!this.running) {
            return;
        }

        this.syncInk();
        this.store.markStale();
        this.store.refresh();
        this.refilter();
        this.syncRenderers();
        this.syncStatusBar();
        this.paintTabs();
        this.refreshBeadViews();
        this.refreshLinkDots();

        for (const graph of this.attached.values()) {
            graph.panel?.refresh();
        }
    }

    /**
     * Shows ranges without committing to them, across every open graph. Used
     * while a handle is being dragged, from the settings dialog as much as from
     * the graph's own panel, since the graph is usually visible behind it.
     */
    previewRanges(ranges: OpacityRange[] | null): void {
        const keeps = this.settings.filterEnabled && ranges ? this.survivorTest(ranges) : null;

        for (const [renderer, graph] of this.attached) {
            graph.preview.keeps = keeps && sparing(keeps, graph.centre());
            repaint(renderer);
        }
    }

    /**
     * What a range is actually selecting, in the units the question was asked
     * in. Drawn under the bar in both places the bar appears.
     *
     * No attempt is made to invert the curve back into a date. Rank has no
     * closed form, the step curve is not injective, and the answer would be
     * about the maths rather than about the vault. Walking the notes and
     * reporting which of them survive is both exact and the more useful thing
     * to know: how many are left, and how old the ends of that stretch are.
     *
     * A hovered column is asked about without the exemptions. The question
     * there is what is in that stretch, and counting the open note and the
     * spotlit ones into every column answered a different one.
     */
    describeRange(ranges: OpacityRange[], exempting = true): string {
        const exempt = exempting ? this.exemptFromFilter() : new Set<string>();
        const summary = summariseRanges(this.store.entries(), (path) => this.filterPosition(path), ranges, exempt);

        return describeSummary(summary, Date.now());
    }

    /**
     * The notes the spotlight is pointing at, out of a given set.
     *
     * The vault passes every note it knows about; a graph measured against
     * itself passes its own. Either way the question — newest few, or anything
     * touched lately — is answered in one place, so the colour, the node sizes,
     * the tab dots and the notes the filter may not remove can never disagree.
     *
     * Pinned notes are passed over rather than competed with. A pin already
     * marks the note permanently, so spending the spotlight on it says nothing
     * new and costs the one note that would have said something.
     */
    private spotlitFrom(paths: Iterable<string>): string[] {
        if (!this.settings.spotlightNewest) {
            return [];
        }

        if (this.settings.spotlightBy === 'window') {
            return this.store.newestSince(paths, Date.now() - this.settings.spotlightMinutes * 60 * 1000, this.pins.all());
        }

        return this.store.newestAmong(paths, this.settings.spotlightCount, this.pins.all());
    }

    /**
     * What a tab's brightness dot is painted, if anything.
     *
     * The same order the graph paints in, for the same reason: a pin is the
     * deliberate statement and the spotlight is the passing one. They rarely
     * collide, because the spotlight is told to skip anything pinned.
     */
    private dotColor(path: string, spotlit: ReadonlySet<string>): string | null {
        if (this.settings.pinMark && this.pins.has(path)) {
            return this.settings.pinColor;
        }

        return spotlit.has(path) ? this.settings.spotlightColor : null;
    }

    /**
     * How far back in the vault's own history a graph is currently showing.
     *
     * Read from the notes being drawn rather than from the animation's counter,
     * which climbs past the number of files in the vault and so is an index
     * into nothing. The newest note on screen is where the replay has reached,
     * by construction: it shows what existed, so nothing newer is there yet.
     *
     * Null once the replay has caught up with the vault, which is both the
     * honest answer and the thing that ends the wave.
     */
    private replayReach(renderer: GraphRenderer): number | null {
        const reached = this.store.reachedBy(pathsIn(renderer));

        return reached !== null && reached < this.store.newestCreated() ? reached : null;
    }

    /** Whether a graph writes every age, which a small panel can afford to. */
    private labelMode(kind: GraphKind): AgeMode {
        return kind === 'local' && this.settings.localLabels ? 'titles' : this.settings.ageLabels;
    }

    /**
     * The line across the top of a graph.
     *
     * A local graph always gets one about the panel rather than the vault.
     * The vault line answers a question nobody asks of a panel: "230 of 1100
     * notes" over a local graph showing a single node is true and useless,
     * and it used to be the default, behind a switch for the useful one.
     */
    private captionFor(renderer: GraphRenderer, graph: AttachedGraph, scoped: boolean, anchorPath: string | null): string | null {
        if (!this.settings.filterCaption) {
            return null;
        }

        const measured = this.describeSpread(renderer, scoped, anchorPath);

        if (graph.kind === 'local') {
            return this.describePanel(renderer, graph.cut.dropped) + measured;
        }

        return this.describeRange(this.settings.filterEnabled ? this.settings.filterRanges : [WHOLE_RANGE]) + measured;
    }

    /**
     * What one graph is holding, as against what the vault holds.
     *
     * The count of what the filter took out comes from the filter itself: the
     * nodes are gone before the renderer sees them, so by the time anything can
     * look at the graph there is no way to tell a panel of nine from a panel of
     * thirteen with four hidden.
     */
    private describePanel(renderer: GraphRenderer, dropped: number): string {
        const now = Date.now();
        let notes = 0;
        let newest = 0;
        let oldest = Number.POSITIVE_INFINITY;

        for (const path of pathsIn(renderer)) {
            const mtime = this.store.mtimeFor(path);

            if (mtime === undefined) {
                continue;
            }

            notes++;
            newest = Math.max(newest, mtime);
            oldest = Math.min(oldest, mtime);
        }

        const hidden = dropped > 0 && `${dropped} hidden`;

        if (notes === 0) {
            return dropped > 0 ? joinStats('Nothing left in range', hidden) : 'Nothing here with a date';
        }

        const count = notes === 1 ? 'Just this note' : `${notes} notes`;
        const ages = oldest === newest
            ? formatAge(newest, now)
            : `${formatAge(newest, now)} back to ${formatAge(oldest, now)}`;

        return joinStats(count, hidden, ages);
    }

    /**
     * The trailing half of the caption, saying what the brightnesses on screen
     * were measured against when that is not simply the vault.
     *
     * Worth saying because re-spreading is invisible: a graph whose range has
     * been re-measured across twelve notes looks exactly like a graph, and the
     * gradient means something quite different.
     */
    private describeSpread(renderer: GraphRenderer, scoped: boolean, anchorPath: string | null): string {
        if (anchorPath !== null) {
            const span = this.store.anchorSpan(pathsIn(renderer), anchorPath, this.settings.spreadFloorHours);

            // Null means the panel was too small to measure across and the
            // absolute numbers were kept, so saying otherwise would be wrong.
            if (span !== null) {
                const name = anchorPath.split('/').pop()?.replace(/\.md$/, '') ?? anchorPath;

                return SEPARATOR + joinStats(`around ${name}`, `${formatSpan(span)} either side`);
            }
        }

        if (scoped) {
            return `${SEPARATOR}spread across this panel`;
        }

        return this.settings.normalizeBy === 'shown' ? `${SEPARATOR}spread across what is shown` : '';
    }

    /**
     * The notes a filter is not allowed to take out: the one you have open, the
     * one a local graph is built around, so it cannot go blank under you, the
     * spotlit ones, since a spotlight pointing at a node that is not there says
     * nothing at all, and everything pinned.
     *
     * The open note and a local graph's centre are usually the same note, but
     * not always: a local graph linked to one pane, or left on a note, keeps its
     * centre while you work in another. Sparing only the open note emptied such
     * a graph the moment you looked away from it, whenever the filter kept older
     * notes than the one it was about.
     *
     * Pins have to be in here or the feature defeats itself. The note you
     * pinned is one you have not touched lately — that is why it needed
     * pinning — so it is precisely what an age filter is built to remove, and a
     * pin that vanishes the moment you narrow the range is not a pin.
     */
    private exemptFromFilter(centre: string | null = null): Set<string> {
        const exempt = this.exemptBesidesOpen();
        const open = this.app.workspace.getActiveFile()?.path;

        if (open !== undefined) {
            exempt.add(open);
        }

        if (centre !== null) {
            exempt.add(centre);
        }

        return exempt;
    }

    private exemptBesidesOpen(): Set<string> {
        return new Set<string>([...this.spotlitFrom(this.store.paths()), ...this.pins.list()]);
    }

    /**
     * Whether a note survives the filter without being the open note: inside
     * the ranges, spotlit or pinned. Only a note that fails this is in the
     * graph because it is open, so only opening or leaving one of those can
     * change what the filter keeps.
     */
    private keptWithoutOpen(): (path: string) => boolean {
        const exempt = this.exemptBesidesOpen();
        const ranges = this.settings.filterRanges;

        return (path) => keepsNote(path, this.filterPosition(path), ranges, exempt);
    }

    /**
     * Which notes a set of ranges keeps, as a test built once and asked many
     * times. The exemptions are worked out here rather than per note: finding
     * the spotlit ones sorts the vault, and doing that once per note was what
     * made every readout and every frame of a drag quadratic.
     */
    private survivorTest(ranges: OpacityRange[]): (path: string) => boolean {
        const exempt = this.exemptFromFilter();

        return (path) => keepsNote(path, this.filterPosition(path), ranges, exempt);
    }

    /**
     * Where a note sits on the line the age filter is drawn over: its own
     * brightness, as a fraction of the way from the minimum to the maximum.
     *
     * Not the opacity itself. Alpha is clamped at 1 when drawn and the maximum
     * may go well past it — 3 by default — so measured in opacity every note
     * brighter than 1 sat on the last point of the line, two thirds of the
     * curve at the defaults, impossible to tell apart. Measured along the
     * curve the whole line means something, and a range keeps meaning the
     * same notes when the minimum or maximum moves.
     *
     * A note's own brightness, never the pooled one: whether a note is old
     * should not depend on whether its neighbours are new.
     */
    filterPosition(path: string): number | undefined {
        const opacity = this.store.opacityFor(path);

        if (opacity === undefined) {
            return undefined;
        }

        const span = this.settings.maxOpacity - this.settings.minOpacity;

        return span <= 0 ? 1 : (opacity - this.settings.minOpacity) / span;
    }

    /**
     * How many notes sit at each stretch of the filter's line, for the
     * picture behind its handles. The same quantity the handles select on —
     * the statistics' spread is the pooled brightness, which cluster warmth
     * had folded into a spike of 310 notes that the filter never saw.
     */
    filterSpread(buckets: number): Spread {
        this.store.refresh();

        const columns = Math.max(1, Math.floor(buckets));
        const spread: Spread = { counts: new Array<number>(columns).fill(0), floor: 0, ceiling: 0 };

        for (const [path] of this.store.entries()) {
            const position = this.filterPosition(path);

            if (position === undefined) {
                continue;
            }

            const clamped = Math.min(1, Math.max(0, position));
            spread.counts[Math.min(columns - 1, Math.floor(clamped * columns))]++;

            // Within a hair of either end counts as held there: the curve
            // flattens into its ends, so a note can sit at the floor without
            // being bit-for-bit equal to it.
            if (clamped <= 1e-6) {
                spread.floor++;
            } else if (clamped >= 1 - 1e-6) {
                spread.ceiling++;
            }
        }

        return spread;
    }

    /**
     * Applies a change made in a graph's own panel at once, and writes it down
     * a moment after the last one. A slider reports every step of a drag; each
     * step is a repaint of a millisecond or two, but saving each would be a
     * file written per step.
     */
    private changeFromPanel(change: () => void): void {
        const before = JSON.stringify(this.settings);
        change();

        // Nothing to apply and, more to the point, nothing to save.
        if (JSON.stringify(this.settings) === before) {
            return;
        }

        this.store.markStale();
        this.store.refresh();
        this.syncRenderers();
        this.saveSoon();
    }

    private readonly saveSoon = debounce(() => void this.saveSettings(), 400, true);

    /** Adds the plugin's section to a graph's own control panel, where it has one. */
    private buildPanel(renderer: GraphRenderer, kind: GraphKind, centre: () => string | null, preview: Preview): PulsarPanel | null {
        const controls = controlsFor(this.app, renderer);
        if (!controls) {
            return null;
        }

        return new PulsarPanel(controls, {
            groups: [
                {
                    heading: 'Nodes',
                    controls: [
                        {
                            kind: 'slider',
                            name: 'Dimmest',
                            limits: { lowest: 0, highest: MIN_OPACITY_LIMIT, step: 0.01 },
                            value: () => this.settings.minOpacity,
                            onChange: (value) => this.changeFromPanel(() => {
                                this.settings.minOpacity = value;
                                this.settings.maxOpacity = Math.max(this.settings.maxOpacity, value);
                            })
                        },
                        {
                            kind: 'slider',
                            name: 'Brightest',
                            limits: { lowest: 0.1, highest: 6, step: 0.01 },
                            value: () => this.settings.maxOpacity,
                            onChange: (value) => this.changeFromPanel(() => {
                                this.settings.maxOpacity = value;
                                this.settings.minOpacity = Math.min(this.settings.minOpacity, value);
                            })
                        },
                        {
                            kind: 'dropdown',
                            name: 'Curve',
                            options: FADE_TYPE_LABELS,
                            value: () => this.settings.fadeType,
                            onChange: (value) => this.changeFromPanel(() => {
                                this.settings.fadeType = value as FadeType;
                            })
                        }
                    ]
                },
                {
                    heading: 'Text',
                    controls: [
                        {
                            kind: 'slider',
                            name: 'Title size',
                            limits: TITLE_SCALE_RANGE,
                            value: () => this.settings.titleScale,
                            onChange: (value) => this.changeFromPanel(() => {
                                this.settings.titleScale = value;
                            })
                        },
                        {
                            kind: 'dropdown',
                            name: 'Ages',
                            // Shorter than the settings' wording, which is a
                            // sentence and pushed the name out of a narrow panel.
                            options: { off: 'Never', hover: 'On hover', titles: 'With titles' } satisfies Record<AgeMode, string>,
                            value: () => this.settings.ageLabels,
                            onChange: (value) => this.changeFromPanel(() => {
                                this.settings.ageLabels = value as AgeMode;
                            })
                        }
                    ]
                }
            ],
            // Only where there is a note in the middle to measure from. The
            // global graph gets no row rather than a disabled one, because a
            // control that can never do anything is worse than its absence.
            anchor: kind === 'local'
                ? {
                    enabled: () => this.settings.localAnchor,
                    onToggle: (on) => {
                        this.settings.localAnchor = on;
                        void this.saveSettings();
                    }
                }
                : null,
            unpinned: () => this.pins.size === 0,
            enabled: () => this.settings.filterEnabled,
            ranges: () => this.settings.filterRanges,
            histogram: (buckets) => this.filterSpread(buckets),
            describe: (ranges) => this.describeRange(ranges),
            describeHover: (ranges) => this.describeRange(ranges, false),
            onToggle: (enabled) => {
                this.settings.filterEnabled = enabled;
                void this.saveSettings();
            },
            onPreview: (ranges) => {
                preview.keeps = ranges ? sparing(this.survivorTest(ranges), centre()) : null;

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
     * Adds or removes the status bar items to match the settings. Obsidian has
     * no way to take one back, so each element is held and removed by hand.
     */
    private syncStatusBar(): void {
        if (this.settings.statusBarAge && !this.statusBarEl) {
            this.statusBarEl = this.addStatusBarItem();
        } else if (!this.settings.statusBarAge && this.statusBarEl) {
            this.statusBarEl.remove();
            this.statusBarEl = null;
        }

        if (this.settings.ink && !this.inkItemEl) {
            this.inkItemEl = this.buildInkItem();
        } else if (!this.settings.ink && this.inkItemEl) {
            this.inkItemEl.remove();
            this.inkItemEl = null;
        }

        this.updateStatusBar();
    }

    /**
     * Shows how long ago the open note was modified. Anything that is not a
     * note has no age worth reporting, so the item goes empty rather than
     * showing something misleading about an attachment.
     */
    private updateStatusBar(): void {
        this.updateInkItem();

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
        const worked = sittings > 1 ? `${SEPARATOR}${sittings} sittings` : '';

        element.setText(`Edited ${formatAge(mtime, Date.now())}${worked}`);
    }

    /** The editor of the note in front, if it is one. */
    private activeEditor(): EditorView | null {
        return (this.app.workspace.getActiveViewOfType(MarkdownView) as { editor?: { cm?: EditorView } } | null)?.editor?.cm ?? null;
    }

    /**
     * Fresh writing, as an item of its own: a paint bucket and how many
     * characters of the open note still look lit.
     *
     * It used to be joined onto the age, which left it no spacing of its own
     * and rebuilt it, click handler and all, every time the age was redrawn.
     * Built once, it only has its text changed.
     */
    private buildInkItem(): HTMLElement {
        const item = this.addStatusBarItem();
        item.addClass('mod-clickable', 'pulsar-graph-status-ink');
        setIcon(item.createSpan({ cls: 'pulsar-graph-status-ink-icon' }), 'paint-bucket');
        item.createSpan({ cls: 'pulsar-graph-status-ink-count' });
        item.hide();

        // This note only, because the number is about this note. Cooling every
        // open note is still a command and a button in the settings.
        item.addEventListener('click', () => {
            const editor = this.activeEditor();

            if (editor) {
                coolInk(editor);
            }

            this.updateInkItem();
        });

        item.addEventListener('contextmenu', (event) => {
            event.preventDefault();

            const editor = this.activeEditor();
            if (!editor) {
                return;
            }

            const { lit, pinned } = inkCounts(editor);
            const menu = new Menu();

            menu.addItem((entry) => entry
                .setTitle('Cool this note\'s writing')
                .setIcon('paint-bucket')
                .setDisabled(lit === 0)
                .onClick(() => {
                    coolInk(editor);
                    this.updateInkItem();
                }));

            menu.addItem((entry) => entry
                .setTitle('Unpin this note\'s writing')
                .setIcon('pin-off')
                .setDisabled(pinned === 0)
                .onClick(() => {
                    unpinInk(editor);
                    this.updateInkItem();
                }));

            menu.showAtMouseEvent(event);
        });

        return item;
    }

    /**
     * Only there while something in the open note is lit, so the status bar
     * is not carrying a permanent zero. The pins are counted in the tooltip:
     * they do not cool, so they are not what the number is tracking.
     */
    private updateInkItem(): void {
        const item = this.inkItemEl;
        if (!item) {
            return;
        }

        const editor = this.settings.ink ? this.activeEditor() : null;
        const { lit, pinned } = editor ? inkCounts(editor) : { lit: 0, pinned: 0 };

        if (lit === 0 && pinned === 0) {
            item.hide();
            return;
        }

        const characters = (count: number): string => `${count} ${count === 1 ? 'character' : 'characters'}`;

        // Pins alone leave the bucket and no number, since none of it is cooling.
        item.find('.pulsar-graph-status-ink-count')?.setText(lit > 0 ? String(lit) : '');
        item.setAttr('aria-label', lit > 0
            ? `${characters(lit)} of fresh writing${pinned > 0 ? `, ${pinned} pinned` : ''}. Click to cool this note's writing, right-click for more`
            : `${characters(pinned)} pinned. Right-click to unpin`);
        item.show();
    }

    /**
     * What the current settings are doing to this vault, read from the graph
     * that is open if there is one.
     */
    measureVault(bands?: number): VaultStats {
        this.store.refresh();

        const [first] = this.attached.entries();
        const renderer = first?.[0] ?? null;
        const graph = first?.[1];

        return describeVault(
            this.store,
            this.settings,
            renderer,
            (path) => graph?.pooled.byPath?.get(path) ?? this.store.opacityFor(path),
            this.settings.history ? this.history.coverage() : null,
            bands
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
        // Nothing attaches while the plugin is off or after it has unloaded.
        // Every caller is a timer, an event or a save, and any of them can
        // arrive late.
        if (!this.running) {
            return;
        }

        // Switched off whole, every graph is handed back exactly as the plugin
        // being switched off hands it back. Through releaseGraphs rather than
        // by releasing each one here, because releasing a hook does not unwrite
        // what it wrote: node colour is the only place a graph group's colour
        // lives, so without the rebuild that path does, the graph stays faded
        // under a switch that says it is off.
        if (!this.settings.graphFade) {
            this.releaseGraphs();
            return;
        }

        const open = openGraphs(this.app);
        const live = new Set(open.map(({ renderer }) => renderer));

        for (const [renderer, graph] of this.attached) {
            if (!live.has(renderer)) {
                graph.release();
                this.attached.delete(renderer);
            }
        }

        let joined = false;

        for (const graph of open) {
            if (!this.attached.has(graph.renderer)) {
                this.attached.set(graph.renderer, this.attach(graph));
                joined = true;
            }

            this.applySoon(graph.renderer);
        }

        // A graph builds itself the moment it opens, before this plugin can
        // reach it, so a new one holds every note whatever the filter says.
        // Something used to put that right by accident: every note opened
        // refiltered every graph. Now that a switch only refilters when it
        // has to, a new graph is filtered here, as soon as it is attached —
        // which also covers a graph that was already open when the plugin
        // loaded, left unfiltered until something happened to refresh it.
        if (joined && this.settings.filterEnabled && !isWholeRange(this.settings.filterRanges)) {
            this.refilter();
        }
    }

    /**
     * Filters what the engine hands a renderer, and repaints the graph once
     * Obsidian has reset its colours. The graph is looked up rather than held,
     * because a renderer can be hooked as Obsidian builds it, before there is
     * an attached graph to paint.
     */
    private hookData(renderer: GraphRenderer, cut: { dropped: number }, centre: () => string | null): DataHook | null {
        return hookRendererData(
            renderer,
            () => {
                const graph = this.attached.get(renderer);

                // Obsidian has just rewritten every colour from group data, so
                // the colours being preserved are stale — and every node that
                // was painted still has our tint on it, which is why this
                // takes the renderer.
                if (graph) {
                    forgetPaintedColors(renderer, graph.paint);
                    this.applyTo(renderer);
                }
            },
            (supplied) => filterGraphData(supplied, {
                ranges: this.settings.filterRanges,
                strengthOf: (path) => (this.settings.filterEnabled ? this.filterPosition(path) : undefined),
                keep: this.exemptFromFilter(centre()),
                counted: (dropped) => {
                    cut.dropped = dropped;
                }
            })
        );
    }

    /**
     * Hooks a graph Obsidian is building, so its first build is already
     * filtered. Everything else waits for the graph to be attached, which takes
     * this hook over. Opening the global graph of a 20,000-note vault with a
     * filter keeping 4,168 of them used to build all 20,000 first.
     */
    private hookEarly(renderer: GraphRenderer, onClose: (callback: () => void) => void, centre: () => string | null): void {
        if (!this.running || !this.settings.graphFade || this.attached.has(renderer) || this.early.has(renderer)) {
            return;
        }

        const cut = { dropped: 0 };
        this.early.set(renderer, { data: this.hookData(renderer, cut, centre), cut });

        // A view closed before it was ever attached.
        onClose(() => {
            this.early.get(renderer)?.data?.release();
            this.early.delete(renderer);
        });
    }

    private attach({ renderer, kind, centre, replaying }: OpenGraph): AttachedGraph {
        // Labels, links and nodes all read the same number, so a node lifted by
        // a neighbour carries its date and its links up with it.
        const pooled: { byPath: Map<string, number> | null } = { byPath: null };
        const strengthOf = (path: string): number | undefined => pooled.byPath?.get(path) ?? this.store.opacityFor(path);

        const labels = new AgeLabels(renderer, (path) => this.describeAge(path, strengthOf));
        labels.setMode(this.labelMode(kind));

        const paint = newPaint();
        const links = new LinkShading(renderer, strengthOf, (id) => this.store.mtimeFor(id));
        links.setMode(this.settings.linkRecency);
        links.setTrails(this.settings.sessionTrails
            ? { gapMs: this.settings.sessionGapMinutes * 60 * 1000, rgb: parseHexColor(this.settings.trailColor), strength: this.settings.trailStrength }
            : null);

        // Hooked as Obsidian built it, if this plugin was running then, in
        // which case the hook has filtered every build so far and is kept.
        const early = this.early.get(renderer);
        this.early.delete(renderer);

        const cut = early?.cut ?? { dropped: 0 };
        const data = early ? early.data : this.hookData(renderer, cut, centre);
        const preview: Preview = { keeps: null };
        const fonts: { multiplier?: number } = {};

        // One body for the first install and every re-install after Obsidian
        // rebuilds its graphics. It used to be written out twice, and the copy
        // went stale: a re-installed graph stopped previewing drags and stopped
        // following the node size slider.
        const onFrame = (): void => {
            // The ages are drawn at the size the node implies, so they are
            // rebuilt alongside the titles rather than left behind with them.
            if (syncLabelFonts(renderer, fonts)) {
                labels.clear();
            }

            labels.sync();
            links.sync();
            holdPaintTint(renderer, paint);
            settleReleases(renderer, paint);

            if (preview.keeps) {
                previewFilter(renderer, preview.keeps);
            }
        };

        const panel = this.buildPanel(renderer, kind, centre, preview);
        const controls = controlsFor(this.app, renderer);
        const caption = controls?.parentElement ? new FilterCaption(controls.parentElement) : null;

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

        const graph: AttachedGraph = {
            kind,
            centre,
            replaying,
            labels,
            links,
            pooled,
            frames: hookRendererFrame(renderer, onFrame),
            onFrame,
            data,
            panel,
            preview,
            cut,
            paint,
            caption,
            release: () => {
                caption?.destroy();
                clearSizes(renderer);
                data?.release();
                releaseHover();
                // Whichever hook is current, not the one installed here: after
                // a graphics rebuild those differ, and releasing only the first
                // left the second running for the life of the graph.
                graph.frames?.release();
                labels.destroy();
                links.destroy();
                panel?.destroy();
                clearPaint(renderer, paint);
                repaint(renderer);
            }
        };

        return graph;
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

    /**
     * A note's place on the fade curve, 0 to 1, recovered from the opacity it
     * was drawn at.
     *
     * Size cannot read the drawn opacity directly. Alpha above 1 is clamped
     * when drawn, so a maximum opacity above 1 flattens the top of the curve —
     * with it at 3, two thirds of the curve reads as "1" and every note in it
     * would come out the same size. Undoing the min and max puts the shape
     * back, since opacity is exactly `min + fade * (max - min)`.
     */
    private shapedStrength(path: string, pooled: Map<string, number> | null): number | undefined {
        const value = pooled?.get(path) ?? this.store.opacityFor(path);

        if (value === undefined) {
            return undefined;
        }

        const span = this.settings.maxOpacity - this.settings.minOpacity;
        return span <= 0 ? 1 : (value - this.settings.minOpacity) / span;
    }

    /**
     * Repaints a graph at the end of what is running now rather than at once.
     * A note switch asks as the active leaf changes, and then Obsidian rebuilds
     * the graph around the note just opened, which wipes the paint and asks
     * again — two full passes, 27 ms each at 20,000 notes, the first of which
     * was never drawn. A microtask still runs before anything is, and a repaint
     * in the meantime settles what is owed.
     */
    private applySoon(renderer: GraphRenderer): void {
        if (this.owed.has(renderer)) {
            return;
        }

        this.owed.add(renderer);
        queueMicrotask(() => {
            if (this.owed.delete(renderer)) {
                this.applyTo(renderer);
            }
        });
    }

    private applyTo(renderer: GraphRenderer): void {
        this.owed.delete(renderer);

        const graph = this.attached.get(renderer);
        if (!graph) {
            return;
        }

        // What this graph's brightness is measured against. Only a local graph
        // has the choice: the global graph is showing the vault, so measuring
        // it against the vault and against itself are the same thing.
        const scoped = graph.kind === 'local' && this.settings.localScope === 'graph';

        // Only a graph with a centre can be measured from one. Read fresh,
        // because a local graph follows the active note and the note in the
        // middle is whichever one it is pointing at now.
        const anchorPath = graph.kind === 'local' && this.settings.localAnchor ? graph.centre() : null;

        // Where the graph's own replay has got to, or null when it is not
        // replaying. Two conditions, because the animation's counter never
        // returns to zero once started: it has to have been started, and the
        // notes on screen have to still be short of the vault's newest. The
        // second is also what ends the wave — once everything is drawn there is
        // nothing left to reach, and the graph goes back to reading today.
        const replayAt = this.settings.replay && graph.replaying() ? this.replayReach(renderer) : null;

        // Not only while something is hidden. The line answers "what am I
        // looking at", which is a question a graph raises whether or not a
        // filter is on.
        graph.caption?.set(this.captionFor(renderer, graph, scoped, anchorPath));

        // Obsidian assigns a new render callback whenever it rebuilds a
        // graph's graphics, which drops the wrapper the labels are driven by.
        // The old hook is released first: if it was displaced by something
        // wrapping on top rather than by a rebuild, it is still in the chain
        // and would otherwise run every frame twice.
        if (!graph.frames?.isInstalled()) {
            graph.frames?.release();
            graph.frames = hookRendererFrame(renderer, graph.onFrame);
        }

        if (graph.labels.setTitleScale(this.settings.titleScale)) {
            // The size is baked into each label when it is built, so they have
            // to go and be made again rather than be adjusted in place.
            graph.labels.clear();
        }

        graph.labels.setMode(this.labelMode(graph.kind));
        graph.links.setMode(this.settings.linkRecency);
        graph.links.setTrails(this.settings.sessionTrails
            ? { gapMs: this.settings.sessionGapMinutes * 60 * 1000, rgb: parseHexColor(this.settings.trailColor), strength: this.settings.trailStrength }
            : null);

        this.store.refresh();

        // Chosen once and read twice: the colour and the size bonus have to
        // land on the same notes, and a local graph measured against itself
        // picks a different set from the vault's newest.
        const spotlit = this.spotlitFrom(scoped ? pathsIn(renderer) : this.store.paths());

        graph.pooled.byPath = applyOpacity(renderer, this.store, {
            spotlit,
            spotlightRgb: parseHexColor(this.settings.spotlightColor),
            spotlightStrength: this.settings.spotlightStrength,
            pinned: this.pins.all(),
            pinOpacity: this.settings.maxOpacity,
            pinMark: this.settings.pinMark,
            pinRgb: parseHexColor(this.settings.pinColor),
            pinStrength: this.settings.pinStrength,
            paint: graph.paint,
            neighbourBleed: this.settings.neighbourBleed,
            neighbourHops: this.settings.neighbourHops,
            clusterWarmth: this.settings.clusterWarmth,
            clusterBy: this.settings.clusterBy,
            adaptive: this.settings.normalizeBy === 'shown' || scoped,
            anchorPath,
            replayAt,
            replayTrailDays: this.settings.replayTrailDays,
            spreadFloorHours: this.settings.spreadFloorHours
        });

        applySizes(renderer, {
            spotlit: new Set(spotlit),
            spotlightSize: this.settings.spotlightSize,
            byAge: this.settings.nodeSizeByAge,
            smallest: this.settings.nodeSizeSmallest,
            largest: this.settings.nodeSizeLargest,
            titleScale: this.settings.titleScale,
            strengthOf: (path) => this.shapedStrength(path, graph.pooled.byPath)
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
