---
name: Screen Dialog
description: Dialog trainer screens. Shared role bar, Lieder/Text switch, scene selection, run-through, text settings, desktop, admin script view. Artboards in design/dialog/.
targets:
  - ../src/app/screens/roles.ts
  - ../src/app/screens/text.ts
  - ../src/app/screens/run.ts
  - ../src/app/settings-sheet.ts
---

# Screen: Text üben

Design: canvas "Dialog-Trainer – Entwürfe" (https://claude.ai/artifact/JepLkpUgQLtk1PHKB1UrxH), committed copy in `design/dialog/`. Screens know no audio, mic or cue internals: they render the `Cue` of the cue engine and send its events; a controller in `src/app` runs the effects (play, stop, mic) and feeds voice detect.

Placeholder text in the artboards is invented. Real lines come from the script.

## Role bar `<gu-roles>` (shared with screen-songs)

Artboard D1, top. Replaces the role chips of screen-songs.

| id | text |
|---|---|
| label | `Deine Rollen · für Lieder und Text` |
| none | `Wähle mindestens eine Rolle` |
| change | `ändern` |
| done | `fertig` |

- One row: label, the selected role names joined by `, `, `change`. Tap: expands to chips of every role with `sings` or `speaks`, library order, multi-select with `aria-pressed`; `done` collapses.
- Empty selection: always expanded, shows `none`, no `done`.
- Selection saved to `settings.roles` (one selection for songs and text). Collapsed by default when a selection exists.

## Mode switch

- Tab pair `Lieder` | `Text` below the role bar, `role="tablist"`. `Lieder` = route `#/songs`, `Text` = route `#/text`. Last tab kept in `settings.tab`.

## Scene selection (`#/text`)

Artboard D1.

| id | text |
|---|---|
| resume | `Weiter bei Szene {n}` / `Zuletzt geübt: {when}` |
| listTitle | `Szene wählen` |
| legend | `deine Zeilen` |
| sceneMeta | `{roles} Rollen · {songs} Lied` / `Lieder` |
| mine | `{n} Zeilen` |
| notReady | `Text wird geladen` |

- `resume` only when a stored position exists for the current role set; tap starts there.
- Scene rows: number, title, meta, count of lines of the selected roles (accent, hidden at 0). Tap: route `#/text/{sceneId}`.
- Script not ready (`library.scriptReady` false): rows muted, `notReady`, not tappable. No script in the library: the `Text` tab is hidden.

## Run-through (`#/text/{sceneId}[/{itemId}]`)

Artboards D2 (others speak), D3 (my turn), D4 (song cue, direction, missed hint). Phone layout uses the full height for text.

| id | text |
|---|---|
| title | `Szene {n} · {title}` |
| me | `{role} · du` |
| upNext | `Gleich du · {roles}, {n} Zeilen` / `Mikro noch aus` |
| myTurn | `Du bist dran` |
| listening | `hört zu` |
| speaking | `du sprichst` |
| silence | `weiter nach {s} s Stille` |
| reveal | `Aufdecken` |
| prompt | `Vorsprechen` |
| next | `Weiter` |
| skip | `Überspringen` |
| direction | `Regie` |
| songCue | `Jetzt kommt ein Lied · {roles} singt mit` / `Lied {n} · {title}` |
| songPractice | `Lied üben` |
| songContinue | `Weiter im Text` |
| missed | `Nichts gehört, nach {s} s weitergemacht.` |
| again | `Nochmal` |

- Header: back (to `#/text`), title with a thin progress bar (turn index of the scene), settings.
- Flow fills the space between header and controls, anchored at the bottom: past items above the current one, older ones fainter, as many as fit. Directions in italics. My lines labelled `me` in accent colour.
- Inline directions (`[…]` in a line, script-format) show in the flow, the cards and the hint in italics in the direction style, without the brackets.
- Current item by cue state:
  - `playing`: white card, speaker chip, playing indicator, full text. Below, when the next turn is mine: `upNext`.
  - `waiting` / `speaking`: accent card `myTurn`, status `listening` or `speaking`, my lines through `hintText` with the mode from settings (show, first words, hidden as bars), `reveal` (when not fully shown; shows the full text until the turn ends), `prompt`, level bar and `silence`.
  - `direction`: bordered card `direction` with a bar running `directionMs`.
  - `song`: white card `songCue` with `songPractice` (route `#/practice/{songId}`; coming back resumes at this item) and `songContinue` (tap event).
- Controls, phone: back, `skip` (only in `playing`), pause/resume (accent), speed of others (`1,0×`, opens settings). In my turn: back, `next` (large, tap event), pause.
- `missed` effect: status bar above the flow with `again` (back event) until the next turn of mine starts.
- Desktop (artboard Desktop D2): scene list left, flow right, same states. Space bar = `next` in my turn, = pause elsewhere.
- Leaving the screen or pausing stores `position()` per role set in `settings.dialogPositions`.

## Text settings

Artboard D5. Sheet opened from the run-through and the scene selection.

| id | text |
|---|---|
| title | `Einstellungen Text` |
| ownLine | `Eigene Zeile` / `Zeigen` · `Anfang` · `Verstecken` |
| ownLineHint | `Anfang: die ersten drei Wörter, der Rest zum Aufdecken.` |
| silence | `Pause bis weiter` / `So lange still, dann geht es weiter.` |
| rate | `Sprechtempo der anderen` |
| directions | `Regieanweisungen anzeigen` |
| loop | `Szene wiederholen` |
| headphones | `Mit Kopfhörern üben. Sonst hört das Mikro die anderen Stimmen und geht zu früh weiter.` |
| micTest | `Mikro testen` / `sprich etwas` |
| done | `Fertig` |

- Values in `settings.dialog`: `hint` (`show` / `start` / `hide`, default `start`), `silenceMs` (500–3000, step 100, default 1200), `rate` (0.8–1.3, step 0.1, default 1.0), `showDirections` (default true), `loopScene` (default false).
- The own-line mode is set only here, never on the run-through.
  `[@test] ../tests/steps/screen-dialog.steps.ts`

```gherkin
Feature: Role bar
  Scenario: collapsed with a selection
    Given settings.roles [anna]
    When the role bar renders
    Then it reads "Anna" with "ändern" and shows no chips

  Scenario: expanded without a selection
    Given settings.roles []
    When the role bar renders
    Then it shows "Wähle mindestens eine Rolle" and the role chips, and no "fertig"

  Scenario: speaking and singing roles both offered
    Given roles maria (sings), erzaehler1 (speaks) and esel (neither)
    When I expand the role bar
    Then chips "Maria" and "Erzähler 1" exist and no chip "Esel"

Feature: Scene selection
  Scenario: resume card
    Given a stored position s4 for role set [anna]
    When the text screen renders
    Then "Weiter bei Szene 4" is visible

  Scenario: lines of my roles per scene
    Given scene s2 with 8 lines of anna and roles [anna]
    Then row 2 shows "8 Zeilen"

  Scenario: no script, no tab
    Given a library without script
    Then the "Text" tab is hidden

Feature: Run-through
  Scenario: others speaking
    Given the cue state playing line of mutter "Macht nichts."
    Then a card shows "Mutter" and "Macht nichts."

  Scenario: inline direction shown as direction
    Given the cue state playing line of mutter "Oh. [Türklopfen] Wer da?"
    Then the card shows "Oh.", the inline direction "Türklopfen" and "Wer da?", and no "["

  Scenario: my turn with first words
    Given settings.dialog.hint "start" and the cue state waiting with my line "Oma mag doch Schneekugeln."
    Then the card reads "Du bist dran" and "Oma mag doch …" and offers "Aufdecken"
    When I press "Aufdecken"
    Then the card reads "Oma mag doch Schneekugeln."

  Scenario: next sends a tap
    Given the cue state waiting
    When I press "Weiter"
    Then the cue engine receives tap

  Scenario: missed hint
    Given the cue effect missed
    Then "Nichts gehört, nach 20 s weitergemacht." and "Nochmal" are visible

  Scenario: song cue jumps and returns
    Given the cue state song with song "04"
    When I press "Lied üben"
    Then the route is "#/practice/04"
    When I come back
    Then the run-through resumes at the song item

  Scenario: space bar on desktop
    Given the cue state waiting
    When I press the space bar
    Then the cue engine receives tap

Feature: Text settings
  Scenario: defaults
    Given empty settings
    Then the sheet shows "Anfang", 1,2 s, 1,0×, directions on and loop off
```

## Admin script view

Artboard "Admin-Editor · Skript". Behaviour in script-editor.spec.md. Layout: content picker with `Skript`, filter bar (role, scene, `nur ohne Ton`), rows per scene (role chip, text, `say`, ▶, `Neu sprechen`, status), action bar for the selected item (`Am Cursor teilen`, `Mit nächstem zusammenführen`, `Zur Regie machen`, `Darunter einfügen`, `Löschen`).
