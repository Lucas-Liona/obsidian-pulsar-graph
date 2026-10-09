# Fresh writing

The one part of Pulsar that works inside a note rather than around it.

<p align="center">
  <img src="assets/fresh-writing.gif" width="640" alt="A note being revised: a half-finished sentence is completed, a one-letter typo is fixed, and a new sentence is added to an earlier paragraph. Each edit appears in green where it was made and cools back to the ordinary text colour while the next one is typed.">
</p>

<p align="center">
  <img src="assets/writing-light.gif" width="680" alt="The same revision on a white page: each edit appears in dark green and cools back to ordinary black text.">
</p>

<p align="center"><i>The same thing on a light theme. Nothing about the colour is hard-coded — it cools toward whatever that text would otherwise be.</i></p>

**Light up what you just wrote.** Text takes a colour as you type it and cools
back to normal over the next few minutes, so a page you have been working in
shows you where the work actually was. Put the whole vault's idea inside a single
note: not *which* notes are warm, but *which paragraphs*.

**How it shows** is either of two opposite things. *Colour what is new* tints the
fresh writing and leaves the page alone. *Dim everything else* leaves the writing
alone and takes the rest of the page down toward the background — which never
replaces a colour you chose, so it suits actually working, where the tint suits a
screenshot. A note with nothing lit in it is never dimmed at all, so opening a
vault does not grey it.

The status bar carries a paint bucket and how many characters of the note you
are in still look lit, leaving out the last shade, which already reads as
ordinary text. Clicking it cools that note. It is only there while something is
lit.

Nothing here marks text to come back to. Obsidian's own highlighting
(`==like this==`) does that better: it is saved in the note, survives closing
it, and is searchable. Fresh writing is only ever about how recently something
was written.

**Start again** cools every open note at once. That is the setting that makes it
usable rather than exhausting — once everything on the page counts as old, the
next thing you write stands on its own instead of competing with the last hour.
It is also a command, **Cool fresh writing**, so it can have a hotkey.

Three things worth knowing about how it works:

- **Nothing is written to the note.** It is a colour in the editor; the file on
  disk is byte for byte what it was. Close the note and the colour is gone.
- **It tracks characters, and it is cheap.** CodeMirror hands over the exact
  ranges each edit inserted and maps existing ranges through later edits itself,
  so the cost is in the size of the change rather than the size of the note. No
  diffing, no snapshots, no comparing anything to anything.
- **It reads where you wrote, never what you wrote.** Offsets and lengths. The
  text is never looked at, stored or counted.
- **It cools toward whatever that text would otherwise be.** The shades are mixed
  against `currentColor`, which on the `color` property means the inherited
  value — so a heading cools to its own colour rather than to body-text white and
  then snapping back when the mark expires. The dimming works the same way, so a
  dimmed heading is a dimmer version of itself instead of one flat grey.

Writing inside something already lit nests the new stretch inside the old one.
That is why the shades are colours rather than opacities — nested opacities
multiply into something far darker than either asked for, while nested colours
just let the innermost win, which is the newest edit, which is the right answer.

It applies in editing and Live Preview. Reading view isn't CodeMirror, so there
is nothing to colour there.

Off by default.

---

[← All docs](README.md) · [Pulsar](../README.md)
