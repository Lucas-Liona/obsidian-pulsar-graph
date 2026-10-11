# Pulsar documentation

[← Back to the README](../README.md)

Pulsar grades Obsidian by time. One page per surface.

Everything here is switchable, including the graph fade itself — there is a
master toggle at the top of the settings, and off means nothing runs at all.

<table>
  <tr>
    <td width="50%" valign="top">
      <a href="time.md"><img src="assets/cards/time.png" width="100%" alt="The same part of a demo graph three times, labelled × 0.25, × 1 and × 6. At × 0.25 most notes are lit; at × 6 only the newest few are, in green, and the rest have nearly gone."></a><br>
      <b><a href="time.md">Time</a></b><br>
      What counts as old, and how an age becomes a brightness. The number everything else reads.
    </td>
    <td width="50%" valign="top">
      <a href="graph.md"><img src="assets/cards/graph.png" width="100%" alt="A small graph on a dark theme and on a light one. The newest notes are green, with a soft glow around them on the dark side and a soft shadow on the light side."></a><br>
      <b><a href="graph.md">The graph</a></b><br>
      Stars around the newest notes, size by age, the age above a node, the spotlight, the glow between neighbours, and what links carry.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="filter.md"><img src="assets/cards/filter.png" width="100%" alt="A graph with a line across the top reading “110 of 110 notes, 2 hours ago back to 11 months ago”."></a><br>
      <b><a href="filter.md">The age filter</a></b><br>
      Taking notes out of the graph rather than dimming them, with a scrubber in the graph's own panel.
    </td>
    <td width="50%" valign="top">
      <a href="local-graph.md"><img src="assets/cards/local-graph.png" width="100%" alt="A local graph around a note called Reinforcement Learning, with its age, 2 weeks ago, above its title. Its neighbours from the last week are drawn brighter than the ones from four and five months ago, and the newest, 5 days ago, is green."></a><br>
      <b><a href="local-graph.md">The local graph</a></b><br>
      The panel around one note, measured against its own notes, or from the note in the middle.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="pins.md"><img src="assets/cards/pins.png" width="100%" alt="Part of a graph with ages above the titles. Three notes from 9 and 11 months ago are pinned and drawn in purple at full strength, while notes from the last few weeks around them are faded."></a><br>
      <b><a href="pins.md">Pins</a></b><br>
      Notes you hold bright whatever their dates say. The one place you overrule the clock.
    </td>
    <td width="50%" valign="top">
      <a href="tabs.md"><img src="assets/cards/tabs.png" width="100%" alt="Three moments of a tab bar: a faded tab marked asleep, the pointer clicking it, and the tab opened."></a><br>
      <b><a href="tabs.md">Tabs</a></b><br>
      The tab bar as a readout of attention: tabs fade by how long since you looked, and the ones you have left alone sleep.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="writing.md"><img src="assets/cards/writing.png" width="100%" alt="A note on a dark theme in which the most recently typed sentences are green."></a><br>
      <b><a href="writing.md">Fresh writing</a></b><br>
      Text takes a colour as you type it and cools back to normal.
    </td>
    <td width="50%" valign="top">
      <a href="beads.md"><img src="assets/cards/history.png" width="100%" alt="Two notes’ histories side by side, each a rail marked now, 1 hour, 1 day, 1 week, 1 month and 1 year, with a bead for every sitting. One note was worked on ten months ago and again this week; the other only in the last two days, so its rail stops at a week."></a><br>
      <b><a href="beads.md">A note's history</a></b><br>
      Each sitting on a note as a bead down the sidebar, from Pulsar's own <a href="history.md">edit history</a>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <a href="performance.md"><picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/perf/scale-dark.svg">
        <img src="assets/perf/scale-light.svg" width="100%" alt="Dot plot on a logarithmic time axis, one row per operation, before and after, with Pulsar off where measured: opening the graph, note switches, a load with fresh writing on, a graph at rest after its timelapse, a refilter and a keystroke.">
      </picture></a><br>
      <b><a href="performance.md">Performance</a></b><br>
      What Pulsar costs at 20,000 notes, where the time goes, and how it was measured.
    </td>
    <td width="50%" valign="top">
      <b><a href="settings.md">Every setting</a></b><br>
      The reference table, with every default and what each one applies to.
      <br><br>
      <b><a href="../README.md">The README</a></b><br>
      What Pulsar is, why it was made, and how to install it.
    </td>
  </tr>
</table>

## Images

Everything these pages and the README use lives in [`assets/`](assets).

| File | What it shows |
|---|---|
| `banner.png` | The README banner |
| `graph-demo.png` · `graph-dark.png` | A graph at rest |
| `sky-pair.png` | 20,000 generated notes with stars, on a dark theme and a light one |
| `stars.png` | Stars and black holes in the demo vault |
| `cards/` | The pictures in the docs grid, one per page, 800×500 |
| `fade-sweep.gif` | The fade swept from hardest to softest |
| `age-filter.gif` | The age filter opened from newest-only to everything |
| `fresh-writing.gif` · `writing-light.gif` | Text typed, cooling, and reset — on a dark theme and a light one |
| `stale-tabs.gif` | A sleeping tab, clicked and closed |
| `graph-caption.png` | The graph with the line that says what is on it |
| `note-history.png` | A note's sittings as beads down the sidebar |
| `hover.png` | A node's age on hover |
| `old/` | Pictures that have been replaced, kept rather than deleted |
| `icon.svg` · `icon-mark.svg` | The mark: one bright point, and the same point further into the past |
| `perf/` | The performance page's charts and flame graphs, a light and a dark copy of each, drawn by [`bench/performance.ipynb`](../bench/performance.ipynb) |

Everything new is captured from the demo vault or the generated 20,000-note
bench vault, never from a real one, and
anything wide is checked for legible note titles before it goes in — see the
capture rules in [AGENTS.md](../AGENTS.md).
