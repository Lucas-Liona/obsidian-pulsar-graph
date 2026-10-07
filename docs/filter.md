# The age filter

Taking notes out of the graph entirely rather than dimming them, and the
scrubber that does it from inside the graph.

<p align="center">
  <img src="assets/age-filter.gif" width="520" alt="Animation of a note graph as the age filter is opened from newest-only to everything. It begins with a single green node and fills in to the whole vault.">
</p>

Fading a note is not hiding it. Obsidian draws a title, its links and its physics
regardless of how transparent the node is, so a note at minimum opacity is still
sitting there taking up room. **Hide notes outside a range** takes them out of
the graph entirely, and what's left re-packs into a tighter shape.

**Keep** is a line with a handle at each end, drawn over the same spread of your
notes the statistics panel shows, so you can aim it at something real rather than
guessing at a number. You can add more than one range — keep the oldest and the
newest and nothing in between, or just the middle of the herd.

Drag a handle to move one edge. **Drag the lit stretch between them to move the
whole range** without changing how wide it is, which is usually the thing you
want once you have decided how big a slice to look at.

Under the line is what the range is actually catching, in dates rather than in
brightness: *223 of 1088 notes, 46 minutes ago back to 3 weeks ago*. Brightness
is not a quantity anyone has an intuition for, so the only honest way to say what
a position on the line means is to go and look. Nothing is inverted or estimated
— the notes are counted.

**Say so on the graph** puts that same line across the top of the graph itself:

> 110 of 110 notes, 1 hour ago back to 4 months ago

<p align="center">
  <img src="assets/graph-caption.png" width="560" alt="A note graph with a line across the top reading: 110 of 110 notes, 2 hours ago back to 11 months ago.">
</p>

It is worth leaving on whether or not you are filtering. While you are, it is
necessary — a graph with half its notes taken out looks exactly like a graph.
While you are not, it still answers the question a graph raises on its own, which
is *what am I looking at*.

Three things it will not do:

- **The note you have open is never hidden.** Otherwise opening an old note would
  make it vanish from the graph, and the local graph would go blank.
- **A [pinned](pins.md) note is never hidden.** The note you pinned is old — that
  is why it needed pinning — so it is exactly what this would otherwise take out
  first, and a pin that vanishes when you narrow the range is not a pin.
- **Attachments and unresolved links are never hidden.** The filter asks how old
  a note is, and those have no age to answer with.

It reads each note's *own* brightness, not the brightness it ends up drawn at. A
note shouldn't count as recent because something next to it is.

The same control lives in the graph's own panel, in the **Pulsar** section
beside Filters, Groups, Display and Forces, under **Age filter**. Filtering by time is a view rather than a preference
— you reach for it to look at something and then put it back — so it belongs
where you already are instead of behind a settings dialog. It's the same setting
in both places; moving one moves the other.

## Reading the bar

The picture behind the handles is your vault counted along the line the
handles move on: each note's own brightness, as a fraction of the way from your
minimum to your maximum. It's the same quantity the handles select on, so what
you see under a handle is what that handle keeps.

- **Bars** — forty of them, each a fortieth of the line, the same in the
  settings and in a graph's panel.
- **The red line** — the same notes smoothed: a Gaussian kernel density, folded
  back at both ends so no note falls off the line. It has no corners, so it
  shows where the vault is thick and where it is thin without jumping whenever
  a note crosses a bar's edge.
- **The axis** — notes per bar, on the left: a round number at the top and a
  dotted line half way up, both labelled. The axis is a square root, because a
  steep fade puts half a vault in the first few bars and a straight axis would
  draw everything else flat; read the labels rather than the height.
- **A red cap** on a bar means it is taller than the axis. That is usually the
  notes held at the floor of the fade — everything older than the curve
  reaches — which are a pile rather than a spread, and are left out of the red
  line for that reason. Hover the bar for its count.

Bars inside what you are keeping are drawn brighter.

**Hover a bar** and the line underneath says what is in that bar alone, in the
same words it uses for a selection. The shape answers *where are the
notes*; the question people actually arrive with is *what is that bump*.

The line also carries the share: `194 of 1092 notes · 18%`. A ratio nobody
computes mid-drag, and the percentage is what the handle is really choosing.

**A press goes to the nearest handle**, not to whatever the browser decides is
under the cursor. At the narrowest a range is allowed to be, the two handles sit
**four pixels apart** — their grab areas overlap however they are sized, and an
overlap is settled by document order, so the handle you aimed at loses to the
one drawn after it, reliably and invisibly. Distance is what you meant, so
distance decides. It also means a press *near* a handle catches it, which is
what lets the handles stay thin enough to sit beside each other at all.

**Dragging a handle doesn't rebuild the graph.** While you hold it, notes are
only hidden: every position stays exactly where it was, so the thing you're
aiming at holds still instead of crawling away from the cursor. The real filter,
with the re-pack, happens when you let go.

Off by default.

---

[← All docs](README.md) · [Pulsar](../README.md)
