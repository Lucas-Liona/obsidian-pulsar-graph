  # Changelog

  ## [1.0.0] - 2025-12-XX

  ### Added
  - Initial release
  - Three fade functions: Linear, Exponential, Step
  - Configurable opacity range (0.0 - 12.0)
  - Exponential steepness control (0.1 - 10.0)
  - Step count configuration (2-10 steps)
  - Support for both global and local graph views
  - Intelligent opacity caching for performance
  - Workspace-aware polling (only runs when graphs open)

  ### Performance
  - Tested on vaults with 500+ notes
  - Zero CPU usage when no graph views are open
  - Updates every 1 second without impacting UI