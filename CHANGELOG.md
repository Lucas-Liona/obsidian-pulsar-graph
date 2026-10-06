# Changelog

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
