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

- `sub` bar range = current staff page (4 bars), key from song, bpm from song times tempo.
- Mode button cycles all → others → backing → all. Saves to settings.

## Staff (canvas, 4 bars per page)

- Treble clef, key signature from `song.key`, 5 lines. Note heads with stems, no beams, no rests. Accidentals only on pitches outside the key.
- Mine: accent colour. Others: `--other`. Syllable under each note, mine bold at the current note. Role name above each run of same-role notes.
- Current note highlighted with a translucent box. Page flips when playhead enters bar 4k.

## Piano roll (canvas)

- Vertical: semitones, labels every semitone row (`C5`, `D5` …). Range follows my notes in view ±2 semitones, min 10 rows.
- Horizontal: 5 s window, playhead at 1/3 width (1.5 s behind, 3.5 s ahead). Target bars = my notes, accent; filled portion = elapsed part. Other roles' notes dashed in `--other`.
- Sung line: pitch frames of the last 1.5 s, folded into the octave of the nearest target note at that time; `null` breaks the line. White, 4 px, dark outline. Dot at the newest frame.

## Cents readout

- Target = my note containing the current time (with onset grace ignored here). Sung = latest voiced frame in the last 150 ms.
- Shows sung note name folded into target octave, `target`, and cents text: |c| ≤ 15 `centsOk`, ≤ tol `centsSlight`, else `centsFar`. No target or no frame: `noTarget`.
- Meter: passive display, no control look. Thin bar with tolerance band and centre tick, `meterEnds` under it. Dot at cents clamped ±100 only while a voiced frame exists.
- Mic indicator in the transport row: small status icon, no button styling.

## Transport

- Progress bar `m:ss` elapsed / total, tap seeks.
- `loop`: toggles loop on the current phrase. Active state highlighted.
- `phraseStart`: seek to current phrase start.
- `tempo`: cycles 100 → 90 → 80 → 70 → 100.
- `pause`: engine.pause, `session.endPass` (passes still go to history), stay paused on practice. Only with `features.results` on: route results when a pass result exists.
- Play again after pause: `session.startPass`, engine.play.
- Session glue: engine `enter` → `session.enter`, pitch `frame` → `session.frame`.
  `[@test] ../tests/steps/screen-practice.steps.ts`

```gherkin
Feature: Practice screen
  Scenario: renders header
    Given song "08" loaded with key "F", bpm 93, title placeholder
    When the screen renders at bar 5
    Then the subline reads "Takt 5–8 · F · 93 BPM"

  Scenario: mode cycles
    Given mode all
    When I tap the voicetrack button twice
    Then the button shows "nur Playback" and engine mode is backing

  Scenario: cents text
    Given target D5 and a sung frame 14 cents above
    Then the readout shows "D5", "Ziel D5" and "+14 Cent · sauber"
    Given a sung frame 40 cents below with tolerance 50
    Then the readout shows "-40 Cent · leicht zu tief"
    Given a sung frame 80 cents above
    Then the readout shows "+80 Cent · zu hoch"

  Scenario: readout and mic are passive indicators
    Given target D5 and no sung frame
    Then the meter is labelled "tief" and "hoch" and shows no dot
    Given a sung frame 14 cents above
    Then the meter shows a dot
    And neither the readout nor the mic indicator is a control

  Scenario: octave folded readout
    Given target D5 and a sung frame at D4 plus 5 cents
    Then the readout shows "D5" and "+5 Cent · sauber"

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
