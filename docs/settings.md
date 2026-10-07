# Every setting

The reference table. Each setting is explained in the page for the surface it
belongs to; this is the list of them.

The page is in seven parts, and each one folds shut and stays that way:

| | |
|---|---|
| **Time** | What counts as old. Every other part reads the number it produces, so it comes first and has no off switch — it is the model rather than a feature. |
| **The graph** | Everything drawn in the graph view itself: the fade, node size, the ages above nodes, what the links carry, regions, the local graph, and the age filter. |
| **Highlights** | The three ways of picking something out on purpose — the spotlight, pins, and fresh writing — against a background that dims by itself. |
| **Tabs** | The tab bar read as attention: the brightness dot, fading, and marking the ones you have left alone. |
| **Elsewhere** | What this draws that is neither a graph nor a tab. The status bar, today. |
| **Setup** | The edit history, and saved sets of everything above. |
| **Measurements** | What the settings are doing to your actual notes. |

**The graph** and **Tabs** have a switch on the container itself. Off means the
same thing the master switch means, for that part only: the hooks come off, the
graphs are handed back their own colours, and nothing is left watching.

Every slider has a number box beside it, and a preview at the top of the settings
shows dots at real ages from your own vault at the opacity each would get, so you
can see what a change does before you close the dialog.

At the bottom, **What this is doing to your vault** shows the numbers behind all
of it: how your notes are spread across the brightness range, how many distinct
brightnesses exist, how your folders divide up, how many islands of linked notes
the open graph has and how big the largest is, and how many links join notes
written in the same sitting.

Every design decision in this plugin was settled by measuring rather than
arguing, and the measurements kept turning out to say more about the vault than
about the plugin. There's no reason to keep that to whoever's holding a debugger.

If you'd rather not assemble a combination yourself, there are presets at the
bottom, next to **Reset**:

| Preset | What you get |
| --- | --- |
| Gentle | Everything stays readable. Age is a hint rather than a filter |
| Even spread | Ranked against each other, so the graph has full contrast whatever your history looks like |
| Bands of age | Five distinct steps, so the graph reads as layers rather than a gradient |
| This month | The last 30 days get the whole range; everything older drops away |
| This week | Seven days on a log scale, so today separates sharply from Tuesday |

A preset only moves the settings that shape the fade. What you've chosen to
*show* — the age labels, the status bar, your spotlight colour — is left alone.

You can also **save your own**. Name the current settings and they're kept, whole
— everything, not just the fade, because a setup you've tuned is the whole look
and not a slice of it. Saved presets appear in the same dropdown.

**Copy** puts a preset on the clipboard as plain JSON and **Paste** reads one
back, so a setup can be kept somewhere or handed to someone else. Nothing leaves
your machine; it's the clipboard, not a server. Anything pasted in is put through
the same repair the plugin's own settings get, so a preset can be wrong or
half-written but never dangerous.

**Reset** puts the settings back to their defaults and leaves your saved presets
alone.

| Setting | Range | Default | Applies to |
| --- | --- | --- | --- |
| Measure age against | Whole history, Recent window, Whatever the graph is showing | Whole history | all |
| Window | 1 – 365 days | 30 | Recent window |
| Never spread across less than | 1 – 168 hours | 6 | anything that re-spreads |
| Age scale | Even, By rank, Logarithmic | Even | all |
| Fade type | Linear, Exponential, Step | Linear | all |
| Minimum opacity | 0.0 – 1.0 | 0.1 | all |
| Maximum opacity | 0.0 – 12.0 | 3.0 | all |
| Steepness | 0.1 – 10.0 | 2.0 | Exponential |
| Number of steps | 1 – 20 | 5 | Step |
| Show note age | Never, On hover, With titles | On hover | all |
| Age the links too | Off, Match the newer note, Fade between the two | Off | all |
| Group temperature | 0.0 - 1.0 | 0 (off) | all |
| Group notes by | Folder, Linked island | Folder | Temperature above 0 |
| Trace what was written together | on / off | off | all |
| Counts as one sitting | 1 - 240 minutes | 30 | Tracing on |
| Trail colour | any | blue | Tracing on |
| Trail strength | 0.0 - 1.0 | 0.55 | Tracing on |
| Neighbour glow | 0.0 - 0.95 | 0 (off) | all |
| Glow reach | 1 - 3 hops | 1 | Glow above 0 |
| Age in the status bar | on / off | on | all |
| Dot beside each tab | on / off | off | all |
| Fade tabs | Never, By attention, By edit time | Never | all |
| What fades | The icon and title, The whole tab | The whole tab | Fading on |
| How it fades | Gradually, All at once | Gradually | By attention |
| Faded after | 1 - 480 minutes | 60 | By attention |
| Faintest a tab gets | 0.1 - 1.0 | 0.35 | Fading on |
| Spotlight the newest note | on / off | off | all |
| Spotlight colour | any | white | Spotlight on |
| Spotlight strength | 0.0 – 1.0 | 1.0 | Spotlight on |
| Light the timelapse as it plays | on / off | off | all |
| Stays lit for | 1 – 365 days | 60 | Replay on |
| Fade the graph at all | on / off | on | all |
| Touch the tab bar at all | on / off | on | all |
| Measure a local graph against | The vault's whole history, The notes in the panel | Whole history | local graph |
| Measure from the note in the middle | on / off | off | local graph |
| Write every age in a local graph | on / off | off | local graph |
| Say what the panel holds | on / off | off | local graph |
| What the spotlight covers | The newest few notes, Anything touched recently | The newest few | Spotlight on |
| Touched within | 1 – 720 minutes | 30 | Window mode |
| Give pins a colour | on / off | on | all |
| Pin colour | any | purple | Pin colour on |
| Pin strength | 0.0 – 1.0 | 0.85 | Pin colour on |

Maximum opacity goes above 1.0 on purpose. Obsidian multiplies a node's opacity by
its own fade factor, so pushing past 1.0 keeps your recent notes at full strength
while everything older still falls away. Be aware that it is clamped at 1.0 when
drawn, so a very high maximum flattens the top of the curve — the preview shows
you when that is happening. The two opacity sliders can't cross — move one past
the other and it takes the other with it.

---

[← All docs](README.md) · [Pulsar](../README.md)
