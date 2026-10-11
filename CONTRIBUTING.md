# Contributing

Thank you for looking.

- **A question or an idea:** start a [discussion](https://github.com/Lucas-Liona/obsidian-pulsar-graph/discussions).
- **A bug:** open an issue. The form asks for what is needed to reproduce it.
- **A security problem:** see [SECURITY.md](SECURITY.md). Please don't report it in public.

## Changing the code

Read [AGENTS.md](AGENTS.md) first. It is written for anyone working on the
repo, people included. It holds the commands, the conventions and the facts
about Obsidian's graph that the plugin is built on.

Work on a branch in its own worktree, outside any vault:

```bash
git worktree add -b my-change ../pulsar-my-change origin/master
cd ../pulsar-my-change && npm ci
```

Before opening a pull request:

```bash
npm run lint && npm run type-check && npm test && npm run build
```

`npm run e2e` runs the plugin inside a real Obsidian, and CI runs it on every
pull request too.

Two habits the project keeps:
- **Measure what you change.** For anything that runs on every frame or event,
  give the mean ± sd before and after. For anything visible, include a
  screenshot from the demo vault, never from a personal one.
- **Add a line under *Unreleased* in `CHANGELOG.md`,** written for someone
  using the plugin.

Pull requests are squash-merged, so the history stays one commit per change.
