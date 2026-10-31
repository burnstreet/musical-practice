---
name: Screen Practice
description: Live singing screen. Artboards Main.dc.html and MainDesktop.dc.html. Header, mode button, staff, piano roll, cents readout, repeat selector, progress bar with sections, transport, mic state, hints.
targets:
  - ../src/app/screens/practice.ts
  - ../src/app/draw/staff.ts
  - ../src/app/draw/roll.ts
---

# Screen: Singen (live)

Lit element `<gu-practice>`. Wires audio engine, pitch engine, session. Draws staff and piano roll on two canvases. Never computes scores itself.

Strings:

| id | text |
|---|---|
| back | aria `Zurück zur Auswahl` |
| title | `Lied {n} · {title}` |
| sub | `Takt {a}–{b} · {key} · {bpm} BPM` |
| modeLabel | `Voicetrack` |
| modeValues | `alle Stimmen` / `nur für andere` / `nur Playback` |
| legendMine | `Meine Stimme · {roleNames}` |
| legendOthers | `Andere` |
| target | `Ziel {note}` |
| centsOk | `{±n} Cent · sauber` |
| centsSlight | `{±n} Cent · leicht zu hoch` / `leicht zu tief` |
| centsFar | `{±n} Cent · zu hoch` / `zu tief` |
| noTarget | `–` |
| meterEnds | `tief` (left) / `hoch` (right), under the meter |
| repeatLabel | `Wiederholen` (heading of the selector row) |
| repeatValues | `Aus` / `Phrase` / `Abschnitt` / `Einsatz` / `A–B` (chips, one active) |
| abSetB | chip text `B setzen` after A is set |
| repeatStatus | `{name} · {m:ss}–{m:ss}`; A–B with A only: `A {m:ss} · B noch nicht gesetzt` |
| skipPrev | aria `Zum vorigen Einsatz` |
| skipNext | aria `Zum nächsten Einsatz` |
| introSkip | `Intro überspringen` |
| phraseStart | aria `Zurück zum Anfang der Phrase` |
| pause | aria `Pause`; with `features.results` on `Pause und Auswertung` |
| tempo | `{t}%`, aria `Tempo {t} Prozent` |
| mic | aria `Mikrofon aktiv` / `Mikrofon aus` |
| micDenied | `Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung.` |
| noPart | `Deine Rolle singt hier nicht. Nur Zuhören.` |

## Setup

- On enter: `library.getSong`, `engine.load(song, roles)`, `setMode(settings.mode)`, headphone sheet if due, `session = new Session`, then `pitch.start(engine.time, engine.latency)` only when the song has notes for the selected roles.
- No notes for my roles: `noPart` hint, mic indicator hidden, mode forced `all`. With `features.results` on, pause goes to songs.
- `pitch.start` returns `denied` or `unsupported`: `micDenied` banner, mic button shows off state, playback allowed, results disabled.
- Leaving: `engine.unload`, `pitch.stop`, `history.record` with session passes.

## Header

- `sub` bar range = the staff page drawn (`Takt {a}` for a one-bar page; before the first draw: `barsPerPage` bars), key from song, bpm from song times tempo.
- Mode button cycles all → others → backing → all. Saves to settings.

## Staff (canvas, 1 to 4 bars per page)

- Treble clef, key signature from `song.key`, 5 lines. Accidentals only on pitches outside the key. A song whose median note lies below B3 is written an octave (or more) above its sound, with a small `8` under the clef (`octaveShift`), so low voices stay on the lines.
- Rests: in each bar every span no visible note covers (bar start to first note, a note's written end to the next note, last end to bar end) gets rests. Gap ends snap to the sixteenth grid (gaps under 1/8 beat vanish), then split into half, quarter, eighth, sixteenth rests, each starting on a multiple of its own length from the bar start; no dotted rests. Empty bar: one whole-bar rest, centred (also in 3/4). Music font glyphs U+1D13B–U+1D13F placed by measured ink (whole hangs from the fourth line, half sits on the middle line). Faint colour of the voice that just stopped (mine first), else the one about to start; muted in an empty bar. Rests are onsets of the spacing without a syllable.
- Note value from `dur` (quarters), quantised to the nearest written value: whole (hollow, no stem), half (hollow, stem), quarter (filled, stem), eighth / sixteenth (filled, stem, 1 / 2 flags); augmentation dot for dotted values (dotted sixteenth to dotted half). Spoken note (rap, `spoken`): slash head on the middle line, no accidental, stem and flags as its value; left out of `octaveShift`. Tie or slur (`tie`, `slur`): an arc from the note to the next note of its role, below the heads when the stem points up, else above; over a page turn it runs out at the page end and comes in at the next page's start.
- Beams (`beamGroups`): eighths and shorter of one role, back to back (each starts where the previous written value ends), in the same bar and beat (quarter), share a beam instead of flags; one note alone keeps its flag. Group stems all point one way, set by the head farthest from the middle line. Beam: straight from first to last stem, slope at most 1/4, moved off the heads so the shortest stem keeps its minimum length (`beamTips`). Sixteenths get a second beam between neighbouring sixteenths, a lone one a stub towards the note before it (after it when first).
- Hyphens: a syllable ending in `-` is drawn without it; a `-` sits centred in the gap to the next syllable of its role on the page, or just after the syllable when that one is on a later page. Spacing leaves room for it.
- Spacing per bar: each onset gets room ∝ (time to the next onset or bar end)^0.6, scaled to fill the bar; a rest before the first note keeps its room. Minimum distance between onsets = head (more before an accidental) and half of each neighbour's syllable + 4 px; short notes take it from long ones.
- Bar widths on a page follow each bar's minimum width. Too dense: lyric font shrinks down to 10 px. Syllables are never left out and always on one row (two rows were unreadable).
- Pages: the song is split once per canvas size and roles (`staffPages`, cached): each page takes up to `barsPerPage` bars (canvas width / 150 px, 2…4: phone 2, sideways 3, wide 4), fewer while its syllables do not fit on one row at 10 px, at least 1. The page shown is the one holding the bar of the heard time.
- Bar lines: solid, text colour, 1.5 px, full staff height, at every bar start on the page and at the page end. Bar number (muted, 10 px) over each bar's start, matching `sub`.
- Notes drawn = `visibleNotes(song.notes, roles)`: one line where I sing (same for the piano roll).
- Mine: accent colour. Others: `--other`. Syllable under each onset (mine first), mine bold at the current note. Role name above each run of same-role notes, left out where it would overprint the previous one.
- Current note highlighted with a translucent box.
- Playhead: dashed vertical line as in the piano roll (text colour, 1.5 px, dash 3/4) over the staff at the heard time, moving linearly from onset to onset (notes at their sung start, rests at their place in the bar; bar line at the page start, page end at the last), so the next entry can be anticipated.
- Intro and other bars without visible notes show whole-bar rests (the song's `bars` include the intro, see content format).

## Piano roll (canvas)

- Vertical: semitones, labels every semitone row without octave (`C`, `C#`, `D` …). Range follows my notes in view ±2 semitones, min 10 rows.
- Horizontal: window `rollWindow` = canvas width / 72 px per second, 5…8 s (a wider screen shows more of what comes), playhead at 30 % width. Target bars = my notes, accent; filled portion = elapsed part. Other roles' notes dashed in `--other`. Spoken notes: no bar, not in the row range, syllable in the lyric strip only; the sung line folds to sung notes only.
- Heard time: staff, piano roll, page and readout show `engine.time() − pitch.delay()`, the song position the singer hears now (Android Chrome measured 760 ms on Bluetooth). Transport and seek keep the playback position.
- Sung line: pitch frames of the last 1.5 s by their scoring stamp `t` (the sung moment in heard time, so the newest point sits at the playhead and the line lies on the note it was sung to), folded into the octave of the nearest target note at that time; `null` breaks the line. White, 4 px, dark outline. Dot at the newest frame.
- Lyric strip: 22 px under the rows (the playhead runs through it). One syllable per onset in view (mine first), 12 px, at its note's start, pushed right only as far as needed to keep 6 px after the previous one (`lyricXs`), so none is left out or overprinted. Mine accent, others `--other`, my sounding one bold.

## Repeat

Selector row `repeatLabel` with chips `repeatValues`, replacing the old loop toggle. One kind active at a time; tapping another chip switches, `Aus` clears the repeat range. Not persisted across sessions, but kept while the same session goes on: when the screen is shown again (back from results) chip, name, A and B follow the engine range. Ranges are song seconds; "now" = the heard time.

- Phrase: the phrase holding now, else the next one, else the last. Range = phrase start/end, `phrase` set, no lead-in.
- Abschnitt: the section holding now, else the next one. Range = section start/end, lead-in. Chip hidden when `song.sections` is missing or empty.
- Einsatz: the own span holding now, else the next one. Range = span start/end, lead-in. No span at or after now: chip stays off.
- A–B: one chip cycles. First tap sets A at now snapped to the nearest bar line, chip reads `abSetB`, status `A m:ss · B noch nicht gesetzt`. Second tap sets B the same way and starts the repeat (no lead-in). B before A: swapped. B on the same bar line as A: B moves to the next bar line. Third tap clears both and ends the repeat. Switching to another kind in between drops A.
- The range is fixed when the kind is switched on. Playback, passes and phrase changes never update it.
- Lead-in: restart (and the first seek on switching on) lands on `leadInStart(range.start, song.bars)` with `LEAD_IN_SEC` = 3, for Abschnitt and Einsatz only. Phrase and A–B land exactly on their start.
- A manual seek outside the range keeps the repeat on. A seek before the range plays on to the range end, then wraps. A seek past the range end plays on without wrapping (engine rule: wrap only when playback crosses the end from before it).
- Section segments are told apart by their start, not their name: two sections of the same name never light up together.
- The wrap is not a pause: the pass goes on, `session.enter` for re-entered notes replaces earlier attempts (scorer rule unchanged). The countdown to my next entry keeps working during repeat and skip.
- Dimming: while a repeat is on, staff, piano roll and progress bar draw everything outside the range at reduced opacity and mark the range start (roll: flag with the range name; A–B: flags `A` and `B`). A without B dims everything before A. Drawing only: sound, mic, scoring and the cents readout are untouched.
- Status line under the selector: `repeatStatus`, hidden when no repeat.

## Own spans and skip

- Own spans = `roleSpans` of my roles with spans merged when the gap between them is below one bar (the length of the bar that holds the gap start).
- `skipPrev`: goes to the start of the latest own span whose start lies more than `LEAD_IN_SEC` before now, else nowhere. Landing = `seekLeadIn(span.start)`. Disabled when no such span or my role set is empty.
- `skipNext`: goes to the first own span whose lead-in landing lies after now. Landing as above. Disabled when none or my role set is empty.
- Skip while Einsatz is on and the target is another span: the repeat moves to that span (range, lead-in). Skip with any other repeat: range stays, playback goes to the landing and wraps at the range end as usual.
- `introSkip`: visible only while now is before the first sung note of any role, and only when `leadInStart(first note start)` is above 0. Press: `seekLeadIn(first note start)`. Hidden otherwise, so the transport holds no button that does nothing.
- Play row: `phraseStart`, `skipPrev`, play/pause, `skipNext`, `tempo`, mic. `introSkip` sits on the `repeatLabel` line, right.

## Progress bar and sections

- Sections show as labelled segments on the bar, always (also without a repeat). No sections: plain bar.
- Tap on a segment: Abschnitt repeat for that section, seek to its lead-in landing. Tap elsewhere: seek.
- Active range highlighted, the lead-in before it marked.

## Upright phone

- Portrait, width below 960 px (390x844, 412x915): the whole screen, play row included, fits the visible height (`100dvh`) with or without the hint, no page scroll. The chips stay on one line (32 px, scroll sideways when too narrow), the roll takes the height the other rows leave (at least 96 px). Up to 760 px height (360x740) the staff is 96 px instead of 112 px, so sections plus the hint still fit. Checked in `e2e/smoke.e2e.ts`.

## Sideways phone

- Landscape with at most 560 px height (844x390, 915x412): the whole screen, play row included, fits the visible height (`100dvh`) with or without sections and with or without the hint, no page scroll. The mode button sits in the header row on the right, staff and piano roll on the left, readout and transport in a 320 px column on the right. The staff is 80 px high, the readout and transport are denser (chips 32 px on one line, 40 px buttons, 52 px main button), the roll takes the remaining height (at least 96 px). Wider staff and roll show more bars and seconds ahead. The manifest allows any orientation. Checked in `e2e/smoke.e2e.ts` together with the upright sizes and 1280x800.

## Cents readout

- Sung = latest voiced frame whose `t` lies in the 150 ms before the heard time. Target = my note containing that `t` (onset grace ignored here).
- Shows sung note name (no octave, as everywhere), `target`, and cents text: |c| ≤ 15 `centsOk`, ≤ tol `centsSlight`, else `centsFar`. No target or no frame: `noTarget`, and while none of my notes sounds, the countdown to my next entry in the cents text slot: `Einsatz in {n} Takten · {s} s` (`1 Takt`; n = bar lines up to the entry; s = seconds at the current tempo, rounded up), `Einsatz in {s} s` within the bar, nothing under 1 s.
- Meter: passive display, no control look. Thin bar with tolerance band and centre tick, `meterEnds` under it. Dot at cents clamped ±100 only while a voiced frame exists.
- Mic indicator in the transport row: small status icon, no button styling.

## Transport

- Progress bar `m:ss` elapsed / total, tap seeks. See Progress bar.
- `phraseStart`: seek to current phrase start.
- `tempo`: cycles 100 → 90 → 80 → 70 → 100.
- `pause`: engine.pause, `session.endPass` (passes still go to history), stay paused on practice. Only with `features.results` on: route results when a pass result exists.
- Play again after pause: `session.startPass`, engine.play.
- The transport follows the engine: its `pause` event (settings calibration, song end) runs the same pause as the button.
- Session glue: engine `enter` → `session.enter`, pitch `frame` → `session.frame`.
- Redraw: a pitch frame only joins the buffer. While playing, the engine tick redraws every animation frame; while paused, frames schedule at most one redraw per animation frame (`requestFrame`, injectable). No smoothing: the newest frame is drawn on the next animation frame.
  `[@test] ../tests/steps/screen-practice.steps.ts`

```gherkin
Feature: Practice screen
  Scenario: renders header
    Given song "08" loaded with key "F", bpm 93, title placeholder
    When the screen renders at bar 5 with the staff 600 px wide
    Then the subline reads "Takt 5–8 · F · 93 BPM"

  Scenario: phone staff pages hold 2 bars
    Given song "08" loaded with key "F", bpm 93, title placeholder
    When the screen renders at bar 5 with the staff 340 px wide
    Then the subline reads "Takt 5–6 · F · 93 BPM"

  Scenario: mode cycles
    Given mode all
    When I tap the voicetrack button twice
    Then the button shows "nur Playback" and engine mode is backing

  Scenario: cents text
    Given target D5 and a sung frame 14 cents above
    Then the readout shows "D", "Ziel D" and "+14 Cent · sauber"
    Given a sung frame 40 cents below with tolerance 50
    Then the readout shows "-40 Cent · leicht zu tief"
    Given a sung frame 80 cents above
    Then the readout shows "+80 Cent · zu hoch"

  Scenario: countdown to my entry
    Given my next note starts at 8.0 in bars of 2 s
    Then at 3.5 the readout shows "Einsatz in 3 Takten · 5 s"
    And at 6.5 the readout shows "Einsatz in 1 Takt · 2 s"
    And at 6.5 at tempo 70 the readout shows "Einsatz in 1 Takt · 3 s"
    And at 7.5 the readout shows no countdown

  Scenario: the screen shows what the singer hears, not what is being played out
    Given a delay of 0.6 s, playback at 9.7 and a frame 14 cents above D5 scored at 9.1
    Then the readout shows "D", "Ziel D" and "+14 Cent · sauber"

  Scenario: pitch frames redraw once per animation frame
    Given target D5 and the screen paused
    When 5 pitch frames arrive before the next animation frame
    Then the screen has not redrawn
    When the animation frame runs
    Then the screen redrew once and the readout shows "+5 Cent · sauber"

  Scenario: readout and mic are passive indicators
    Given target D5 and no sung frame
    Then the meter is labelled "tief" and "hoch" and shows no dot
    Given a sung frame 14 cents above
    Then the meter shows a dot
    And neither the readout nor the mic indicator is a control

  Scenario: octave folded readout
    Given target D5 and a sung frame at D4 plus 5 cents
    Then the readout shows "D" and "+5 Cent · sauber"

  Scenario: pause stays on practice
    Given a pass with at least one entered note
    When I press pause
    Then session.endPass ran and the route stays "#/practice/08"
    When I press the back button
    Then the route is "#/songs"

  Scenario: pause leads to results when the results screen is on
    Given the results screen is enabled
    And a pass with at least one entered note
    When I press pause
    Then session.endPass ran and the route is "#/results/08"

  Scenario: paused from elsewhere
    Given a pass with at least one entered note
    When the engine is paused from outside the screen
    Then the transport shows "Abspielen" and session.endPass ran

  Scenario: pause with nothing sung
    Given a pass with no entered note
    When I press pause
    Then the route stays and playback is paused

  Scenario: mic stamps follow what the singer hears
    Given engine latency 0.040
    When the screen opens
    Then pitch.start got the song time and a playback latency of 0.040

  Scenario: mic denied
    Given pitch.start returns denied
    Then the banner "Mikrofon nicht erlaubt. Du hörst das Lied, aber ohne Bewertung." is visible and play works

  Scenario: role without notes
    Given roles [esel] selected for song "08"
    Then the hint "Deine Rolle singt hier nicht. Nur Zuhören." is visible, no mic button, mode is all

  Scenario: tempo cycles
    When I tap tempo three times
    Then the button shows "70%" and engine tempo is 70

  Scenario: leaving records history
    Given two completed passes
    When I navigate back
    Then history.record was called with two passes and engine.unload ran

Feature: Repeat selector
  Scenario: Phrase repeat takes the current phrase
    Given the heard time is inside phrase 2 spanning [10.0,14.0]
    When I tap the chip "Phrase"
    Then the repeat range is the range [10.0,14.0] with phrase 2 and no lead-in
    And the status line reads "Phrase 3 · 0:10–0:14"

  Scenario: Abschnitt repeat takes the section holding the playhead
    Given sections "Strophe 1" [8.0,24.0] and "Refrain" [24.0,40.0] and the heard time 30.0
    When I tap the chip "Abschnitt"
    Then the repeat range is the range [24.0,40.0] with lead-in
    And the status line reads "Refrain · 0:24–0:40"

  Scenario: Einsatz repeat takes my own span, or the next one
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 30.0
    When I tap the chip "Einsatz"
    Then the repeat range is the range [40.0,50.0] with lead-in

  Scenario: Einsatz without any span ahead stays off
    Given my own spans [10.0,20.0] and the heard time 30.0
    When I tap the chip "Einsatz"
    Then no repeat range is set

  Scenario: one kind at a time
    Given the "Phrase" repeat is on
    When I tap the chip "Einsatz"
    Then only the chip "Einsatz" is active and the repeat range is that span's range
    When I tap the chip "Aus"
    Then no repeat range is set and no status line is shown

  Scenario: range is fixed when switched on
    Given the "Phrase" repeat is on for phrase 2
    When playback runs on into phrase 3
    Then the repeat range is still the range of phrase 2

  Scenario: seek outside the range keeps the repeat
    Given the "Phrase" repeat is on for phrase 2
    When I tap the progress bar at a time inside phrase 5
    Then the chip "Phrase" is still active and the repeat range is unchanged

  Scenario: no sections hides the Abschnitt chip
    Given a song without sections
    Then the chips are "Aus", "Phrase", "Einsatz" and "A–B"

  Scenario: wrap keeps the pass going
    Given the "Phrase" repeat is on and a pass is running
    When the repeat wraps
    Then session.endPass did not run and re-entered notes replace earlier attempts

  Scenario: countdown keeps working during repeat
    Given the "Einsatz" repeat is on for a span starting at 40.0 in bars of 2 s
    When the heard time is 34.0
    Then the readout shows "Einsatz in 3 Takten · 6 s"

  Scenario: the repeat survives showing the screen again
    Given the "Abschnitt" repeat is on for [24.0,40.0]
    When the practice screen is shown again
    Then only the chip "Abschnitt" is active and the status line reads "Refrain · 0:24–0:40"

  Scenario: a pending A survives showing the screen again
    Given A is set at 6.0 and bars every 2 s
    When the practice screen is shown again
    Then the chip reads "B setzen" and the status line reads "A 0:06 · B noch nicht gesetzt"
    When I set B at 14.0
    Then the range is [6.0,14.0]

Feature: Dimming and sections
  Scenario: everything outside the range is dimmed
    Given the "Abschnitt" repeat is on for [24.0,40.0]
    Then staff, roll and progress bar are drawn with a dim range [24.0,40.0] and a flag "Refrain" at 24.0
    And the heard audio, the mic and the scorer are untouched

  Scenario: A and B flags
    Given an A–B repeat [6.0,14.0]
    Then the roll draws flags "A" at 6.0 and "B" at 14.0

  Scenario: no repeat no dimming
    Given no repeat
    Then staff, roll and progress bar are drawn without a dim range

  Scenario: sections are segments on the bar
    Given sections "Strophe 1" and "Refrain"
    Then the progress bar shows two labelled segments, also without a repeat

  Scenario: tap a section starts its repeat
    Given sections "Strophe 1" [8.0,24.0] and "Refrain" [24.0,40.0]
    When I tap the segment "Refrain"
    Then the chip "Abschnitt" is active, the repeat range is [24.0,40.0] with lead-in and time() is 20.0

  Scenario: sections of the same name are told apart
    Given two sections both named "Refrain", [8.0,24.0] and [24.0,40.0]
    When I tap the second segment
    Then only the second segment is active
Feature: A-B dimming
  Scenario: A without B dims everything before A
    Given A is set at 6.0
    Then the staff, the roll and the progress bar are drawn with a dim range from 6.0 to the song end

Feature: A–B repeat
  Scenario: A, B and clear on one button
    Given bars every 2 s and the heard time 5.1
    When I tap the chip "A–B"
    Then the chip reads "B setzen" and the status line reads "A 0:06 · B noch nicht gesetzt"
    When the heard time is 13.7 and I tap the chip again
    Then the repeat range is the range [6.0,14.0] without phrase and without lead-in
    And the status line reads "A–B · 0:06–0:14"
    When I tap the chip a third time
    Then no repeat range is set and the chip reads "A–B"

  Scenario: B before A swaps
    Given A is set at 14.0
    When I set B at 6.0
    Then the range is [6.0,14.0]

  Scenario: B on the same bar line moves on
    Given A is set at 6.0 and bars every 2 s
    When I set B at 6.4
    Then the range is [6.0,8.0]

Feature: Skip
  Scenario: next own entry lands a lead-in before
    Given my own spans [10.0,20.0] and [40.0,50.0], bars every 2 s and the heard time 25.0
    When I tap "Zum nächsten Einsatz"
    Then time() is 36.0

  Scenario: previous goes to the current span start when far enough in
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 44.0
    When I tap "Zum vorigen Einsatz"
    Then time() is 36.0

  Scenario: previous goes one further back when just after the start
    Given my own spans [10.0,20.0] and [40.0,50.0] and the heard time 41.0
    When I tap "Zum vorigen Einsatz"
    Then time() is 6.0

  Scenario: spans less than one bar apart merge
    Given bars of 2 s and my role spans [10.0,14.0] and [15.0,20.0]
    Then the own spans are [10.0,20.0]
    And "Zum nächsten Einsatz" from 12.0 has no target

  Scenario: skip buttons disabled without a target
    Given my own spans [10.0,20.0] and the heard time 11.0
    Then "Zum vorigen Einsatz" is disabled
    Given the heard time 15.0 and no later span
    Then "Zum nächsten Einsatz" is disabled
    Given an empty role set
    Then both skip buttons are disabled

  Scenario: skip moves an active Einsatz repeat
    Given the "Einsatz" repeat is on for [10.0,20.0] and my next own span is [40.0,50.0]
    When I tap "Zum nächsten Einsatz"
    Then the repeat range is the range [40.0,50.0] with lead-in and time() is 36.0

  Scenario: skip keeps any other repeat
    Given the "Phrase" repeat is on for phrase 2
    When I tap "Zum nächsten Einsatz"
    Then the repeat range is unchanged and time() is the lead-in landing

Feature: Intro skip
  Scenario: shown before the first sung note
    Given the first sung note of any role starts at 12.0 and bars every 2 s
    And the heard time 1.0
    Then the button "Intro überspringen" is visible
    When I press it
    Then time() is 8.0

  Scenario: hidden once the first note has started
    Given the first sung note of any role starts at 12.0
    And the heard time 12.5
    Then the button "Intro überspringen" is not shown

  Scenario: hidden when the lead-in would land at 0
    Given the first sung note of any role starts at 2.0
    Then the button "Intro überspringen" is not shown
```
