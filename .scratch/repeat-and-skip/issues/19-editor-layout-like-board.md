# Editor: side column and selected-note card as on the design board

Status: resolved
Blocked by: none
Spec: ../spec.md

Found after ticket 12: the sections panel sits under the bands. The board *Admin-Editor* (design/repeat-and-skip/Editor.dc.html) puts it in a side column. Also not built yet: the board's dark rounded styling and the card *Ausgewählte Note*.

Goal:
- On a wide window, the sections list and the re-detect button sit in a side column next to the staff, the bands and the roll, as on the board. On a narrow window they fall back below them.
- A card *Ausgewählte Note* shows the selected note, with the fields the board shows (e.g. pitch, time, syllable, phrase, section). It is read-only unless the board shows editing that already exists in the editor (e.g. the *Phrasenanfang* toggle). Do not add new note edits; the spec rules them out.
- The editor panels take the board's dark rounded look, as far as it fits the existing web/style.css.

Code: web/index.html, web/style.css, web/app.js. Behaviour stays as it is: section ops, selection, paging and saving. Rendering is not unit-tested. Check by screenshot against the board.

## Comments

Resolved (agent, 2026-10-29): #editor grid, main column staff, bands and roll, side column the card *Ausgewählte Note* and the sections panel; below 1100 px the side column falls under the roll. Panels take the board's dark rounded look (24 px, #17498C, pill buttons, accent on the picked section row and an active *Phrasenanfang*). The card is read-only (pitch, syllable, bar and beat, phrase, section, role; several notes: count and bar range); its *Rolle setzen* and *Phrasenanfang* controls (moved from the edit toolbar, same handlers) show in Edit notes mode only. Not built: page header with Save and unsaved-changes line (Save stays in the edit toolbar), dark page background, dark roll (canvas colours), trash icon (a ✕ instead). No new note edits.
