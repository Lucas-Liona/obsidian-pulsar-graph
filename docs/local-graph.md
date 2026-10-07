# The local graph

Obsidian has two graphs. The big one shows your vault; the small one — *Open
local graph* in a note's menu, usually parked in the sidebar — shows one note
and whatever is linked to it, a few jumps out.

Pulsar treats them the same by default, and that default is wrong often enough
to be worth a setting.

## Why it needs its own answer

A local graph is not a smaller global graph. It is **a question about one note**:
every node in it is there because of its relationship to the note in the middle.
That changes what "old" means in it.

The whole graph has thousands of notes spread over however many years you have
been writing, and that spread is what the fade is drawn against. A local graph
has eleven notes which you probably wrote in the same fortnight, because notes
that link to each other tend to have been written together. Graded against a
year of history, all eleven land within a few per cent of each other and the
panel is eleven identical dots. The gradient is still there; it has nothing left
to say.

## Measure a local graph against

| | |
|---|---|
| **The vault's whole history** | What every graph did before this setting existed. A note in the panel is drawn at exactly the brightness it has in the big graph. |
| **The notes in the panel** | The range is re-measured across just the notes on screen, so the oldest of the eleven is dark, the newest is bright, and the ones between are spread out. |

The second one is what makes the panel readable, at the cost of the two graphs no
longer agreeing: the same note is dim in one and bright in the other, because
they are answering different questions. That is the trade, and it is why this
ships **off** — nothing changes under you until you choose it.

It is held open by **Never spread across less than**, in the Time settings. Six
notes all written this morning really are all recent, and drawing the one from
09:12 as ancient because the others came later would be a lie the arithmetic
told. Below that floor the range simply does not use its full width.

A half-life scale is left alone either way. It measures each note against the
clock and nothing else, which is the one property it exists for; re-spreading it
would throw that away.

## The spotlight, in a panel of twelve

The spotlight picks the most recently edited notes, and until now it picked them
**out of the whole vault** and then drew whichever of them happened to be on
screen. In a local graph that is usually none of them: twelve notes out of
thousands, and the one you edited last is rarely among them, so the feature most
likely to tell you where the action is was simply blank there.

Measured against the panel, it picks the newest note **in the panel**. Node size
follows the same choice, so the colour and the size land on the same note.

The two are one setting on purpose. Both are asking *compared to what*, and
answering that question twice, differently, in one panel is how a graph ends up
disagreeing with itself.

---

[← All docs](README.md) · [Pulsar](../README.md)
