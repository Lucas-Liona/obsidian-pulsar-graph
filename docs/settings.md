# Every setting

The reference table. Each setting is explained in the page for the surface it
belongs to; this is the list of them.

The page is in eight parts, and each one folds shut and stays that way:

| | |
|---|---|
| **Time** | What counts as old. Every other part reads the number it produces, so it comes first and has no off switch — it is the model rather than a feature. |
| **The graph** | Everything drawn in the graph view itself: the fade, node size, the ages above nodes, what the links carry, regions, the local graph, the age filter and the replay. |
| **Highlights** | The three ways of picking something out on purpose — the spotlight, pins, and fresh writing — against a background that dims by itself. |
| **Tabs** | The tab bar read as attention: the brightness dot, fading, and marking the ones you have left alone. |
| **Elsewhere** | What this draws that is neither a graph nor a tab: the status bar, and a dot after each link in a note. |
| **Setup** | The edit history, and saved sets of everything above. |
| **Measurements** | What the settings are doing to your actual notes. |
| **Clear and reset** | What cannot be taken back: forgetting the history, resetting the settings and unpinning every note. Each asks for a second click. |

**The graph** and **Tabs** have a switch on the container itself. Off means the
same thing the master switch means, for that part only: the hooks come off, the
graphs are handed back their own colours, and nothing is left watching.

A handful of these also live in the graph's own panel, in a **Pulsar** section
beside Filters, Groups, Display and Forces — the ones worth reaching for while
looking at a graph rather than from a dialog in front of it:

| Heading | Controls |
|---|---|
| **Nodes** | Dimmest, Brightest, Curve, Glow, Size by age, Stars, Spotlight |
| **Links** | Age, Trace sittings |
| **Text** | Title size, Ages |
| **Age filter** | Measure from this note (local graph only), Hide notes outside a range, the range bar |

They are the same settings, not copies: moving one moves the other. Dimmest and
Brightest are the minimum and maximum opacity, Curve is the fade type, Glow is
Neighbour glow, Size by age is Size nodes by age, Stars is Draw the newest notes
as stars, Spotlight is Spotlight the
newest note, the links' Age is Age the links too, Trace sittings is Trace what
was written together, and Ages is Show note age. Both run over the same range in either place. Sliders apply
while you drag and are saved once you stop.

Every slider in the settings has a number box beside it, and a preview at the
top shows dots at real ages from your own vault at the opacity each would get,
so you can see what a change does before you close the dialog.

**Measurements** shows the numbers behind all of it: how your notes are spread
across the brightness range, how many distinct brightnesses exist, how much edit
history there is, how your folders divide up, how many islands of linked notes
the open graph has and how big the largest is, and how many links join notes
written in the same sitting.

Every design decision in this plugin was settled by measuring rather than
arguing, and the measurements kept turning out to say more about the vault than
about the plugin. There's no reason to keep that to whoever's holding a debugger.

If you'd rather not assemble a combination yourself, there are presets in
Setup:

| Preset | What you get |
| --- | --- |
| Gentle | Everything stays readable. Age is a hint rather than a filter |
| Even spread | Ranked against each other, so the graph has full contrast whatever your history looks like |
| Bands of age | Five distinct steps, so the graph reads as layers rather than a gradient |
| This month | The last 30 days get the whole range; everything older drops away |
| This week | Seven days on a log scale, so today separates sharply from Tuesday |
| Steady decay | A note halves in brightness every two weeks, by the calendar, so adding or deleting notes changes nothing else |

A preset only moves the settings that shape the fade. What you've chosen to
*show* — the age labels, the status bar, your spotlight colour — is left alone.

You can also **save your own**. Name the current settings and they're kept,
whole — everything but the history settings, the master switch and your pins,
because a setup you've tuned is the whole look and not a slice of it. Saved
presets appear in the same dropdown.

**Copy** puts a preset on the clipboard as plain JSON and **Paste** reads one
back, so a setup can be kept somewhere or handed to someone else. Nothing leaves
your machine; it's the clipboard, not a server. Anything pasted in is put through
the same repair the plugin's own settings get, so a preset can be wrong or
half-written but never dangerous.

**Reset all settings**, in Clear and reset, puts the settings back to their
defaults and leaves your saved presets, your pins and which parts are folded
alone. Deleting a saved preset asks for a second click, as everything in Clear
and reset does.

The tables below follow the settings tab from top to bottom.

## Above the parts

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Pulsar | on / off | on | everything | The master switch. Off, nothing is watched, drawn or recorded |

## Time

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Age scale | Even, By rank, Logarithmic, By half-life | Even | all | How a gap in age becomes a gap in opacity |
| Half-life | 1 hour – 365 days, in round steps | 14 days | By half-life | How long a note takes to fade halfway |
| Measure age against | Whole history, Recent window, Whatever the graph is showing | Whole history | any scale but half-life | What sets the oldest and newest ends |
| Never spread across less than | 15 minutes – 7 days, in round steps | 6 hours | anything that re-spreads | The narrowest span a re-spread range may cover |
| Window | 6 hours – 365 days, in round steps | 30 days | Recent window | How far back the range reaches. Older notes sit at the minimum |

## The graph

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| The graph (switch on the header) | on / off | on | all | Off hands every graph back as Obsidian draws it |
| Draw the newest notes as stars | on / off | off | all | A soft halo around the newest notes: a glow on a dark theme, black on a light one |
| How many | 1 – 250 | 10 | Stars on | How many of the newest notes get one |
| Pulse | on / off | off | Stars on | Each one breathes. Draws a still graph 30 times a second while it is on screen; holds still while the system asks for reduced motion |
| Fade type | Linear, Exponential, Step | Linear | all | How opacity falls from newest to oldest |
| Minimum opacity | 0.0 – 1.0 | 0.1 | all | How faint the oldest note gets |
| Maximum opacity | 0.0 – 12.0 | 3.0 | all | How bright the newest note gets |
| Steepness | 0.1 – 10.0 | 2.0 | Exponential | Higher keeps only the newest notes bright |
| Number of steps | 1 – 20 | 5 | Step | How many bands of age |
| Size nodes by age | on / off | off | all | Scales each node by age, on top of Obsidian's own size |
| Oldest at | 0.2 – 3.0 | 0.7 | Sizing on | What the dimmest note's size is multiplied by |
| Newest at | 0.2 – 3.0 | 1.8 | Sizing on | What the brightest note's size is multiplied by. Below Oldest at reverses it |
| Title size | 0.5 – 2.5 | 1.0 | all | What every title's font is multiplied by |
| Show note age | Never, On hover, Whenever titles are shown | On hover | all | The age, written above the node |
| Age the links too | Off, Match the newer note, Fade between the two | Off | all | Gives each link the age of its ends |
| Trace what was written together | on / off | off | all | Colours links between notes saved in one sitting |
| Trail colour | any | blue `#5ac8fa` | Tracing on | |
| Trail strength | 0.0 – 1.0 | 0.55 | Tracing on | How far a trail goes toward its colour |
| Group temperature | 0.0 – 1.0 | 0 (off) | all | Pulls each note toward its group's median brightness |
| Group notes by | Folder, Linked island | Folder | Temperature above 0 | What counts as a group |
| Neighbour glow | 0.0 – 0.95 | 0 (off) | all | How much of a bright note carries to the notes it links to |
| Glow reach | 1 – 3 hops | 1 | Glow above 0 | How many links the glow travels |
| Measure a local graph against | The vault's whole history, The notes in the panel | Whole history | local graph | Also decides which note the spotlight picks there. Under a half-life the panel option only does that |
| Measure from the note in the middle | on / off | off | local graph | Brightness by distance in time from the panel's note, either side. Replaces the choice above for brightness |
| Write every age in a local graph | on / off | off | local graph | Ages with every title in a panel, whatever Show note age says |
| Hide notes outside a range | on / off | off | all | Takes notes out of the graph rather than dimming them. The open note, a local graph's own note, spotlit notes and pins are kept |
| Say so on the graph | on / off | on | every graph | A line across the top saying what the graph holds. Shown whether or not the filter is on, and so is its switch |
| Keep | one or more ranges along the curve | the whole range | Filter on | What the filter keeps. **+** adds a range, **−** removes the last |
| Light the timelapse as it plays | on / off | off | all | Measures each note from the moment the graph's own timelapse has reached |
| Stays lit for | 1 – 365 days, in round steps | 60 days | Replay on | How much vault time a note takes to fade behind the wave |

Maximum opacity goes above 1.0 on purpose. Obsidian multiplies a node's opacity by
its own fade factor, so pushing past 1.0 keeps your recent notes at full strength
while everything older still falls away. Past 1.0 a node isn't drawn any more
solid: on a dark theme its colour is lightened instead, so a grey node goes
whiter until it is plain white, and a very high maximum flattens the top of the
curve — the preview shows you when that is happening. On a light theme it is
the mirror: the colour deepens instead, so the theme's grey goes toward black
(Moonstone's `#5c5c5c` is near black by 1.5 and black from 2), since lightening
there would fade a recent note into the page. The spotlight and pin colours are
never lightened or deepened past full strength; a graph group's colour is,
like anything else. On a light theme the spotlight's colour is darkened
instead, as far as it takes to stand 3:1 off white and no further, since the
colours that glow on a dark theme are pale and pale is what vanishes on a
light one: the default green `#4dff91` is drawn `#33a960` there. The
two opacity sliders can't cross — move one past the other and it takes the other
with it.

## Highlights

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Spotlight the newest note | on / off | off | all | Paints the most recently modified notes a colour of your own |
| Spotlight colour | any | green `#4dff91` | Spotlight on | On a light theme, drawn darker until it stands 3:1 off the page |
| Spotlight strength | 0.0 – 1.0 | 1.0 | Spotlight on | How far the colour overrides the node's own |
| What it covers | The newest few notes, Anything touched recently | The newest few notes | Spotlight on | A count, or a window of time |
| How many notes | 1 – 25 | 1 | The newest few notes | How many of the newest notes are lit |
| Touched within | 1 minute – 1 day, in round steps | 30 minutes | Anything touched recently | Every note edited this recently is lit, however many — or none |
| Spotlight size | 1.0 – 5.0 | 2.0 | Spotlight on | What a spotlit note's circle is multiplied by |
| Give pins a colour | on / off | on | all | Paints pinned notes, so a pin reads as a pin rather than as fresh |
| Pin colour | any | purple `#c084fc` | Pin colour on | |
| Pin strength | 0.0 – 1.0 | 0.85 | Pin colour on | How far the colour overrides the node's own |
| Pinned notes | a list, each with **Unpin** | none | all | Pinning itself is a right-click on a graph node or a note in the file explorer, or a command |
| Light up what you just wrote | on / off | off | all | Fresh text takes a colour and cools back to normal. The status bar counts what is still lit |
| How it shows | Colour what is new, Dim everything else | Colour what is new | Fresh writing on | Colour the new text, or dim the rest of the page |
| How far it dims | 0.1 – 0.9 | 0.45 | Dim everything else | How far toward the background the rest of the page goes |
| Cools over | 1 second – 4 hours, in round steps | 5 minutes | Fresh writing on | How long fresh writing takes to fade back. The slider is marked where seconds give way to minutes and minutes to hours |
| Colour | any | orange `#ff7a45` | Fresh writing on | What the newest writing is drawn in |
| Start again | button: **Cool it all** | | Fresh writing on | Cools every open note at once. Also a command |

## Tabs

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Tabs (switch on the header) | on / off | on | all | Off leaves the tab bar as Obsidian draws it |
| Show a dot beside each tab | on / off | off | all | A dot at that note's brightness in the graph. Hover it for when the note was edited |
| Fade tabs | Never, By attention, By edit time | Never | all | Dims a tab the longer it goes untouched |
| What fades | The icon and title, The whole tab | The whole tab | Fading on | |
| How it fades | Gradually, All at once | Gradually | By attention | |
| Faded after | 1 minute – 8 hours, in round steps | 1 hour | By attention | How long a tab is ignored before it is as faint as it gets |
| Faintest a tab gets | 0.1 – 1.0 | 0.35 | Fading on | |
| Mark tabs you have left alone | on / off | off | all | Marks tabs not looked at for a while. A command closes them |
| How they are marked | A line down the edge, A 💤 where the dot goes | A line down the edge | Marking on | |
| Marked after | 5 minutes – 2 days, in round steps | 4 hours | Marking on | How long a tab is ignored before it is marked |

## Elsewhere

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Show the open note's age | on / off | on | all | The open note's age in the status bar, with no graph needed |
| A dot after each link | on / off | off | all | A dot after each link in a note, at the linked note's brightness |

## Setup

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Keep a record of when notes were worked on | on / off | on | all | Records each sitting with a note, in the plugin's own folder |
| Counts as one sitting | 1 minute – 4 hours, in round steps | 30 minutes | History or tracing on | The longest gap between two saves in one sitting. The history counts sittings by it and trails decide what was written together by it. Listed under History while that is on, and with the trails otherwise |
| Sittings kept per note | 10 – 1000 | 100 | History on | The oldest are dropped past this |
| Blend in edit intensity | 0.0 – 1.0 | 0 (off) | History on | How much brightness comes from how often you return to a note |
| Measure intensity | Against the busiest note, By rank, Logarithmic | By rank | History on | How a sitting count becomes a brightness. Does nothing at a blend of 0 |
| Import earlier history | button: **Import** | | History on | Reads core File Recovery's snapshot times as earlier sittings. Never what a note says |
| Presets | the six above, and yours | | all | Applies one |
| Save these settings | a name, and **Save** | | all | Keeps the current settings as a preset |
| Each saved preset | **Copy**, **Delete** | | a preset saved | Delete asks twice |
| Share presets | **Copy all**, **Paste** | | all | Every saved preset to the clipboard, or presets from it |

## Measurements

Nothing to set. It is the numbers described above.

## Clear and reset

| Setting | Range | Default | Applies to | What it does |
| --- | --- | --- | --- | --- |
| Forget everything recorded | button: **Forget** | | all | Deletes the edit history |
| Reset all settings | button: **Reset** | | all | Every setting back to its default. Saved presets, pins and folded parts are kept |
| Unpin every note | button: **Unpin all** | | all | Unpins every note in the graph |

---

[← All docs](README.md) · [Pulsar](../README.md)
