import { debounce, Plugin, TAbstractFile, TFile } from 'obsidian';
import { applyOpacity, getGraphRenderers, GraphRenderer, hookRendererData, repaint, Unhook } from './graph';
import { OpacityStore } from './opacity-store';
import { DEFAULT_SETTINGS, PulsarGraphSettings, PulsarSettingTab, parseSettings } from './settings';

/** Coalesces the burst of modify events Obsidian fires while a note is typed. */
const UPDATE_DELAY_MS = 150;

export default class PulsarGraphPlugin extends Plugin {
    settings: PulsarGraphSettings = DEFAULT_SETTINGS;

    private readonly store = new OpacityStore(() => this.settings);
    private readonly unhooks = new Map<GraphRenderer, Unhook>();

    private readonly updateSoon = debounce(() => this.updateGraphs(), UPDATE_DELAY_MS, true);

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
        for (const unhook of this.unhooks.values()) {
            unhook();
        }
        this.unhooks.clear();
    }

    async loadSettings(): Promise<void> {
        this.settings = parseSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.store.markStale();
        this.updateGraphs();
    }

    private onFileChanged(file: TAbstractFile): void {
        if (!isNote(file)) {
            return;
        }

        this.store.recordChange(file);
        this.updateSoon();
    }

    /**
     * Hooks renderers that have appeared and releases ones whose view is gone,
     * so no graph keeps a patched setData after its leaf closes.
     */
    private syncRenderers(): void {
        const open = new Set(getGraphRenderers(this.app));

        for (const [renderer, unhook] of this.unhooks) {
            if (!open.has(renderer)) {
                unhook();
                this.unhooks.delete(renderer);
            }
        }

        for (const renderer of open) {
            if (this.unhooks.has(renderer)) {
                continue;
            }

            const unhook = hookRendererData(renderer, () => this.applyTo(renderer));
            if (unhook) {
                this.unhooks.set(renderer, unhook);
            }

            this.applyTo(renderer);
        }
    }

    private updateGraphs(): void {
        for (const renderer of getGraphRenderers(this.app)) {
            this.applyTo(renderer);
        }
    }

    private applyTo(renderer: GraphRenderer): void {
        this.store.refresh();
        applyOpacity(renderer, this.store);
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
