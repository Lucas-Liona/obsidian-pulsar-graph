# Probe

Measuring Pulsar against a running Obsidian. Every number in this repo's commit
messages came from this loop, and so did most of its bug fixes — the interesting
failures here are not the ones that throw, they are the ones where a colour is
quietly nine units short or a panel of thirteen notes is drawn in a fifth of the
range.

## The loop

```bash
OB=/mnt/c/Users/lucas/AppData/Local/Programs/Obsidian/Obsidian.com

npm run build
cp main.js /mnt/c/Users/lucas/Vaults/Obsidian-Vault/.obsidian/plugins/pulsar-graph/
"$OB" plugin:reload id=pulsar-graph
"$OB" eval code="$(cat probe.js)"
```

`obsidian` is **not** on `PATH`; that `$OB` line is the whole trick. Write the
script to a file and pass it with `$(cat …)` — `eval` takes the script on the
command line, and an 8 KB payload once wedged the renderer and lost a tab layout
that was not recoverable from anywhere.

**Only `main.js` is ever copied in.** The vault is also the git checkout, and
`styles.css` is tracked, so copying a whole build dirties the working tree — a
mistake that has already put a release tag on the wrong commit. To see a
stylesheet change, use the demo vault at `/mnt/c/Users/lucas/pulsar-demo-vault`,
which is not a checkout, or read computed styles instead of looking.

## Every script starts the same way

```js
if (app.vault.getName() !== 'Obsidian-Vault') return 'wrong vault';
```

`vault=<name>` is ignored. With two vaults open, every command goes to the
focused window, and three runs were once measured against the wrong one.

## The vault being measured is someone's real notes

- **Copy `data.json` aside first** and compare it at the end. It must come back
  identical.
- **Change settings in memory only**: `plugin.settings.x = …` then
  `plugin.syncRenderers()` or `plugin.paintTabs()`. Never `saveSettings()` while
  probing. Put every field back and sync again.
- **Detach every leaf you open** and restore `rightSplit.collapsed` to what it
  was. Delete any `window.__…` globals a multi-step probe needed.
- **Return counts and lengths, not note titles or paths.** Nothing captured from
  a real vault is publishable without checking what is legible in it.

**Synthetic pointer events complete real gestures.** Dispatching `pointerup`
during a range-bar test finished a drag, which committed the test range to the
user's settings and saved it. If a gesture ends in a commit, either stub the
commit or expect to restore what it wrote.

## Things that silently measure nothing

- **A hidden leaf never renders.** `width` and `height` are 0, fonts read stale,
  and anything driven by frames is frozen — the graph's replay counter sat at 1
  for an entire measurement because the sidebar was collapsed. `revealLeaf`
  first, and put the sidebar back after.
- **A local graph follows the active file.** `setViewState` and `openFile` will
  not move its centre; set `view.engine.options.localFile` and call
  `engine.render()`.
- **Other settings do the averaging for you.** A vault with neighbour glow and
  cluster warmth on draws every linked island at one brightness, which made
  three separate measurements all read "1 distinct value". Zero them in memory
  before measuring anything about brightness.
- **`getLeavesOfType` outlives `iterateAllLeaves`**, so the count of attached
  graphs is not the count of graphs on screen.

## What a good measurement looks like

Two numbers from the same vault, one for each side of the change, with the
settings that would confound it switched off. The commit message carries both.
Where a change cannot be measured, the body says so and says what would have
measured it — see the hygiene the merged PRs set.

## Timing and profiling

Two tools, for two questions. **How long does it take** is a batch timing inside
`eval`; **where does the time go** is a CPU profile.

**Time in batches, report mean ± sd.** `performance.now()` is coarsened to
0.1 ms in Electron, so a single call under that reads as 0 or 0.1. Time a batch
of calls, divide, repeat the batch, and report the spread:

```js
const stat = (a) => { const m = a.reduce((x, y) => x + y, 0) / a.length;
  return { mean: m, sd: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) }; };
```

**Profile through the DevTools protocol.** Node's `inspector` module is not
available in Obsidian's renderer ("initialized without a V8::Inspector"), but
`@electron/remote` is, and its webContents debugger speaks CDP to the window the
script is running in:

```js
const d = require('@electron/remote').getCurrentWebContents().debugger;
const mine = !d.isAttached(); if (mine) d.attach('1.3');
await d.sendCommand('Profiler.enable');
await d.sendCommand('Profiler.setSamplingInterval', { interval: 100 });
await d.sendCommand('Profiler.start');
/* the work */
const { profile } = await d.sendCommand('Profiler.stop');
require('fs').writeFileSync('C:\\Users\\lucas\\AppData\\Local\\Temp\\pulsar-prof\\x.cpuprofile', JSON.stringify(profile));
if (mine) d.detach();
```

Deploy `npm run build:profile` first, or every frame is named `s` or `t`. Then
`node scripts/flame.mjs x.cpuprofile --top 15` for a table, or without `--top`
for folded stacks that `flamegraph.pl` turns into an SVG. A `.cpuprofile` also
opens directly in DevTools' Performance panel or speedscope.

**Count wrappers from the stack, not from what they draw.** Labels and colours
undercount: a stale instance whose labels were orphaned draws nothing and still
runs. Patch one node's `render` for a frame, raise `Error.stackTraceLimit`, and
count `plugin:pulsar-graph` frames in the stack — one per wrapper in the
render chain. It should be 1.

**Hold the node count fixed across a comparison.** A graph in a background tab
is not re-rendered when the plugin reloads, so it keeps whatever data it last
had — filtered or not. The same probe read 239 nodes one run and 1113 the next.
Every per-frame number scales with it; print it alongside every timing.

## Looking at what you built

`dev:screenshot` takes the whole workspace — his notes included. To look at one
component, capture only its box:

```js
const r = el.getBoundingClientRect();
const img = await require('@electron/remote').getCurrentWebContents()
  .capturePage({ x: Math.floor(r.x), y: Math.floor(r.y), width: Math.ceil(r.width), height: Math.ceil(r.height) });
require('fs').writeFileSync('C:\\Users\\lucas\\AppData\\Local\\Temp\\pulsar-prof\\x.png', img.toPNG());
```

For a component that is not on screen, bundle it alone with esbuild as an IIFE
that sets a `window.__…` global, `(0, eval)(fs.readFileSync(…))` it inside the
app, mount it in a fixed-position div with real data from the plugin, capture
the div, remove it. That only works for code that does not import `obsidian` at
runtime — `require('obsidian')` does not resolve from `eval`. Anything built
with `Setting` has to be captured where the plugin itself mounted it: bring the
leaf forward, capture, and put the previous tab back with `parent.selectTab`.

To see a stylesheet change in the real vault, **disable** the shipped plugin
stylesheet (`style.disabled = true`) and inject the branch's for the length of
the capture, then remove it and re-enable. Layering the new one over the old
lets removed rules bleed through.

**Clean up what you inject.** Eleven hand-injected copies of the stylesheet
were found in `<head>` a day after they were added, one of them giving a class
a background the shipped CSS never had. Five stale Age sections and six stacked
captions were in the graph panels too. Count them at the end:
`[...document.querySelectorAll('style')].filter(s => s.textContent.startsWith('.pulsar-graph-preview')).length`
should be 1.

## Watching data.json

An md5 at the end catches a changed file, not a file that is being rewritten
with the same bytes. Watch the mtime while idle as well:

```bash
for i in 1 2 3 4 5; do stat -c '%y' data.json; sleep 1; done
```

A panel control whose value was set during a refresh fired its change handler,
which saved, which refreshed: data.json was rewritten every 0.9 s with nothing
changing in it, and only the mtime showed it. If a probe has to exercise a real
save, take the copy first, expect exactly one write per gesture, and put the
copy back after.
