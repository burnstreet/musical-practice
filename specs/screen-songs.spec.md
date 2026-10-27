---
name: Screen Songs
description: Role and song selection. Artboards Songs.dc.html and SongsDesktop.dc.html. Download progress, role chips, song rows with markers and badges, voicetrack mode, start.
targets:
  - ../src/app/screens/songs.ts
---

# Screen: Rolle und Lied wählen

Lit element `<gu-songs>`. Uses library, history, settings.

Strings:

| id | text |
|---|---|
| title | `Wer bist du im Stück?` |
| subtitle | `Du kannst mehrere Rollen wählen.` |
| listTitle | `Lied zum Üben` |
| legend | `deine Rolle singt mit` |
| progress | `Lädt … {done} von {total} MB` |
| progressDone | hidden |
| progressError | `Download unterbrochen. Beim nächsten Start geht es weiter.` |
| loading | `wird geladen` |
| modeAll | `Mit Voicetrack` / `Alle Stimmen sind zu hören.` |
| modeOthers | `Voicetrack nur für andere` / `Meine Rolle ist stumm, die anderen Stimmen sind zu hören.` |
| modeBacking | `Nur Playback` / `Nur die Begleitung, keine Stimmen.` |
| start | `Üben starten` |
| settings | aria `Einstellungen` |

- Role chips: roles with `sings = true`, in library order. Multi-select, `aria-pressed`. Selection saved to `settings.roles`. Empty selection allowed.
- Progress bar at top while `sync` runs. Hidden when done without error.
- Song rows: number, title, roles of the song as names joined by ` · `. Accent dot when the song has a selected role. Badge `{n} %` from `history.badge` for the current selection, hidden when null. Row not ready: muted, `loading` text, not expandable.
- Tapping a ready row expands it: three mode options (radio, default `settings.mode`), then `start`. One row expanded at a time.
- `start`: saves mode, route `#/practice/{id}`.
  `[@test] ../tests/steps/screen-songs.steps.ts`

```gherkin
Feature: Songs screen
  Scenario: only singing roles shown
    Given roles maria (sings) and esel (not sings)
    When the screen renders
    Then a chip "Maria" exists and no chip "Esel"

  Scenario: marker follows selection
    Given song "08" with roles [maria, chor] and song "04" with roles [josef]
    When I select "Maria"
    Then row 8 shows the marker and row 4 does not

  Scenario: badge from history
    Given history badge 86 for song "08" with the selected roles
    When the screen renders
    Then row 8 shows "86 %"

  Scenario: loading row
    Given song "05" not ready
    Then row 5 shows "wird geladen" and does not expand on tap

  Scenario: progress
    Given sync at 30 of 95 MB
    Then "Lädt … 30 von 95 MB" is visible
    When sync finishes without error
    Then the progress bar is hidden

  Scenario: start practice
    Given row 8 expanded with "Nur Playback" chosen
    When I press "Üben starten"
    Then settings.mode is "backing" and the route is "#/practice/08"
```
