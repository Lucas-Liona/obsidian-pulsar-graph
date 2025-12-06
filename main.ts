import { App, DropdownComponent, Editor, MarkdownView, Modal, Notice, NumberValue, Plugin, PluginSettingTab, Setting, TFile, debounce } from 'obsidian';
import { text } from 'stream/consumers';

const MS_PER_DAY = 86400000;

interface MyPluginSettings {
	fadeType: string,
	minOpacity: number,
	maxOpacity: number,
	steepness: number
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	fadeType: 'Linear',
	minOpacity: 0.1,
	maxOpacity: 3.0,
	steepness: 2.0
}

export default class PulsarGraphPlugin extends Plugin {
	settings: MyPluginSettings;

	// Cache (path -> mtime)
	private mtimeCache: Map<string, number> = new Map();
	private oldestMtime: number = Date.now()
	private newestMtime: number = 0;

	// Track patched renderers to restore on unload
	private patchedRenderers: Set<any> = new Set();

	// This deserves a blog post or something, even Claude Pro with Sonnet 4.5 thinking was going to give me a terrible caching algorithm that ran worse than what I already had!!! Always check AI
	// It was gonna have me do a vault scan every update, and then on top of that every 60 seconds scan the vault and cache the first and last notes created.

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new SampleSettingTab(this.app, this));

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

		// Listen for layout changes to detect when graph views are opened/closed
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.patchGraphRenderers();
			})
		);

		// Also check on active leaf change
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.patchGraphRenderers();
			})
		);

		// Initial patch for any existing graph views
		this.app.workspace.onLayoutReady(() => {
			this.patchGraphRenderers();
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

		if (mtime < this.oldestMtime) {
			this.oldestMtime = mtime;
		if (mtime > this.newestMtime) {
			this.newestMtime = mtime;
			}
		}
	}

	private onFileDelete(file: TFile): void {
        const deletedMtime = this.mtimeCache.get(file.path);
        this.mtimeCache.delete(file.path);
        
        // Only recalculate if we deleted the oldest or newest
        if (deletedMtime === this.oldestMtime || deletedMtime === this.newestMtime) {
            this.recalculateMinMax();
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
                fadeFactor = Math.round(normalized * 4) / 4;
                break;
            default:
                fadeFactor = normalized;
        }
        
        return minOpacity + (fadeFactor * (maxOpacity - minOpacity));
    }

	private patchGraphRenderers(): void {
		const leaves = this.app.workspace.getLeavesOfType('graph');

		leaves.forEach(leaf => {
			const view = (leaf.view as any);
			const renderer = view?.renderer;

			// Check if renderer exists and isn't already patched
			if (!renderer || this.patchedRenderers.has(renderer)) {
				return;
			}

			// Save the original renderCallback method
			const originalRenderCallback = renderer.renderCallback?.bind(renderer);
			if (!originalRenderCallback) {
				return;
			}

			// Mark as patched
			this.patchedRenderers.add(renderer);

			// Apply opacity immediately on first patch
			this.applyOpacityToNodes(renderer.nodeLookup);

			// Track when we applied immediately to prevent double-processing
			let lastImmediateApplication = Date.now();

			// Create a debounced version of opacity application for this renderer
			// Debounce: executes 50ms after renders stop (responsive feel)
			const debouncedApplyOpacity = debounce(() => {
				this.applyOpacityToNodes(renderer.nodeLookup);
			}, 50);

			// Throttle: prevent execution more than once per 300ms (prevents animation flicker)
			let lastExecutionTime = 0;
			const throttledDebouncedApplyOpacity = () => {
				const now = Date.now();

				// Skip if we just applied immediately (prevents double-processing on load)
				if (now - lastImmediateApplication < 500) {
					return;
				}

				if (now - lastExecutionTime >= 300) {
					lastExecutionTime = now;
					debouncedApplyOpacity();
				}
			};

			// Monkey-patch: wrap the original renderCallback with our opacity application
			renderer.renderCallback = (...args: any[]) => {
				// Let Obsidian render first
				const result = originalRenderCallback(...args);

				// Apply opacity with throttle + debounce (prevents flicker, stays responsive)
				throttledDebouncedApplyOpacity();

				return result;
			};

			// Store reference to original for cleanup
			(renderer as any).__originalRenderCallback = originalRenderCallback;
		});
	}

	private applyOpacityToNodes(nodeLookup: any): void {
		if (!nodeLookup) return;

		for (const [path, node] of Object.entries(nodeLookup)) {
			const mtime = this.mtimeCache.get(path);
			if (mtime === undefined) continue;

			// Get existing color RGB, or use default for ungrouped nodes
			const currentColorRgb = (node as any).color?.rgb ?? 16777215; // Default to white (0xFFFFFF)

			const opacity = this.calculateOpacity(mtime);

			(node as any).color = {
				a: opacity,
				rgb: currentColorRgb
			};
		}
	}

	onunload() {
		// Restore original renderCallback methods for all patched renderers
		this.patchedRenderers.forEach(renderer => {
			if ((renderer as any).__originalRenderCallback) {
				renderer.renderCallback = (renderer as any).__originalRenderCallback;
				delete (renderer as any).__originalRenderCallback;
			}
		});
		this.patchedRenderers.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}


class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: PulsarGraphPlugin;

	constructor(app: App, plugin: PulsarGraphPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: 'Pulsar Graph Settings' });

		// new Setting(containerEl)
		// 	.setName('Setting #1')
		// 	.setDesc('It\'s a secret')
		// 	.addText(text => text
		// 		.setPlaceholder('Enter your secret')
		// 		.setValue(this.plugin.settings.mySetting)
		// 		.onChange(async (value) => {
		// 			this.plugin.settings.mySetting = value;
		// 			await this.plugin.saveSettings();
		// 		}));

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

	
		// new Setting(containerEl)
		// 	.setName('Minimum Opacity')
		// 	.setDesc('Set the minimum opacity (0 may remove nodes)')
		// 	.addText(text => {text
		// 		.inputEl.type = NumberValue}
		// 		.setPlaceholder(0.1)
		// 		.setValue(this.plugin.settings.minOpacity)
		// 		.onChange(async (value) => {
		// 			this.plugin.settings.minOpacity = value;
		// 			await this.plugin.saveSettings();
		// 		}));

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
		}
	}
}