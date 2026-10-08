// Editor reconfigurations per plugin load, with every pending restyle forced and
// timed at a fixed point: before each workspace.updateOptions call, right after
// fresh writing's last body property is set, and at the end of the load. This is
// what showed that 1.40.0's slower reconfigure was a whole-window restyle paid
// inside the call. Not a module: run it through relay.mjs
// (HARNESS=restyle.mjs pp.sh '{"vault":"pulsar-demo-vault","label":"…","n":10}').
// As it ran on 8 October 2026; only the output folder is no longer hard-coded.
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
    const flushes = [], varFlushes = [];
    // The last of the three variables set: the restyle it leaves pending is forced and timed
    // right there, in either order, so neither build's restyle can slip into an untimed frame.
    const bodyStyle = document.body.style, setProp = bodyStyle.setProperty;
    bodyStyle.setProperty = function (name, ...rest) {
        const r = setProp.call(this, name, ...rest);
        if (name === '--pulsar-ink-dim') { const t = performance.now(); void document.body.offsetHeight; varFlushes.push(performance.now() - t); }
        return r;
    };
    ws.updateOptions = function (...args) {
        let t = performance.now(); void document.body.offsetHeight; flushes.push(performance.now() - t);
        t = performance.now(); const r = real.apply(this, args); calls.push(performance.now() - t); return r;
    };
    // History writes from each load are dropped, so the demo's history is untouched.
    const adapter = app.vault.adapter, write = adapter.write;
    let dropped = 0;
    adapter.write = function (path, ...rest) { if (path.includes('plugins/pulsar-graph/')) { dropped++; return Promise.resolve(); } return write.call(this, path, ...rest); };
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(app.plugins.plugins[ID] ?? {}));
    const ol = proto.loadData, os = proto.saveData;
    // Saves are stubbed in both modes: an older build must not rewrite the demo's settings.
    proto.saveData = function (...a) { return this.manifest?.id === ID ? Promise.resolve() : os.apply(this, a); };
    if (A.first) proto.loadData = function (...a) { return this.manifest?.id === ID ? Promise.resolve(null) : ol.apply(this, a); };
    const perLoad = [], loadMs = [], flushPerLoad = [], afterMs = [], varPerLoad = [];
    try {
        for (let i = 0; i < (A.n ?? 10); i++) {
            await app.plugins.disablePlugin(ID);
            await sleep(400);
            calls.length = 0; flushes.length = 0; varFlushes.length = 0;
            const t = performance.now();
            await app.plugins.enablePlugin(ID);
            loadMs.push(performance.now() - t);
            // Whatever restyle the load left pending, paid now rather than at the next frame.
            const t2 = performance.now(); void document.body.offsetHeight; afterMs.push(performance.now() - t2);
            await sleep(1200);
            perLoad.push(calls.slice()); flushPerLoad.push(flushes.slice()); varPerLoad.push(varFlushes.slice());
        }
    } finally {
        delete bodyStyle.setProperty;
        ws.updateOptions = real;
        proto.loadData = ol; proto.saveData = os;
        await app.plugins.disablePlugin(ID); await sleep(2500); await app.plugins.enablePlugin(ID); await sleep(2500);
        adapter.write = write;
    }
    const base = app.vault.adapter.basePath.replace(/\\/g, '/');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(`${base}/.obsidian/plugins/${ID}/main.js`)).digest('hex');
    const rec = { label: A.label, first: !!A.first, mainSha256: sha, editors, ink: app.plugins.plugins[ID]?.settings?.ink, linkDots: app.plugins.plugins[ID]?.settings?.linkDots, callsPerLoad: perLoad.map((c) => c.length), callMs: perLoad, flushMs: flushPerLoad, varFlushMs: varPerLoad, afterLoadFlushMs: afterMs, enableMs: loadMs, droppedWrites: dropped };
    const dir = `${globalThis.__ppOut ?? `${require('os').tmpdir()}/pulsar-prof`}/runs/pulsar-demo-vault`;
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${dir}/${A.label}.json`, JSON.stringify(rec, null, 1));
    const st = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); return `${m.toFixed(2)} ± ${sd.toFixed(2)}`; };
    const sum = (xs) => xs.reduce((a, b) => a + b, 0);
    return JSON.stringify({ label: A.label, sha: sha.slice(0, 12), editors, ink: rec.ink, callsPerLoad: rec.callsPerLoad.join(''), callMs: st(perLoad.map(sum)), flushBeforeMs: st(flushPerLoad.map(sum)), varFlushMs: st(varPerLoad.map(sum)), afterLoadFlushMs: st(afterMs), totalMs: st(perLoad.map((c, i) => sum(c) + sum(flushPerLoad[i]) + sum(varPerLoad[i]) + afterMs[i])), enableMs: st(loadMs), dropped });
})()
