---
name: Screen Results
description: Pass results on request. Canvas "Auswertung – Entwürfe" boards Main (Gesamt / Abschnitte / Phrasen), Einsaetze and Verlauf. Tabs, ring, tendency, note split, entry grid, rows per section and phrase, entry pictures, tip, trend, actions, day bars over weeks.
targets:
  - ../src/app/screens/results.ts
---

# Screen: Auswertung

Lit element `<gu-results>`. Shows the latest `PassResult` of the live session. Reached only by the practice screen's `results` button, never automatic. Pure display: every number from the scorer.

Design: canvas https://claude.ai/artifact/VuMigQE7PKiR3eyLrrN6q2, boards Main and Einsaetze. No cent numbers anywhere: singers do not know cents. Words and arrows instead; too high in `--high` (orange), too low in `--low` (light blue), told apart by arrows too.

Strings:

| id | text |
|---|---|
| back | aria `Zurück zum Üben`; in the entries view aria `Zurück` |
| sub | `Durchgang {n}` |
| tabs | `Gesamt` / `Abschnitte` / `Phrasen` |
| ring | `{pct}%` + `Töne getroffen` |
| tendency | `Tendenz` → `sauber` / `↑ etwas zu hoch` / `↓ etwas zu tief` / `↑ zu hoch` / `↓ zu tief`; `–` without sung notes |
| entryStat | `Einsätze` → `{k} von {n} sauber` |
| intonation | `Intonation` + `{n} Töne`, axis `← Halbton tiefer` / `genau` / `Halbton höher →` |
| split | `↓ zu tief` / `sauber` / `↑ zu hoch`, each `{n} Töne` (`1 Ton`); `{n} Töne nicht gesungen` when any |
| grid | `Einsätze nach Pausen` + `{n} Einsätze`; columns `← zu früh` / `pünktlich` / `zu spät →`; rows `↓ von oben` / `direkt` / `↑ von unten`; centre cell adds `sauber`; `{n} nicht gesungen` when any |
| allEntries | `Alle Einsätze ansehen →` |
| entriesTitle | `Einsätze nach Pausen` |
| filter | `Daneben ({n})` / `Alle ({n})` |
| showClean | `{n} saubere Einsätze auch zeigen` |
| chips | `↑ von unten reingerutscht` / `↓ von oben reingekommen` / `← {ms} ms zu früh` / `→ {ms} ms zu spät` / `✓ Einsatz sauber` / `nicht gesungen` |
| marks | section rows: one dot per entry, `✓` / `↑` / `↓` / `←` / `→` / `–`, aria = its chips |
| where | `Phrase {i} · Takt {bar}` |
| rowSection | name + `Einsätze {k} von {n} sauber` |
| rowPhrase | `Phrase {i}` + `„{lyric}“` |
| rowPct | `{pct} %` |
| rowDrill | aria `{row name} bei 80 % üben` |
| drill | `Phrase {n} bei 80 % üben` |
| again | `Nochmal ganz` |
| trend | `Durchgänge` |
| none | `Keine Töne gesungen.` |
| daysButton | `Verlauf` |
| daysTitle | `Verlauf` |
| spans | `7 Tage` / `4 Wochen` / `Alles` |
| daysHits | `Töne getroffen` + `an {k} von 7 Tagen geübt` / `an {k} von 28 Tagen geübt` / `seit {d.m.}, in {k} von {n} Wochen geübt` |
| daysNow | `{pct} %` of the last bar with a value |
| daysDelta | `+{n} Punkte` / `−{n} Punkte` + `diese Woche` / `in 4 Wochen` / `seit Beginn`; only with two bars that have a value |
| daysTend | `Tendenz` + `oben zu hoch, unten zu tief`, now `zuletzt {tendency}`, foot `Helles Band = sauber genug` |
| daysEntries | `Einsätze sauber` + `pünktlich und direkt auf dem Ton` |
| daysSections | `Abschnitte · Töne getroffen`, row: name, line, `{first} % → {last} %` |
| daysFoot | `Jeder Balken ist der Schnitt eines Tages. Tage ohne Üben bleiben leer.`; for `Alles`: `… eines Tages, bei „Alles“ einer Woche. …` |
| daysNone | `Noch keine Tage gespeichert.` |

- Tendency of mean cents c (pass, section, phrase): |c| ≤ 15 `sauber`; |c| ≤ tol `etwas zu …`; else `zu …`.
- Tab `Abschnitte` only when the pass has section results.
- Gesamt:
  - Ring `hitPct`, Tendenz, `entryStat` (hidden without entries).
  - Intonation: sung notes' cents in 8 bins of 25 over ±100 (clamped), tolerance band shaded; a bin whose centre lies beyond ±tol in `--high` / `--low`. Split bar `low` / `hits` / `high` with counts.
  - Grid: entries counted by `approach` (rows) × `timing` (cols); not sung ones only in `{n} nicht gesungen`. Card hidden without entries.
  - Tip card `result.tip`; trend from pass 2 (polyline of `session.trend()`); `drill` (hidden when `worstPhrase` null); `again` and `daysButton` side by side.
- Abschnitte: one row per section result. Phrasen: one row per phrase result, under its section's name when sections exist. Row: name, sub, `rowPct` = round(100 · hits / notes), bar from the centre by mean cents (±75 scale, tolerance marks dashed), tendency words, marks (chips for phrases, dots for sections), play button `rowDrill`.
- Entries view (`allEntries`): `filter` tabs, default `Daneben` = entries not clean. Card per entry: `where`, lyric from the entry note to the phrase end, picture (−300 to +600 ms: pause shaded, target bar from 0, dashed line at 0, `curve` as line), chips, play button drills its phrase. `showClean` under the list in `Daneben`.
- Phrase drill (`drill`, phrase rows, entry cards): Phrase repeat for that phrase (range = phrase start/end with `phrase`, no lead-in; the practice screen shows `Phrase` active), tempo 80, seek phrase start, playback paused, route practice.
- Section drill (section rows): Abschnitt repeat for that section (range = section with lead-in, `live.repeat` kind `section`; the practice screen shows `Abschnitt` active), tempo 80, `seekLeadIn(section start)`, playback paused, route practice.
- `again`: clears the repeat, tempo 100, seek 0, route practice.
- `back`: route practice, engine untouched.
- Verlauf view (`daysButton`, board Verlauf): `history.days(song, role set)`, drawn with `dayBars(days, span, localDay())`; span tabs default `7 Tage`. Header sub `Lied {n} · {title}`, back aria `Zurück` to Gesamt.
  - Bar charts per bar, empty bar dashed: hits (value over the bar while at most 10 bars), tendency up / down from a centre line (±75 scale, band ±tolerance, colours as tendency), clean entries.
  - Labels under the bars: `7 Tage` weekday `Mo`…`So`; `4 Wochen` `{d.m.}` on every 7th bar from the first; `Alles` `KW {n}` on every 4th bar from the first.
  - Entries card hidden without entries in the span; sections card only for names in the span, in song order.
  `[@test] ../tests/steps/screen-results.steps.ts`

```gherkin
Feature: Results screen
  Scenario: stats rendered
    Given pass 3 with hitPct 86, meanCents 18, tendency high, tolerance 50
    When the screen renders
    Then it shows "Durchgang 3", "86%", "↑ etwas zu hoch"
    And no text says "Cent"

  Scenario: tendency far
    Given meanCents -60, tendency low, tolerance 50
    Then it shows "↓ zu tief"

  Scenario: notes split by direction
    Given a pass with 6 hits, 1 low, 2 high of 10 notes
    Then the split shows "1 Ton", "6 Töne", "2 Töne" and "1 Ton nicht gesungen"

  Scenario: entry grid
    Given a pass with entries clean, clean, late from below, early, not sung
    Then it shows "2 von 5 sauber" and "1 nicht gesungen"
    And the grid cell direkt / pünktlich shows 2, von unten / zu spät 1, direkt / zu früh 1, von oben / zu früh 0

  Scenario: no entries, no grid
    Given a pass without entries
    Then no text says "Einsätze"

  Scenario: entries view
    Given a pass with entries clean, late from below
    When I press "Alle Einsätze ansehen →"
    Then one entry card shows "↑ von unten reingerutscht" and "→ 150 ms zu spät"
    When I press "Alle (2)"
    Then 2 entry cards are shown

  Scenario: sections and phrases
    Given a pass over sections "Strophe" and "Refrain" with one phrase each
    When I press "Abschnitte"
    Then rows "Strophe" and "Refrain" are shown
    When I press "Phrasen"
    Then rows "Phrase 1" and "Phrase 2" are shown

  Scenario: no sections, no tab
    Given one pass
    Then there is no "Abschnitte" tab

  Scenario: trend hidden on first pass
    Given one pass
    Then no "Durchgänge" element
    Given three passes
    Then "Durchgänge" shows three points

  Scenario: again
    When I press "Nochmal ganz"
    Then no repeat range is set, tempo 100, time 0, route is practice

  Scenario: back to practice
    When I press "Zurück zum Üben"
    Then the route is practice and the engine is untouched

  Scenario: no recording button
    Then no element with text "Aufnahme anhören" exists

Feature: Results screen drill
  Scenario: drill action
    Given worstPhrase 2
    When I press "Phrase 3 bei 80 % üben"
    Then the repeat range is the range of phrase 2 with phrase 2 and no lead-in
    And tempo is 80, time is the phrase start, route is practice, playing is false
    And the practice screen shows the chip "Phrase" active

  Scenario: section drill
    Given a pass over sections "Strophe" and "Refrain" with one phrase each
    When I press "Abschnitte"
    And I press "Refrain bei 80 % üben"
    Then the repeat range is "Refrain" with lead-in, tempo is 80, playing is false, route is practice
    And the practice screen shows the chip "Abschnitt" active

Feature: Results screen Verlauf
  Scenario: last 7 days
    Given stored days: 2 days ago 6 of 10 hits, 1 of 2 entries clean; today 8 of 10 hits, 2 of 2 entries clean
    When I press "Verlauf"
    Then it shows "an 2 von 7 Tagen geübt", "80 %", "+20 Punkte diese Woche", "Einsätze sauber", "100 %"
    And there are 7 hit bars, 5 of them empty

  Scenario: all weeks
    Given stored days: 14 days ago 6 of 10 hits; today 8 of 10 hits
    When I press "Verlauf"
    And I press "Alles"
    Then it shows "in 2 von 3 Wochen geübt", "+20 Punkte seit Beginn", "bei „Alles“ einer Woche"
    And there are 3 hit bars, 1 of them empty

  Scenario: sections over days
    Given stored days: 2 days ago section "Refrain" 3 of 5 hits; today section "Refrain" 4 of 5 hits
    When I press "Verlauf"
    Then it shows "Abschnitte · Töne getroffen", "Refrain", "60 % → 80 %"

  Scenario: no entries, no entries card
    Given stored days: today 8 of 10 hits
    When I press "Verlauf"
    Then no text says "Einsätze sauber"

  Scenario: back from Verlauf
    Given stored days: today 8 of 10 hits
    When I press "Verlauf"
    And I press "Zurück"
    Then it shows "Töne getroffen", "Nochmal ganz"
```
