import type { App, Command, EventRef, MarkdownPostProcessor, PluginManifest, PluginSettingTab, ViewCreator } from 'obsidian';
import { FakeElement } from './dom';
import { detach } from './events';

/**
 * The runtime values of 'obsidian' that the plugin extends or calls and whose
 * behaviour a test can see: the component lifecycle, a plugin's data file,
 * notices and debounce. `test/obsidian-stub.ts` re-exports them, so every test
 * gets these and no other.
 *
 * Each follows Obsidian's own, as far as the declarations and AGENTS.md say
 * what that is. Where they do not, the choice is written down beside it.
 */

/** What `onload` returned, so a test can wait for an async one to finish. */
const loading = new WeakMap<object, Promise<void>>();

/** Resolves once a component's `onload` has finished, async or not. */
export function whenLoaded(component: object): Promise<void> {
    return loading.get(component) ?? Promise.resolve();
}

/**
 * Obsidian's `Component`. Loading runs `onload` and then loads every child;
 * unloading takes the children down first, newest first, then runs every
 * registered cleanup, newest first, then `onunload`. A child added to a loaded
 * component is loaded at once.
 */
export class Component {
    private loaded = false;
    private readonly children: Component[] = [];
    private readonly cleanups: Array<() => unknown> = [];

    load(): void {
        if (this.loaded) {
            return;
        }

        this.loaded = true;

        // Obsidian does not wait for an async onload before carrying on,
        // and neither does this; the promise is kept for whenLoaded.
        const result = this.onload();

        if (result instanceof Promise) {
            loading.set(this, result);
        }

        for (const child of [...this.children]) {
            child.load();
        }
    }

    onload(): void | Promise<void> {
        // For subclasses.
    }

    unload(): void {
        if (!this.loaded) {
            return;
        }

        this.loaded = false;

        while (this.children.length > 0) {
            this.children.pop()?.unload();
        }

        while (this.cleanups.length > 0) {
            this.cleanups.pop()?.();
        }

        this.onunload();
    }

    onunload(): void {
        // For subclasses.
    }

    addChild<T extends Component>(component: T): T {
        this.children.push(component);

        if (this.loaded) {
            component.load();
        }

        return component;
    }

    removeChild<T extends Component>(component: T): T {
        const at = this.children.indexOf(component);

        if (at >= 0) {
            this.children.splice(at, 1);
            component.unload();
        }

        return component;
    }

    register(cleanup: () => unknown): void {
        this.cleanups.push(cleanup);
    }

    registerEvent(ref: EventRef): void {
        this.register(() => detach(ref));
    }

    registerInterval(id: number): number {
        this.register(() => window.clearInterval(id));
        return id;
    }

    /** Whether this component is loaded, for checking lifecycles. */
    isLoaded(): boolean {
        return this.loaded;
    }
}

/**
 * Obsidian's `Plugin`. Its data lives in `data.json` in the plugin's folder,
 * written through the vault adapter as Obsidian writes it, so a test reads and
 * corrupts it the same way it reads `history.json`. The rest records what was
 * registered rather than wiring it into the app: nothing in the plugin reads
 * back its own commands, views or settings tab.
 */
export class Plugin extends Component {
    readonly commands: Command[] = [];
    readonly settingTabs: PluginSettingTab[] = [];
    readonly views = new Map<string, ViewCreator>();
    readonly postProcessors: MarkdownPostProcessor[] = [];
    readonly editorExtensions: unknown[] = [];
    readonly statusBarItems: FakeElement[] = [];

    constructor(readonly app: App, readonly manifest: PluginManifest) {
        super();
    }

    private get dataPath(): string {
        return `${this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`}/data.json`;
    }

    async loadData(): Promise<unknown> {
        const adapter = this.app.vault.adapter;

        if (!(await adapter.exists(this.dataPath))) {
            return null;
        }

        return JSON.parse(await adapter.read(this.dataPath)) as unknown;
    }

    async saveData(data: unknown): Promise<void> {
        await this.app.vault.adapter.write(this.dataPath, JSON.stringify(data, null, 2));
    }

    addCommand(command: Command): Command {
        this.commands.push(command);
        return command;
    }

    addSettingTab(tab: PluginSettingTab): void {
        this.settingTabs.push(tab);
    }

    registerView(type: string, creator: ViewCreator): void {
        this.views.set(type, creator);
        this.register(() => this.views.delete(type));
    }

    registerMarkdownPostProcessor(processor: MarkdownPostProcessor): MarkdownPostProcessor {
        this.postProcessors.push(processor);
        return processor;
    }

    registerEditorExtension(extension: unknown): void {
        this.editorExtensions.push(extension);
    }

    /** An element Obsidian puts in the status bar and takes out on unload. */
    addStatusBarItem(): FakeElement {
        const item = new FakeElement('div', { cls: 'status-bar-item' });
        this.statusBarItems.push(item);
        this.register(() => item.remove());
        return item;
    }
}

/** Every notice shown since the last `clearNotices()`, oldest first. */
const shown: string[] = [];

export function notices(): readonly string[] {
    return shown;
}

export function clearNotices(): void {
    shown.length = 0;
}

/** Obsidian's toast, recorded rather than drawn. */
export class Notice {
    constructor(message: unknown) {
        shown.push(typeof message === 'string' ? message : '[fragment]');
    }

    setMessage(message: unknown): this {
        shown.push(typeof message === 'string' ? message : '[fragment]');
        return this;
    }

    hide(): void {
        // Nothing is drawn.
    }
}

/** Obsidian's `Debouncer`: the function, plus a way to drop or force the pending call. */
export interface Debouncer<T extends unknown[], V> {
    (...args: [...T]): Debouncer<T, V>;
    cancel(): Debouncer<T, V>;
    run(): V | undefined;
}

/**
 * Obsidian's debounce: the last call's arguments run once, `timeout` after the
 * first call of a burst — or after the latest, with `resetTimer`. `cancel`
 * drops a pending call and `run` makes it now.
 *
 * Built on `window.setTimeout`, so fake timers drive it. It used to run at
 * once, which made a plugin under test write its history on every edit and
 * update its graphs on every keystroke, neither of which Obsidian does.
 */
export function debounce<T extends unknown[], V>(callback: (...args: [...T]) => V, timeout = 0, resetTimer = false): Debouncer<T, V> {
    let timer: number | null = null;
    let pending: [...T] | null = null;
    let deadline = 0;

    const call = (): V | undefined => {
        if (pending === null) {
            return undefined;
        }

        const args = pending;
        pending = null;
        return callback(...args);
    };

    const fire = (): void => {
        if (deadline !== 0) {
            const now = Date.now();

            if (now < deadline) {
                timer = window.setTimeout(fire, deadline - now);
                deadline = 0;
                return;
            }
        }

        timer = null;
        call();
    };

    const debounced: Debouncer<T, V> = Object.assign(
        (...args: [...T]): Debouncer<T, V> => {
            pending = args;

            if (timer === null) {
                timer = window.setTimeout(fire, timeout);
            } else if (resetTimer) {
                deadline = Date.now() + timeout;
            }

            return debounced;
        },
        {
            cancel: (): Debouncer<T, V> => {
                if (timer !== null) {
                    window.clearTimeout(timer);
                    timer = null;
                }

                pending = null;
                deadline = 0;
                return debounced;
            },
            run: (): V | undefined => {
                if (timer === null) {
                    return undefined;
                }

                window.clearTimeout(timer);
                timer = null;
                deadline = 0;
                return call();
            }
        }
    );

    return debounced;
}
