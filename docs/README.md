# Pulsar documentation

[← Back to the README](../README.md)

Pulsar grades Obsidian by time. One page per surface.

Everything here is switchable, including the graph fade itself — there is a
master toggle at the top of the settings, and off means nothing runs at all.

| | |
|---|---|
| **[Time](time.md)** | What counts as old, and how an age becomes a brightness. Read this one first if you read any. |
| **[The graph](graph.md)** | Size, the age above a node, the spotlight, neighbour glow, folder temperature, links. |
| **[The age filter](filter.md)** | Hiding notes outside a stretch of time, and the scrubber in the graph's own panel. |
| **[The local graph](local-graph.md)** | The panel around one note, and why it is not a smaller version of the whole graph. |
| **[Pins](pins.md)** | Holding chosen notes bright whatever their dates say, and keeping them out of the filter's way. |
| **[Tabs](tabs.md)** | Fading by attention, the brightness dot, marking tabs you have left alone. |
| **[Fresh writing](writing.md)** | Text that lights up as you type it and cools back down. |
| **[Edit history](history.md)** | The log of when each note was worked on. |
| **[A note's history](beads.md)** | That log drawn as beads down the sidebar: bursts, gaps and quiet stretches. |
| **[Every setting](settings.md)** | The reference table. |
| **[Performance](performance.md)** | What Pulsar costs and where, how that was measured, and what changed release by release. |

## Images

Everything these pages and the README use lives in [`assets/`](assets).

| | |
|---|---|
| `banner.png` | The README banner |
| `graph-demo.png` · `graph-dark.png` | A graph at rest |
| `fade-sweep.gif` | The fade swept from hardest to softest |
| `age-filter.gif` | The age filter opened from newest-only to everything |
| `fresh-writing.gif` · `writing-light.gif` | Text typed, cooling, and reset — on a dark theme and a light one |
| `stale-tabs.gif` | A sleeping tab, clicked and closed |
| `graph-caption.png` | The graph with the line that says what is on it |
| `note-history.png` | A note's sittings as beads down the sidebar |
| `hover.png` | A node's age on hover |
| `icon.svg` · `icon-mark.svg` | The mark: one bright point, and the same point further into the past |
| `perf/` | The performance page's charts and flame graphs, a light and a dark copy of each, drawn by [`bench/performance.ipynb`](../bench/performance.ipynb) |

Everything new is captured from the demo vault, never from a real one, and
anything wide is checked for legible note titles before it goes in — see the
capture rules in [AGENTS.md](../AGENTS.md).
