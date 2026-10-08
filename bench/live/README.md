# The live harness

The scripts that measured Pulsar inside a running Obsidian for
[docs/performance.md](../../docs/performance.md). They are copies of what ran on
7 October 2026, cut down to what the one-session rerun used, with hard-coded paths
turned into variables. They have not been run again since that change, so treat a
failure as a bug in the copy before suspecting the method.

| File | What it does |
|---|---|
| `genvault.py` | Grows the bench vault: numbered one-line notes, 1 to 4 links each by preferential attachment, exponential ages with a 90-day mean. Deterministic per note, so 1,000 → 5,000 → 20,000 keeps the earlier notes. |
| `harness.mjs` | The measurements: `opengraph`, `switches`, `opentwo`, `settle`, `awake`, `timelapse`, `meta`, `benchsetup`, `guard`/`unguard`, `enable`/`disable`. Each run writes one JSON file with every sample. |
| `reconfigure.mjs` | Counts and times every `workspace.updateOptions` call across ten plugin loads. |
| `restyle.mjs` | The same, with every pending restyle forced and timed at fixed points, so a restyle left pending by the caller is not billed to the call. Written after `reconfigure.mjs` was fooled by exactly that. |
| `relay.mjs` | Evaluates a script inside the window of a named vault. |
| `pp.sh` | Runs one command through Obsidian's CLI and the relay. |
| `rerun.sh` | The one-session rerun, phases A (open the graph), B (note switches), C (timelapse at rest) and D (reconfigurations). |

None of these files is a module, and none is plugin code. `relay.mjs` and the scripts
it runs are read from disk and evaluated inside Obsidian by its command-line `eval`; the
`.mjs` extension only keeps them out of `npm run lint` and the community directory's
scan, as with the repo's build scripts.

## Running it

It needs Obsidian's CLI (installer 1.12.7 or later, with Settings → General → Command
line interface on), the release builds to compare, and two vaults you do not mind
writing to: the generated bench vault and a small one like the demo vault. Never point
it at a vault you use. The harness blocks Pulsar's history file from being written while
it runs, and `rerun.sh` copies builds and a settings file into the plugin folders.

```bash
python3 bench/live/genvault.py ~/pulsar-bench-vault 20000   # then open it in Obsidian

export OBSIDIAN=/path/to/Obsidian.com          # the CLI
export PULSAR_LIVE='C:/path/to/bench/live'     # this folder, as Obsidian sees it
export PULSAR_PROF_OUT='C:/path/to/pulsar-prof' # where run files go, as Obsidian sees it
export BENCH_PLUGIN_DIR=~/pulsar-bench-vault/.obsidian/plugins/pulsar-graph
export DEMO_PLUGIN_DIR=~/pulsar-demo-vault/.obsidian/plugins/pulsar-graph
export BENCH_SETTINGS=/path/to/data.json       # the settings to measure the bench with
export MAIN_138=… MAIN_139=… MAIN_140=…        # each release's main.js

PHASES="A B C D" bash bench/live/rerun.sh
python3 bench/extract.py "$PULSAR_PROF_OUT/runs" bench/results   # as this shell sees it
```

`extract.py` rebuilds each part of `bench/results/` whose raw files it finds, so a
rerun on its own replaces `rerun/` and leaves the rest alone.

The bench was measured with the author's settings. What matters in them for the
numbers: the age filter on with one range kept, 0.18–0.69 along the curve; age scale by
rank; exponential fade from 0.05 to 2.52; neighbour glow 0.7 over 3 hops; warmth by
linked island at 1; node size by age; ages on titles; fresh writing on; no pins. At
20,000 notes that filter keeps 4,168. The same range is what `test/range-stats.bench.ts`
uses.

## What the probe loop in AGENTS.md adds

The harness follows the rules in [AGENTS.md](../../AGENTS.md) and the `probe` skill:
every script checks `app.vault.getName()` first, because the CLI sends every command to
the focused window whatever `vault=` says; a leaf must be revealed before anything a
frame produces is measured; settings are changed in memory and the vault's `data.json`
compared with a copy afterwards; and a run returns counts and timings, never note titles
or paths.
