// Editor reconfigurations per plugin load, every call timed, raw output saved
// to <__ppOut>/runs/pulsar-demo-vault/<label>.json. Not a module: run it
// through relay.mjs (HARNESS=reconfigure.mjs pp.sh '{...}'). As it ran on
// 7 October 2026; only the output folder is no longer hard-coded.
//
//   { vault: 'pulsar-demo-vault', label, first: true|false, n: 10 }
//   first = true loads with no saved settings (the defaults); false with the
//   vault's own. Saves are stubbed in both modes.
(async () => {
    const A = globalThis.__pp || {};
    if (app.vault.getName() !== A.vault || A.vault !== 'pulsar-demo-vault') return JSON.stringify({ error: 'demo only' });
    const fs = require('fs'), crypto = require('crypto');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const ID = 'pulsar-graph';
    const ws = app.workspace;
    for (const l of ws.getLeavesOfType('markdown')) await l.loadIfDeferred?.();
    const editors = ws.getLeavesOfType('markdown').filter((l) => l.view?.editor?.cm).length;
    const calls = [];
    const real = ws.updateOptions;
    ws.updateOptions = function (...args) { const t = performance.now(); const r = real.apply(this, args); calls.push(performance.now() - t); return r; };
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(app.plugins.plugins[ID] ?? {}));
    const ol = proto.loadData, os = proto.saveData;
    // Saves are stubbed in both modes: an older build must not rewrite the demo's settings.
    proto.saveData = function (...a) { return this.manifest?.id === ID ? Promise.resolve() : os.apply(this, a); };
    if (A.first) proto.loadData = function (...a) { return this.manifest?.id === ID ? Promise.resolve(null) : ol.apply(this, a); };
    const perLoad = [], loadMs = [];
    try {
        for (let i = 0; i < (A.n ?? 10); i++) {
            await app.plugins.disablePlugin(ID);
            await sleep(400);
            calls.length = 0;
            const t = performance.now();
            await app.plugins.enablePlugin(ID);
            loadMs.push(performance.now() - t);
            await sleep(1200);
            perLoad.push(calls.slice());
        }
    } finally {
        ws.updateOptions = real;
        proto.loadData = ol; proto.saveData = os;
        if (A.first) { await app.plugins.disablePlugin(ID); await sleep(300); await app.plugins.enablePlugin(ID); await sleep(1000); }
    }
    const base = app.vault.adapter.basePath.replace(/\\/g, '/');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(`${base}/.obsidian/plugins/${ID}/main.js`)).digest('hex');
    const rec = { label: A.label, first: !!A.first, mainSha256: sha, editors, ink: app.plugins.plugins[ID]?.settings?.ink, linkDots: app.plugins.plugins[ID]?.settings?.linkDots, callsPerLoad: perLoad.map((c) => c.length), callMs: perLoad, enableMs: loadMs };
    const dir = `${globalThis.__ppOut ?? `${require('os').tmpdir()}/pulsar-prof`}/runs/pulsar-demo-vault`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/${A.label}.json`, JSON.stringify(rec, null, 1));
    return JSON.stringify({ label: A.label, sha: sha.slice(0, 12), editors, callsPerLoad: rec.callsPerLoad });
})()
