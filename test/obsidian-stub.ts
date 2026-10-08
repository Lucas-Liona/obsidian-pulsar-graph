// Stand-ins for the runtime values the plugin imports from 'obsidian', which
// ships declarations only. Two layers of test use them.
//
// A module test imports one file from src and drives it directly. For those
// the classes here only need to exist, so that modules extending or checking
// against them can load.
//
// A plugin test loads the whole of PulsarGraphPlugin against the fake Obsidian
// in test/harness/, and for that the values the plugin extends or calls have
// to behave like the real ones: the component lifecycle, a plugin's data file,
// notices and debounce. Those live in test/harness/runtime.ts and are exported
// from here, so both layers see the same Obsidian. Everything else below still
// behaves like nothing at all; a plugin test that needs one of them to do
// something has found the next thing to fake.
export { Component, debounce, Notice, Plugin } from './harness/runtime';

export class TAbstractFile {
    path = '';
}

export class TFile extends TAbstractFile {
    extension = 'md';
    stat = { mtime: 0, ctime: 0, size: 0 };
}

export class App {}
export class PluginSettingTab {}
export class ItemView {}
export class Menu {}
export class Setting {}
export class SliderComponent {}
export class TextComponent {}
export class WorkspaceLeaf {}
export class MarkdownView {}

export function setIcon(): void {}
export function normalizePath(path: string): string {
    return path;
}
