# Pins

Notes held bright whatever their dates say, for the ones you mean to come back
to.

Everything else here grades a note by time, which answers one question well —
*what have I been working on* — and cannot answer the other one at all. The note
you are heading towards is by definition one you have not touched lately. The
longer you leave it, the fainter this plugin draws it, and if you are using the
age filter it eventually leaves the graph altogether. The thing you most need to
remember is the thing this plugin is busy forgetting.

A pin is where you overrule the clock.

## Pinning

Three ways in, all doing the same thing:

- **Right-click a node in the graph** and choose *Pin in the graph*.
- **Right-click a note in the file explorer**, same item.
- **The command *Pin this note in the graph***, which works on the note you have
  open and takes a hotkey.

The first one is the useful one, because the graph is where you notice that a
note has started sinking — so while you have nothing pinned, the graph's own
**Age** panel says so in one line. It goes away the moment you pin something.

## What a pin does

It holds the node at the top of your opacity range, permanently. If you have
node size by age switched on it comes out at full size too, since size follows
the same number.

**The age filter cannot remove a pinned note.** This matters more than it
sounds: the note you pinned is old — that is *why* it needed pinning — so it is
precisely what an age filter is built to take out, and a pin that vanishes the
moment you narrow the range is not a pin at all. Pinned notes sit alongside the
note you have open and the spotlit ones as the things the filter is not allowed
to touch.

A pin is also given **a colour of its own**, and that is on by default even
though every other colour here starts off. A note held at full brightness with
nothing to say why is indistinguishable from one you edited this morning, which
makes the graph quietly wrong rather than merely plain. Nothing changes until you
pin something, so the default costs nobody anything.

**The spotlight does not land on a pinned note.** It skips anything pinned and
picks the next newest instead, so the two never fight over one node and you get
both facts at once: the note you chose, and the note you were last in. Where
they do collide — a vault with nothing left to promote — the pin wins, because
a pin is the one deliberate statement in the whole plugin and a colour that
stops meaning *pinned* is a colour nobody can read.

A pin shows **in the tab bar** too, if the brightness dot is on: a pinned note's
dot takes the pin colour. The tab bar is the one place you can see a pin without
opening the graph, and without it a note held at full brightness looks exactly
like one you edited this morning.

## Taking them off

The settings tab lists everything pinned, with an *Unpin* beside each and an
*Unpin all*. There is a command for the latter too. A list you cannot read is a
list that grows until half the graph is pinned and nobody remembers why, so the
list is the feature as much as the pinning is.

A pin **follows a note that gets renamed or moved**, because filing something
away somewhere permanent is the action most likely to happen to a note you are
keeping for later. Deleting a note takes its pin with it.

## What a pin is not

It is a list of paths in the plugin's own settings. Pinning **writes nothing
into your notes** — no frontmatter, no tag, no file touched, and your
modification times are left exactly as they were, which matters because this
plugin reads them.

The cost of that is that a path is not an identity. A note moved by something
that does not announce the move — a sync conflict resolved outside Obsidian, a
file renamed on disk while the vault is closed — loses its pin, and the pin is
dropped on the next load rather than pointing at nothing.

Pins are also deliberately **left out of saved presets**. A preset is a look, and
a pin is a path in your vault: a preset shared between two people would otherwise
carry one of their note paths into the other's vault and throw away whatever they
had pinned. How a pin is *drawn* is part of a preset, and stays.

---

[← All docs](README.md) · [Pulsar](../README.md)
