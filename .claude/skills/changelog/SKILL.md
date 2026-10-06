---
name: changelog
description: Write the release notes for a group of merged PRs, and render them into the demo vault. Use when cutting a release, or when the demo vault's changelog has fallen behind what has shipped.
---

# Changelog

Releases are cut **per theme, not per change**. A release is a sentence someone
would read: several merged pull requests that together did one thing.

## The single source

**The merged PR bodies are the source of truth.** They already carry the
reasoning, the measurements and the evidence, and they were reviewed. The release
note and the vault note are both rendered from them and are always safe to delete
and regenerate. Never write a fact into the changelog that is not in a PR body —
put it in the PR body first.

## Writing the release note

1. List what has merged since the last tag:
   `git log --oneline <last-tag>..master`
2. Read each PR body: `gh pr view <n> --json title,body`
3. Group them into one theme. If they do not form one, that is two releases.
4. Write the note:
   - **One sentence of what changed for the reader**, before any detail.
   - **The measurements**, where a PR has them. They are the reason to believe it.
   - **A link into `docs/`** for the surface that changed, never a restatement of
     the documentation.
   - Fixes and small corrections go in a short **Also** list at the end. A patch
     note does not need a paragraph.
5. Nothing about the implementation unless a reader would hit it.

## Rendering into the demo vault

The demo vault is `~/pulsar-demo-vault`. Changelog notes live in its
**`Changelog/`** folder, one note per release, named for the version.

- The vault's `Notes/` folder is **not touched**. Its 74 notes have deliberate
  modification times spread across a year, and that spread is what the fade demo
  is built on.
- Set each changelog note's modification time to **the moment that release was
  tagged**, so the vault's own graph is an honest picture of the project's
  history and fades correctly.
- Link each release note to the one before it, so the changelog is a chain in the
  graph rather than a scattering of unconnected nodes.
- Note titles must stay generic — see the capture rules in `AGENTS.md`. The vault
  is published; nothing in it may identify anyone.

## Before tagging

- `manifest.json`, `package.json` and `package-lock.json` all carry the new
  version, and the tag is on the commit that carries it. A mismatch here has
  rejected a tag three times.
- The release asset's hash matches a local build of the tagged source.
- The release is published, not left a draft.
