# A note's history

One bead per sitting, down a rail, positioned by when it happened.

<p align="center">
  <img src="assets/note-history.png" width="320" alt="A sidebar panel headed Topology, 10 sittings, first 4 months ago. A vertical rail runs down the panel with circles on it: three bunched near the bottom beside the label 4 months ago, two in the middle, and four bunched at the top beside the label 2 days ago. The circles near the top are brighter than the ones at the bottom.">
</p>

Obsidian keeps one modification time per note and throws the rest away, so the
graph can tell you a note was touched this morning and never that it was touched
every morning for a month and then abandoned. [Pulsar's own
record](history.md) keeps the rest. This is where you read it.

Open it with the command **Show this note's history**. It lives in the right
sidebar and follows whatever note you are looking at.

## Reading it

**Newest at the top.** Each bead is one *sitting* — a run of writing with no gap
in it longer than your session gap — so a morning's work is one bead rather than
the several hundred autosaves it really was.

**Position is the point.** A list of dates would be easier to draw and answers a
different question; the shape is what tells "edited three times today" from
"appended to once a month" without reading a single number. Beads bunch where you
were busy and leave gaps where you were not, and the gaps say as much as the
beads do.

**One scale for every note, logarithmic back from now.** The top of the rail is
now, and it is labelled at an hour, a day, a week, a month and a year, then two,
five, ten and twenty years. A year is the same 420 pixels down in every note, so
two notes can be read against each other at a glance. Because the scale is
logarithmic, this morning still spreads out: the first hour gets 93 pixels and
the first day 206, so a sitting twenty minutes ago and one three hours before it
land 76 pixels apart. The trade is at the old end, where a month of daily sittings a year ago
spans about 3 pixels.

| A sitting this long ago | Lands this far down |
| --- | ---: |
| 5 minutes | 25 px |
| 1 hour | 93 px |
| 1 day | 206 px |
| 1 week | 276 px |
| 1 month | 329 px |
| 1 year | 420 px |
| 3 years | 460 px |

The rail stops at the first label past the note's oldest sitting, so a note
worked on only this morning has a short rail and one with years in it a long
one, on the same scale. A note with a single sitting gets the axis too: on one
scale for every note, where that sitting falls says something. The view redraws
itself once a minute while it is on screen, since a bead's place is its age.

**Size is how long the sitting ran**, up to two hours. A sitting recorded from a
single write has no duration at all and still draws, at the floor.

**Brightness is the vault's scale**, the same one the graph fades by, so a bead
near the top is as bright as that note's node. It is held clear of the very
bottom: the graph can afford to take a node to nearly nothing because a thousand
others carry the picture, but a bead you cannot see is a bead you cannot hover.

**Hover a bead** for when it was, how long it ran, and how much the note grew or
shrank while you were in it.

## When it is empty

It says which of the three reasons applies:

- **The history is switched off** — or Pulsar is. It is in the settings.
- **No note open.** Nothing to show a history of.
- **Nothing recorded yet** for this note, which is the normal state on day one.
  The record starts empty and is worth little until it has been running a while.
  The settings can [import what Obsidian's own file recovery already
  holds](history.md), which is usually the last week.

---

[← All docs](README.md) · [Pulsar](../README.md)
