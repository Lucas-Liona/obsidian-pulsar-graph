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
| `settings-layout.ts` | The collapsible containers the settings tab is built from |
| `presets.ts` | The named preset list |
| `fade.ts` | The three curves, as pure functions of a 0–1 recency |
| `opacity-store.ts` | mtime and opacity caches, the range being measured against, the rank order |
| `graph.ts` | Obsidian's undocumented graph internals, node colour, neighbour and group pooling |
| `age-label.ts` | The age drawn above a node |
| `links.ts` | Age and session trails carried into the links |
| `hover.ts` | The per-renderer hover hook |
| `age.ts` | A timestamp into words |
| `pins.ts` | The notes held bright whatever their dates say |
| `bead-view.ts` | A note's sittings, drawn down the sidebar |
| `tabs.ts` | Attention time, and fading the tab bar by it |
| `stats.ts` | What the settings are doing to this vault |
| `filter.ts` | Which notes survive, applied before the renderer sees them |
| `range-bar.ts` | The unit line with a handle at each end, over the vault's own spread |
| `graph-controls.ts` | The Age section inside the graph's own panel, and the caption across the top |

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
- `npm run type-check` — `tsc --noEmit`, then the same over `test/`
- `npm test` — vitest over `test/**/*.test.ts`. `obsidian` is declarations
  only, so `test/obsidian-stub.ts` stands in for the few runtime values the
  source imports; a renderer is faked with plain objects shaped like PIXI's.

A vault checkout that has not been installed since the flat-config migration
fails lint with `ERR_PACKAGE_PATH_NOT_EXPORTED` for `eslint/config` rather than
with a lint error; `npm install` fixes it. The lockfile used to be rewritten
wholesale by every install, which was indentation and nothing else: npm writes
it with `package.json`'s tabs, and it had been committed with two spaces. It is
committed in npm's own format now, so an install that changes nothing leaves it
alone.

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

**A released hook may still be called.** Release can only unlink a wrapper
that is still on top; one that anything has wrapped since — another plugin, or
this plugin loaded again — is now that wrapper's original and stays in the
chain for the life of the renderer. Every hook therefore switches itself off on
release as well as unlinking where it can. Before that, an unloaded instance
kept drawing age labels from its frozen copy of the vault, stacked on the live
ones.

**An unloaded instance must never attach again.** Timers, debounced updates
and saves already in flight still hold the old instance after a reload, and
`syncRenderers` from any of them re-attached it to every open graph — measured
at 22 wrappers per frame after three reloads, from one. Unload sets a flag that
everything which attaches checks first.

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

**A node right-click goes through the public API.** The renderer has
`onNodeClick`, `onNodeRightClick`, `onNodeHover` and `onNodeUnhover`, all with
the same `(event, id, type)` shape — but the right-click one does not need
touching, because Obsidian's own handler fires the documented `file-menu`
workspace event with a source of `graph-context-menu`. One listener puts an item
on a graph node and in the file explorer both. Wrapping `onNodeRightClick`
instead gets you nothing to add to: it builds and shows its menu in one
synchronous call.

**`getLeavesOfType` can outlive `iterateAllLeaves`.** A detached graph leaf was
still returned by `getLeavesOfType('graph')` after `iterateAllLeaves` had stopped
walking it, so anything attaching per renderer should expect to be handed dead
ones. Harmless — a renderer whose leaf is gone never draws — but it means the
count of attached graphs is not the count of graphs on screen. Observed after a
programmatic `detach()`; not confirmed for a tab closed by hand.

**A local graph knows what it is about.** The `localgraph` view is a file view,
so `view.file` is the note it is showing, and its engine carries
`options.localFile` — the note the graph was actually built from — along with
`options.localJumps`, how many links out it reached. Prefer the engine's: a view
caught mid-switch can report a file that none of the drawn nodes are related to
yet. The global graph has no centre and reports no file, which is the one
structural difference between the two beyond size.

**Easing a tint upward stalls; downward converges.** A circle's tint moves a
tenth of the gap per frame and the step truncates, so a channel climbing the last
few units moves by `9 * 0.1 = 0` and stops there permanently — a node left
drawn at `#b3aab3` against a colour of `#b3b3b3`, frozen across 124 frames. The
flip side is that an assignment which lands is permanent: at zero gap there is
nothing left to step. Anything that paints a node has to hand the colour back by
assigning it on a **frame**, and keep doing so until the renderer agrees.
Counting anything other than frames does not work — several passes run inside one
settings change, all of them before the rebuild those changes trigger, so the
tint looks settled while the circle that will actually be drawn does not exist
yet.

**The graph's timelapse can be ridden, but its counter is not a playhead.** The
engine carries `progression`, `progressionSpeed` and `renderProgression()`, and
the *Start timelapse animation* button in the graph's own controls drives them.
Each step rebuilds the node set, so a `setData` wrapper already fires on every
step and anything colouring along with it rides the animation rather than owning
playback. What `progression` is *not* is an index: it climbed past 2500 in a
vault of 1473 files, kept climbing for minutes after the node count had settled,
and never returned to zero. It advances only while the view renders, so a
collapsed sidebar freezes it. Read it as a yes/no — has a replay been started in
this view — and take the moment being shown from the notes on screen instead: the
newest creation time among them is where the replay has reached, which also stops
being behind the vault the instant the replay catches up.

**Mid-rebuild a node has no colour.** Inside the `setData` wrapper,
`node.color` reads back `undefined` for every node at once, so code that
preserves a colour by reading it there preserves nothing. Keep what the node had
before as the fallback.

**Alpha above 1 is clamped when drawn.** A high maximum opacity flattens the top
of the curve rather than extending it — and there is therefore no headroom above
the maximum for anything to use. A "crest" multiplier for the replay's wave was
built, measured at 5.04 against a maximum of 2.52, and deleted: it was four times
past the point where anything changes. Contrast at the top of the range has to
come from lowering what is around it.

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
  turns a drag calculation into a division by zero, and the graph's own replay
  counter sits frozen at 1 because nothing is drawing.
- **Synthetic pointer events complete real gestures.** Dispatching `pointerup`
  while testing the range bar finished a drag, which committed the test range to
  the user's settings and saved it to `data.json`. If a gesture ends in a commit,
  stub the commit or expect to restore what it wrote — and compare `data.json`
  against a copy taken before the probe, every time.
- **Other settings will do the averaging for you.** A vault with neighbour glow
  and cluster warmth switched on draws every linked island at a single
  brightness, which made three separate measurements read "1 distinct value"
  before anyone noticed. Zero them in memory before measuring anything about
  brightness.

There is a `probe` skill in `.claude/skills/` holding this loop in full.

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
- **Pan and scale are CSS pixels; the canvas is device pixels.** PIXI runs the
  stage at CSS scale and the view at `devicePixelRatio`, so framing computed
  against `renderer.px.view.width` comes out wrong by the ratio and the graph
  sits off-centre. Use `renderer.width` and `renderer.height`.
- **Set the pan after the zoom has finished easing.** `zoomTo` moves the pan
  while it runs, so centring before it settles is immediately undone.
- Chrome can be hidden for a shot by injecting a stylesheet over
  `.workspace-ribbon`, `.status-bar`, `.view-header`,
  `.workspace-tab-header-container`, `.graph-controls` and
  `.titlebar-button-container`. Call `renderer.onResize()` afterwards, and take
  the whole lot out again when the shoot is over.
- A fake cursor and a click halo are two injected divs positioned per frame.
  Position them against a **text range**, not an element box: a tab's title fills
  the tab as a flex item, so its right edge is over a hundred pixels past the end
  of the text, and the cursor lands on the wrong tab.

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
