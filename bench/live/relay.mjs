// Runs a script inside the Obsidian window of a named vault. Not a module:
// pp.sh hands it to Obsidian's command-line eval, which runs it in whichever
// window has focus, and from there it finds the right window by title and
// evaluates the script in that one. Every script also checks the vault's name
// itself, because the CLI's vault=<name> is ignored.
//
//   globalThis.__pr = { vault, file, focus?, ...arguments for the script }
//   globalThis.__ppOut, if set, is passed on to the script.
(async () => {
    const A = globalThis.__pr;
    const out = globalThis.__ppOut ?? null;
    const loader = `globalThis.__pp=${JSON.stringify(A)};globalThis.__ppOut=${JSON.stringify(out)};eval(require('fs').readFileSync(${JSON.stringify(A.file)},'utf8'))`;
    if (app.vault.getName() === A.vault && !A.focus) return await eval(loader);
    const { BrowserWindow } = require('@electron/remote');
    const w = BrowserWindow.getAllWindows().find((x) => x.isVisible() && x.getTitle().includes(`${A.vault} - Obsidian`));
    if (!w) return JSON.stringify({ error: 'no visible window for vault' });
    // Chromium throttles a window without focus, so a timed run focuses it first.
    if (A.focus) w.focus();
    return await w.webContents.executeJavaScript(loader, true);
})()
