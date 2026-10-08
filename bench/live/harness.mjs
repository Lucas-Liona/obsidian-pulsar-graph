// The live harness behind docs/performance.md, as it ran on 7 October 2026,
// cut down to the commands the one-session rerun used. Beyond removing the
// others, the only change is that the output folder is no longer hard-coded.
//
// Not a module, and never imported: relay.mjs reads this file and evaluates it
// inside the Obsidian window of the vault named in __pp.vault, through
// Obsidian's command-line eval. The .mjs extension keeps it out of the plugin's
// lint and the community directory's scan, like the repo's build scripts.
//
//   globalThis.__pp = { cmd, vault, label, ... }   what to run, and where
//   globalThis.__ppOut                              where runs/<vault>/ is written
//
// Loaded by eval with globalThis.__pp = { cmd, ... }.
// Returns small JSON summaries; full records go to runs/<vault>/<label>.json.
// Never returns or writes note titles or paths.
(async () => {
    const A = globalThis.__pp || {};
    const fs = require('fs');
    const crypto = require('crypto');
    const ROOT = globalThis.__ppOut ?? `${require('os').tmpdir()}/pulsar-prof`;
    const ID = 'pulsar-graph';
    const vault = app.vault.getName();

    if (!A.vault || vault !== A.vault) {
        return JSON.stringify({ error: 'wrong vault', here: vault, wanted: A.vault });
    }

    const dir = `${ROOT}/runs/${vault}`;
    fs.mkdirSync(dir, { recursive: true });
    const out = (name, data) => fs.writeFileSync(`${dir}/${name}`, typeof data === 'string' ? data : JSON.stringify(data, null, 1));
    const now = () => performance.now();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const P = () => app.plugins.plugins[ID];
    const round = (x) => Math.round(x * 1000) / 1000;

    const stat = (a) => {
        const n = a.length;
        if (n === 0) return { n: 0 };
        const s = [...a].sort((x, y) => x - y);
        const mean = a.reduce((x, y) => x + y, 0) / n;
        const sd = n > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / (n - 1)) : 0;
        const q = (p) => s[Math.min(n - 1, Math.floor(p * (n - 1) + 0.5))];
        return { n, mean: round(mean), sd: round(sd), median: round(q(0.5)), p90: round(q(0.9)), min: round(s[0]), max: round(s[n - 1]) };
    };

    const md5 = (p) => { try { return crypto.createHash('md5').update(fs.readFileSync(p)).digest('hex').slice(0, 8); } catch (e) { return null; } };
    const base = app.vault.adapter.basePath.replace(/\\/g, '/');
    const pluginDir = `${base}/${app.vault.configDir}/plugins/${ID}`;

    const graphs = () => {
        const list = [];
        for (const type of ['graph', 'localgraph']) {
            for (const leaf of app.workspace.getLeavesOfType(type)) {
                const r = leaf.view?.renderer;
                list.push({ type, nodes: r?.nodes?.length ?? null, drawing: !!(r && r.width > 0) });
            }
        }
        return list;
    };

    // Long tasks (>50 ms main-thread blocks) seen by the page.
    const longTasks = () => {
        const seen = [];
        const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push({ s: e.startTime, d: e.duration }); });
        po.observe({ entryTypes: ['longtask'] });
        return { stop: () => po.disconnect(), within: (t0, t1) => seen.filter((e) => e.s >= t0 - 1 && e.s < t1).reduce((x, e) => x + e.d, 0) };
    };

    const withProfile = async (name, fn) => {
        if (!A.profile) return fn();
        const d = require('@electron/remote').getCurrentWebContents().debugger;
        const mine = !d.isAttached();
        if (mine) d.attach('1.3');
        await d.sendCommand('Profiler.enable');
        await d.sendCommand('Profiler.setSamplingInterval', { interval: 100 });
        await d.sendCommand('Profiler.start');
        try {
            return await fn();
        } finally {
            const { profile } = await d.sendCommand('Profiler.stop');
            out(`${name}.cpuprofile`, JSON.stringify(profile));
            if (mine) d.detach();
        }
    };

    // Blocks Pulsar's history file from being written, and logs every write
    // into the plugin folder, while measurements move tabs around.
    const guard = () => {
        const ad = app.vault.adapter;
        if (!window.__ppGuard) {
            const orig = ad.write;
            const log = [];
            ad.write = function (path, ...rest) {
                if (typeof path === 'string' && path.includes(`plugins/${ID}/`)) {
                    const blocked = path.endsWith('history.json') || (!!A.blockData && path.endsWith('data.json'));
                    log.push({ file: path.split('/').pop(), blocked, at: Date.now() });
                    if (blocked) return Promise.resolve();
                }
                return orig.call(this, path, ...rest);
            };
            window.__ppGuard = { orig, log };
        }
        return window.__ppGuard;
    };
    const unguard = () => {
        const g = window.__ppGuard;
        if (!g) return { guarded: false };
        app.vault.adapter.write = g.orig;
        delete window.__ppGuard;
        return { unguarded: true, writes: g.log.length, files: [...new Set(g.log.map((w) => `${w.file}${w.blocked ? ' (blocked)' : ''}`))] };
    };

    const refilter = async () => {
        const p = P();
        if (p && typeof p.refilter === 'function') p.refilter();
        await frame(); await frame();
        return graphs();
    };

    const waitReady = async (expect, timeout = 10000) => {
        const t0 = now();
        while (now() - t0 < timeout) {
            const p = P();
            if (p && p.running && p.store && [...p.store.paths()].length > 0 && p.attached && p.attached.size >= expect) return now();
            await frame();
        }
        return null;
    };

    const cmds = {
        async guard() { guard(); return { guarded: true }; },
        async unguard() { return unguard(); },
        async switches() {
            const n = A.n ?? 30;
            const md = [];
            app.workspace.iterateRootLeaves((l) => { if (l.view?.getViewType() === 'markdown' && l.view.file) md.push(l); });
            md.sort((x, y) => (y.activeTime || 0) - (x.activeTime || 0));
            if (md.length < 2) return { error: `need two markdown tabs, have ${md.length}` };
            const [a, b] = md;
            const original = app.workspace.activeLeaf;
            const before = graphs();
            app.workspace.setActiveLeaf(a, { focus: true });
            await sleep(800);
            const lt = longTasks();
            const rec = [];
            const p0 = P();
            let refilters = 0;
            const prevRefilter = p0 ? p0.refilter : null;
            if (p0) p0.refilter = function (...a) { refilters++; return prevRefilter.apply(this, a); };
            await withProfile(`${A.label}`, async () => {
                for (let i = 0; i < n + 2; i++) {
                    const target = i % 2 === 0 ? b : a;
                    await sleep(A.gap ?? 600);
                    const t0 = now();
                    app.workspace.setActiveLeaf(target, { focus: true });
                    const t1 = now();
                    await frame(); const t2 = now();
                    await frame(); const t3 = now();
                    if (i >= 2) rec.push({ t0, sync: t1 - t0, frame1: t2 - t0, frame2: t3 - t0 });
                }
                await sleep(A.gap ?? 600);
            });
            if (p0) delete p0.refilter;
            lt.stop();
            for (const r of rec) r.long = lt.within(r.t0, r.t0 + (A.gap ?? 600));
            if (original) app.workspace.setActiveLeaf(original, { focus: true });
            const summary = { label: A.label, pulsar: P()?.manifest?.version ?? 'off', refiltersPerSwitch: round(refilters / (n + 2)), graphsBefore: before, graphsAfter: graphs(),
                sync: stat(rec.map((r) => r.sync)), frame1: stat(rec.map((r) => r.frame1)), frame2: stat(rec.map((r) => r.frame2)), long: stat(rec.map((r) => r.long)) };
            out(`${A.label}.json`, { ...summary, records: rec.map(({ t0, ...r }) => r) });
            return summary;
        },
        async disable() { await app.plugins.disablePlugin(ID); await frame(); return { pulsar: P() ? 'on' : 'off', graphs: graphs() }; },
        async enable() { const expect = A.expect ?? 0; await app.plugins.enablePlugin(ID); await waitReady(expect); if (A.raw) { await sleep(1500); return { pulsar: P()?.manifest?.version, attached: P()?.attached?.size, graphs: graphs() }; } return { pulsar: P()?.manifest?.version, attached: P()?.attached?.size, graphs: await refilter() }; },
        async benchsetup() {
            if (vault !== 'pulsar-bench-vault') return { error: 'bench only' };
            const files = app.vault.getMarkdownFiles();
            const t0 = now();
            while (Object.keys(app.metadataCache.resolvedLinks).length < files.length && now() - t0 < 600000) await sleep(500);
            const indexed = now() - t0;
            const pick = files.filter((f) => /Note 0000[12]\.md$/.test(f.path));
            let left = app.workspace.getLeaf(false);
            await left.openFile(pick[0]);
            const second = app.workspace.getLeaf('tab');
            await second.openFile(pick[1]);
            let graph = app.workspace.getLeavesOfType('graph')[0];
            if (!graph) {
                graph = app.workspace.getLeaf('split', 'vertical');
                await graph.setViewState({ type: 'graph', active: false });
            }
            app.workspace.setActiveLeaf(second, { focus: true });
            await sleep(3000);
            return { indexedMs: Math.round(indexed), notes: files.length, links: Object.values(app.metadataCache.resolvedLinks).reduce((x, o) => x + Object.keys(o).length, 0), graphs: graphs() };
        },
        async timelapse() {
            const leaf = app.workspace.getLeavesOfType('graph')[0];
            const e = leaf?.view?.dataEngine;
            if (!e) return { error: 'no graph' };
            if (A.stop) { e.progression = 0; await sleep(500); e.render(); return { stopped: true, progression: e.progression, nodes: leaf.view.renderer.nodes.length }; }
            if (A.start) void e.renderProgression();
            const nodes = [];
            for (let i = 0; i < (A.sec ?? 0); i++) { await sleep(1000); nodes.push(leaf.view.renderer.nodes.length); }
            return { progression: Math.round(e.progression), speed: e.progressionSpeed, nodes };
        },
        async awake() {
            const sec = A.sec ?? 20;
            const leaf = app.workspace.getLeavesOfType(A.type ?? 'graph')[0];
            const r = leaf?.view?.renderer;
            if (!r) return { error: 'no graph' };
            const perSec = [];
            const cpuPerSec = [];
            const d = A.noprof ? null : require('@electron/remote').getCurrentWebContents().debugger;
            const mine = d && !d.isAttached(); if (mine) d.attach('1.3');
            if (d) {
                await d.sendCommand('Profiler.enable');
                await d.sendCommand('Profiler.setSamplingInterval', { interval: 500 });
                await d.sendCommand('Profiler.start');
            }
            let profile = { nodes: [], samples: [], timeDeltas: [] };
            try {
                const remote = require('@electron/remote');
                const pid = remote.getCurrentWebContents().getOSProcessId();
                const cores = require('os').cpus().length;
                const cpuNow = () => (remote.app.getAppMetrics().find((m) => m.pid === pid)?.cpu.percentCPUUsage ?? 0) * cores / 100;
                cpuNow();
                for (let i = 0; i < sec; i++) {
                    let awakeSamples = 0;
                    for (let j = 0; j < 10; j++) { await sleep(100); if (!(r.idleFrames > 60)) awakeSamples++; }
                    perSec.push(awakeSamples / 10);
                    cpuPerSec.push(cpuNow());
                }
            } finally {
                if (d) profile = (await d.sendCommand('Profiler.stop')).profile;
                if (mine) d.detach();
            }
            const idleId = new Set(profile.nodes.filter((n) => n.callFrame.functionName === '(idle)').map((n) => n.id));
            let idle = 0, total = 0;
            const idlePerSec = [];
            let bucketIdle = 0, bucketTotal = 0, bucketStart = 0;
            profile.samples.forEach((s, i) => {
                const dt = profile.timeDeltas[i + 1] ?? 0; total += dt; bucketTotal += dt;
                if (idleId.has(s)) { idle += dt; bucketIdle += dt; }
                if (bucketTotal >= 1e6) { idlePerSec.push(bucketIdle / bucketTotal); bucketIdle = 0; bucketTotal = 0; }
            });
            if (d) out(`${A.label}.cpuprofile`, JSON.stringify(profile));
            const summary = { label: A.label, nodes: r.nodes?.length, progression: Math.round(leaf.view.dataEngine?.progression ?? 0), awakeShare: stat(perSec), cores: stat(cpuPerSec), idleShare: stat(idlePerSec), idleOverall: total ? round(idle / total) : null };
            out(`${A.label}.json`, { ...summary, perSec, cpuPerSec, idlePerSec });
            return summary;
        },
        async opentwo() {
            if (vault !== 'pulsar-bench-vault') return { error: 'bench only' };
            const p = P();
            const ranges = p.settings.filterRanges;
            const inside = (path) => { const v = p.filterPosition(path); if (v === undefined) return null; const c = Math.min(1, Math.max(0, v)); return ranges.some((r) => c >= r.from && c <= r.to); };
            const want = A.which === 'in';
            const picks = app.vault.getMarkdownFiles().filter((f) => inside(f.path) === want).slice(0, 2);
            if (picks.length < 2) return { error: 'not enough notes' };
            const md = [];
            app.workspace.iterateRootLeaves((l) => { if (l.view?.getViewType() === 'markdown') md.push(l); });
            while (md.length < 2) { const l = app.workspace.getLeaf('tab'); md.push(l); }
            await md[0].openFile(picks[0]);
            await md[1].openFile(picks[1]);
            app.workspace.setActiveLeaf(md[1], { focus: true });
            await sleep(1500);
            return { which: A.which, positions: picks.map((f) => round(p.filterPosition(f.path))), graphs: graphs() };
        },
        async opengraph() {
            if (vault !== 'pulsar-bench-vault') return { error: 'bench only' };
            for (const l of app.workspace.getLeavesOfType('graph')) l.detach();
            await sleep(2000);
            const lt = longTasks();
            const proto = (() => { const l = app.workspace.getLeavesOfType('localgraph')[0]; return null; })();
            const t0 = now();
            const leaf = app.workspace.getLeaf('split', 'vertical');
            await leaf.setViewState({ type: 'graph', active: false });
            const r = () => leaf.view?.renderer;
            const counts = [];
            let tNodes = null, firstNodes = null;
            while (now() - t0 < 60000) {
                const rr = r();
                if (rr && rr.nodes?.length > 0) { tNodes = now(); firstNodes = rr.nodes.length; break; }
                await frame();
            }
            for (let i = 0; i < 30; i++) { counts.push(r()?.nodes?.length ?? 0); await sleep(100); }
            let settled = null;
            while (now() - t0 < (A.limit ?? 90000)) { if (r()?.idleFrames > 60) { settled = now(); break; } await sleep(200); }
            lt.stop();
            const res = { label: A.label, pulsar: P() ? 'on' : 'off', early: P() ? P().early instanceof Map : null, filter: P()?.settings?.filterEnabled ?? null, firstNodes, toFirstNodes: tNodes && round(tNodes - t0), nodesOver3s: [...new Set(counts)], settledMs: settled && round(settled - t0), blockedFirst10s: round(lt.within(t0, t0 + 10000)), blockedTotal: round(lt.within(t0, now())) };
            out(`${A.label}.json`, res);
            return res;
        },
        async settle() {
            const r = app.workspace.getLeavesOfType('graph')[0]?.view?.renderer;
            if (!r) return { error: 'no graph' };
            const t0 = now();
            while (now() - t0 < (A.limit ?? 60000)) { if (r.idleFrames > 60) return { settledMs: round(now() - t0), nodes: r.nodes?.length }; await sleep(200); }
            return { settledMs: null, nodes: r.nodes?.length };
        },
        async meta() {
            const remote = require('@electron/remote');
            const os = require('os');
            const w = remote.getCurrentWindow();
            const b = w.getBounds();
            const disp = remote.screen.getDisplayMatching(b);
            let gpu = null;
            try { const g = await remote.app.getGPUInfo('basic'); gpu = (g.gpuDevice || []).map((d) => ({ active: !!d.active, vendorId: d.vendorId, deviceId: d.deviceId })); } catch (e) { gpu = String(e).slice(0, 120); }
            let onBattery = null;
            try { onBattery = remote.powerMonitor.isOnBatteryPower(); } catch (e) { onBattery = String(e).slice(0, 80); }
            let sha = null;
            try { sha = crypto.createHash('sha256').update(fs.readFileSync(`${pluginDir}/main.js`)).digest('hex'); } catch (e) { sha = null; }
            const metrics = remote.app.getAppMetrics();
            const pid = remote.getCurrentWebContents().getOSProcessId();
            const cores = os.cpus().length;
            const m = { label: A.label, at: new Date().toISOString(), enabled: app.plugins.enabledPlugins.has(ID), loaded: !!P(), mainSha256: sha,
                window: { focused: w.isFocused(), visible: w.isVisible(), minimized: w.isMinimized(), width: b.width, height: b.height },
                display: { hz: disp.displayFrequency, scale: disp.scaleFactor, id: disp.id }, onBattery, gpu,
                cpu: { model: os.cpus()[0].model, threads: cores }, memFreeGB: round(os.freemem() / 2 ** 30),
                otherObsidianCores: round(metrics.filter((x) => x.pid !== pid).reduce((t, x) => t + (x.cpu?.percentCPUUsage ?? 0), 0) * cores / 100),
                graphs: graphs() };
            out(`${A.label}.meta.json`, m);
            return { sha: sha && sha.slice(0, 12), focused: m.window.focused, hz: m.display.hz, onBattery, other: m.otherObsidianCores };
        },
    };

    if (!cmds[A.cmd]) return JSON.stringify({ error: `no command ${A.cmd}` });
    try {
        return JSON.stringify(await cmds[A.cmd]());
    } catch (e) {
        return JSON.stringify({ error: String(e && e.stack || e).slice(0, 600) });
    }
})()

