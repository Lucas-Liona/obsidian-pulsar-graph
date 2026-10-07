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
