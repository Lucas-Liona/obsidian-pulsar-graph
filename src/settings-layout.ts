import { Setting } from 'obsidian';

/**
 * A collapsible container in the settings tab, with an optional switch on its
 * own header.
 *
 * Obsidian's `setHeading()` draws a bold line and nothing else: it marks a
 * place in a list rather than holding anything, so fifteen of them down one
 * page are fifteen things of equal weight and no structure at all. These hold
 * their contents, so a page can have a handful of parts instead.
 *
 * The switch belongs on the header rather than inside, because "turn this whole
 * thing off" is a different kind of statement from the settings it governs, and
 * a row among rows reads as one of them.
 */
export interface ContainerOptions {
    /** A one-line answer to "what is this part of the page for". */
    about: string;
    /** The switch on the header, for a part that can be turned off whole. */
    power?: { enabled: () => boolean; onToggle: (on: boolean) => void };
}

export class SettingsPage {
    constructor(
        private readonly containerEl: HTMLElement,
        private readonly collapsed: Set<string>,
        private readonly remember: (collapsed: string[]) => void
    ) {}

    /**
     * Opens a container and returns the element its contents go into.
     *
     * Returns null when the container is collapsed or switched off, so a caller
     * can skip building what nobody is going to see — the settings tab is
     * rebuilt on every change, and the parts of it are not free.
     */
    container(name: string, options: ContainerOptions): HTMLElement | null {
        const section = this.containerEl.createDiv({ cls: 'pulsar-graph-section' });
        const header = section.createDiv({ cls: 'pulsar-graph-section-header' });

        const shut = this.collapsed.has(name);
        section.toggleClass('is-collapsed', shut);

        const title = header.createDiv({ cls: 'pulsar-graph-section-title' });
        title.createDiv({ cls: 'pulsar-graph-section-chevron' });
        title.createDiv({ cls: 'pulsar-graph-section-name', text: name });

        title.addEventListener('click', () => {
            const nowShut = !this.collapsed.has(name);

            if (nowShut) {
                this.collapsed.add(name);
            } else {
                this.collapsed.delete(name);
            }

            section.toggleClass('is-collapsed', nowShut);
            this.remember([...this.collapsed]);
        });

        const power = options.power;

        if (power) {
            // Built with Setting so it is the same control as every other
            // toggle on the page, then moved onto the header.
            const control = new Setting(header).addToggle((toggle) => toggle
                .setValue(power.enabled())
                .onChange((value) => power.onToggle(value))
            );

            control.settingEl.addClass('pulsar-graph-section-power');
            control.infoEl.remove();
        }

        const body = section.createDiv({ cls: 'pulsar-graph-section-body' });
        body.createDiv({ cls: 'pulsar-graph-section-about', text: options.about });

        if (shut) {
            return null;
        }

        if (power && !power.enabled()) {
            body.createDiv({
                cls: 'pulsar-graph-section-off',
                text: 'Switched off. Nothing in here is running.'
            });

            return null;
        }

        return body;
    }
}
