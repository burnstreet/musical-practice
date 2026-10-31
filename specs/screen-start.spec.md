---
name: Screen Start
description: Password screen. Artboards Start.dc.html and StartDesktop.dc.html. Size line, WLAN hint, unlock, error states.
targets:
  - ../src/app/screens/start.ts
---

# Screen: Start und Passwort

Lit element `<gu-start>`. Layout per artboard. Uses vault and library only.

Strings:

| id | text |
|---|---|
| kicker | `kicker` from the production (`src/production.ts`); hidden when empty |
| title | `Gemeinsam üben` |
| subtitle | `Lieder zum Mitsingen mit Tonhöhen-Feedback` |
| label | `Passwort` |
| placeholder | `Passwort eingeben` |
| toggle | aria `Passwort anzeigen` / `Passwort verbergen` |
| button | `Entsperren` |
| busy | `Prüfe…` |
| size | `Nach dem Entsperren werden etwa {mb} MB geladen. Am besten im WLAN.` |
| sizeUnknown | `Zum ersten Entsperren brauchst du Internet.` |
| footer | `Alle Lieder und Stimmen sind verschlüsselt. Das Passwort wird nur auf diesem Gerät gespeichert, du musst es nur einmal eingeben.` |
| errWrong | `Falsches Passwort.` |
| errOffline | `Keine Verbindung. Zum ersten Entsperren brauchst du Internet.` |
| changed | `Das Passwort wurde geändert. Bitte neu eingeben.` |

- On show: `library.fetchManifest()`. Size line from `sizeInfo()`, `mb` = round(totalBytes / 1 000 000). Null: `sizeUnknown`, button disabled.
- Vault state `password-changed`: `changed` banner above the form.
- Submit: button shows `busy`, disabled. `ok`: `library.sync()` starts (not awaited), route songs. `wrong-password`: `errWrong` under the field, field keeps focus, value cleared. `no-manifest`: `errOffline`.
- Enter key submits. Empty password: button disabled.
  `[@test] ../tests/steps/screen-start.steps.ts`

```gherkin
Feature: Start screen
  Scenario: size shown
    Given a manifest with totalBytes 95400000
    When the start screen renders
    Then it shows "Nach dem Entsperren werden etwa 95 MB geladen. Am besten im WLAN."

  Scenario: wrong password
    Given the vault answers wrong-password
    When I submit "x"
    Then "Falsches Passwort." is visible, the field is empty and focused, and no song title is anywhere in the DOM

  Scenario: success starts sync
    Given the vault answers ok
    When I submit the password
    Then library.sync was called and the route is "#/songs"

  Scenario: password changed
    Given vault state password-changed
    When the start screen renders
    Then "Das Passwort wurde geändert. Bitte neu eingeben." is visible
```
