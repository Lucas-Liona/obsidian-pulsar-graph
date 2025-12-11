import { App, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

const MS_PER_UPDATE = 1 * 1000; // 1 second

// Obsidian's internal graph types (undocumented)
interface GraphNode {
    color?: {
        a: number;
        rgb: number;
    };
}

interface GraphNodeLookup {
    [path: string]: GraphNode;
}

interface GraphRenderer {
    nodeLookup: GraphNodeLookup;
    renderCallback?: () => void;
}

interface GraphView {
    renderer?: GraphRenderer;
}

interface PulsarGraphSettings {
    fadeType: string;
    minOpacity: number;
    maxOpacity: number;
    steepness: number;
    numSteps: number;
}

const DEFAULT_SETTINGS: PulsarGraphSettings = {
    fadeType: 'Linear',
    minOpacity: 0.1,
    maxOpacity: 3.0,
    steepness: 2.0,
    numSteps: 5.0
}

export default class PulsarGraphPlugin extends Plugin {
    settings: PulsarGraphSettings;

    // Cache (path -> mtime)
    private mtimeCache: Map<string, number> = new Map(); // I will keep this for node age with hover or just ot cache other recalculations? like if I change from exponential to linear I can apply a base transform to this map instead of rereading vault
    // maybe I really want a Map<string, vector<number, number>> (or tuple) for path: (mtime, opacity) or just regular 2 Maps for mtime and opacity : 2 x Map<string, number>
    private opacityCache: Map<string, number> = new Map();
    private opacityCacheDirty = true;

    private oldestMtime: number = Date.now()
    private newestMtime = 0;

    // Track if graph views exist to control polling
    private hasGraphViews = false;
    private updateInterval: number | null = null;

    // This deserves a blog post or something, even Claude Pro with Sonnet 4.5 thinking was going to give me a terrible caching algorithm that ran worse than what I already had!!! Always check AI
    // It was gonna have me do a vault scan every update, and then on top of that every 60 seconds scan the vault and cache the first and last notes created.

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new PulsarSettingTab(this.app, this));

        // Here I will add cacheing, I think I will do hotnote (last edited) as a setting as well
        // I think docs say you should wait until the app/vault is ready to do stufF?
        // A good way to check the runtime of my plugin is to type a common letter like 'a' into the search filter, cacheing would help here I want to record the difference
        // I also want link opacity probably, and text opacity
        // Plugin ruins animation too!

        // It will be a setting option to normalize to newest, or normalize to now.    The first would be determinant, always the same, and the second your whole vault would be darker if you came back to it after a while
        await this.buildCache();

        this.registerEvent(
            this.app.vault.on('create', (file) => {
                if (file instanceof TFile) {
                    this.onFileChange(file);
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile) {
                    this.onFileChange(file);
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('delete', (file) => {
                if (file instanceof TFile) {
                    this.onFileDelete(file);
                }
            })
        );
        
        this.registerEvent(
            this.app.vault.on('rename', (file, oldPath) => {
                if (file instanceof TFile) {
                    this.mtimeCache.delete(oldPath);
                    this.onFileChange(file);
                }
            })
        );

        // Listen for layout changes to start/stop polling based on graph view presence
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.checkGraphViews();
            })
        );

        // Also check on active leaf change
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.checkGraphViews();
            })
        );

        // Initial check for any existing graph views
        this.app.workspace.onLayoutReady(() => {
            this.checkGraphViews();
        });
    }

    private async buildCache(): Promise<void> {
        console.log('Building Cache...');
        const files = this.app.vault.getMarkdownFiles();

        let oldest = Date.now();
        let newest = 0;

        for (const file of files) {
            const mtime = file.stat.mtime;
            this.mtimeCache.set(file.path, mtime);

            if (mtime < oldest) oldest = mtime;
            if (mtime > newest) newest = mtime;
        }

        this.oldestMtime = oldest;
        this.newestMtime = newest;

        console.log(`Pulsar: Cached ${files.length} files`);
    }

    private onFileChange(file: TFile): void {
        const mtime = file.stat.mtime;
        this.mtimeCache.set(file.path, mtime);
        
        const oldOldest = this.oldestMtime;
        const oldNewest = this.newestMtime;

        if (mtime < this.oldestMtime) {
            this.oldestMtime = mtime;
        if (mtime > this.newestMtime) {
            this.newestMtime = mtime;
            }
        }
        
        // Only rebuild cache if oldest or newest was changed (changes opacity calcuation for all nodes)
        if (this.oldestMtime !== oldOldest || this.newestMtime !== oldNewest) {
          this.opacityCacheDirty = true;
        }

        // If dirty flag NOT set, we can do incremental update
        if (!this.opacityCacheDirty) {
            this.opacityCache.set(file.path, this.calculateOpacity(mtime));
        }
    }

    private onFileDelete(file: TFile): void {
        const deletedMtime = this.mtimeCache.get(file.path);
        this.mtimeCache.delete(file.path);
        
        // Only recalculate if we deleted the oldest or newest
        if (deletedMtime === this.oldestMtime || deletedMtime === this.newestMtime) {
            this.recalculateMinMax();
            this.opacityCacheDirty = true;
        }
    }

    private recalculateMinMax(): void {
        if (this.mtimeCache.size === 0) {
            this.oldestMtime = Date.now();
            this.newestMtime = 0;
            return;
        }
        
        let oldest = Date.now();
        let newest = 0;
        
        for (const mtime of this.mtimeCache.values()) {
            if (mtime < oldest) oldest = mtime;
            if (mtime > newest) newest = mtime;
        }
        
        this.oldestMtime = oldest;
        this.newestMtime = newest;
    }

    private calculateOpacity(mtime: number): number {
        const { fadeType, minOpacity, maxOpacity } = this.settings;
        
        const timeRange = this.newestMtime - this.oldestMtime;
        if (timeRange === 0) return maxOpacity;
        
        const normalized = (mtime - this.oldestMtime) / timeRange;
        
        let fadeFactor: number;
        switch (fadeType) {
            case 'Linear':
                fadeFactor = normalized;
                break;
            case 'Exponential':
                fadeFactor = Math.pow(normalized, this.settings.steepness);
                break;
            case 'Step':
                fadeFactor = Math.round(normalized * (this.settings.numSteps-1)) / this.settings.numSteps; // suspicious if this works
                break;
            default:
                fadeFactor = normalized;
        }
        
        return minOpacity + (fadeFactor * (maxOpacity - minOpacity));
    }

    private checkGraphViews(): void {
        const globalGraphs = this.app.workspace.getLeavesOfType('graph');
        const localGraphs = this.app.workspace.getLeavesOfType('localgraph');
        const hasGraphs = globalGraphs.length + localGraphs.length > 0;

        // Start polling if any graph exists and we're not already polling
        if (hasGraphs && !this.hasGraphViews) {
            this.hasGraphViews = true;
            this.startPolling();
        }
        // Stop polling if no graphs exist
        else if (!hasGraphs && this.hasGraphViews) {
            this.hasGraphViews = false;
            this.stopPolling();
        }
    }

    private startPolling(): void {
        if (this.updateInterval !== null) return;

        // Poll every 1 second - stays out of render loop entirely
        this.updateInterval = window.setInterval(() => {
            this.updateGraphs();
        }, MS_PER_UPDATE);
    }

    private stopPolling(): void {
        if (this.updateInterval !== null) {
            window.clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    private updateGraphs(): void {
        const globalLeaves = this.app.workspace.getLeavesOfType('graph');
        const localLeaves = this.app.workspace.getLeavesOfType('localgraph');
        const allLeaves = [...globalLeaves, ...localLeaves];

        if (allLeaves.length === 0) return;

        allLeaves.forEach(leaf => {
            const view = leaf.view as GraphView;
            const renderer = view?.renderer;

            if (!renderer?.nodeLookup) return;

            // Apply opacity to all nodes
            this.applyOpacityToNodes(renderer.nodeLookup);

            // Trigger re-render
            if (renderer.renderCallback) {
                renderer.renderCallback();
            }
        });
    }

    private applyOpacityToNodes(nodeLookup: GraphNodeLookup): void {
        if (!nodeLookup) return;

        // Rebuild entire cache if dirty
        if (this.opacityCacheDirty) {
            this.rebuildOpacityCache();
            this.opacityCacheDirty = false;
        }

        for (const [path, node] of Object.entries(nodeLookup)) {
            const mtime = this.mtimeCache.get(path);
            if (mtime === undefined) continue;

            const graphNode = node as GraphNode;

            // Get existing color RGB, or use default for ungrouped nodes
            const currentColorRgb = graphNode.color?.rgb ?? 16777215; // Default to white (0xFFFFFF)

            let opacity = this.opacityCache.get(path);

            if (opacity === undefined) {
              // New file we haven't seen yet
              const mtime = this.mtimeCache.get(path);
              if (mtime !== undefined) {
                  opacity = this.calculateOpacity(mtime);
                  this.opacityCache.set(path, opacity);
              }
              continue;
          }

            graphNode.color = {
                a: opacity,
                rgb: currentColorRgb
            };
        }
    }

    private rebuildOpacityCache(): void {
        this.opacityCache.clear();
        for (const [path, mtime] of this.mtimeCache) {
            this.opacityCache.set(path, this.calculateOpacity(mtime));
        }
    }

    onunload() {
        // Stop polling when plugin unloads
        this.stopPolling();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.opacityCacheDirty = true;
    }
}

class PulsarSettingTab extends PluginSettingTab {
    plugin: PulsarGraphPlugin;
    
    constructor(app: App, plugin: PulsarGraphPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }
    
    display(): void {
        const { containerEl } = this;
        
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Pulsar Graph Settings' });
        
        new Setting(containerEl)
        .setName('Fade Type')
            .setDesc('Choose the function that determines how Opacity is calculated')
            .addDropdown(drop => drop
                .addOption('Linear', 'Linear')
                .addOption('Exponential', 'Exponential')
                .addOption('Step', 'Step')
                .setValue(this.plugin.settings.fadeType)
                .onChange(async (value) => {
                    this.plugin.settings.fadeType = value;
                    await this.plugin.saveSettings();
                    this.display();
                })
            )

            new Setting(containerEl)
            .setName('Minimum Opacity')
            .setDesc('Opacity for oldest notes (0.0 to 1.0)')
            .addText(text => text
                .setPlaceholder('0.2')
                .setValue(String(this.plugin.settings.minOpacity))
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num >= 0 && num <= 1) {
                        this.plugin.settings.minOpacity = num;
                        await this.plugin.saveSettings();
                    }
                })
            );
            
        new Setting(containerEl)
        .setName('Maximum Opacity')
        .setDesc('Opacity for newest notes (0.0 to 12.0)')
            .addText(text => text
                .setPlaceholder('1.0')
                .setValue(String(this.plugin.settings.maxOpacity))
                .setValue(String(this.plugin.settings.maxOpacity))
                .onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!isNaN(num) && num >= 0 && num <= 12) {
                        this.plugin.settings.maxOpacity = num;
                        await this.plugin.saveSettings();
                        }
                    })
            );

        switch (this.plugin.settings.fadeType) {
            case 'Exponential':
                new Setting(containerEl)
                    .setName('Steepness')
                    .setDesc('Controls curve steepness (1.0 = linear, >1 = convex, <1 = concave)')
                    .addSlider(slider => slider
                        .setLimits(0.1, 10.0, 0.1)
                        .setValue(this.plugin.settings.steepness)
                        .setDynamicTooltip()
                        .onChange(async (value) => {
                            this.plugin.settings.steepness = value;
                            await this.plugin.saveSettings();
                        })
                    );
                break;
            case 'Step':
                new Setting(containerEl)
                .setName('Number of Steps')
                .setDesc('Controls the number of different possible opacities')
                .addSlider(slider => slider
                    .setLimits(1, 20, 1)
                    .setValue(this.plugin.settings.numSteps)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.numSteps = value;
                        await this.plugin.saveSettings();
                    })
                );

        }
    }
}