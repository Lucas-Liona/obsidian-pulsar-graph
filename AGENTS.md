# AGENTS.md — Pulsar Graph

Guidance for anyone (human or AI agent) working on this repo. Pulsar Graph is an
Obsidian community plugin that applies time-based opacity to graph nodes, so
recently-modified notes stand out and stale ones fade.

## Project shape
- TypeScript in `src/`, bundled to `main.js` by esbuild; loaded by Obsidian.
- `src/main.ts` is plugin lifecycle only. `src/settings.ts` holds the settings
  type, defaults and tab; `src/fade.ts` the three curves (linear, exponential,
  step); `src/opacity-store.ts` the mtime and opacity caches;
  `src/graph.ts` Obsidian's undocumented graph internals and node updates.
- Works on the global and local graph views. Local-only, no network calls.
- Release artifacts: `main.js`, `manifest.json` and `styles.css`. The stylesheet
  holds the hover label only; everything else the plugin draws goes through
  Obsidian's graph renderer, not CSS.

## Commands
- `npm install` — install deps
- `npm run dev` — watch build
- `npm run build` — production build (type-check + esbuild)
- `npm run lint` / `npm run lint:fix` — eslint over the whole tree, zero
  warnings enforced. Uses `eslint-plugin-obsidianmd`, which mirrors the checks
  the community directory runs on every release, so keep it clean.
- `npm run type-check` — `tsc --noEmit`

## Conventions
- `"strict": true` TypeScript; keep it warning-clean.
- UI text is sentence case ("Fade type", not "Fade Type"). No top-level heading
  in the settings tab, and no console logging.
- Register everything that needs cleanup with `this.register*` (intervals, DOM
  and workspace events) so unload leaks nothing.
- Local/offline only: no network calls, no telemetry, no reading vault content
  beyond note timestamps.
- Never change the manifest `id` after release; keep command IDs stable.

## Developing
- Branches are worked in workmux worktrees (`~/.workmux/pulsar-graph/<handle>`)
  on the Linux filesystem; npm and esbuild over `/mnt/c` are much slower. The
  vault's own copy of the plugin stays on `master` and receives built `main.js`
  for testing.
- To test a build in Obsidian: copy `main.js` into the vault plugin folder, then
  `obsidian plugin:reload id=pulsar-graph` (Obsidian's CLI; needs installer
  1.12.7+ and Settings -> General -> Command line interface). `obsidian eval`,
  `dev:screenshot` and `dev:errors` are the debugging loop.

## Releasing
- Bump `version` in `manifest.json` (SemVer, no leading `v`). `versions.json`
  only needs a new entry when `minAppVersion` changes; it exists so older
  Obsidian installs can find the last version that still supported them.
- Push a tag equal to the version exactly (`1.0.0`, not `v1.0.0`). The release
  workflow builds, attaches `main.js`, `manifest.json` and `styles.css`, and
  attaches build provenance. The release is created as a draft; publish it once checked.
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
