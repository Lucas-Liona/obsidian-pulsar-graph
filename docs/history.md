# Edit history

Pulsar's own record of when each note was worked on: where it comes from, and
why it is worth nothing until it has been running a while.

Obsidian keeps one modification time per note and throws the rest away. Edit a
note ten times over a year and nine of those are gone — which is why the graph
can tell you a note was touched this morning but never that it was touched every
morning for a month and then abandoned.

Pulsar can keep that record itself. It writes down each **sitting**: a run of
writes with no gap in it longer than your session gap, so a morning's work is one
entry rather than the several hundred autosaves it really was. Each one stores
when it started, when it ended, and how long the note was at each end.

It starts empty, and it is worth nothing on the day you install it and a lot a
year later — which is the only reason it's on by default when everything else
here is off. The statistics panel at the foot of the settings shows what it has
collected so far, and **Forget everything recorded**, in Clear and reset at the
foot of the settings, throws the lot away after a second click.

It's a record of how *you* worked on *this* machine, so it lives in a file of its
own in the plugin's folder and is never synced between devices. An edit that
arrives by sync is dated by the note's own timestamp, so work you did on your
phone three days ago is recorded three days ago rather than as a fictional
sitting now.

**It can start with a head start.** Obsidian's core *File recovery* plugin keeps
a copy of every note it has seen change, usually for the last seven days, and
**Import earlier history** in the settings folds those timestamps in. On my vault
that turned 170 snapshots across 76 notes into 96 sittings in one press. It's a
button rather than something that happens on its own, it says what it found
before you press it, and it's safe to press twice — a timestamp already inside a
sitting merges back into it instead of adding another.

Only the timestamps are read. Each of those snapshots holds the note's full text,
and the import never goes near it: the two indexes are walked with
`openKeyCursor`, which hands back a cursor object that has no `value` property on
it at all, so the text isn't merely left alone, it's unreachable from there.

**Blend in edit intensity** is the first thing that reads it. Slide it up and a
node's brightness stops being purely about *when* you last touched a note and
starts being partly about *how often you come back to it* — the note you revisit
every week outshines the one you opened once, even if both were touched this
morning.

It's added to recency rather than multiplied by it:

```
brightness = (1 − blend) · recency + blend · intensity
```

which is why 0 is a true no-op and why a note with nothing recorded yet keeps a
share of what its date earns instead of vanishing. Intensity is a sitting count,
ranked against the other notes by default — counts are far more lopsided than
dates, most notes having one or two while a handful have dozens, so measuring
against the busiest note would leave nearly everything at the bottom.

It's worth little until the history has been running a while, and a steep fade
curve magnifies it sharply.

The other thing that reads it is **[the history view](beads.md)**: a note's
sittings drawn as beads down the sidebar, so its bursts and quiet stretches read
at a glance. It was deliberately left until the record existed to design
against.

---

[← All docs](README.md) · [Pulsar](../README.md)
