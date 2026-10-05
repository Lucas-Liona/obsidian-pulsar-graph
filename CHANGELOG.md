# Changelog

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
