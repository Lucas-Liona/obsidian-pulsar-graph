# Tabs

The tab bar as a readout of attention rather than a pile of things you opened
once.

Everything in this section means the tabs in the main editor area, and only
those. Sidebar panels are left alone: the outline, backlinks, local graph and a
Bases view each report a file of their own, and it isn't always the file you're
looking at, so a sidebar tab that joined in appeared to change at random.

**Show a dot beside each tab** puts a small filled circle next to the title, at
that note's brightness in the graph. It's the cheapest way to have the idea in
front of you without opening the graph at all, and it reads at a glance where a
date doesn't. If the spotlight is on, the newest note's dot takes its colour.

Your tab bar is usually a pile of things you opened once. **Fade tabs** dims one
the longer it goes untouched, so it reads as attention instead.

The useful setting is **by how long since you looked at it**, which is not the
same as when the file was edited. For a tab the question isn't when it was last
written, it's when you last had your eyes on it — an hour is a long time for
something sitting open in front of you. Obsidian doesn't record that, so Pulsar
keeps it. Sitting in a note doesn't count against it, and the tab you're in never
fades.

You can also fade them **by how long since it was edited**, which matches what
the graph is showing.

**What fades** is either the icon and title, or the whole tab with its
background. **Hovering a faded tab brings it back to full strength** either way,
so reaching for one you can barely see works, and so a whole tab dimmed to a
tenth doesn't take its close button down with it. There's a floor on how faint a
tab gets anyway, since one you can't read is one you can't get back to.

**How it fades** is the difference between *over* a span and *at* the end of
one. Gradually reads as how long ago; all at once reads as past the line or not.
Worth knowing: a gradient over a short span saturates almost immediately — set
to fade over one minute, every tab you haven't touched in a minute sits at the
floor together and the bar tells you nothing. If everything looks equally faint,
that span is the setting to change.

It survives a restart, but the time Obsidian spent closed doesn't count. Being
away from the app for a week isn't a week of ignoring a note, so the gaps freeze
while it's shut and resume where they left off. A tab with nothing on record
starts level with the rest.

**Mark tabs you have left alone** goes a step further: once a tab has been
ignored past a threshold you set, a quiet line appears down its edge, and a
**Close stale tabs** command closes the marked ones.

<p align="center">
  <img src="assets/stale-tabs.gif" width="760" alt="A row of editor tabs. Two are dimmed and carry a sleep symbol. A cursor moves to one of them, a green ring opens where it clicks, and the tab closes.">
</p>

**How they are marked** is a line down the edge, or a 💤 where the brightness dot
goes. The line is quiet to the point of being easy to miss, which is either the
point or the problem depending on the day. The 💤 replaces the dot rather than
sitting beside it: a narrow tab has room for one or the other, and a tab you are
being invited to close has nothing useful to say about its brightness.

Nothing closes on its own, ever. A tab that shuts itself feels like data loss
even when nothing is lost, and it's the plugin that gets blamed for losing your
place. A pinned tab is never marked — pinning is a deliberate statement that it
should stay — and neither is the tab you're in, which reports no idle time at
all.

A new install has the dot on, fades tabs by how long since you looked at them
— the icon and title, not the whole tab — and marks the ones left alone with a
💤.

There's also a status bar item — **Edited 4 minutes ago** for whatever note you
have open. It reads the note, not the graph, so it works with no graph view in
sight. On by default, since it says what the whole plugin is about in four
words. Switch it off under **Elsewhere**.

The spotlight paints the most recently modified note a colour of your own, so
the thing you touched last is findable at a glance. It can cover the last few
notes instead, up to 25, or everything touched within a window. It's on by
default. It's the one feature here that changes a node's colour rather than its
opacity, and it puts the original colour back the moment the newest note changes,
you turn it off, or the plugin unloads.

**Spotlight strength** decides how far that colour overrides the node's own. At
full strength you get exactly the colour you picked. Below that it mixes with
whatever your graph groups gave the node, which is the only way a group colour
should ever end up in there.

---

[← All docs](README.md) · [Pulsar](../README.md)
