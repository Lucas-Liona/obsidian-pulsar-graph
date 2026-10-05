import { debounce, Plugin, TAbstractFile, TFile } from 'obsidian';
import { formatAge } from './age';
import { applyOpacity, getGraphRenderers, GraphRenderer, hookRendererData, repaint, SpotlightState, Unhook } from './graph';
import { AgeLabel, hookNodeHover } from './hover';
import { OpacityStore } from './opacity-store';
import { DEFAULT_SETTINGS, PulsarGraphSettings, PulsarSettingTab, parseSettings } from './settings';

/** Everything this plugin owns for one open graph view. */
interface AttachedGraph {
    release: Unhook;
    label: AgeLabel;
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
        const label = new AgeLabel(renderer);

        const releaseData = hookRendererData(renderer, () => this.applyTo(renderer));
        const releaseHover = hookNodeHover(renderer, {
            onHover: (path) => this.showAge(label, path),
            onUnhover: () => label.hide()
        });

        return {
            label,
            spotlight: {},
            release: () => {
                releaseData?.();
                releaseHover();
                label.destroy();
            }
        };
    }

    /**
     * Nodes exist for attachments and unresolved links too, and those carry no
     * modification time worth showing, so the label stays hidden for them.
     */
    private showAge(label: AgeLabel, path: string): void {
        const mtime = this.settings.showAgeOnHover ? this.store.mtimeFor(path) : undefined;

        if (mtime === undefined) {
            label.hide();
            return;
        }

        label.show(formatAge(mtime, Date.now()));
    }

    private applyTo(renderer: GraphRenderer): void {
        const graph = this.attached.get(renderer);
        if (!graph) {
            return;
        }

        this.store.refresh();
        applyOpacity(renderer, this.store, {
            spotlightNewest: this.settings.spotlightNewest,
            spotlight: graph.spotlight
        });
        repaint(renderer);
    }
}

/**
 * Only notes are graded. Attachments can appear as graph nodes, but their
 * timestamps say nothing about when a note was worked on, and they would
 * stretch the range every opacity is normalized against.
 */
function isNote(file: TAbstractFile): file is TFile {
    return file instanceof TFile && file.extension === 'md';
}
