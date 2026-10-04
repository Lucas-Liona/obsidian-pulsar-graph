# Changelog

## [1.0.0] - unreleased

### Added
- Initial release
- Three fade functions: linear, exponential and step
- Configurable opacity range, with values above 1.0 making recent notes brighter
- Steepness control for the exponential curve (0.1 - 10.0)
- Step count for the step curve (1 - 20)
- Works on both the global and local graph views

### Performance
- Opacity is cached per note and recalculated only when the vault's oldest or
  newest note changes, or when a setting changes
- No timers: opacity is reapplied when a graph rebuilds its data, when a note
  changes, and when a setting changes. Nothing runs while the vault is idle
- Measured on a 1049-note vault
