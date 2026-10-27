---
name: Screen Results
description: Pass results. Artboards Auswertung.dc.html and AuswertungDesktop.dc.html. Ring, stats, phrase chart, tip, trend, actions.
targets:
  - ../src/app/screens/results.ts
---

# Screen: Auswertung

Lit element `<gu-results>`. Shows the latest `PassResult` of the live session. Pure display.

Switched off for now: `features.results = false` (`src/app/features.ts`). Pause stays on practice and the shell sends the results route to practice. The screen and its tests stay; flip the flag to bring it back.

Strings:

| id | text |
|---|---|
| close | aria `Schließen` |
| sub | `Durchgang {n}` |
| ring | `{pct}%` + `getroffen` |
| dev | `Ø Abweichung` → `{n} Cent` |
| tendency | `Tendenz` → `sauber` / `leicht zu hoch` / `leicht zu tief` / `zu hoch` / `zu tief` |
| range | `Tonumfang` → `{lo} – {hi}` |
| chart | `Abweichung je Phrase`, bars labelled `Phrase {i}` |
| trend | `Verlauf` |
| drill | `Phrase {n} bei 80 % üben` |
| again | `Nochmal ganz` |
| none | `Keine Töne gesungen.` |

- Tendency label: `ok` → `sauber`; `high` with |mean| ≤ tol → `leicht zu hoch`, else `zu hoch`; same for `low`.
- Range: note names in true octave. Null: `–`.
- Chart: one signed bar per phrase, zero line, tolerance band shaded. Unsung phrase: empty slot. Bar beyond ±tol in white, inside in accent.
- Tip card: `result.tip`.
- Trend: from pass 2, polyline of `session.trend()` with dots, label `Verlauf`. Hidden on pass 1.
- `drill`: hidden when `worstPhrase` null. Sets loop to that phrase, tempo 80, seeks phrase start, route practice, playback paused until user presses play.
- `again`: clears loop, tempo 100, seek 0, route practice.
- `close`: route songs.
  `[@test] ../tests/steps/screen-results.steps.ts`

```gherkin
Feature: Results screen
  Scenario: stats rendered
    Given pass 3 with hitPct 86, meanCents 18, tendency high, rangeMidi [59, 69], tolerance 50
    When the screen renders
    Then it shows "Durchgang 3", "86%", "18 Cent", "leicht zu hoch", "B3 – A4"

  Scenario: tendency far
    Given meanCents -60, tendency low, tolerance 50
    Then it shows "zu tief"

  Scenario: trend hidden on first pass
    Given one pass
    Then no "Verlauf" element
    Given three passes
    Then "Verlauf" shows three points

  Scenario: drill action
    Given worstPhrase 2
    When I press "Phrase 3 bei 80 % üben"
    Then engine loop is phrase 2, tempo 80, time is the phrase start, route is practice, playing is false

  Scenario: again
    When I press "Nochmal ganz"
    Then engine loop is null, tempo 100, time 0, route is practice

  Scenario: no recording button
    Then no element with text "Aufnahme anhören" exists
```
