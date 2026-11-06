---
name: Script editor
description: Script view in the existing editor. Pure edit ops on the script, list view, audio status and per-line re-render through the editor server.
targets:
  - ../web/script-ops.js
  - ../web/app.js
  - ../tools/serve.py
---

# Script editor

Part of the editor (`./mp.ps1 serve`, `web/`). Same page, same server. Edits go through pure ops in `web/script-ops.js` and save through `POST /save/script.json`. No role or voice editing: those stay in `sources/config.json`.

## View

- The song picker gets an entry `Skript` when `web/data/script.json` exists. It opens the script view instead of the song views.
- List grouped by scene (heading = scene title). One row per item: role chip in a colour per role (lines), text field, `say` field (lines, empty = none), audio status, buttons.
- Role filter: show only lines of one role plus their neighbours.
- Audio status per line: `ohne Ton` when the line has no audio for its current hash. The editor asks the server (`POST /script-status` with the script, answer `{ missing: [itemId] }`) after load, after save and after each render. Never hashes in JS.
- Buttons per line: `▶` plays its audio (`/data/script/<hash>.mp3`, the hash from the status answer); `Neu sprechen` posts the line (`POST /render-line` with `{ item }`), the server renders it with `render_line` and its role's voice, answers `{ hash }`; the editor plays it. Rendering a line does not save the script.
- Inline directions (`[…]`, script-format) are edited as plain text in the text field. A line with inline directions shows its spoken text as the `say` field's placeholder (`spricht: …`). Action `Markierung zur Regie` puts the selected part of a line's text in brackets.
- Text fields grow with their text: long lines show in full.
- First `Neu sprechen` of a server process loads the model: the button shows `lädt …` until the answer.
- Drawing and server routes are not unit-tested; the ops are.

## Ops (`web/script-ops.js`)

All pure: take a script, return a new script or throw `ScriptOpError` with a German message the editor shows.

- `setText(s, id, text)`: empty text refused.
- `setSay(s, id, say)`: empty string removes `say`. Lines only.
- `setRole(s, id, role)`: lines only.
- `setType(s, id, type, role?)`: between `line` and `direction`; to `line` needs `role`. `say` dropped on the way to `direction`. Song items refused.
- `split(s, id, offset)`: text before and after `offset`, both trimmed and non-empty, else refused. First keeps id and `say` is dropped from both; second gets a new id, same type and role.
- `merge(s, id)`: joins the item with the next item of the same scene when both are lines of the same role or both directions; text joined with a space; `say` dropped; the second item's id disappears. Else refused.
- `insertAfter(s, id, item)`: new id. `remove(s, id)`.
- New ids: random 4 chars `[a-z0-9]`, not in use.
  `[@test] ../tests/steps/script-editor.steps.ts`

```gherkin
Feature: Script ops
  Scenario: split a line
    Given a line "aaaa" of anna with text "Hallo du. Komm her." and say "Hallo duh. Komm her."
    When I split it at offset 9
    Then "aaaa" has text "Hallo du." and no say
    And the next item is a line of anna with text "Komm her." and a new id

  Scenario: split at the edge refused
    Given a line "aaaa" with text "Hallo"
    When I split it at offset 0
    Then it fails and the script is unchanged

  Scenario: merge two lines of one role
    Given lines "aaaa" and "bbbb" of anna with texts "Eins." and "Zwei."
    When I merge "aaaa"
    Then "aaaa" has text "Eins. Zwei." and "bbbb" is gone

  Scenario: merge across roles refused
    Given line "aaaa" of anna followed by line "bbbb" of mutter
    When I merge "aaaa"
    Then it fails with a message

  Scenario: line becomes direction
    Given a line "aaaa" of anna with say "x"
    When I set its type to direction
    Then "aaaa" is a direction without role and say

  Scenario: direction becomes line only with a role
    Given a direction "dddd"
    When I set its type to line without role
    Then it fails
    When I set its type to line with role anna
    Then "dddd" is a line of anna

  Scenario: empty say removes it
    Given a line "aaaa" with say "x"
    When I set say to ""
    Then "aaaa" has no say

  Scenario: insert gets a fresh id
    Given a script with items "aaaa" and "bbbb"
    When I insert a direction after "aaaa"
    Then the new item sits between them with an id that is neither
```
