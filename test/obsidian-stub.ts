// Stand-ins for the runtime values the plugin imports from 'obsidian', which
// ships declarations only. Classes exist so that modules extending or checking
// against them can load; none of them behaves like the real thing, and a test
// that needs one to is testing the wrong layer.
export class TAbstractFile {
    path = '';
}

export class TFile extends TAbstractFile {
    extension = 'md';
    stat = { mtime: 0, ctime: 0, size: 0 };
}

export class App {}
export class Component {}
export class Plugin extends Component {}
export class PluginSettingTab {}
export class ItemView {}
export class Menu {}
export class Notice {}
export class Setting {}
export class SliderComponent {}
export class TextComponent {}
export class WorkspaceLeaf {}
export class MarkdownView {}

export function setIcon(): void {}
export function normalizePath(path: string): string {
    return path;
}

export function debounce<T extends unknown[]>(run: (...args: T) => void): ((...args: T) => void) & { cancel: () => void } {
    return Object.assign((...args: T) => run(...args), { cancel: () => undefined });
}
