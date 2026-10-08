// A fake Obsidian to load the whole plugin into. See world.ts for the app,
// renderer.ts for the graph and what of Obsidian's behaviour it keeps, and
// plugin.ts for loading the real PulsarGraphPlugin into it.
export { FakeElement } from './dom';
export { clearNotices, notices } from './runtime';
export { FakeNode, FakeRenderer, FakeText, easeRgb, type HookName } from './renderer';
export { createWorld, FakeGraphView, World, type NoteSpec, type WorldOptions } from './world';
export { dataPath, historyPath, loadPlugin, pluginDir, settle, unloadPlugin, wait } from './plugin';
