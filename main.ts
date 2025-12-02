import { randomInt } from 'crypto';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class PulsarGraphPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		console.log('Pulsar Graph: Plugin loaded');
        
        // Wait a bit for graph to exist, then update
        this.registerInterval(
			window.setInterval(() => this.updateGraph(), 1000)
        );
	}

	updateGraph() {
        // Get all graph views
        const leaves = this.app.workspace.getLeavesOfType('graph');
        
        leaves.forEach(leaf => {
            const view = (leaf.view as any);
            
            // Check if renderer exists
            if (!view?.renderer?.nodeLookup) {
                return;
            }
            
            console.log('Pulsar Graph: Found graph, setting opacity to 0.2');
            
            // Set every node to 0.2 opacity
            const nodeLookup = view.renderer.nodeLookup;
            for (const [path, node] of Object.entries(nodeLookup)) {
				const colorBefore = JSON.stringify((node as any).color);
				
				console.log(`Node: ${path}`);
				console.log(`Color before:`, colorBefore);
				console.log(`Has rgb?`, (node as any).color?.rgb !== undefined);
				console.log(`Full node:`, node);

                // (node as any).color = {
                //     a: (randomInt(10)+1)/5,  // random opacity
				// 	rgb: (node as any).color.rgb || 0x6bd385  // preserve color or default green
                // };
				if (!(node as any).color) {
					continue; // or skip these nodes
				}
				
				const currentColor = (node as any).color;
				if (currentColor.rgb !== undefined) {
					currentColor.a = Math.sin(currentColor.rgb + randomInt(5));
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
	}
}
