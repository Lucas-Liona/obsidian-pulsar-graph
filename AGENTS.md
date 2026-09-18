# AGENTS.md — Pulsar Graph

Guidance for anyone (human or AI agent) working on this repo. Pulsar Graph is an
Obsidian community plugin that applies time-based opacity to graph nodes, so
recently-modified notes stand out and stale ones fade.

## Project shape
- TypeScript (`main.ts`) bundled to `main.js` by esbuild; loaded by Obsidian.
- Currently a single file (~440 lines): plugin lifecycle, a settings tab,
  opacity caching, and three fade functions (linear, exponential, step).
- Works on the global and local graph views. Local-only, no network calls.
- Release artifacts: `main.js`, `manifest.json`, `styles.css`.

## Commands
- `npm install` — install deps
- `npm run dev` — watch build
- `npm run build` — production build (type-check + esbuild)
- `npm run lint` / `npm run lint:fix` — eslint, zero warnings enforced
- `npm run type-check` — `tsc --noEmit`

## Conventions
- `"strict": true` TypeScript; keep it warning-clean.
- Register everything that needs cleanup with `this.register*` (intervals, DOM
  and workspace events) so unload leaks nothing.
- Local/offline only: no network calls, no telemetry, no reading vault content
  beyond note timestamps.
- Never change the manifest `id` after release; keep command IDs stable.

## Releasing
- Bump `version` in `manifest.json` (SemVer, no leading `v`) and `versions.json`.
- Tag a release matching the version exactly; attach `main.js`, `manifest.json`,
  and `styles.css` as individual assets.

## References
- Obsidian API: https://docs.obsidian.md
- Plugin guidelines: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines
- Community submission validator:
  https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml
