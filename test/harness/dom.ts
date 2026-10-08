/**
 * The little of the DOM the plugin reaches outside the graph: a status bar
 * item. Only what is used is here, and a selector it cannot answer throws, so
 * a test that wanders into real DOM work says so rather than passing on a
 * no-op.
 */

/** An element's inline style, held as custom properties. */
export class FakeStyle {
    private readonly properties = new Map<string, string>();

    setProperty(name: string, value: string): void {
        this.properties.set(name, value);
    }

    removeProperty(name: string): string {
        const value = this.properties.get(name) ?? '';
        this.properties.delete(name);
        return value;
    }

    getPropertyValue(name: string): string {
        return this.properties.get(name) ?? '';
    }

    /** Every property currently set, for checking nothing is left behind. */
    names(): string[] {
        return [...this.properties.keys()].sort();
    }
}

interface ElementOptions {
    cls?: string | string[];
    text?: string;
}

/** An element with Obsidian's helpers on it, in the subset the plugin calls. */
export class FakeElement {
    readonly classes = new Set<string>();
    readonly attributes = new Map<string, string>();
    readonly children: FakeElement[] = [];
    readonly style = new FakeStyle();
    parent: FakeElement | null = null;
    text = '';
    shown = true;
    /** Taken out of the document by `remove()`. */
    removed = false;
    private readonly listeners = new Map<string, Array<(event: unknown) => void>>();

    constructor(readonly tag: string, options: ElementOptions = {}) {
        const classes = typeof options.cls === 'string' ? options.cls.split(' ') : options.cls ?? [];
        classes.filter((name) => name.length > 0).forEach((name) => this.classes.add(name));
        this.text = options.text ?? '';
    }

    setText(text: string): void {
        this.text = text;
    }

    getText(): string {
        return this.text + this.children.map((child) => child.getText()).join('');
    }

    addClass(...names: string[]): void {
        names.forEach((name) => this.classes.add(name));
    }

    removeClass(...names: string[]): void {
        names.forEach((name) => this.classes.delete(name));
    }

    toggleClass(name: string, on: boolean): void {
        if (on) {
            this.classes.add(name);
        } else {
            this.classes.delete(name);
        }
    }

    hasClass(name: string): boolean {
        return this.classes.has(name);
    }

    createEl(tag: string, options?: ElementOptions): FakeElement {
        return this.append(new FakeElement(tag, options));
    }

    createDiv(options?: ElementOptions): FakeElement {
        return this.append(new FakeElement('div', options));
    }

    createSpan(options?: ElementOptions): FakeElement {
        return this.append(new FakeElement('span', options));
    }

    private append(child: FakeElement): FakeElement {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    /** Class selectors only, which is all the plugin asks for. */
    find(selector: string): FakeElement | null {
        if (!/^\.[\w-]+$/.test(selector)) {
            throw new Error(`The fake DOM only finds by a single class, not ${selector}`);
        }

        const name = selector.slice(1);

        for (const child of this.children) {
            if (child.classes.has(name)) {
                return child;
            }

            const deeper = child.find(selector);
            if (deeper) {
                return deeper;
            }
        }

        return null;
    }

    querySelector(selector: string): FakeElement | null {
        return this.find(selector);
    }

    setAttr(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    getAttr(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    addEventListener(type: string, listener: (event: unknown) => void): void {
        const named = this.listeners.get(type) ?? [];
        named.push(listener);
        this.listeners.set(type, named);
    }

    removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
    }

    hide(): void {
        this.shown = false;
    }

    show(): void {
        this.shown = true;
    }

    remove(): void {
        this.removed = true;

        if (this.parent) {
            this.parent.children.splice(this.parent.children.indexOf(this), 1);
            this.parent = null;
        }
    }

    get isConnected(): boolean {
        return !this.removed;
    }
}
