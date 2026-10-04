# Pulsar Graph

Fade graph nodes by how recently each note was modified, so the part of your
vault you are actually working in stands out and the rest recedes.

<!-- Demo GIF goes here: docs/demo.gif (see issue #2) -->

## How it works

Every note gets a recency value between 0 and 1: the oldest note in the vault is
0, the newest is 1. A fade curve shapes that value, and the result is mapped onto
the opacity range you configure. That opacity becomes the node's alpha in the
graph view.

Opacity is relative to your vault, not to the calendar. The newest note always
sits at maximum opacity, so a vault you have not touched in a month looks the
same as one you edited this morning. Absolute time windows are planned
([#3](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues/3)).

## Fade curves

| Curve | Shape | Good for |
| --- | --- | --- |
| Linear | Opacity tracks recency evenly | An even spread across the vault's history |
| Exponential | `recency ^ steepness` | Emphasising very recent work; steepness above 1 is steeper, below 1 gentler |
| Step | Recency rounded onto evenly spaced levels | Reading the graph as distinct bands of age |

<!-- Fade curve comparison image goes here: docs/curves.png (see issue #2) -->

## Settings

| Setting | Range | Default | Applies to |
| --- | --- | --- | --- |
| Fade type | Linear, Exponential, Step | Linear | all |
| Minimum opacity | 0.0 - 1.0 | 0.1 | all |
| Maximum opacity | 0.0 - 12.0 | 3.0 | all |
| Steepness | 0.1 - 10.0 | 2.0 | Exponential |
| Number of steps | 1 - 20 | 5 | Step |

Maximum opacity is allowed above 1.0 on purpose. Obsidian multiplies a node's
opacity by its own fade factor, so a value above 1.0 keeps recent notes at full
strength while everything older still fades. Minimum opacity is capped at 1.0,
and the two values cannot cross.

<!-- Settings screenshot goes here: docs/settings.png (see issue #2) -->

## Behaviour worth knowing

- Only markdown notes are graded. Attachments and unresolved links keep the
  colour the graph gives them, since their timestamps say nothing about when a
  note was worked on.
- Group colours survive. The plugin changes a node's alpha and leaves the colour
  Obsidian assigned it, whether that came from a graph group or the theme.
- A faded node is still a node. Obsidian draws labels, links and physics
  independently of node opacity, so a note at minimum opacity remains visible as
  a label and stays clickable. This is a fade, not a filter; filtering is
  tracked in
  [#23](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues/23).
- Updates are event-driven, not timed. Opacity is reapplied when a note changes,
  when a graph rebuilds its data, and when a setting changes. Nothing runs while
  the vault is idle.

## Installation

### Community plugins

1. **Settings** -> **Community plugins** -> **Browse**
2. Search for *Pulsar Graph*, then **Install** and **Enable**

### Manual

1. Download `main.js` and `manifest.json` from the
   [latest release](https://github.com/Lucas-Liona/obsidian-pulsar-graph/releases).
2. Put both in `YourVault/.obsidian/plugins/pulsar-graph/`.
3. Reload Obsidian and enable the plugin under **Community plugins**.

## Compatibility

- Obsidian 1.8.0 or newer
- Desktop and mobile
- Global graph and local graph views

The plugin reaches into Obsidian's graph renderer, which is not part of the
public API. It degrades to doing nothing rather than erroring if those internals
change, but a graph release can still require a fix here.

## Roadmap

Work is tracked in
[issues](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues) and grouped
into [milestones](https://github.com/Lucas-Liona/obsidian-pulsar-graph/milestones).
The near-term themes:

- **Legibility** - a note's age on hover, a live preview of the fade curve in
  settings, a spotlight on the most recently edited note.
- **Time model** - absolute time windows, normalisation that survives a vault
  where most notes are old and a few are new.
- **Reach** - compatibility with other graph plugins, opacity pooled across
  neighbours, a per-note edit history view.

Ideas and bug reports are welcome in the issue tracker.

## Development

```bash
git clone https://github.com/Lucas-Liona/obsidian-pulsar-graph.git
cd obsidian-pulsar-graph
npm install
npm run dev     # watch build
npm run build   # production build, type-check included
npm run lint
```

`main.js` is a build artifact and is not committed. To test a build in Obsidian,
copy it next to `manifest.json` in a vault's plugin folder and reload the plugin.
[AGENTS.md](AGENTS.md) has the repo's conventions and release process.

## About

This started as a pet project: I wanted to see which corner of my own vault was
alive, and the graph view would not tell me. It tries to do one thing well and
stay out of the way. I wrote the original plugin myself and built v1.0 with
Claude as a pair; the git history shows which commits are which.

The plugin is local and offline. It reads note modification times and nothing
else — no network calls, no telemetry, no vault content.

## License

[MIT](LICENSE)
