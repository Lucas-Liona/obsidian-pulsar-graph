# Pulsar Graph

Fades the nodes in Obsidian's graph by how recently you touched each note, so the
part of your vault you're actually working in lights up and the rest sinks back.

<p align="center">
  <a href="https://github.com/Lucas-Liona/obsidian-pulsar-graph/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Lucas-Liona/obsidian-pulsar-graph/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/Lucas-Liona/obsidian-pulsar-graph"></a>
  <img alt="Minimum Obsidian version" src="https://img.shields.io/github/manifest-json/minAppVersion/Lucas-Liona/obsidian-pulsar-graph?label=obsidian">
</p>

<p align="center">
  <img src="docs/graph-dark.png" width="880" alt="A graph of about 1200 notes. A scattering of nodes is bright white, most are dim, and the dimmest are barely visible against the background.">
</p>

<p align="center"><i>My own vault, 1200 notes. Every bright dot is something I touched this week.</i></p>

<p align="center">
  <img src="docs/fade-sweep.gif" width="420" alt="Animation of the same graph as the fade is swept from strongest to weakest. Nodes light up in waves, newest first, until the whole vault is visible.">
</p>

<p align="center"><i>The same vault, sweeping the fade from hardest to softest. The newest notes come up first.</i></p>

## Why I made it

I built this plugin a year ago and I've been using it since, and I wanted to share
it with people.

When you have a vault this big, you forget things you used to write. Graph mode
equalizes everything — a note from two years ago sits there looking exactly like
the one you wrote this morning. At first it's intimidating, and then it's just
flat. I wanted the graph to carry time in it, so I could see what I've been
working on without reading a single label, and so the old stuff would actually
look old.

That turned out to be the useful part. You find concepts you meant to keep up
with and haven't touched in months — all those learning notes sitting out at the
dim edge. It makes you want to go write them properly, and it pushes you toward
real links and well-defined notes, because that's what makes the clusters show up.

## How I use it

Set Obsidian's **text fade threshold** (Graph view settings → Display) so the
titles only appear once you lean in. Then at rest you're not reading anything —
you're just looking at colour, and you can feel what's new and what's gone quiet.
Zoom in a little and the names fade up right where you're looking.

It does the same thing for the local graph. When you're in a note and you can see
which of its neighbours are alive and which have been sitting there for a year,
that's a different kind of context than a list of links.

## What it does

Every note gets a recency value between 0 and 1 — the oldest note in your vault is
0, the newest is 1. A fade curve shapes that number, and the result becomes the
node's opacity.

Opacity is relative to your vault, not to the calendar. Your newest note always
sits at maximum opacity, so a vault you haven't opened in a month looks the same
as one you edited this morning. Anchoring to real time instead is
[planned](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues/3).

### Fade curves

| Curve | What it does | Good for |
| --- | --- | --- |
| Linear | Opacity tracks recency evenly | An even spread across the vault's history |
| Exponential | `recency ^ steepness` | Picking out very recent work. Steepness above 1 is sharper, below 1 gentler |
| Step | Recency rounded onto evenly spaced levels | Reading the graph as distinct bands of age |

### Settings

| Setting | Range | Default | Applies to |
| --- | --- | --- | --- |
| Fade type | Linear, Exponential, Step | Linear | all |
| Minimum opacity | 0.0 – 1.0 | 0.1 | all |
| Maximum opacity | 0.0 – 12.0 | 3.0 | all |
| Steepness | 0.1 – 10.0 | 2.0 | Exponential |
| Number of steps | 1 – 20 | 5 | Step |
| Show age on hover | on / off | on | all |
| Spotlight the newest note | on / off | off | all |

Maximum opacity goes above 1.0 on purpose. Obsidian multiplies a node's opacity by
its own fade factor, so pushing past 1.0 keeps your recent notes at full strength
while everything older still falls away. The two opacity sliders can't cross — move
one past the other and it takes the other with it.

### Hover and spotlight

A note's age — "3 days ago", "5 months ago" — is drawn above its node, centred,
the same distance up as the title sits down, in the same font and a little
quieter. It's part of the graph, not a tooltip over it, so it pans and zooms with
everything else. Obsidian's own page preview still works alongside it.

**Show note age** has three settings:

| | |
|---|---|
| **Never** | No ages at all. |
| **On hover** | The age appears above whichever node you're pointing at. The default. |
| **Whenever titles are shown** | Every node that's showing its name shows its age too, dimmed by that note's own opacity. |

That last one is worth a try if you already use the text fade threshold the way I
do: the names come in as you lean towards the graph, and now the dates come with
them, with old notes carrying faint ones.

The spotlight paints the single most recently modified note a colour of your
own, so the thing you touched last is findable at a glance. It's off by default,
because it's the one feature here that changes a node's colour rather than its
opacity, and it puts the original colour back the moment the newest note changes,
you turn it off, or the plugin unloads.

**Spotlight strength** decides how far that colour overrides the node's own. At
full strength you get exactly the colour you picked. Below that it mixes with
whatever your graph groups gave the node, which is the only way a group colour
should ever end up in there.

## Worth knowing

- **Only notes are faded.** Attachments and unresolved links keep whatever colour
  the graph gives them. Their timestamps don't say anything about when you were
  actually working on something.
- **Your group colours survive.** The plugin changes how transparent a node is and
  leaves its colour alone, so anything you've set up with graph groups still works.
  The one exception is the newest-note spotlight, which is off unless you turn it
  on and restores the colour it replaced.
- **A faded node is still there.** Obsidian draws labels, links and physics with
  their own opacity, so a note at minimum opacity still has a visible title and
  stays clickable. This is a fade, not a filter — that's
  [a separate idea](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues/23).
  Turning the text fade threshold up is the fix today, and it's the better way to
  use it anyway.
- **Nothing runs on a timer.** Opacity is reapplied when a note changes, when a
  graph rebuilds, and when you change a setting. While the vault is idle the plugin
  does nothing at all.

## Install

Pulsar Graph isn't in the community directory yet. Until it is:

1. Download `main.js`, `manifest.json` and `styles.css` from the
   [latest release](https://github.com/Lucas-Liona/obsidian-pulsar-graph/releases).
2. Put all three in `YourVault/.obsidian/plugins/pulsar-graph/`.
3. Reload Obsidian and turn it on under **Community plugins**.

## Compatibility

Obsidian 1.8.0 or newer, desktop and mobile, global and local graph views.

The plugin reaches into Obsidian's graph renderer, which isn't part of the public
API. It's written to quietly do nothing rather than break if those internals
change, but a graph update can still mean it needs a fix here.

## Where it's going

I made this to do one thing well, and I'd rather keep it that way than bolt on
everything. That said, time is a bigger idea than opacity, and the direction I'm
interested in is making time easier to see throughout the graph: a note's age on
hover, a spotlight on whatever you edited last, a preview of the curve while
you're setting it, and anchoring opacity to real dates instead of to your vault's
own range. Further out, playing nicely with other ways of exploring a graph.

It's all in the [issues](https://github.com/Lucas-Liona/obsidian-pulsar-graph/issues)
and grouped into [milestones](https://github.com/Lucas-Liona/obsidian-pulsar-graph/milestones).
If you use this and something is missing, open one.

## Development

```bash
git clone https://github.com/Lucas-Liona/obsidian-pulsar-graph.git
cd obsidian-pulsar-graph
npm install
npm run dev     # watch build
npm run build   # production build, type-check included
npm run lint
```

`main.js` is built, not committed. To try a build, copy it next to `manifest.json`
in a vault's plugin folder and reload the plugin.
[AGENTS.md](AGENTS.md) has the repo conventions and the release process.

## Credits

Written by me. The 1.0 cleanup — splitting it into modules, the build and release
setup, and a pile of bug fixes — I did with Claude, in my free time, to get the
repo into shape so other people could actually use it.

## License

[MIT](LICENSE)
