---
name: Screen Practice
description: Live singing screen. Artboards Main.dc.html and MainDesktop.dc.html. Header, mode button, staff, piano roll, cents readout, transport, mic state, hints.
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
| loop | aria `Phrase wiederholen` (toggle) |
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

- `sub` bar range = current staff page (`barsPerPage` of the staff canvas width: 2 below 560 px, else 4), key from song, bpm from song times tempo.
- Mode button cycles all → others → backing → all. Saves to settings.

## Staff (canvas, 2 or 4 bars per page)

- Treble clef, key signature from `song.key`, 5 lines. No beams, no ties. Accidentals only on pitches outside the key.
- Rests: in each bar every span no visible note covers (bar start to first note, a note's written end to the next note, last end to bar end) gets rests. Gap ends snap to the sixteenth grid (gaps under 1/8 beat vanish), then split into half, quarter, eighth, sixteenth rests, each starting on a multiple of its own length from the bar start; no dotted rests. Empty bar: one whole-bar rest, centred (also in 3/4). Music font glyphs U+1D13B–U+1D13F placed by measured ink (whole hangs from the fourth line, half sits on the middle line). Faint colour of the voice that just stopped (mine first), else the one about to start; muted in an empty bar. Rests are onsets of the spacing without a syllable.
- Note value from `dur` (quarters), quantised to the nearest written value: whole (hollow, no stem), half (hollow, stem), quarter (filled, stem), eighth / sixteenth (filled, stem, 1 / 2 flags); augmentation dot for dotted values (dotted sixteenth to dotted half).
- Spacing per bar: each onset gets room ∝ (time to the next onset or bar end)^0.6, scaled to fill the bar; a rest before the first note keeps its room. Minimum distance between onsets = head (more before an accidental) and half of each neighbour's syllable + 4 px; short notes take it from long ones.
- Bar widths on a page follow each bar's minimum width. Too dense: lyric font shrinks down to 10 px, then every other syllable moves to a second lyric row (canvas class `tall`, a bit higher). Syllables are never left out.
- Bar lines: solid, text colour, 1.5 px, full staff height, at every bar start on the page and at the page end. Bar number (muted, 10 px) over each bar's start, matching `sub`.
- Notes drawn = `visibleNotes(song.notes, roles)`: one line where I sing (same for the piano roll).
- Mine: accent colour. Others: `--other`. Syllable under each onset (mine first), mine bold at the current note. Role name above each run of same-role notes, left out where it would overprint the previous one.
- Current note highlighted with a translucent box. Page = `barsPerPage` bars, flips when the playhead enters the next page.

## Piano roll (canvas)

- Vertical: semitones, labels every semitone row without octave (`C`, `C#`, `D` …). Range follows my notes in view ±2 semitones, min 10 rows.
- Horizontal: 5 s window, playhead at 30 % width (1.5 s behind, 3.5 s ahead). Target bars = my notes, accent; filled portion = elapsed part. Other roles' notes dashed in `--other`.
- Heard time: staff, piano roll, page and readout show `engine.time() − pitch.delay()`, the song position the singer hears now (Android Chrome measured 760 ms on Bluetooth). Transport and seek keep the playback position.
- Sung line: pitch frames of the last 1.5 s by their scoring stamp `t` (the sung moment in heard time, so the newest point sits at the playhead and the line lies on the note it was sung to), folded into the octave of the nearest target note at that time; `null` breaks the line. White, 4 px, dark outline. Dot at the newest frame.

## Cents readout

- Sung = latest voiced frame whose `t` lies in the 150 ms before the heard time. Target = my note containing that `t` (onset grace ignored here).
- Shows sung note name (no octave, as everywhere), `target`, and cents text: |c| ≤ 15 `centsOk`, ≤ tol `centsSlight`, else `centsFar`. No target or no frame: `noTarget`.
- Meter: passive display, no control look. Thin bar with tolerance band and centre tick, `meterEnds` under it. Dot at cents clamped ±100 only while a voiced frame exists.
- Mic indicator in the transport row: small status icon, no button styling.

## Transport

- Progress bar `m:ss` elapsed / total, tap seeks.
- `loop`: toggles loop on the current phrase. Active state highlighted.
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
```
