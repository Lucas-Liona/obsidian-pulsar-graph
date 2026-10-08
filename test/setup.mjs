// Obsidian's code runs in a browser window, where the global object is also
// `window` and timers are reached through it: the plugin guidelines ask for
// window.setTimeout, for popout windows. Node has no window, so every test
// gets the global object as its window, as a page does. Fake timers installed
// with vi.useFakeTimers() then reach the plugin through it like anything else.
//
// Kept to this: a document would change how @codemirror sees the environment
// as it is imported.
globalThis.window ??= globalThis;
