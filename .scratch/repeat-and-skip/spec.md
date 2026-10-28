# Repeat and skip

Status: ready-for-agent

Designs: Claude Design canvas "Wiederholen und Springen – Entwürfe", https://claude.ai/artifact/7CZmN8NxVA5vztViGPY1j4 (boards: *Handy 3a Abschnitt wiederholen*, *3b Intro überspringen*, *3c A–B setzen*, *Desktop 3 Einsatz wiederholen*, *Admin-Editor*). Snapshot into `design/` when the work lands.

## Problem Statement

A singer practising a song can only repeat one phrase. To drill a whole refrain, the stretch of a song where they sing, or a hard passage across phrase borders, they have to seek by tapping the progress bar and hope to land on the right spot. Getting to their own first entry means sitting through the instrumental intro, and getting to the next entry means guessing a time. Landing exactly on a note start gives no run-up, so they miss the entry. The admin cannot see or correct how a song is structured (phrases, verses, refrains) while preparing content.

## Solution

The singer gets a **Repeat** selector on the practice screen: *Aus*, *Phrase*, *Abschnitt* (Strophe or Refrain), *Einsatz* (my own span) and *A–B* (two points the singer sets). While a repeat is on, everything outside its range is dimmed on the staff, the piano roll and the progress bar, and playback wraps at the range end. Sections appear as labelled segments on the progress bar, and tapping one starts its repeat. Two skip buttons jump to the previous or next own entry, landing a **lead-in** before it. *Intro überspringen* skips the instrumental intro before the first sung note.

Songs carry an optional list of **sections**, detected from repeated lyric lines when the content is built. The admin editor shows the staff, phrase band, section band, syllables and a smaller piano roll together, so the admin can check the detection and correct sections by bar number.

## User Stories

1. As a singer, I want to repeat the current phrase, so that I can drill one line until it sits
2. As a singer, I want to repeat the current verse or refrain, so that I can practise a whole section in one go
3. As a singer, I want to repeat my current own span, so that I can drill exactly the part I have to sing
4. As a singer, I want to set point A and point B and repeat between them, so that I can drill a passage that crosses phrase borders
5. As a singer, I want one *A–B* button that sets A, then B, then clears, so that I need no extra controls on a phone
6. As a singer, I want A and B to snap to bar lines, so that the repeat starts and ends musically
7. As a singer, I want one repeat mode at a time, so that I always know what is repeating
8. As a singer, I want the repeat range fixed when I switch it on, so that it does not jump to the next phrase while I sing
9. As a singer, I want a manual seek outside the range to keep the repeat on, so that I can look around without losing my drill
10. As a singer, I want everything outside the repeat range dimmed on the staff, the piano roll and the progress bar, so that I see at a glance what is repeating
11. As a singer, I want the dimming to be a visual hint only, so that sound and scoring are not changed by it
12. As a singer, I want to see the sections of a song as labelled segments on the progress bar, so that I can find the verse or refrain I want
13. As a singer, I want to tap a section on the progress bar to start its repeat, so that I need no extra steps
14. As a singer, I want a status line naming the active repeat and its time range, so that I know what is looping
15. As a singer, I want section and own-span repeats to restart with a lead-in of 3 s, snapped back to a bar line, so that I get a run-up to the entry
16. As a singer, I want phrase and A–B repeats to restart exactly at their start, so that tight drills stay tight
17. As a singer, I want *Intro überspringen* to jump to the first sung note minus the lead-in, so that I do not wait through the instrumental intro
18. As a singer, I want *Intro überspringen* shown only before the first sung note, so that the transport holds no button that does nothing
19. As a singer, I want to jump to my next own entry, so that I can skip what others sing
20. As a singer, I want to jump to my previous own entry, so that I can go back to the part I just sang
21. As a singer, I want "previous" to go to the start of the current own span when I am more than the lead-in past it, and to the one before otherwise, so that it behaves like a media player
22. As a singer, I want own spans separated by less than one bar merged into one, so that skipping does not throw me back into the middle of a line
23. As a singer, I want skip buttons disabled when no earlier or later own entry exists or my role set is empty, so that I am not misled
24. As a singer, I want a skip to another own span to move an active *Einsatz* repeat to that span, so that the repeat follows me
25. As a singer, I want repeating to keep one pass going and re-entered notes to replace earlier attempts, so that my pass results reflect my last try
26. As a singer, I want the results screen's drill action to turn on the Phrase repeat for my worst phrase, so that the drill keeps working
27. As a singer, I want the repeat selector to hide *Abschnitt* for songs without sections, so that old bundles keep working
28. As a singer, I want the countdown to my next entry to keep working during skip and repeat, so that I can anticipate the entry
29. As an admin, I want sections detected automatically when I build a song, so that I do not enter them by hand
30. As an admin, I want detection to treat runs of consecutive phrases whose lines recur later as refrains and what lies between as numbered strophes, so that the result matches how songs are built
31. As an admin, I want to see the staff, syllables, phrase band, section band and piano roll in the editor together, so that I can check phrases and sections against the notes
32. As an admin, I want the editor staff to look like the singer's staff, so that I check what the singer will see
33. As an admin, I want to add, delete, rename and re-bar sections in a list, so that I can correct detection exactly
34. As an admin, I want section edges to snap to bar lines, so that sections never start mid-bar
35. As an admin, I want a button to re-detect sections after a confirmation, so that I can start over after fixing phrase flags
36. As an admin, I want my saved sections to survive a repack, so that corrections are never overwritten by re-detection
37. As an admin, I want to click a phrase or section in the bands to select it and highlight its notes, so that I can see what belongs to it
38. As an admin, I want to keep setting *Phrasenanfang* on notes as the only way to edit phrases, so that phrases stay derived from one source

## Implementation Decisions

- **Domain language.** The glossary renames **Loop** to **Repeat** (kinds: phrase, section, own span, A–B). *Loop* stays as an internal event name and as a German label where "Wiederholen" is too long. New terms: **Section**, **Lead-in**, **Own span** (a merged role span of the role set). The singer-facing section heading says *Wiederholen*.
- **Section data.** The note file of a song gains an optional `sections` array of `{name, start, end}` in seconds, snapped to bar lines. Bundles without it stay valid. The content-format version is bumped and the content format spec documents the field.
- **Detection.** Section detection lives in the Python builder next to phrase derivation. A run of two or more consecutive phrases whose line texts recur later in the song is a Refrain, and each recurrence is its own section instance named *Refrain*, *Refrain 2*, … . The stretches between refrains are *Strophe 1*, *Strophe 2*, … . Intro and outro without notes are no section. Sections already stored in the song's source are kept as they are and not re-detected on a repack. Re-detection replaces them only when the admin asks for it in the editor.
- **Engine.** The audio engine's single-phrase loop becomes a repeat over a time range `{start, end}` or none. When playback reaches the range end it seeks to the range start. The `loop` event names a phrase only when the range is a phrase. Seeking, tempo and mode are unchanged.
- **Range building.** The practice screen builds ranges: Phrase (current phrase), Section (the section holding the playhead), Einsatz (the own span holding the playhead, or the next one if none), A–B (two points). A range is fixed at the moment the selector is switched on and is not updated by playback. Only one kind is active at a time.
- **Lead-in.** Section and own-span repeats restart `3 s` before the range start, snapped back to the previous bar line and never before 0. Skip actions use the same lead-in. Phrase and A–B repeats restart exactly at their start. The countdown to the next entry and the scorer's rule that a re-entered note discards earlier frames stay as they are.
- **Own spans.** Role spans of the role set separated by a gap shorter than one bar are merged into one own span, for both skipping and the Einsatz repeat. Previous goes to the start of the current own span when the playhead is more than the lead-in past it, otherwise to the one before. Next goes to the following one. Both are disabled when no target exists or the role set is empty.
- **Intro skip.** *Intro überspringen* is visible only while the heard time is before the first sung note of any role. It seeks to that note minus the lead-in. A song whose lead-in would land at 0 never shows it.
- **A–B.** One button cycles: set A at the current time, set B, clear. Points snap to the nearest bar line. After A is set the selector chip reads *B setzen* and the status line reads `A m:ss · B noch nicht gesetzt`. A without B dims everything before A. B must be later than A, otherwise the points are swapped.
- **Skip while a repeat is on.** A skip to another own span while *Einsatz* is active moves the repeat to that span. Other skips keep the active range, and playback wraps at the range end as usual. A manual seek outside the range keeps the repeat on and plays on until the range end, then wraps.
- **Dimming.** While a repeat is active the staff, the roll and the progress bar draw everything outside the range at reduced opacity and mark the range start (flag with the range name on the roll, A and B flags for A–B). This is drawing only. Heard audio and scoring are untouched.
- **Progress bar.** Shows sections as labelled segments, always (also without a repeat). Tapping a section starts the Section repeat for it. The active range is highlighted, the lead-in before it is marked. The status line shows the active repeat, its name and its range.
- **Practice screen UI.** The old loop toggle is replaced by a labelled selector row (*Wiederholen*: *Aus*, *Phrase*, *Abschnitt*, *Einsatz*, *A–B*) and a skip row with previous own entry, next own entry and, before the first note, *Intro überspringen*. The phrase-start button stays. The Abschnitt chip is hidden when the song has no sections. See the design boards for layouts on phone and desktop.
- **Drill.** The results screen's drill action sets the Phrase repeat for the worst phrase, tempo 80, seeks its start, and leaves playback paused, as before.
- **Editor.** The admin editor (vanilla JS under `web/`) gets the player's staff drawing by sharing it through a second build entry. It shows staff with syllables, a phrase band (number, line text, flag at each phrase start), a section band, and a smaller piano roll, all on one bar grid. Pages follow the roll's visible window with previous/next, showing as many bars as fit. Clicking a phrase, a section or a staff note selects it and highlights it in the roll. The phrase start flag stays the only phrase edit. Sections are edited in a list (name, from bar, to bar, delete, add) and re-detected through a button with a confirmation. Detection runs in the builder, reached through the existing editor server, never duplicated in the editor. Saving writes sections to the note file through the existing save path.
- **Repack.** All songs are re-detected and repacked as part of this work. The pack step needs `PITCH_PASSWORD`, which only the user supplies.

## Testing Decisions

- A good test drives the behaviour a singer or admin sees, through the module's public interface, and checks what comes out (time, range, label, written file), never internal state.
- The seams are the existing Gherkin scenarios in `specs/*.spec.md`, run by Vitest or pytest through the existing step files. No new seams.
  1. **Builder (pytest):** section detection from repeated lines, naming, bar snapping, preserving stored sections on repack, intro and outro excluded. Prior art: `tools/tests/test_phrases.py`, `tools/tests/steps_phrases.py`.
  2. **Content format (Vitest):** `sections` is validated, bundles without it load. Prior art: `tests/specs/content-format.test.ts`.
  3. **Audio engine (Vitest):** repeat range wrap, no range, loop event for phrases only, seek with lead-in. Prior art: the Loop feature in `specs/audio-engine.spec.md` and `tests/specs/audio-engine.test.ts`.
  4. **Practice screen (Vitest):** the selector kinds, fixed range, A–B cycle and snap, intro skip visibility, own-span merge and previous/next rules, skip with an active *Einsatz* repeat, dimming flags, section ticks and section tap, drill hand-off, chip hidden without sections. Prior art: `tests/specs/screen-practice.test.ts`, `tests/specs/screen-results.test.ts`.
  5. **Editor ops (Vitest):** add, delete, rename and re-bar a section, snap to bars, re-detect replace. Prior art: `tests/specs/editor.test.ts` and `web/edit-ops.js`.
- Drawing is covered only by the existing draw tests plus a manual check against the design boards. The editor's staff, band and roll rendering is not unit-tested.
- Specs are updated before code: `audio-engine`, `screen-practice`, `screen-results` (drill wording), `content-format`, `builder`, then the glossary, each with its Gherkin scenarios. Implementation follows test-first.

## Out of Scope

- Dragging section edges or A–B points on the progress bar or in the editor.
- Editing lyric text or syllables in the editor.
- New phrase editing beyond the existing *Phrasenanfang* flag.
- Detecting sections other than strophe and refrain (bridge, coda) automatically. The admin can name any section.
- Changing scoring, tolerance, history or results beyond the drill hand-off.
- Per-role section data, or sections that differ between singers.
- Persisting the chosen repeat across sessions.

## Further Notes

- The designs are unverified drafts rendered by the canvas only. Layout on a real 390×844 phone should be checked during the practice-screen ticket.
- The existing desktop design snapshot in `design/` is partly outdated (see `design/README.md`); the new boards should be added to it, not replace it.
- The lead-in is 3 s, a fixed constant. Make it a single named value so it can be tuned.
- Memory notes: the song audio, scores and web data JSON stay gitignored; only encrypted content is committed.
