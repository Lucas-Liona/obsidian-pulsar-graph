# The graph

What Pulsar draws on the graph beyond the fade itself: size, the age above a
node, the newest note, the glow between neighbours, folder temperature, and what
the links carry.

## Size

Obsidian already sizes a node, and it is worth knowing how: `getSize()` is
`node size slider × clamp(3 × √(links + 1), 8, 30)`. Links, and nothing else.
That formula does not leave its floor until a note has **seven** links, so in a
real 1088-note vault 381 of the first 400 nodes came out at exactly 8. The size
channel is almost entirely unused, which is what makes it worth spending on age.

**Size nodes by age** multiplies Obsidian's own number rather than replacing it,
so a hub still reads as a hub. You set what the oldest and the newest are
multiplied by; putting the newest *below* the oldest runs it backwards, which is
a reasonable thing to want.

**Title size** scales every name on the graph, and the age drawn above a node
with it. Obsidian offers no control over
this at all — a title's font is `14 + size / 4`, tied to the node size, so a
small-node graph gets small titles whether or not you wanted that. This
separates them.

Neither reaches the simulation. Obsidian's own node size slider doesn't either:
the physics run in a worker with their own copy of the graph, so a bigger circle
doesn't push its neighbours any harder.

## Hover and spotlight

A note's age — "3 days ago", "5 months ago" — is drawn above its node, centred,
the same distance up as the title sits down, in the same font and a little
quieter. It's part of the graph, not a tooltip over it, so it pans and zooms with
everything else. Obsidian's own page preview still works alongside it.

<p align="center">
  <img src="hover.png" width="760" alt="A dimmed graph with one node lit. Above it, centred, the text '4 minutes ago'; below it, the note's title.">
</p>

**Show note age** has three settings:

| | |
|---|---|
| **Never** | No ages at all. |
| **On hover** | The age appears above whichever node you're pointing at. The default. |
| **Whenever titles are shown** | Every node that's showing its name shows its age too, dimmed by that note's own opacity. |

That last one is worth a try if you already use the text fade threshold the way I
do: the names come in as you lean towards the graph, and now the dates come with
them, with old notes carrying faint ones.

**Spotlight size** makes the newest note's circle larger as well as coloured.
Worth knowing why it needs to: Obsidian sizes a node by its link count and
nothing else, and the note you wrote last is almost always the least linked thing
in the vault — so without this the one node you always want to find is reliably
the *smallest* on screen. It multiplies on top of any other sizing rather than
replacing it.

The spotlit note is also never hidden by the age filter, on the same rule as the
note you have open. A filter quietly removing the one node the graph is pointing
at is the graph disagreeing with itself.

## Neighbour glow

A note doesn't live alone. **Neighbour glow** lets a bright note lift the notes
it links to, so an area you're working in reads as a region rather than as
scattered points. Each node takes the better of its own brightness and a fraction
of its brightest neighbour, and **Glow reach** decides how many links that
travels along — each step carries the fraction again, so it falls away with
distance.

Worth knowing: the glow travels along links, and grouping by *island of linked
notes* draws its boundaries along those same links. The glow runs first for
exactly that reason — warming first would hand every node neighbours identical to
itself and leave the glow nothing to lift.

How much it does for you depends on how linked your vault is. Mine is sparse —
about 700 links across 1060 notes — so the effect is real but gentle. A densely
linked vault will see much more.

Off by default.

## Group temperature

**Group temperature** pulls every note toward the middle of the group it belongs
to, so a part of the vault reads as alive or as cold at a glance instead of
having to be picked out note by note. Unlike the glow below, it moves notes
**both ways**: a stale note in a busy folder comes up, a fresh one in an
abandoned corner goes down.

Group by folder or by island of linked notes. Folders suit most vaults — mine
splits into regions that genuinely differ:

| Folder | Notes | Mean brightness |
| --- | ---: | ---: |
| 2 Areas | 177 | 0.75 |
| _Journal | 387 | 0.17 |
| 3 Notes | 78 | 0.17 |
| 4 Reference | 81 | 0.14 |
| 5 Archive | 206 | 0.11 |

Islands of linked notes only work if your vault actually has islands. Mine has
686 of them, and 633 are single notes with one blob of 421 in the middle, so
folders tell me far more. Check yours before reaching for it.

Off by default.

## Links carry age too

Obsidian draws every link in one flat colour whatever its two ends have been
through, which leaves the busiest half of the picture saying nothing about time.
**Age the links too** changes that:

- **Match the newer note** gives a link the age of its livelier end, so the
  structure around recent work comes forward instead of sitting in uniform grey.
- **Fade between the two** fades each link along its length, bright at the newer
  note and dim at the older one.

That second one is worth it for the discovery thing: a bright line running out of
today's work and dimming into something you wrote a year ago is exactly the note
you'd forgotten you had. Off by default, like everything that changes how the
graph is drawn beyond the nodes themselves.

## What you wrote together

**Trace what was written together** colours the link between two notes that were
saved close enough together to have been open in the same sitting. It says
nothing about *how long ago* — the fade already does that — so the two read as
separate facts: colour for togetherness, brightness for age.

How much it catches depends on how you work. On my vault a 5 minute window
already marks 246 of 692 links, and stretching it to 4 hours only reaches 312,
which says most of my linked notes were written in genuine bursts rather than
drifting together over an afternoon.

Off by default, with its own colour kept clear of the spotlight's. **Trail
strength** mixes that colour with the one links are normally drawn in — at full
strength it is a stripe of neon, and a little under half way reads as a warmer
line, which is much easier to sit with.

---

[← All docs](README.md) · [Pulsar](../README.md)
