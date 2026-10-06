# Time

How Pulsar decides what counts as old, and how an age becomes a brightness.
Everything else in the plugin reads the number this page describes.

## What counts as old

**Measure age against** decides where those two ends sit, and it matters more than
the curve does.

**The vault's whole history** runs from your oldest note to your newest. It's the
default and it's honest, but one note from years ago sets the far end for
everything else, and then a year of recent work can land inside a few percent of
the range and come out looking identical. On my own vault — 1060 notes, default
curve — that puts **1001 of them in the top fifth of the range**.

**A recent window** throws the old end away and spends the whole range on the last
so many days. Anything older sits at minimum opacity. Same vault, same curve, a
30 day window: 850 notes drop to the bottom and the remaining 210 spread out
properly across the rest.

Which you want depends on what you're looking at. The whole history is a picture
of the vault; a window is a picture of what you're working on. The window is also
the one that keeps meaning something when you come back after a month away,
because it's anchored to the clock rather than to your newest note.

### Whatever the graph is showing

The third option re-spreads the range across the notes actually on screen rather
than across the vault. It is the answer to a specific and annoying problem:
filter down to the brightest few per cent and every survivor is at the top of the
range together, so the gradient tells you nothing exactly when you have asked the
most specific question. Measured on a 1089-note vault filtered to its brightest
2%, all 194 surviving nodes came out between 0.981 and 1 — identical once alpha
is clamped. Spread across what is shown, the same 194 cover the full range.

It respects Obsidian's own Filters and the graph's search box too, so typing a
tag there turns it into a time lens for just those notes.

Two things keep it honest:

- **It only decides how bright, never which.** The age filter still picks its
  notes on the absolute scale, so this cannot feed itself.
- **The range is held open to a floor**, six hours by default. Three notes from
  the last ten minutes genuinely are all recent, and drawing the nine-minute-old
  one as ancient would be a lie the arithmetic told.

It pairs especially well with the **rank** scale — rank among the notes shown is
a different and more useful thing than rank among all of them. A half-life
ignores it entirely, since a half-life is measured against the calendar and
nothing else, which is the whole point of it.

## How ages turn into gaps

**Age scale** decides what a gap between two notes is worth.

| Scale | What it does | Good for |
| --- | --- | --- |
| Even | Opacity follows the calendar | A vault edited at a steady rate |
| By rank | A note's place in the running order, not its date | Any vault — a lopsided history can't flatten it |
| Logarithmic | Recent gaps count for more, old ones for less | Picking the last few days out of a long history |
| By half-life | Halves every so many days, against the calendar | A vault that keeps growing, or one with ancient notes in it |

**By rank** is the one that can't be defeated by your editing history. Half your
notes are above the halfway mark by construction, whatever the dates look like.
Here's the same 1060 note vault with the default curve, counting notes in each
fifth of the opacity range:

| | | | | | |
| --- | ---: | ---: | ---: | ---: | ---: |
| Whole history, even | 17 | 12 | 22 | 8 | **1001** |
| Whole history, by rank | 118 | 235 | 236 | 235 | 236 |
| 30 day window, even | 850 | 23 | 88 | 47 | 52 |
| 30 day window, by rank | 866 | 48 | 49 | 48 | 49 |

The trade is that rank hides *how much* older something is. Two notes a year
apart look as different as two notes a day apart, if nothing else sits between
them. Even and logarithmic keep that information; rank spends it on contrast.

**By half-life** is the only one of the four that is *absolute*. The other three
measure each note against the rest of your vault, so what a note is worth depends
on what else is in there — one note from 2019 stretches the range and darkens
everything else, and deleting it brightens your whole graph for no reason you'd
ever guess. A half-life measures against the clock instead: set it to 14 days and
a note from a fortnight ago is at half brightness, one from a month ago at a
quarter, whatever else you do to the vault.

Measured on a real 1085 note vault, dropping one ancient note in and reading the
same six notes before and after:

| Scale | Notes whose brightness moved | Largest change |
| --- | ---: | ---: |
| Even | 6 of 6 | 1.62 |
| Logarithmic | 6 of 6 | 0.10 |
| By rank | 3 of 6 | 0.001 |
| By half-life | 0 of 6 | 0 |

It's also the scale that needs no **Measure age against** setting, because there
is no range to measure against — so that row disappears when you pick it.

## Fade curves

| Curve | What it does | Good for |
| --- | --- | --- |
| Linear | Opacity tracks recency evenly | An even spread across the vault's history |
| Exponential | `recency ^ steepness` | Picking out very recent work. Steepness above 1 is sharper, below 1 gentler |
| Step | Recency rounded onto evenly spaced levels | Reading the graph as distinct bands of age |

---

[← All docs](README.md) · [Pulsar](../README.md)
