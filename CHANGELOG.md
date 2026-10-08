# Changelog

## [Unreleased]

### Added

- **More of Pulsar in the graph's own panel.** Under *Nodes*, a *Glow* slider
  and switches for *Size by age* and the *Spotlight*; and a new *Links* group
  with how links are aged (*Off*, *Match newer*, *Fade*) and a *Trace
  sittings* switch. They are the same settings as in the settings tab, so
  moving one moves the other, and each applies to the graph as you change it.

- **A tab's dot says when its note was edited**, on hover, the way a link's
  dot does: "Edited 5 days ago". The dot used to let the pointer pass through
  it, so there was nothing to hover; a click on it still lands on the tab.

### Changed

- **A note's history is drawn on one scale for every note**, logarithmic back
  from now, instead of each rail being scaled to its own note. A rail covering
  twenty minutes used to look exactly like one covering a year. Now the top is
  now, labels mark an hour, a day, a week, a month and a year (then two, five,
  ten and twenty years), and a year is 420 pixels down in every note, so two
  notes read against each other. This morning still spreads out, since the
  first hour gets 93 pixels and the first day 206; a month of daily sittings a
  year ago spans about 3. The rail stops at the first label past the oldest
  sitting, so a short history stays short. A note with one sitting gets the
  axis too, and the view redraws itself once a minute while it is shown,
  since a bead's place is its age.

- **Fresh writing can cool in as little as a second**, and still over as long
  as four hours. *Cools over* is one slider of round steps — 1, 2, 3, 5, 10, 15,
  20, 30 and 45 seconds, then minutes, then hours — marked where the unit
  changes, so the short end is as easy to pick as the long one. It used to
  start at a minute. A duration set before this keeps its value until the
  slider is moved.

- **Every other length of time is set the same way**: *Faded after*, *Marked
  after*, *Touched within*, *Counts as one sitting*, *Never spread across less
  than*, *Window*, *Half-life* and *Stays lit for* are each a slider of round
  steps, written with their unit ("45 min", "6 h", "14 d") and marked where the
  unit changes, instead of a bare number whose unit was only in the
  description. Three reach further:
  - **a window can be six hours**, and a half-life an hour, so "today" can be
    the whole range; both stopped at a day;
  - **the spotlight's window reaches a day**, so it can mark everything
    touched today; it stopped at 12 hours, and its slider moved in fives from
    1, so it never landed on its own default of 30;
  - **the spread floor goes down to 15 minutes**, for a local graph of one
    afternoon; it stopped at an hour.

  Each is stored in the unit it always was, as a fraction where it needs one,
  so a version from before reads a value below its own floor as that floor.

### Fixed

- **On a light theme the newest notes no longer vanish into the page.** Past
  full strength Obsidian lightens a node, which on a dark background reads as
  brighter and on a light one fades it toward white: under the shipped maximum
  of 3, Moonstone's newest notes were drawn white on white and the graph was
  links and nothing else. On a light theme a note past full strength is now
  drawn solid and deepened toward black instead, the mirror of what a dark
  theme does. In the demo vault on Moonstone, 14 of 112 nodes were invisible
  at the new defaults and 100 at the old; now 1 is, the white spotlight. Dark
  themes are unchanged.

- **Switching theme with a graph open recolours its notes.** A note with no
  group colour kept the old theme's grey through every repaint: the dark
  theme's `#b3b3b3` against a light fill of `#5c5c5c`, measured. It follows
  the theme now, and so does the colour a pinned or spotlit note is handed
  back.

- **Blending in edit intensity no longer dims notes with nothing on record.**
  A note with no sittings counted as the least worked-on of all, so while the
  history was new every note was dimmed by the blend: at 0.25, the newest note
  reached three quarters of the range and no further. A note with no record is
  judged by its date alone now, and one with sittings is blended as before.

- **The note history's rail ends at its oldest bead.** It ran from when the
  first sitting began, but each bead is drawn where its sitting ended, so the
  bottom of every rail was a label with no bead at it: a note with one sitting
  had its bead at the top of an empty line, labelled "4 hours ago" at both
  ends, and in a longer history the oldest bead floated above the bottom by
  its own length.

- **How long a sitting is can be set again.** *Counts as one sitting* decides
  how the edit history counts sittings, but it was only shown with *Trace what
  was written together* on, which is off by default. It is listed under
  History now, and with the trails when History is off.

- **The caption's switch is always there.** *Say so on the graph* draws a line
  on every graph, filter or not, but its switch was only shown with the filter
  on, so the only way to turn the caption off was to turn the filter on first.

- **Brightest in the graph's own panel goes as high as the setting.** It
  stopped at 6 while *Maximum opacity* goes to 12, so a value above 6 jumped
  down the moment the panel's slider was touched.

- **The docs and settings say what the spotlight and status bar do.** The
  spotlight was described as painting "the single" newest note, though it can
  cover up to 25 or a time window, and the tabs page said the status bar age
  was off by default, which it has not been since 1.15.0.

## [1.42.0] - 2026-10-08

### Fixed

- **Dragging the age filter shows its result again.** While a handle was held,
  the notes outside the range were meant to disappear with the graph held
  still, then rebuild on release; nothing disappeared, because Obsidian puts
  back the flag Pulsar hid them with on every frame. They are hidden in a way it
  leaves alone now, and a held drag costs less per frame than before
  (0.44–0.47 ms against 0.58–0.62 ms in the demo vault).

- **A graph is filtered from its first build after Obsidian starts.** A graph
  restored at startup, or opened while the tab bar was switched off, was
  filtered against ages that had not been worked out yet, so it showed every
  note until something made it filter again. Starting with a graph restored and
  the filter on is now 35% faster at 10,000 notes and 26% faster at 50,000,
  because the first build is only the notes the filter keeps.

- **A replay ends.** Once the timelapse has drawn every note the filter allows,
  the graph goes back to today's brightness. It used to wait for the vault's
  newest note, which the filter may never draw, so it stayed in replay
  brightness.

- **A note deleted while it was open stays out of the edit history.** It could
  be written back as seen a moment after it was deleted.

- **Switching Pulsar off and on quickly keeps the last sitting.** Turning it
  back on read the history before the save from turning it off had landed.

- **A settings tab left open across a reload can no longer save over newer
  settings**, such as a pin made since.

- **A closed graph is let go of.** A graph whose tab had been closed could stay
  attached and be rebuilt with the others on every refilter.

- **An old filter range saved with equal minimum and maximum opacity keeps the
  notes it kept.**

### Documentation

- **How Pulsar's performance is measured**, in `docs/performance.md`: the
  method, the machine, the results release by release, flame graphs, threats to
  validity and the corrections, with a notebook that recomputes every number
  from the data in the repo.

## [1.41.0] - 2026-10-08

### Fixed

- **A local graph keeps its own note through the age filter.** The filter
  never removes the note you have open, but a local graph linked to one pane
  keeps its note while you work in another. With a filter keeping older notes
  than that one, looking away dropped it from its own graph, and dragging a
  handle hid it the same way. Each graph now spares the note it is built
  around.

- **The edit history survives a write cut short.** Obsidian writes a file in
  place, so quitting or crashing part way through a save left `history.json`
  cut off, and the next load started a new history. Each save now writes
  `history.backup.json` first and `history.json` second, and a history that
  will not read is read from the backup. In the demo vault, a history cut in
  half at reload went from 112 notes to 0 before and kept all 112 after. A
  save takes about 2 ms longer.

- **An unreadable history is never written over.** A history file that was
  there but could not be read, such as one held for a moment by a sync tool or
  a virus scanner, used to be replaced by an empty one at the next save:
  112 notes to 0 in the demo vault under a 20-second lock. Pulsar now records
  nothing until it can read the file, and tries again every half minute. A file
  that reads but is damaged is kept as `history.damaged-<date>.json` before a
  new one starts.

- **The spotlight and pins are drawn in exactly the colour picked.** Above a
  maximum opacity of 1, Obsidian's graph lightens each colour channel
  separately, which turned a green spotlight (`#4dff91`) turquoise
  (142, 255, 255) at a maximum of 1.85. Painted nodes are now drawn at an
  opacity of at most 1, so the colour stays (77, 255, 145). Grey nodes still
  go whiter, as a high maximum intends.

- **The histogram's overflow mark is no longer red.** It ran into the start of
  the red curve over the first bar. It is now a lighter grey than the bars.

### Performance

- **Fresh writing's colours restyle only the editors.** They were set on the
  whole window, so every load with fresh writing on restyled every element in
  it. With six editors open in the demo vault, a load's restyling and editor
  reconfiguration went from 20.72 ± 1.00 ms to 9.31 ± 1.30 ms, and changing a
  fresh-writing colour saves the same.

### Documentation

- **The settings reference lists every setting**, 66 rows in the settings
  tab's order. The `obsidian` typings are pinned to the version the build uses,
  so a build of the source reproduces the release.

## [1.40.0] - 2026-10-07

### Added

- **A dot after each link**, off by default, under Elsewhere → *Links in
  notes*. Every link to a note that exists gets a dot at the brightness that
  note has in the graph, in the pin colour if it is pinned, and hovering it
  says when the note was last edited. It works in reading view and in the
  editor. Links to notes not yet written, web links, embeds and anything in code
  get no dot. In a test note of 30 links, a keystroke cost 0.988 ± 0.326 ms with
  dots on and 1.021 ± 0.377 ms with them off; reading view spends
  0.24 ± 0.09 ms per render adding them.

- **Fresh writing has a status bar item of its own**: a paint bucket and the
  number of characters in the open note that still look lit. It follows the text
  as it cools instead of updating once a minute. Click it to cool this note's
  writing; right-click to cool or unpin. The tooltip counts pinned characters,
  and a note with only pins left shows the bucket alone. New command: *Unpin
  writing in this note*.

- **A Clear and reset section**, last in the settings, holds the three actions
  that cannot be undone: *Forget everything recorded*, *Reset all settings* and
  *Unpin every note*, moved there from History, Presets and Pins. Each needs a
  second click within 4 seconds, and is greyed out when there is nothing to act
  on. Deleting a saved preset also asks twice.

### Changed

- **Cooling fresh writing keeps pins.** Clicking the status bar item, the *Cool
  fresh writing* command and *Start again* all used to erase pinned writing as
  well.

- **Resetting settings keeps pinned notes**, along with saved presets and which
  sections are folded. A reset used to empty the saved pin list without
  touching the one the graph draws from. Pins have their own button now.

### Fixed

- **A tab counts as ignored from when it was left.** The attention clock
  stamped a note only when it was opened, so a note sat in for twenty minutes
  read as twenty minutes ignored the moment it was left: its tab faded, it could
  be marked stale, and the next session started from the same time. With tab
  fading on, a tab left after 20 minutes was drawn at 0.567 in 1.39.0 and is now
  drawn at full strength. Leaving for the graph or an empty tab, switching
  Pulsar off and quitting all count as leaving.

- **A load reconfigures no editor it does not need to.** Every load had Obsidian
  reconfigure every open editor twice, whether fresh writing was on or not; in a
  real vault the two took 51 ms between them. Now a load reconfigures none while
  fresh writing and link dots are both off. With fresh writing on it still
  reconfigures once, one fewer than before. *(Corrected after release, twice.
  This first said one reconfiguration took 51 ms. It then said the one left
  cost 14.7 ± 1.6 ms against 7.2 ms for 1.38.0's two, but that figure included
  a restyle of the whole window that 1.38.0 paid just after its
  reconfigurations instead of during them. Timed together, a load with fresh
  writing on cost 25–28 ms after 1.40.0 against 31–34 ms in 1.38.0, and 1.41.0
  removes most of the restyle.)*

## [1.39.0] - 2026-10-07

Performance, from profiling 1.38.0 in a real vault, the demo vault and a
generated bench vault of 20,000 notes. The bench numbers use a real vault's
settings, whose age filter keeps 4,168 of the 20,000.

*Corrected after release.* The figures below come from a later run of 1.38.0,
1.39.0 and Pulsar off side by side in one session, every run kept. The
originals compared measurements taken hours apart and timed no 1.38.0 graph
opening at all; side by side, a switch between notes the filter hides gained
less than first published.

### Fixed

- **A graph opens already filtered.** A new graph was first built from every
  note and filtered only afterwards, and a graph already open when Pulsar loaded
  stayed unfiltered: 1,115 nodes instead of 241 in a real vault after a reload.
  Graphs are now filtered from Obsidian's very first build of them, so opening
  one costs what the filtered graph costs. Opening the bench vault's global
  graph settles in 6.16 ± 0.11 s and blocks the main thread for 0.30 ± 0.05 s,
  against 10.94 ± 0.76 s and 5.02 ± 0.69 s in 1.38.0, and 30.65 ± 3.88 s and
  25.84 ± 4.31 s with Pulsar off.

- **A graph stops drawing once nothing changes.** A graph whose timelapse had
  been started never went idle: Obsidian keeps handing it the same data about
  nine times a second, and Pulsar repainted and woke it every time. With a
  timelapse started in the demo vault, its renderer used 0.31 ± 0.02 of a core
  in 1.38.0; it now uses 0.07 ± 0.01, the same as with Pulsar off.

- **A note switch does less.** It re-ran the filter over every open graph even
  when the two notes involved could not change what was shown, and repainted
  every graph twice, the first time for nothing. On the bench, the main thread
  was blocked for 149.6 ± 12.0 ms per switch in 1.38.0 and is now 78.3 ± 7.1 ms.
  Switching between notes the filter would hide, which does need a refilter,
  went from 157.2 ± 9.7 ms to 119.0 ± 7.5 ms. In a vault whose filter keeps old
  notes, switching between recent ones still refilters, because that really
  does change what is shown.

- **Refiltering is cheaper.** A refilter that leaves a graph as it was no longer
  rebuilds it: 1.162 ± 0.253 ms down to 0.343 ± 0.048 ms in a real vault.

## [1.38.0] - 2026-10-07

### Added

- **Measure a local graph against itself**, off by default. Notes that link to
  each other tend to have been written together, so graded against the whole
  vault a panel's notes come out nearly alike: across 123 panels in a real
  vault, the median spread was 11% of the brightness range, against 100% when
  each panel was measured on its own. The spotlight follows the same setting and
  picks the newest notes in the panel.

- **Measure a local graph from the note in the middle**, off by default, with a
  toggle in the graph's own panel. Brightness becomes how close in time each
  note is to the centre, in either direction, which answers *what else was being
  worked on at the time*. In 66 of 123 panels there were notes on both sides of
  the centre, and a one-sided age scale discards one side.

- **Write every age in a local graph**, off by default. The ages above titles
  are one setting for both graphs, and writing one on every title is noise
  across a whole graph; a local graph can now be told to write them regardless.
  They follow the titles, so they appear on the nodes whose names Obsidian is
  drawing at that zoom: 5 of 13 in one panel.

- **A spotlight by time window**: everything touched in the last so many
  minutes, however many that is, including none. A count always answers: at an
  idle moment in a real vault the newest three notes were 21, 34 and 124 minutes
  old, so a note left two hours ago was marked as where you are. The spotlight
  itself is still off by default, and a count is still what it does when
  switched on.

- **Pins show in the tab bar.** Where the brightness dot is on, a pinned note's
  dot takes the pin colour, so a note held bright no longer looks like one
  edited this morning. While nothing is pinned, the graph's own panel says
  *Right-click a node to pin it.*

- **The graph's own timelapse is lit as it plays**, off by default. Obsidian's
  *Start timelapse animation* replays the vault in creation order, but each note
  was drawn at today's brightness, so the first half of a replay was nearly
  black: at 180 days back, all 72 notes that existed sat at minimum. Each note
  is now graded from the moment being shown, and the graph goes back to reading
  today once the replay catches up.

- **A Pulsar section in the graph's own panel**, beside Filters, Groups, Display
  and Forces. Dimmest, brightest, the curve, title size and ages sit there with
  the age filter, and they are the same settings the dialog holds. Sliders apply
  while you drag and save 400 ms after the last step; a measured five-step drag
  saved once.

### Changed

- **Settings in seven parts instead of fifteen headings**: Time, The graph,
  Highlights, Tabs, Elsewhere, Setup and Measurements, each of which folds shut
  and remembers it. The graph and Tabs carry a switch of their own, on by
  default, that releases what that part draws rather than dimming it: switching
  the graph off took attached renderers from 1 to 0. All 58 settings are still
  there, with one renamed to *Show the open note's age* now that it sits under a
  status bar heading.

- **A pin outranks the spotlight.** The spotlight skips pinned notes and takes
  the next newest instead, so you see both the note you chose and the one you
  were last in. Where the two still land on one node the pin's colour wins,
  reversing the order 1.37.0 shipped.

- **A local graph's caption describes the panel, not the vault**: how many notes
  it holds, how many the age filter has hidden, and how old they are. Over a
  panel the vault line was true and useless, and without the hidden count a
  panel the filter has nearly emptied looks just like a note with no links.

- **The age filter's handles go where you aim.** A press goes to the nearest
  handle by distance; at the narrowest range the handles sit four pixels apart,
  and before this the one drawn later took presses aimed at the other. Hovering
  the histogram describes that stretch alone, and the caption gives the share as
  a percentage.

- **The age filter's histogram is a smooth curve over 40 bars**, on a
  square-root scale with a labelled axis, and the bars inside the selection
  brighten. It used to be scaled to its tallest column, which held 300 notes
  against 5–15 in the rest, so everything else was drawn flat. Notes piled at
  the floor or ceiling of the fade are left out of the curve, and their bar is
  capped in red.

- **Figures are separated by a centred dot rather than commas** wherever the
  plugin reports numbers: the range caption, the caption over a graph, the panel
  summary, the statistics and the status bar.

- **Docs**: the README is caught up with what has shipped, and the loop behind
  this repo's measurements is written down.

### Fixed

- **An unloaded plugin no longer keeps drawing on the graph.** Instances left
  behind by a reload kept their hooks and put them back on every graph refresh,
  which is how one node's title came to carry seven age labels. After three
  reloads with an update pending and three graph refreshes, the render chain
  held 22 wrappers; it now holds 1. A title Obsidian rebuilds also gets its age
  label back.

- **The age filter no longer sorts the vault once per note.** Dragging it,
  hovering its histogram and every graph pass were quadratic in vault size, and
  a pass runs after every note save while a graph is open. On a 1104-note vault
  a full pass over both graphs went from 276.8 ms to 2.94 ms.

- **The age filter measures along the curve, and draws what it selects.** The
  histogram drew pooled brightness while the handles selected on opacity clamped
  at 1, so at the default settings the top 69% of the curve was a single point
  on the line. Both now read a note's own position along the curve, and saved
  ranges, presets included, are converted on load so they keep selecting the
  same notes.

- **Two settings were filed in the wrong place.** The stale-tab settings were
  drawn under Pins, so they looked missing to anyone reading the Tabs section,
  and the status bar age sat under Labels.

## [1.37.0] - 2026-10-06

Two features, one idea: a note is more than the single moment Obsidian records
against it.

Until now Pulsar read exactly one number per note — its modification time — and
everything followed from that. That answers *what have I been working on* and
nothing else. This release adds the two things it could never say: **this one
matters regardless of its date**, and **here is everything you did to it, not
just the last thing**.

### Pins

The note you are heading back to is, by definition, one you have not touched
lately. The longer you leave it the fainter Pulsar draws it, and under the age
filter it eventually leaves the graph altogether — the thing you most need to
remember is the thing the plugin is busy forgetting.

A pin overrules the clock. Pinned notes are held at full brightness, given a
colour of their own, and **cannot be removed by the age filter**.

Right-click a node in the graph, or a note in the file explorer, and choose *Pin
in the graph* — or use the command for the note you have open, which takes a
hotkey. The settings tab lists what is pinned with an *Unpin* beside each.

Pins write nothing into your notes and leave your modification times alone,
which matters because this plugin reads them. They follow a rename, and they are
deliberately left out of saved presets — a preset is a look, and a pin is a path
in *your* vault.

→ [Pins](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/pins.md)

### A note's history, drawn as beads

Obsidian keeps one modification time per note and throws the rest away, so the
graph can tell you a note was touched this morning and never that it was touched
every morning for a month and then abandoned. Pulsar has kept the rest since
1.22.0; this is the view it was collected for.

One bead per sitting, down a rail in the sidebar. Position is when, size is how
long it ran, brightness is the vault's own fade curve, and hovering gives the
date, the duration and how much the note grew. Open it with **Show this note's
history**.

Positioned rather than listed, because the shape is the point: it is what tells
"edited three times today" from "appended to once a month" without reading a
number, and the gaps say as much as the beads.

The rail is scaled to that note's own history, not the vault's — against the
vault a note with two sittings three hours apart put both beads in the same
pixel, because three hours is nothing beside eleven months.

→ [A note's history](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/beads.md)
· closes #26

### Also

- **Fixed a colour the plugin could leave behind.** Releasing a node's colour
  put `node.color` back correctly and still left it *drawn* in the old one,
  frozen a few units short. Two causes: mid-rebuild a node's colour reads back
  `undefined`, so the code preserving it preserved nothing; and the renderer
  eases a tint a tenth of the gap per frame and truncates, so a channel climbing
  the last few units moves by zero and stalls permanently. Easing down
  converges, easing up does not. After the fix, 0 of 111 nodes disagree between
  drawn tint and colour; before, 1 did. This affected the spotlight every time
  it moved on.
- The spotlight and pins now share one record of what each node was painted. Two
  of those, each saving and restoring the same node's colour, is how a graph
  group's colour gets lost for good.

## [1.36.0] - 2026-10-06

Three small things, all about making what matters easier to see.

### The line across the top of the graph

It used to appear only while the age filter was narrowing something. It is now
on whenever you want it, and it reads:

> 110 of 110 notes, 2 hours ago back to 11 months ago

The `Age filter` prefix went with it, because it is no longer only about the
filter. While you are filtering, it is necessary — a graph with half its notes
taken out looks exactly like a graph. While you are not, it still answers the
question a graph raises on its own: *what am I looking at*.

### The spotlight can cover more than one note

At 1 it marks the thing you touched last. At 5 it marks the last five, which
reads as *where you have been* rather than *where you are* — a short trail
through the graph instead of a single point.

Every spotlit node keeps the colour it had underneath, so turning the count back
down hands them all back exactly as they were.

### Sleeping tabs

A tab you have left alone can now wear a 💤 instead of the quiet line down its
edge. It takes the brightness dot's place rather than sitting beside it: a
narrow tab has room for one or the other, and a tab you are being invited to
close has nothing useful to say about how bright it is.

Nothing closes on its own, as before. **Close stale tabs** is still a command
you run.

---

📖 [The graph](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/graph.md)
· [The age filter](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/filter.md)
· [Tabs](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/tabs.md)

## [1.35.0] - 2026-10-06

One toggle at the top of the settings, and off means off.

### Switching it off actually switches it off

Not "stops drawing" — nothing is watched, nothing is cached, no timer runs, no
editor carries anything of ours, and every graph is handed back its own colours.
Measured across the switch:

| | on | off |
|---|---|---|
| graphs hooked | 3 | **0** |
| notes cached | 1,090 | **0** |
| editor extensions | 1 | **0** |
| nodes carrying a Pulsar colour | 1,090 | **0** |
| status bar item | yes | **no** |

Every feature below it can still be switched off on its own, and almost all of
them already are until you ask.

Commands stay in the palette either way, so a hotkey you assigned survives being
switched off. They say so if you press one.

### The settings page is readable now

It had grown to thirteen sections in the order they were built, with no
explanation of what any of them were for.

- **Every section says what it is for.** You should not have to work out what
  "Fade" fades — which is also why it is now called **Graph fade**.
- **A rule between sections**, so the page has a shape.
- **Ordered by surface**, not by build history: time, then the graph in drawing
  order, then the places that are not the graph, then the data underneath. If
  you only want the graph, you never scroll past *Age filter*. *Fresh writing*
  used to sit between *Links* and *Size* for no reason at all.
- **Switched off, it collapses to the one switch** — 61 controls become 1.

---

📖 [All the documentation](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/README.md)

## [1.34.0] - 2026-10-06

Three changes about one complaint: the thing you are looking for stops being
findable exactly when you narrow down to it.

### Measure age against whatever the graph is showing

A third option beside *the vault's whole history* and *a recent window*.

Filter down to your brightest few per cent and every note left is at the top of
the range together — so the gradient tells you nothing precisely when you have
asked the most specific question. Measured on a 1,089-note vault filtered to its
brightest 2%:

| measured against | the 194 notes still on screen |
|---|---|
| the vault's whole history | **0.981 – 1** — all at full brightness, all identical |
| whatever the graph is showing | **0.05 – 1** — the full range |

It respects Obsidian's own Filters and the graph's search box too, so typing a
tag there turns the search box into a time lens for just those notes. It pairs
especially well with the **rank** scale.

Two things keep it honest. It only ever decides *how bright*, never *which notes
are in* — the filter still reads the absolute scale, so it cannot feed itself.
And the range is held open to a floor, six hours by default, because three notes
from the last ten minutes genuinely are all recent and drawing the
nine-minute-old one as ancient would be a lie.

### The spotlight can grow the node

Worth knowing why it needed to. Obsidian sizes a node by its **link count and
nothing else** — and the note you wrote last is almost always the least-linked
thing in your vault. So the one node you always want to find was reliably the
*smallest* on screen: measured at the size floor with 12 of its 35 neighbours
larger than it.

It multiplies on top of any other sizing rather than replacing it, so switching
on *size by age* can never make the spotlight shrink.

### The spotlit note is never filtered out

On the same rule the note you have open already had. A filter quietly removing
the one node the graph is pointing at is the graph disagreeing with itself.

---

📖 [Time](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/time.md)
· [The graph](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/graph.md)

## [1.33.0] - 2026-10-06

Text takes a colour as you type it and cools back to normal over the next few
minutes, so a page shows you where the work in it actually was.

This was in 1.32.0 too, but only just — it had one bug that made it unusable on
a styled theme, and it was missing the two things that make it worth leaving on.

### Writing cools toward its own colour

Before, every lit stretch cooled toward your body-text colour and then
**snapped** to its real colour when the mark expired. On a theme with coloured
headings that is very obvious and very wrong.

Each stretch now cools toward whatever that text would otherwise be. A heading
ends up its own colour, a link ends up link blue, body text ends up white. There
is no colour table and nothing is read from your theme — it falls out of how CSS
resolves `currentColor`.

Measured on a page whose headings are `rgb(235, 111, 146)`: at the same point in
the fade, a heading sits at `oklab(0.769, -0.042, …)` and a body line at
`oklab(0.829, -0.075, …)`. Same ink, same age, already heading somewhere
different.

### Dim everything else

The opposite arrangement: leave the writing alone and take the rest of the page
down toward the background instead. It never replaces a colour you chose, which
makes it the one to use while actually working, where the tint is better for
showing someone.

A note with nothing lit in it is never dimmed, so opening your vault does not
grey it.

### Pins

**Pin this writing** holds a stretch at full strength and stops it cooling. A
pin is a marker, not a timestamp — it answers *come back to this* — so it does
not fade, and it has its own colour.

With nothing selected it pins the lit stretch under your cursor, or the current
line if there is none, which is what makes it work on text you did not just
write.

### The status bar counts, and resets

`Edited 4 minutes ago · 340 lit · 12 pinned`. Click it to cool everything. It is
only there while something is lit.

### Also

- The age drawn above a node now follows **Title size**. Obsidian derives that
  font from the node's size, so scaling titles used to leave the ages behind.

---

Nothing is ever written to your note. It is a colour in the editor and the file
on disk is untouched — close the note and it is gone.

📖 [Fresh writing](https://github.com/Lucas-Liona/obsidian-pulsar-graph/blob/master/docs/writing.md)

## [1.32.0] - 2026-10-06

### Added

- **Light up fresh writing, and let it cool**, off by default. Text you type is
  lit and cools a shade at a time until it is back to normal, and **Cool it
  all** clears every mark at once. CodeMirror reports the exact ranges each edit
  inserted, so nothing is diffed or snapshotted and the note on disk is left
  unchanged.

## [1.31.0] - 2026-10-06

### Added

- **Size nodes by age, and set the title size.** Obsidian sizes a node by its
  link count alone, and on a 1088-note vault 381 of the first 400 nodes sat at
  the size floor, so the size channel was almost unused. Sizing by age
  multiplies Obsidian's own size rather than replacing it, so a hub still reads
  as a hub. Title size is its own control, since Obsidian otherwise derives a
  title's font from its node's size.

## [1.30.0] - 2026-10-06

### Changed

- **An age filter you can aim, and that says what it caught.** The histogram
  under the range has twenty columns instead of five, the handles are thin
  enough not to sit on top of each other at the narrowest range, and dragging
  the stretch between them moves both edges at once. A caption under the line,
  and optionally across the top of the graph, says how many notes the range
  holds and how old they are, counted rather than estimated.

## [1.29.0] - 2026-10-06

### Added

- **Choose what a faded tab fades, and how.** Either the icon and title as
  before, or the whole tab with its background, which is the default; hovering a
  faded tab brings it back to full strength either way, so its close button
  stays usable. The fade can also step at the end of the span instead of sliding
  across it, because a gradient over a short span saturates: at one minute, 13
  of 14 tabs sat at the floor together.

## [1.28.0] - 2026-10-06

### Fixed

- **The tab bar keeps up, and stops flickering.** Sidebar panels such as the
  outline, backlinks and local graph report a file of their own, so they were
  given a brightness dot or a dimmed title and seemed to change by themselves;
  they are now left alone. A tab switch moved dots 42 times on a 14-tab window
  and now moves none, and every dot is one colour instead of the active tab's
  standing out. Writing in a note repaints its tab, rather than waiting for a
  tab change or the 30-second timer.

## [1.27.0] - 2026-10-06

### Added

- **Mark tabs you have left alone**, off by default. Once a tab has gone
  unlooked-at past a threshold of your choosing, a quiet line appears down its
  edge, and a **Close stale tabs** command closes the marked ones. Closes #54.

  Nothing closes on its own. A tab that shuts itself feels like data loss even
  when nothing is lost, and it is the plugin that gets blamed for losing
  someone's place.

  A pinned tab is never marked, since pinning is a deliberate statement that it
  should stay. Nor is the tab in front of you, which reports no idle time at all.
  Sidebar panels are excluded as well: the outline, backlinks, local graph and
  outgoing links views each report a file of their own, so without that check the
  command would have offered to close someone's sidebar.

### Fixed

- The README still said the attention clock was forgotten on every restart. It
  has survived restarts since 1.23.0, with the time Obsidian spent closed not
  counted against a tab.

## [1.26.0] - 2026-10-06

### Added

- **Blend in edit intensity**, at 0 by default. A node's brightness can now come
  partly from how often you return to a note rather than only from how recently
  you touched it, so the note you revisit weekly outshines the one you opened
  once even when both were touched this morning.

  `brightness = (1 - blend) * recency + blend * intensity`. Added rather than
  multiplied, for two reasons: at 0 it is exactly the previous behaviour, so the
  feature being off by default falls out of the arithmetic rather than needing a
  branch; and a product would make a note with nothing recorded vanish however
  recently it was edited, which is every note for the first weeks after the
  history is switched on.

  Intensity is a sitting count, normalised by rank by default. Counts are far
  more lopsided than dates — most notes have one or two and a handful have dozens
  — so measuring against the busiest note leaves nearly everything at the bottom.
  **Against the busiest note** and **Logarithmic** are the alternatives.

  Measured on a real vault, four notes with 5, 5, 1 and 0 sittings: at a blend of
  0 their opacities were 1.72, 1.80, 1.64 and 0.05; at 0.5 they became 2.13,
  2.18, 0.05 and 0.05; at 1 the two five-sitting notes converged exactly, as
  equal ranks should. A blend of 0 was confirmed bit-identical to the old path.

  The curve preview shows age alone, since the ages it walks belong to no note
  and so have no intensity to read.

## [1.25.0] - 2026-10-06

### Added

- **Import earlier history**, in the History settings. The edit history starts
  empty, and core *File recovery* holds the only local record of anything from
  before it was switched on — usually the last seven days. This folds those
  timestamps in. On a real vault it turned 170 snapshots across 76 notes into 96
  sittings, skipping 4 for notes that no longer exist, and a second press added
  nothing: a timestamp already inside a sitting merges back into it.

  A button rather than something that happens on load. Reading another plugin's
  private database unasked reads badly however harmless it is, and the button
  names what it found before anyone presses it.

  **Only timestamps are read.** Those records hold each note's full text in a
  `data` field, and this never goes near it: both indexes are walked with
  `openKeyCursor`, which yields an `IDBCursor` rather than an
  `IDBCursorWithValue` — no `value` property exists on it — and joining the
  `path` and `ts` cursors on their shared `primaryKey` gives every pair without
  opening a single record.

  The database is named from `app.appId`, never found by looking for a name
  ending in `-backup`. One Obsidian install holds one of these per vault it has
  ever opened; the install this was written on has eight, so matching on the
  suffix is how another vault's note paths end up in this one's history. Dataview
  and Omnisearch key their own databases the same way.

  It is opened at whatever version it is already at, and only if it already
  exists. Opening with a version of our own would run File recovery's upgrade,
  which drops and recreates the store — destroying the very thing being read —
  and opening a name that does not exist would create it.

## [1.24.0] - 2026-10-06

### Added

- **A fourth age scale, by half-life.** Set it to 14 days and a note from a
  fortnight ago is drawn at half brightness, one from a month ago at a quarter,
  and so on down.

  It is the only scale that is absolute. The other three measure each note
  against the rest of the vault, so what a note is worth depends on what else is
  in there: a single note from years ago stretches the range and darkens
  everything else, and deleting it brightens the whole graph for no reason anyone
  would guess. Measured on a 1085 note vault, dropping one ancient note in moved
  all six sampled notes under Even — the largest by 1.62 — and none at all under
  a half-life.

  This is also what a softmax over the notes reduces to. Rescaling it so the
  brightest note is 1 cancels the denominator exactly, leaving an exponential
  decay on the gap from the newest note, with the temperature as a time constant
  in days. The sum normalisation contributes nothing, and keeping it would put
  the average note of 1085 at 0.0009.

- **A sixth preset, Steady decay**: a two-week half-life, the only preset where
  adding or deleting notes changes nothing else.

### Changed

- **Age scale** now comes first in the Time settings, because it decides whether
  the rest of that section applies at all. **Measure age against** and the window
  length are hidden when a half-life is chosen, since a half-life has no range to
  measure against. A leftover window setting no longer narrows the ages the
  settings preview walks.

## [1.23.0] - 2026-10-06

### Added

- **Keep a record of when notes were worked on**, on by default. Obsidian keeps
  one modification time per note and discards the rest, so a note touched every
  morning for a month and then abandoned is indistinguishable from one touched
  once. Pulsar now writes each *sitting* down itself — a run of writes with no gap
  longer than your session gap — with when it started, when it ended, and the
  note's length at each end. Settles #24.

  It is on by default, unlike everything else past the core fade. The rule that
  keeps extras off exists so nothing changes the look of someone's Obsidian
  uninvited; this changes nothing on screen, writes only numbers, and into a file
  of the plugin's own. It is also worth nothing until it has been running a while,
  so starting it off would mean nobody ever has any history to show.

  A bead's timestamp is the note's own mtime rather than the clock, which is what
  makes a synced edit land on the day it was really made: Obsidian Sync writes a
  pulled note with the remote's timestamp, so work done on another device three
  days ago is recorded three days ago instead of as a fictional sitting now.

  It lives in `history.json` beside the plugin, not in `data.json`. `saveData`
  rewrites the whole of `data.json` on every settings change, and Obsidian Sync
  merges config JSON by replacing each top-level key with the remote's copy — so
  a log nested under a key there would lose every entry the other device had not
  seen. The file is gitignored, and **Forget everything recorded** empties it.

- **The statistics panel reports what has been collected**: how many sittings,
  across how many notes, and how far back they reach. This is the one feature
  whose entire value is that it has been running a while, so being able to watch
  it fill matters more than usual.

- **The status bar counts sittings** beside the age, once a note has more than one
  on record.

### Changed

- **The attention clock survives a restart.** Tab fading measured how long since
  you looked at a note from a table that emptied on every launch, so a tab ignored
  for three days read as freshly visited after a reload. It is now written down —
  but the time Obsidian spent closed does not count against a tab, because being
  away from the app is not time spent ignoring anything. Gaps freeze while it is
  shut and resume where they left off.

- Saved and shared presets no longer carry the history settings. A preset is a
  look, and someone else's has no business switching off the record of how you
  work.

## [1.22.0] - 2026-10-05

### Added

- **Show a dot beside each tab**, off by default. A small filled circle next to
  the title, drawn at that note's brightness in the graph, so its age is in front
  of you without the graph being open at all. The newest note's dot takes the
  spotlight colour when the spotlight is on. Closes #55.

  A dot reads at a glance where a date has to be parsed, which is what makes it
  worth having somewhere as cramped as a tab.

## [1.21.0] - 2026-10-05

### Added

- **Fade tabs**, off by default. A tab dims the longer it goes untouched, so the
  tab bar reads as attention rather than as a pile of things opened once.
  Closes #53.

  The default basis is how long since you last *looked* at a note, which is not
  its modification time. For a tab the question is when you last had your eyes on
  it, and an hour is a long time for something sitting open in front of you.
  Obsidian records nothing like it, so it is kept here. Time spent in a note does
  not count against it and the tab you are in never fades. Fading by edit time is
  offered too, which keeps the tabs in step with the graph.

  Attention is not carried across a restart. It is a fact about a session, and
  persisting it would mean counting hours the app was not running for; everything
  open at launch starts level and diverges as you work.

  Only the icon and the title dim. The close button keeps its strength, because
  the point of noticing a stale tab is being able to act on it, and a floor keeps
  a tab readable — one you cannot read is one you cannot get back to.

## [1.20.0] - 2026-10-05

### Fixed

- Node names stayed at their old size when the graph's node size slider moved.
  A title's font is `14 + size / 4`, but the text is only re-rasterised when a
  node is flagged dirty and nothing flags it when that slider changes, so circles
  grew and their names stayed where they were. Measured: at a multiplier of 2.5 a
  size 20 node kept a size 16 font where 19 was called for.

  This is Obsidian's behaviour rather than the plugin's, but the plugin draws
  ages beside those names at the same size, so leaving it alone was not an
  option. The ages are rebuilt on the same frame.

## [1.19.0] - 2026-10-05

### Fixed

- The range handles moved one step per press instead of following the cursor.
  Every move rebuilt the bar, which replaced the handle part way through the
  gesture and threw away what was holding the drag together. The elements are
  now built once and a drag only moves them.
- A drag no longer depends on pointer capture succeeding. Capture is still asked
  for, because it helps, but the gesture is held by listeners on the window, so a
  slider that cannot capture still follows the cursor rather than silently
  stopping.

### Changed

- The section is called **Age filter** in both the settings and the graph's own
  panel. It was Filter in one and Age in the other.
- Dragging the range in the settings dialog now previews across every open graph
  instead of rebuilding on each step, which is what the graph panel already did.
  The graph is usually visible behind the dialog, so it may as well respond.

## [1.18.0] - 2026-10-05

### Added

- An **Age** section in the graph's own control panel, beside Filters, Groups,
  Display and Forces, holding the filter's switch and a scrubber for its range.
  Filtering by time is a view rather than a preference, so it belongs where you
  are already looking instead of behind a settings dialog. It is the same setting
  in both places.
- Dragging a handle previews instead of rebuilding. A real filter re-packs the
  graph, which is right once a choice is made and wrong while it is being made:
  every frame of a drag would re-pack and the thing being aimed at would crawl
  away from the cursor. During a drag notes are only hidden, so every position
  holds still; the rebuild happens on release. Measured on a real vault, a
  preview leaves all 1264 nodes in place and the commit takes it to 312.

## [1.17.0] - 2026-10-05

### Added

- **Hide notes outside a range**, off by default. Notes outside the range are
  removed from the graph rather than dimmed, so what remains re-packs. Closes #23.

  Opacity 0 never hid anything: a title still draws, links still draw, and the
  node still pushes its neighbours around in the simulation. Removing it from the
  data is the only thing that takes it out, and it is safe — the renderer builds
  a link only when both ends exist, and it leaves surviving nodes' positions
  alone, so the map does not jump.

  **Keep** is a line with a handle at each end, over the same spread of notes the
  statistics panel shows. Several ranges are allowed, so the oldest and the newest
  with nothing between them is expressible, as is the middle on its own.

  The note you have open is never hidden, so a local graph cannot go blank.
  Attachments and unresolved links are never hidden either, having no age to be
  judged on. The brightness read is each note's own rather than the one it ends
  up drawn at: a note should not count as recent because something beside it is,
  and reading the pooled value would be circular, since pooling is computed from
  the adjacency the filter decides.

## [1.16.0] - 2026-10-05

### Added

- Save the current settings under a name of your own. Saved presets sit in the
  same dropdown as the built-in ones. Unlike a built-in, which is a curated fade
  shape, one you save keeps every setting, because a setup tuned to a vault is
  the whole look rather than a chosen slice of it. Closes #59.
- Copy a preset to the clipboard as plain JSON, and paste one back, so a setup
  can be kept somewhere or handed to someone else. It is the clipboard rather
  than a server; nothing leaves the machine.

  Anything arriving that way goes through the same repair the plugin's own
  settings get, so a pasted preset can be wrong, half written or hand edited
  without being dangerous. Verified against deliberately hostile input: a string
  where a number belongs falls back, an out-of-range number is clamped, an
  unknown fade type returns to the default, a preset containing presets has them
  stripped, and an entry with no name is dropped entirely.

### Fixed

- **Reset** no longer throws away saved presets along with the settings.

## [1.15.0] - 2026-10-05

### Changed

- The plugin is now called **Pulsar**. It started as a way to fade the graph by
  time and that is still what it does, but the idea is not really about the
  graph, and a name that says "graph" would have had to be lived with forever.
  The id stays `pulsar-graph`, so nothing to install or configure moves.
- The open note's age in the status bar is **on by default**. It was off on the
  principle that nothing should appear in a part of Obsidian the plugin does not
  otherwise own, which was the wrong rule for the one feature that is the
  plugin's whole subject matter stated in four words. Nothing is published yet,
  so no existing setting changes under anyone.

## [1.14.0] - 2026-10-05

### Added

- **What this is doing to your vault**, a panel at the foot of the settings. It
  shows how notes are spread across the brightness range as a small chart, how
  many distinct brightnesses exist, how many sit at full, how the folders divide
  up, and — when a graph is open — its nodes and links, its islands of linked
  notes and the largest of them, and how many links join notes written in the
  same sitting.

  Islands and trails are properties of the drawn graph rather than of the vault,
  so they only appear while one is open.

## [1.13.0] - 2026-10-05

### Added

- **Trail strength**, mixing the trail colour with the colour links are normally
  drawn in. At full strength a trail is a stripe of neon; the new default of 0.55
  reads as a warmer line and is far easier to sit with.

### Changed

- The settings are grouped under headings: Time, Fade, Clusters, Links, Labels,
  Spotlight and Presets. There are enough of them now that one flat column was
  the wrong shape.
- The neighbour glow is applied before group temperature rather than after.

### Fixed

- The neighbour glow had almost no effect when groups were islands of linked
  notes. The glow carries brightness along links and an island's boundaries are
  drawn along those same links, so warming first gave every node neighbours
  identical to itself and left the glow nothing to lift. Spreading locally and
  then taking the regional view fixes it: on a real vault the glow's contribution
  goes from 0.007 to 0.021, now slightly more than it manages with folders.
- Turning a setting on no longer throws the settings tab back to the top. The
  tab is rebuilt to reveal what a setting unlocks, and the element being emptied
  is the one that scrolls.

## [1.12.0] - 2026-10-05

### Added

- **Trace what was written together**, off by default, with its own gap and
  colour. The link between two notes saved within one sitting of each other is
  coloured, so a reading of the graph shows what was worked on together rather
  than only when. Part of #25, and the last of the four.

  Trails are carried by colour and age by brightness, so the two say different
  things about the same link instead of competing for one channel. It works
  whether or not the links are aged. Obsidian eases a link's tint back by itself
  once the plugin stops writing it, so switching this off needs nothing undone.

## [1.11.0] - 2026-10-05

### Added

- **Group temperature** and **Group notes by**, off by default. Every note is
  pulled toward the middle of its group, so a region of the vault reads as alive
  or as cold without being picked out note by note. Part of #25.

  Unlike the neighbour carry this moves notes both ways: a stale note in a busy
  folder comes up and a fresh one in an abandoned corner goes down, which is the
  whole point of it and why it is a separate setting.

  Grouping by folder is the default because grouping by island of linked notes
  only means something in a vault that has islands. A real 1060 note vault splits
  into 686 of them, 633 being single notes with one blob of 421 in the middle,
  while the same vault's folders differ from a mean brightness of 0.75 down to
  0.11. Both are offered; the one that usually works is the default.

## [1.10.0] - 2026-10-05

### Added

- **Neighbour glow** and **Glow reach**, off by default. A node takes the better
  of its own brightness and a fraction of its brightest neighbour, repeated once
  per hop so the carry falls away with distance. An area being worked in reads as
  a region rather than as scattered points. Part of #25.

  The adjacency is the renderer's rather than the vault's, so a local graph pools
  only over what it is actually showing.

### Changed

- Node opacity, the age labels and the link shading now read one number, so a
  node lifted by a neighbour carries its date and its links up with it rather
  than glowing alone.

## [1.9.0] - 2026-10-05

### Added

- **Age the links too**, off by default. Links were drawn in one flat colour
  whatever their ends had been through, which left the busiest half of the
  picture carrying no time at all. Part of #25.

  *Match the newer note* gives a link the age of its livelier end. *Fade between
  the two* fades it along its length, bright at the newer note and dim at the
  older one, which is done by stretching a quantized ramp texture over the line
  sprite. Sixteen ramps cover every link in a vault, and the whole thing falls
  back to flat links if a future renderer stops allowing it.

  The alpha the renderer would have used is recomputed rather than read back and
  scaled: the renderer eases a link's alpha a tenth of the way per frame, so
  scaling its own value would compound into something far darker than intended.

## [1.8.0] - 2026-10-05

### Added

- Presets, beside Reset: Gentle, Even spread, Bands of age, This month and This
  week. There are now enough ways to combine normalization, scale and curve that
  assembling one by hand is work, and these are five that are worth having.

  Each sets every fade setting rather than layering onto what was there, so
  applying one lands somewhere predictable. None of them touch the age labels,
  the status bar or the spotlight: those are what you want shown, not how age is
  read, and a preset has no business resetting a colour someone picked.

## [1.7.0] - 2026-10-05

### Added

- The open note's age in the status bar, as "Edited 4 minutes ago". It reads the
  active file rather than a graph, so it works with no graph view open. Off by
  default, because it puts something in a part of Obsidian the plugin does not
  otherwise touch. Closes #22.

  The text is relative to now, so it goes stale on its own while a note sits
  open. It re-reads the clock once a minute, and only while the setting is on.
  Anything that is not a note shows nothing rather than reporting an
  attachment's timestamp as if it meant something.

## [1.6.0] - 2026-10-05

### Added

- **Age scale**, choosing how a gap in time becomes a gap in opacity. Even, the
  default, is unchanged. Closes #4.

  **By rank** places a note by where it sits in the running order rather than by
  its date, so half the vault is above the halfway mark whatever the editing
  history looks like. It is the one scale a long tail cannot flatten. On a 1060
  note vault with the default curve, the fifths of the opacity range go from
  17/12/22/8/1001 to 118/235/236/235/236.

  **Logarithmic** shapes opacity by the log of a note's age in days, so a day
  against a week separates far more than a year against two. Days rather than
  milliseconds on purpose: the log of a span in milliseconds puts a whole vault
  within a couple of units of itself, and a day is a fair floor for two edits an
  hour apart.

  Both combine with the window from 1.5.0. Rank inside a window ranks only the
  notes in it, and anything older falls out at the minimum.

- The settings preview walks the places rather than the calendar in rank mode,
  since even steps through time say nothing about a scale that ignores time. It
  shows the real ages those places land on.

## [1.5.0] - 2026-10-05

### Added

- **Measure age against**, choosing between the vault's whole history and a
  recent window of 1 to 365 days. The whole history is still the default.

  Against the whole history, a single old note sets the far end of the range for
  everything else, so a long tail flattens everything recent into the same
  opacity. Measured on a 1060 note vault with the default curve: 1001 notes land
  in the top fifth of the range. With a 30 day window, 850 drop to the bottom and
  the remaining 210 spread across the rest. Closes #3.

  A window is anchored to the clock rather than to the newest note, so a vault
  left alone for a month fades on its own. Cached opacities are recomputed when
  that anchor has drifted by a hundredth of the window, checked while a graph is
  already being updated rather than on a timer.

## [1.4.0] - 2026-10-05

### Added

- A preview at the top of the settings, showing dots at real ages from your own
  vault, each at the opacity the current settings would give a note that old. It
  updates as you drag, and it reads the vault's actual span of ages rather than
  an invented one, so what you see is what your graph will do.
- Every slider now has a number box beside it. The box is left alone while you
  are typing in it and tidied up when you leave, so a half finished number is
  never corrected under the cursor.

### Changed

- `styles.css` is a release artifact again, now that the preview needs it. It was
  dropped in 1.2.0 when the hover tooltip left the DOM.

## [1.3.0] - 2026-10-05

### Added

- **Spotlight colour** and **Spotlight strength**. The spotlight used to borrow
  the theme's hover colour, which is the colour Obsidian already paints whatever
  node you are pointing at, so the newest note and a hovered one looked the same.
  Pick your own instead. Strength below 1 mixes it with the colour the node
  already had, which is the only way a graph group's colour should ever reach it.

### Fixed

- The spotlight came out as a blend of its own colour and the group colour
  underneath. Obsidian eases a node's tint a tenth of the way per frame and
  stops drawing after sixty idle frames, so the colour froze part way there. The
  spotlit node's tint is now assigned outright.
- The spotlight stopped standing out at high maximum opacity. Opacity above 1 is
  clamped when drawn, so once enough notes reach full strength none of them can
  be told apart by brightness and only the colour was left to do the work — and
  the colour was the washed out blend above.
- Turning the plugin off, or reloading it, left the newest note painted. The
  next load then read that paint as the colour to preserve and lost the real one.
  The colour is handed back on unload, and forgotten whenever Obsidian rewrites
  node colours from group data, so what is remembered is never stale.

## [1.2.0] - 2026-10-05

### Changed

- A note's age is now drawn above its node, centred, the same distance away as
  the title below it and in the same font, instead of following the cursor as a
  tooltip. The tooltip sat on top of the title it was meant to accompany.

### Added

- **Show note age** replaces the on-off hover toggle with three choices: never,
  on hover, or whenever Obsidian is showing titles. The last one ties the ages
  to the zoom level you already use to bring names in, and fades each age along
  with its own node, so old notes carry quiet dates.

### Removed

- `styles.css` is no longer part of a release. The plugin draws nothing in the
  DOM any more, so there is nothing left to style.

## [1.1.0] - 2026-10-05

### Added
- Hovering a node shows how long ago that note was modified, next to the
  pointer. On by default, and it leaves Obsidian's own page preview working
- Optional spotlight on the single most recently modified note, tinting it with
  the theme's accent colour. Off by default, and it puts back whatever colour
  the node had when the newest note changes or the setting is turned off

## [1.0.0] - 2026-10-05

First release.

### Added
- Graph nodes fade by how recently each note was modified, on both the global
  and local graph views
- Three fade curves: linear, exponential and step
- Configurable opacity range. Values above 1.0 hold recent notes at full
  strength while the rest of the graph fades
- Steepness control for the exponential curve (0.1 - 10.0)
- Step count for the step curve (1 - 20)
- Reset button restoring every setting to its default

### Behaviour
- Only markdown notes are graded. Attachments and unresolved links keep the
  colour the graph gives them
- Node colour is left alone, so graph groups keep working; only opacity changes
- Opacity is normalized against the vault's own oldest and newest note, so the
  newest note always sits at maximum opacity

### Performance
- Opacity is cached per note and recalculated only when the vault's oldest or
  newest note changes, or when a setting changes
- No timers. Opacity is reapplied when a graph rebuilds its data, when a note
  changes, and when a setting changes. Nothing runs while the vault is idle
- Measured on a 1049-note vault
