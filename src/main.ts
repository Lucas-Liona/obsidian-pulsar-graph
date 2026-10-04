import { Plugin, TFile } from 'obsidian';
import { applyOpacity, countGraphLeaves, getGraphRenderers } from './graph';
import { OpacityStore } from './opacity-store';
import { DEFAULT_SETTINGS, PulsarGraphSettings, PulsarSettingTab, parseSettings } from './settings';

const UPDATE_INTERVAL_MS = 1000;

export default class PulsarGraphPlugin extends Plugin {
    settings: PulsarGraphSettings = DEFAULT_SETTINGS;

    private readonly store = new OpacityStore(() => this.settings);

    private graphsOpen = false;
    private updateInterval: number | null = null;

    async onload(): Promise<void> {
        await this.loadSettings();
        this.addSettingTab(new PulsarSettingTab(this.app, this));

        this.store.build(this.app.vault.getMarkdownFiles());

        this.registerEvent(this.app.vault.on('create', (file) => {
            if (file instanceof TFile) {
                this.store.recordChange(file);
            }
        }));

        this.registerEvent(this.app.vault.on('modify', (file) => {
            if (file instanceof TFile) {
                this.store.recordChange(file);
            }
        }));

        this.registerEvent(this.app.vault.on('delete', (file) => {
            if (file instanceof TFile) {
                this.store.recordDelete(file);
            }
        }));

        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
            if (file instanceof TFile) {
                this.store.forget(oldPath);
                this.store.recordChange(file);
            }
        }));

        // Polling only runs while a graph is on screen, so track when that changes.
        this.registerEvent(this.app.workspace.on('layout-change', () => this.syncPolling()));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.syncPolling()));
        this.app.workspace.onLayoutReady(() => this.syncPolling());
    }

    onunload(): void {
        this.stopPolling();
    }

    async loadSettings(): Promise<void> {
        this.settings = parseSettings(await this.loadData());
    }

    async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        this.store.markStale();
    }

    private syncPolling(): void {
        const graphsOpen = countGraphLeaves(this.app) > 0;
        if (graphsOpen === this.graphsOpen) {
            return;
        }

        this.graphsOpen = graphsOpen;

        if (graphsOpen) {
            this.updateGraphs();
            this.startPolling();
        } else {
            this.stopPolling();
        }
    }

    private startPolling(): void {
        if (this.updateInterval !== null) {
            return;
        }

        // Obsidian resets node colours as it refreshes graph data, so opacity
        // has to be reapplied. Polling keeps that out of the render loop.
        this.updateInterval = window.setInterval(() => this.updateGraphs(), UPDATE_INTERVAL_MS);
        this.registerInterval(this.updateInterval);
    }

    private stopPolling(): void {
        if (this.updateInterval !== null) {
            window.clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    private updateGraphs(): void {
        const renderers = getGraphRenderers(this.app);
        if (renderers.length === 0) {
            return;
        }

        this.store.refresh();

        for (const renderer of renderers) {
            applyOpacity(renderer.nodeLookup, this.store);
            renderer.renderCallback?.();
        }
    }
}
