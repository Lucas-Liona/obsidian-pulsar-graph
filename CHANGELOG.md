# Changelog

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
