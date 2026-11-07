---
name: Screen Dialog
description: Dialog trainer screens. Shared role bar, Lieder/Text switch, scene selection, run-through, paused scene view with repeat, text settings, desktop, admin script view. Artboards in design/dialog/ and design/dialog-repeat/.
targets:
  - ../src/app/screens/roles.ts
  - ../src/app/screens/text.ts
  - ../src/app/screens/run.ts
  - ../src/app/dialog.ts
  - ../src/app/settings-sheet.ts
---

# Screen: Text üben

Design: canvas "Dialog-Trainer – Entwürfe" (https://claude.ai/artifact/JepLkpUgQLtk1PHKB1UrxH), committed copy in `design/dialog/`. Paused scene view and repeat: canvas "Text · Abschnitt üben – Entwürfe" (https://claude.ai/artifact/Gpo361XzAdnDWW3zrG3mSW), committed copy in `design/dialog-repeat/` (T1–T4); it wins over D2–D5 where they differ. Screens know no audio, mic or cue internals: they render the `Cue` of the cue engine and send its events; a controller in `src/app` runs the effects (play, stop, mic) and feeds voice detect.

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
- Script not ready (`library.scriptReady` false): one muted row `notReady`, not tappable (scenes are unknown until the script file is stored). No script in the library: the `Text` tab is hidden.

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
| upNextWrap | ` · dann wieder von vorn` (appended to the `Gleich du` part of `upNext`) |

- The run-through opens paused (`cueStart` with `paused`): no audio, no mic until play. Exception: coming back from `songPractice` resumes at the song item, not paused.
- Header: back (to `#/text`), title with a thin progress bar (turn index of the scene, turns as the cue engine groups them: my consecutive lines are one turn), settings.
- Flow fills the space between header and controls, anchored at the bottom: past items above the current one, older ones fainter, as many as fit. Directions in italics. My lines labelled `me` in accent colour.
- Inline directions (`[…]` in a line, script-format) show in the flow, the cards and the hint in italics in the direction style, without the brackets.
- Direction for me: a `direction` item whose text holds the `name` of a selected role as a whole word (case-sensitive; directions have no role field). Shown in accent colour in the flow, `direction` card with accent border and label. Inline directions never.
- Current item by cue state:
  - `playing`: white card, speaker chip, playing indicator, full text. Below, when the next turn is mine: `upNext`, plus `upNextWrap` when that turn is the last turn of the repeat. Next turn = `cue.next`.
  - `paused`: the paused scene view below.
  - `waiting` / `speaking`: accent card `myTurn`, status `listening` or `speaking`, my lines through `hintText` with the mode from settings (show, first words, hidden as bars), `reveal` (when not fully shown; shows the full text until the turn ends), `prompt`, level bar and `silence`.
  - `direction`: bordered card `direction` with a bar running `directionMs`.
  - `song`: white card `songCue` with `songPractice` (route `#/practice/{songId}`; coming back resumes at this item) and `songContinue` (tap event).
- Controls, phone, while running: back, `skip` (only in `playing`), pause (accent), speed of others (`1,0×`, opens settings). In my turn: back, `next` (large, tap event), pause.
- `missed` effect: status bar above the flow with `again` (back event) until the next turn of mine starts.
- Desktop (artboard Desktop D2): scene list left, flow right, same states. Space bar = `next` in my turn, = pause elsewhere.
- Leaving the screen or pausing stores `position()` per role set in `settings.dialogPositions`.

## Paused scene view and repeat

Artboards T1 (paused), T2 (item tapped), T3 (repeat set), T4 (running in the repeat).

| id | text |
|---|---|
| pausedHint | `Pausiert · Zeile antippen für Von, Bis oder Ab hier` |
| here | `Hier geht es weiter` |
| from | `Von`, aria `Wiederholung von hier` |
| to | `Bis`, aria `Wiederholung bis hier` |
| fromHere | `Ab hier` |
| repeat | `Wiederholung · {n} Zeile` / `Zeilen` (n = lines in the range) |
| repeatClear | aria `Wiederholung aufheben` |
| play | aria `Weiter abspielen` |

- In `paused` the flow shows the whole scene, directions as set, and scrolls; it opens with the current turn in view and `here` above it. Items before the current turn are dimmed.
- My lines before the current turn show in full. From it on they go through `hintText` with the own-line mode, `hide` as bars like in the card.
- Header and progress in `paused` as while running.
- Controls in `paused`: play (sends `resume`), speed of others. No back: tap an item and `fromHere` instead. `pausedHint` above the flow.
- Tap an item: its whole turn is highlighted. A sheet over flow and controls shows the turn's first item (speaker, text through the hint as in the flow, `(+{n} Zeile)` / `(+{n} Zeilen)` for more items), `from`, `to` and `fromHere`. `from` / `to` show pressed when that end is set and is this turn.
- Tap another item: the sheet switches to it. Tap anywhere else: the sheet closes.
- `from` / `to`: set that end to the turn's first / last item; an opposite end on the wrong side is cleared; a position outside the new range moves to its start. Sheet closes.
- `fromHere`: position = the turn's first item, stored in `settings.dialogPositions`. The repeat stays. Sheet closes.
- The screen draws the range from `repeatRange`: marked items, tags `Von` / `Bis` at a set end. Chip above the controls, in `paused` and while running: `repeat` and ✕ (`repeatClear`), which removes the scene's entry.
- Stored in `settings.dialogRepeats[sceneId]` (shell).
- Every change of range or position restarts the cue at the position with the current `repeat` option: paused stays paused; while running (✕ on the chip) the current turn starts again, still running.
- Desktop: same, in the flow column. Escape closes the sheet.

Paused-view scene of the scenarios below (every scenario of that feature starts with it): scene s1 = i1 (line of another role), i2 and i3 (my lines in a row), i4 (line of another role), i5 (my line "Wir gehen gleich nach Hause"); hint "start".

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
| headphones | `Mit Kopfhörern üben. Sonst hört das Mikro die anderen Stimmen und geht zu früh weiter.` |
| micTest | `Mikro testen` / `sprich etwas` |
| done | `Fertig` |

- Values in `settings.dialog`: `hint` (`show` / `start` / `hide`, default `start`), `silenceMs` (500–3000, step 100, default 1200), `rate` (0.8–1.3, step 0.1, default 1.0), `showDirections` (default true).
- The own-line mode is set only here, never on the run-through.
  `[@test] ../tests/steps/screen-dialog.steps.ts`

```gherkin
Feature: Role bar
  Scenario: collapsed with a selection
    Given settings.roles [lena]
    When the role bar renders
    Then it reads "Lena" with "ändern" and shows no chips

  Scenario: expanded without a selection
    Given settings.roles []
    When the role bar renders
    Then it shows "Wähle mindestens eine Rolle" and the role chips, and no "fertig"

  Scenario: speaking and singing roles both offered
    Given roles clara (sings), erzaehler (speaks) and esel (neither)
    When I expand the role bar
    Then chips "Clara" and "Erzähler" exist and no chip "Esel"

Feature: Scene selection
  Scenario: resume card
    Given a stored position s4 for role set [lena]
    When the text screen renders
    Then "Weiter bei Szene 4" is visible

  Scenario: lines of my roles per scene
    Given scene s2 with 8 lines of lena and roles [lena]
    Then row 2 shows "8 Zeilen"

  Scenario: no script, no tab
    Given a library without script
    Then the "Text" tab is hidden

Feature: Run-through
  Scenario: others speaking
    Given the cue state playing line of vater "Macht nichts."
    Then a card shows "Vater" and "Macht nichts."

  Scenario: inline direction shown as direction
    Given the cue state playing line of vater "Oh. [Donnergrollen] Wer da?"
    Then the card shows "Oh.", the inline direction "Donnergrollen" and "Wer da?", and no "["

  Scenario: directions for my roles highlighted
    Given roles [lena] and scene s1 with directions "Vorhang zu", "Lena setzt sich", "Tante Ilse winkt" and a line of vater
    When the run-through starts at "Lena setzt sich" and I press play
    Then the direction card is highlighted
    When the run-through starts at the line and I press play
    Then in the flow "Lena setzt sich" is highlighted and "Vorhang zu" and "Tante Ilse winkt" are not

  Scenario: my turn with first words
    Given settings.dialog.hint "start" and the cue state waiting with my line "Tante Ilse mag doch Schneekugeln."
    Then the card reads "Du bist dran" and "Tante Ilse mag …" and offers "Aufdecken"
    When I press "Aufdecken"
    Then the card reads "Tante Ilse mag doch Schneekugeln."

  Scenario: next sends a tap
    Given the cue state waiting
    When I press "Weiter"
    Then the cue engine receives tap

  Scenario: progress counts turns
    Given roles [lena] and scene s1 with a line of vater, two lines of lena and a line of vater
    When the run-through starts at the last line
    Then the progress reads "3 von 3"

  Scenario: not ready, one muted row
    Given a script not ready yet
    When the text screen renders
    Then one disabled row reads "Text wird geladen"

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
    Then the sheet shows "Anfang", 1,2 s, 1,0× and directions on

Feature: Paused scene view and repeat
  @todo
  Scenario: opens paused with the whole scene
    Given the paused-view scene
    When the run-through opens at s1
    Then the cue state is paused and no effect ran
    And "Hier geht es weiter" stands above i1
    And the flow shows i1 to i5 and "Wir gehen gleich …"
    And there is no back button

  @todo
  Scenario: sheet opens on tap, switches, closes elsewhere
    Given the run-through paused at s1
    When I tap i1
    Then a sheet shows "Von", "Bis" and "Ab hier"
    When I tap i4
    Then the sheet shows the text of i4
    When I tap the header
    Then no sheet is shown

  @todo
  Scenario: my turn is one block
    Given the run-through paused at s1
    When I tap i3 and press "Von"
    Then settings.dialogRepeats.s1 is from i2
    And the cue option repeat is from i2 in s1

  @todo
  Scenario: setting a range moves the position into it
    Given the run-through paused at i1
    When I set "Von" at i4 and "Bis" at i5
    Then "Hier geht es weiter" stands above i4 and the chip reads "Wiederholung · 2 Zeilen"

  @todo
  Scenario: Von after Bis clears Bis
    Given repeat in s1 from i1 to i3
    When I set "Von" at i4
    Then settings.dialogRepeats.s1 is from i4 without an end

  @todo
  Scenario: Ab hier keeps the range
    Given repeat in s1 from i4 to i5, paused at i4
    When I tap i1 and press "Ab hier"
    Then "Hier geht es weiter" stands above i1 and the chip is visible

  @todo
  Scenario: chip clears the range
    Given repeat in s1 from i4 to i5
    When I press "Wiederholung aufheben"
    Then no chip is shown and settings.dialogRepeats has no s1

  @todo
  Scenario: repeat per scene, not per role set
    Given repeat in s1 from i4 to i5 stored
    When I change the roles and open s1
    Then the chip is visible

  @todo
  Scenario: play resumes
    Given the run-through paused at s1
    When I press "Weiter abspielen"
    Then the cue engine receives resume
```

## Admin script view

Artboard "Admin-Editor · Skript". Behaviour in script-editor.spec.md. Layout: content picker with `Skript`, filter bar (role, scene, `nur ohne Ton`), rows per scene (role chip, text, `say`, ▶, `Neu sprechen`, status), action bar for the selected item (`Am Cursor teilen`, `Mit nächstem zusammenführen`, `Markierung zur Regie`, `Zur Regie machen`, `Darunter einfügen`, `Löschen`).
