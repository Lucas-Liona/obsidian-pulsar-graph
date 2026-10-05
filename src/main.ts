import { debounce, Plugin, TAbstractFile, TFile } from 'obsidian';
import { formatAge } from './age';
import { AgeLabels, AgeText } from './age-label';
import { applyOpacity, clearSpotlight, forgetSpotlightColor, FrameHook, getGraphRenderers, GraphRenderer, holdSpotlightTint, hookRendererData, hookRendererFrame, repaint, SpotlightState, Unhook } from './graph';
import { hookNodeHover } from './hover';
import { OpacityStore } from './opacity-store';
import { DEFAULT_SETTINGS, PulsarGraphSettings, PulsarSettingTab, parseSettings } from './settings';

/** Everything this plugin owns for one open graph view. */
interface AttachedGraph {
    release: Unhook;
    labels: AgeLabels;
    /** Kept so it can be re-installed when Obsidian rebuilds its graphics. */
    frames: FrameHook | null;
    spotlight: SpotlightState;
}

/** Coalesces the burst of modify events Obsidian fires while a note is typed. */
const UPDATE_DELAY_MS = 150;

export default class PulsarGraphPlugin extends Plugin {
    settings: PulsarGraphSettings = DEFAULT_SETTINGS;

    private readonly store = new OpacityStore(() => this.settings);
    private readonly attached = new Map<GraphRenderer, AttachedGraph>();

    private readonly updateSoon = debounce(() => this.syncRenderers(), UPDATE_DELAY_MS, true);

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new PulsarSettingTab(this.app, this));

        this.store.build(this.app.vault.getMarkdownFiles());

        this.registerEvent(this.app.vault.on('create', (file) => this.onFileChanged(file)));
        this.registerEvent(this.app.vault.on('modify', (file) => this.onFileChanged(file)));

        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (isNote(file)) {
                this.store.recordDelete(file);
                this.updateSoon();
            }
        }));

        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            this.store.forget(oldPath);
            this.onFileChanged(file);
        }));

        // Graph views come and go, and each brings its own renderer to hook.
        this.registerEvent(this.app.workspace.on('layout-change', () => this.syncRenderers()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncRenderers()));
        this.app.workspace.onLayoutReady(() => this.syncRenderers());
    }

    onunload(): void {
        for (const graph of this.attached.values()) {
            graph.release();
        }
        this.attached.clear();
    }

    async loadSettings(): Promise<void> {
        this.settings = parseSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.store.markStale();
        this.syncRenderers();
    }

    private onFileChanged(file: TAbstractFile): void {
        if (!isNote(file)) {
            return;
        }

        this.store.recordChange(file);
        this.updateSoon();
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
        const labels = new AgeLabels(renderer, (path) => this.describeAge(path));
        labels.setMode(this.settings.ageLabels);

        const spotlight: SpotlightState = {};

        const releaseData = hookRendererData(renderer, () => {
            // Obsidian has just rewritten every colour from group data, so the
            // colour the spotlight was preserving is stale.
            forgetSpotlightColor(spotlight);
            this.applyTo(renderer);
        });
        const frames = hookRendererFrame(renderer, () => {
            labels.sync();
            holdSpotlightTint(renderer, spotlight);
        });

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
            frames,
            spotlight,
            release: () => {
                releaseData?.();
                releaseHover();
                frames?.release();
                labels.destroy();
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
    private describeAge(path: string): AgeText | undefined {
        const mtime = this.store.mtimeFor(path);
        if (mtime === undefined) {
            return undefined;
        }

        const opacity = this.store.opacityFor(path) ?? this.store.cacheOpacityFor(path, mtime);

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
                holdSpotlightTint(renderer, graph.spotlight);
            });
        }

        graph.labels.setMode(this.settings.ageLabels);

        this.store.refresh();
        applyOpacity(renderer, this.store, {
            spotlightNewest: this.settings.spotlightNewest,
            spotlightRgb: parseHexColor(this.settings.spotlightColor),
            spotlightStrength: this.settings.spotlightStrength,
            spotlight: graph.spotlight
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
