# The local graph

Obsidian has two graphs. The big one shows your vault; the small one — *Open
local graph* in a note's menu, usually parked in the sidebar — shows one note
and whatever is linked to it, a few jumps out.

Pulsar used to treat them the same, and that was wrong often enough to be worth
a setting: a new install measures a local graph against its own panel.
Settings saved before that keep measuring against the vault.

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

### What it costs

Re-measuring a panel against itself has one consequence worth knowing about: the
note the panel is *about* can end up the faintest thing in it. If the centre is
the oldest of its twelve — which happens whenever you open a local graph on
something you have not touched in a while — it lands at the bottom of the
re-measured range. Measured in a real vault, the centre note was the brightest in
its own panel in only 28 of 123 panels, and in one 13-node panel it came out at
the very bottom of the range.

That is not a bug in the arithmetic; it is the arithmetic answering the question
it was asked. It is also the reason for the next setting.

## Measure from the note in the middle

Instead of asking *how recent is each of these*, ask **how close in time is each
of these to the note in the middle**. The centre is the brightest thing in the
panel by construction, a note you were in the day before it is as bright as one
you were in the day after, and six months either way is dark.

It answers a different question: *what else was being worked on at the time*.
Which is, more often than not, the question you actually have when you open a
local graph on something written months ago.

**Both directions count, and that is the whole point.** In a real vault, 66 of
123 panels contained notes both older *and* newer than the note in the middle. A
one-sided age scale can only ever rank the newer half above the older half, so
in half the panels in a vault it is throwing away the evidence on one side. The
notes you wrote the afternoon before you wrote this one were part of the same
work.

Every age scale still applies — each of them is a way of turning a gap in time
into a gap in brightness, and a distance is a gap in time. Even spread divides
the range by the furthest note; logarithmic magnifies the notes closest in time;
rank spreads them evenly by distance however lopsided the gaps are; a half-life
needs no span at all and so works in a panel of two.

The spread floor applies here too, as how far either side the panel reaches at
minimum. The median panel in a real vault came out at **5.8 days either side**,
and the caption says which it is:

> 13 notes · around Weeknotes, 4 days either side

While it is on it replaces the choice above for brightness. Which note the
spotlight picks is still that setting's business, since that is a question about
what is newest and not about what is near.

It is **off** by default, and it is a view rather than a preference — you reach
for it, look, and put it back — so it has a toggle in the graph's own panel, under **Pulsar › Age filter**, as
well as in the settings. The global graph gets no such toggle: it has
no note in the middle, and a control that can never do anything is worse than
its absence.

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

## What a small panel can afford

Two things the whole graph cannot.

### Write every age

The ages above node titles are one setting for both graphs, and *with titles* on
a two-thousand-node graph is noise. On a panel of twelve it is free information,
so a local graph can be told to write them whatever the big graph is doing. A
new install does.

They ride along with the titles, which Obsidian hides below a zoom you control —
in a sidebar-width panel that usually means the handful of names you can
actually read. Measured on a 13-node panel with the global setting on *on
hover*: no ages at all before, and an age on each of the 5 nodes whose titles
were visible after.

### What the panel holds

The caption across the top of the global graph counts your vault. Over a panel
of thirteen notes, that is true and useless, so a local graph's caption counts
the panel instead. Measured on the same panel, with the age filter on:

| | |
|---|---|
| The vault line | `194 of 1092 notes, 51 minutes ago back to 2 weeks ago` |
| The panel line | `13 notes · 21 hours ago back to 5 days ago` |

This used to be a switch, off by default, which left every local graph showing
the vault line. A local graph showing one node under `230 of 1100 notes` is the
case that ended the switch.

Not one number in the first line is about anything on screen. The panel line says
how many notes are in front of you, how recent the newest and the oldest of them
are, and — when the age filter has taken some out — **how many are missing**:

> 9 notes · 4 hidden · 2 hours ago back to 3 weeks ago

That last part is worth having because the filter is absolute. It reads a note's
age against your whole vault, by design, so narrowing it hard enough will empty
a local graph down to the one note the panel is about. It cannot go fully blank —
the note you have open is one of the notes the filter is never allowed to remove
— but *nearly* blank looks exactly like a note with no links, and those are
different facts. The count is the difference.

It is the filter's own count, because by the time anything can look at the graph
the hidden nodes are gone: they are removed from the data before the renderer
ever sees them, so afterwards there is no way to tell a panel of nine from a
panel of thirteen with four taken out.

---

[← All docs](README.md) · [Pulsar](../README.md)
