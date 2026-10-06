# Fresh writing

The one part of Pulsar that works inside a note rather than around it.

**Light up what you just wrote.** Text takes a colour as you type it and cools
back to normal over the next few minutes, so a page you have been working in
shows you where the work actually was. Put the whole vault's idea inside a single
note: not *which* notes are warm, but *which paragraphs*.

**Start again** cools everything at once. That is the setting that makes it
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

Writing inside something already lit nests the new stretch inside the old one.
That is why the shades are colours rather than opacities — nested opacities
multiply into something far darker than either asked for, while nested colours
just let the innermost win, which is the newest edit, which is the right answer.

It applies in editing and Live Preview. Reading view isn't CodeMirror, so there
is nothing to colour there.

Off by default.

---

[← All docs](README.md) · [Pulsar](../README.md)
