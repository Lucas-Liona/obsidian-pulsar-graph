# AGENTS.md — Pulsar

Guidance for anyone, human or otherwise, working on this repo. Pulsar
grades Obsidian's graph by time: how recently each note was modified becomes how
strongly its node is drawn, so the part of a vault being worked in stands out and
the rest sinks back.

## Project shape

TypeScript in `src/`, bundled to `main.js` by esbuild and loaded by Obsidian.

| File | Holds |
|---|---|
| `main.ts` | Plugin lifecycle only: settings, events, attaching to graphs |
| `settings.ts` | The settings type, defaults, parsing and the settings tab |
| `presets.ts` | The named preset list |
| `fade.ts` | The three curves, as pure functions of a 0–1 recency |
| `opacity-store.ts` | mtime and opacity caches, the range being measured against, the rank order |
| `graph.ts` | Obsidian's undocumented graph internals, node colour, neighbour and group pooling |
| `age-label.ts` | The age drawn above a node |
| `links.ts` | Age and session trails carried into the links |
| `hover.ts` | The per-renderer hover hook |
| `age.ts` | A timestamp into words |
| `tabs.ts` | Attention time, and fading the tab bar by it |
| `stats.ts` | What the settings are doing to this vault |
| `filter.ts` | Which notes survive, applied before the renderer sees them |
| `range-bar.ts` | The unit line with a handle at each end |
| `graph-controls.ts` | The Age section inside the graph's own panel |

Works on the global and local graph views. Local and offline only.

Release artifacts: `main.js`, `manifest.json` and `styles.css`. Almost everything
the plugin draws goes through Obsidian's own renderer rather than CSS; the
stylesheet covers the settings tab's curve preview.

## Commands

- `npm install` — install dependencies
- `npm run dev` — watch build
- `npm run build` — production build (type-check + esbuild)
- `npm run lint` / `npm run lint:fix` — eslint over the whole tree, zero warnings
  enforced. Uses `eslint-plugin-obsidianmd`, which mirrors the checks the
  community directory runs on every release, so keep it clean.
- `npm run type-check` — `tsc --noEmit`

## Conventions

- `"strict": true` TypeScript, warning-clean.
- UI text is sentence case ("Fade type", not "Fade Type"). No top-level heading
  in the settings tab; section headings inside it are fine. No console logging.
- Register anything needing cleanup with `this.register*` so unload leaks
  nothing. Hooks installed on a renderer are released when its view closes.
- Local and offline only: no network calls, no telemetry, and nothing read from a
  note beyond its timestamps.
- Never change the manifest `id` after release; keep command IDs stable.
- Every feature past the core fade is optional and off by default. Anything that
  changes a colour, or puts something in a part of Obsidian the plugin does not
  otherwise touch, starts off.

## Working with Obsidian's graph

The graph renderer is undocumented and bundles its own copy of PIXI. These are
the facts the plugin is built on, all read out of the shipped renderer and
checked against a running vault. They are the expensive part of this repo.

**Hooks are per-renderer, never global.** `setData`, `renderCallback`,
`onNodeHover` and `onNodeUnhover` are plain instance properties the graph view
assigns. Wrapping one reaches exactly one graph and is undone by putting the
original back. Always call the original first.

**Repainting.** `renderCallback` returns early once `idleFrames > 60`, so calling
it directly draws nothing on a settled graph. `renderer.changed()` wakes the loop.

**`setData` is what wipes node colour.** It reassigns every node's colour from
group data, which is the only reason an earlier version of this plugin polled on
a timer; wrapping it removed every interval. It also *preserves* `x`/`y` for
nodes that survive the call — only genuinely new nodes are given positions, and
those are seeded at the average position of their related nodes. Removing nodes
and putting them back is therefore not destructive to a layout. Links are created
only when both endpoints exist, so dangling link entries are already tolerated.

**Values eased per frame.** A node's circle tint, a link's alpha and a link's
tint are each moved a tenth of the way toward their target every frame. Two
consequences: a colour applied over a different one *freezes part way* when the
graph goes idle, and scaling a value the renderer left behind compounds frame
over frame into something far darker than intended. Assign absolutely, deriving
the renderer's own target rather than reading back its output.

**`getFillColor()` ignores `node.color` in two cases**: the hovered node always
uses `colors.fillHighlight`, and a node of type `focused` uses
`colors.fillFocused` when that has any alpha. Borrowing either as a feature
colour makes that feature indistinguishable from a hover.

**Alpha above 1 is clamped when drawn.** A high maximum opacity flattens the top
of the curve rather than extending it.

**Labels never see `node.color`.** A title's alpha is
`textAlpha * fadeAlpha * colors.text.a`, and `textAlpha` is
`clamp(log2(scale) + 1 - fTextShowMult, 0, 1)`, so titles vanish below a zoom the
user controls and a faded node still carries a full-strength title. A title is a
PIXI text object at `node.y + (size + 5) * nodeScale + moveText / scale`,
anchored at its top; anything added to its children inherits its position, zoom
scaling, font and visibility, which is how the age label is drawn without
duplicating any of that. The constructor comes from `node.text.constructor`,
since no PIXI global is exposed.

**A link's line is a stretched, rotated sprite** whose local x axis runs source to
target, so a horizontal ramp texture maps onto it with no extra maths.

**A renderer's `width` and `height` are 0 while its leaf is hidden**, which
silently breaks any screen-space maths. Reveal the leaf first.

**Spreading brightness along links and grouping by island of linked notes are
the same boundary.** Anything that averages within an island will nullify
anything that carries along links, unless the carrying runs first.

## Developing

Branches are worked in git worktrees on the native filesystem; npm and esbuild
over a mounted Windows drive are much slower. A vault used for testing keeps the
plugin on the default branch and receives built output.

Only `main.js` should be copied into a vault that is also the git checkout.
`main.js` is gitignored and `styles.css` is not, so copying a build over the
latter dirties the working tree — which has already blocked a release once, in a
way that only surfaced as a tag pointing at the wrong commit.

To test a build: copy `main.js` into the vault's plugin folder, then
`obsidian plugin:reload id=pulsar-graph` using Obsidian's CLI (needs installer
1.12.7+ and Settings → General → Command line interface). `obsidian eval`,
`dev:screenshot` and `dev:errors` are the debugging loop. `eval` runs JavaScript
inside the running app with full vault access, and `dev:screenshot` captures the
workspace rather than any open modal.

Three things about that loop, each learned by breaking it:

- **`eval` takes the script on the command line, so keep it small.** An 8 KB
  payload (a stylesheet being injected) wedged the renderer and left the window
  showing "Error" with the CLI reporting that it could not find Obsidian at all.
  Restarting loses the main area's tab layout, which is not recoverable from
  anywhere: `workspace.json` is rewritten on launch and is gitignored in the
  vault repo. Read files from disk inside the script instead, or copy them in.
- **`vault=<name>` is ignored.** With two vaults open, every command goes to the
  focused window, so revealing a leaf can silently redirect the next call to a
  different vault. Three test runs were measured against a demo vault running
  version 1.0.0 before it showed. Assert `app.vault.getName()` inside the script
  and have it return early if it is wrong.
- **Reveal the leaf before measuring anything a frame produces.** A renderer
  whose leaf is in a background tab never calls `render()`, so `fontDirty` is
  never consumed and font sizes read stale forever. The same is true of the
  controls: a collapsed panel's range bar has a bounding rect of zero, which
  turns a drag calculation into a division by zero.

### Capturing images and video

Anything published — the README, the directory listing, a release note, a short —
comes from the **demo vault at `~/pulsar-demo-vault`**, never from a real one. It
exists for this: 74 notes, titles only, with modification times deliberately
spread across a year so the fade has something to show. Its note titles were
audited and are all generic; keep them that way, because a vault anyone can
download must say nothing about whoever made it.

A frame from a real vault is only publishable if nothing in it is legible, and
that is harder than it sounds: a wide shot at zoom 0.545 once had two private note
titles in it plainly readable. Check every frame at full size before it goes
anywhere, including the file explorer, the recent-files pane and any open note in
the background. The settings tab is never in a published frame.

Published images live in `docs/assets/`. The pipeline that made the current ones,
which is worth reusing rather than reinventing:

- **The graph exports itself.** `renderer.getTransparentScreenshot()` returns a
  canvas of the graph alone at full resolution, with no app chrome to crop
  around. `getBackgroundScreenshot()` composites it onto white, which is wrong on
  a dark theme — take the transparent one and composite onto
  `--background-primary` yourself.
- **`fs` works inside `eval`**, so a capture loop can write its own PNGs straight
  to disk instead of returning megabytes of base64 through the CLI.
- **Framing is `zoomTo`, not `setScale`.** `setScale` assigns a value the render
  loop immediately eases away from; `zoomTo` sets the target it eases toward.
- **A settings change needs `store.markStale()`** before `syncRenderers()`, or
  the cached opacities are never recomputed. A whole fade-sweep animation was
  shot this way before anyone noticed it was animating nothing.
- Anything in the editor has to be `dev:screenshot` and cropped, since only the
  graph can export itself.

Capture notes, learned the hard way:

- `dev:screenshot` takes the whole workspace, not the focused leaf, so the
  sidebars are in every frame unless they are collapsed first.
- It writes into the vault root. Delete the file after reading it; a stray PNG in
  a vault that is also a git checkout is a dirty tree.
- Each capture is a round trip through the CLI, so a sequence assembled from them
  is a few frames per second. That is fine for something slow (text cooling,
  a tab fading) and not fine for anything that needs to look smooth.
- A fake cursor can be injected into the DOM and animated to narrate an action,
  but it has to be removed afterwards along with anything else injected.

Treat a test vault's settings and contents as the user's. Reading them is fine;
writing settings while probing means putting them back exactly, and nothing
captured from a real vault should be published without checking what is legible
in it.

## Releasing

- Bump `version` in `manifest.json` (SemVer, no leading `v`). `versions.json`
  only needs a new entry when `minAppVersion` changes; it exists so older
  Obsidian installs can find the last version that still supported them.
- Push a tag equal to the version exactly (`1.0.0`, not `v1.0.0`), on the commit
  that carries that version in its manifest. The release workflow builds,
  attaches `main.js`, `manifest.json` and `styles.css` plus build provenance, and
  creates the release as a draft to be published once checked.
- The directory re-scans every release and verifies that a published `main.js`
  matches a build of the committed source, so releases must be reproducible.
  Checking a downloaded asset's hash against a local build is worth doing.
- Submission and updates go through the dashboard at community.obsidian.md, not
  a pull request to `obsidianmd/obsidian-releases` (that route is closed). The
  directory reads `manifest.json` from the default branch's HEAD and scans every
  release across manifest, release assets, source code and build verification.
  Use **Review branch** there to dry-run a scan before tagging.

## References

- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Submission requirements:
  https://docs.obsidian.md/community-directory/submission-requirements-for-plugins
- Developer policies: https://docs.obsidian.md/community-directory/developer-policies
- Manifest reference: https://docs.obsidian.md/Reference/Manifest
