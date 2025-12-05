import { App, DropdownComponent, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';

const MS_PER_DAY = 86400000;

interface MyPluginSettings {
	mySetting: string,
	// fadeType: 'Linear' | 'Exponential' | 'Step';
	fadeType: string
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'Secret',
	fadeType: 'Linear'
}

export default class PulsarGraphPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new SampleSettingTab(this.app, this));

		console.log('Pulsar Graph: Plugin loaded');
        
		// Here I will add cacheing, I think I will do hotnote (last edited) as a setting as well
		// I think docs say you should wait until the app/vault is ready to do stufF?
		// A good way to check the runtime of my plugin is to type a common letter like 'a' into the search filter, cacheing would help here I want to record the difference
		// I also want link opacity probably, and text opacity
		// Plugin ruins animation too!

        // Wait a bit for graph to exist, then update
        this.registerInterval(
			window.setInterval(() => this.updateGraph(), 1000)
        );
	}

	updateGraph() {
        // Get all graph views
        const leaves = this.app.workspace.getLeavesOfType('graph');

		const now = Date.now();
        
        leaves.forEach(leaf => {
            const view = (leaf.view as any);
            
            // Check if renderer exists
            if (!view?.renderer?.nodeLookup) {
                return;
            }
            
            console.log('Pulsar Graph: Found graph, altering opacity');
            
            const nodeLookup = view.renderer.nodeLookup;
            for (const [path, node] of Object.entries(nodeLookup)) {
				const colorBefore = JSON.stringify((node as any).color);
				
				if (!(node as any).color) {
					continue; // or skip these nodes
				}

				const file = this.app.vault.getFileByPath(path);
		

				const currentColorrgb = (node as any).color.rgb;
				if (file && currentColorrgb !== undefined) {
					const opacity = now - file.stat.mtime;

					(node as any).color = {
						a: Math.max(0.1, 1 - 2*(opacity/MS_PER_DAY)/200),
						rgb: currentColorrgb
					};
				}

				

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
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
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
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));

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
				})
			)

			// .addText(text => text
			// 	.setPlaceholder('Choose Fade Type')
			// 	.setValue(this.plugin.settings.fadeType)
			// 	.onChange(async (value) => {
			// 		this.plugin.settings.mySetting = value;
			// 		await this.plugin.saveSettings();
			// 	}));
	}
}
