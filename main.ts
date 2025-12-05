import { App, DropdownComponent, Editor, MarkdownView, Modal, Notice, NumberValue, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
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

		// Wait a bit for graph to exist, then update
		this.registerInterval(
			window.setInterval(() => this.updateGraph(), 1000)
		);
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

	private updateGraph(): void {
		const leaves = this.app.workspace.getLeavesOfType('graph');
		if (leaves.length === 0) return;

		leaves.forEach(leaf => {
			const view = (leaf.view as any);

			// Check if renderer exists
			if (!view?.renderer?.nodeLookup) {
				return;
			}

			console.log('Pulsar Graph: Found graph, altering opacity');

			const nodeLookup = view.renderer.nodeLookup;

            for (const [path, node] of Object.entries(nodeLookup)) {
                if (!(node as any).color) continue;
                
                const mtime = this.mtimeCache.get(path);
                if (mtime === undefined) continue;
                
                const currentColorRgb = (node as any).color.rgb;
                if (currentColorRgb === undefined) continue;
                
                const opacity = this.calculateOpacity(mtime);
                
                (node as any).color = {
                    a: opacity,
                    rgb: currentColorRgb
                };
			}
			// Trigger re-render
			if (view.renderer.renderCallback) {
				view.renderer.renderCallback();
			}
		});
	}

	onunload() {

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
                        .setLimits(0.1, 5.0, 0.1)
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