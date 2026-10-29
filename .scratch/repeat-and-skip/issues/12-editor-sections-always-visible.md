# Editor: sections list visible without edit mode

Status: resolved
Blocked by: none
Spec: ../spec.md

User stories 31 and 33. The sections list (`#sectList`) and the *Abschnitte neu erkennen* button (`#sectBtn`) sit inside `#editTools`. That container is hidden until "Edit notes" is switched on (web/index.html:32-41, web/app.js:826). The admin therefore sees no sections list at first, and the editor looks unfinished.

In addition, the list shows only the names until the server has answered with the bar grid (web/app.js:713-717). The bar fields stay empty while it waits.

Goal:
- The sections list and the re-detect button are visible as soon as a song is loaded, in their own panel next to or under the bands, independent of note-edit mode.
- The bar fields show a loading state, or are disabled, until the grid has arrived.

Check against the board *Admin-Editor* in design/repeat-and-skip/Editor.dc.html. No unit test for the layout. The section ops are already covered in tests/specs/editor.test.ts.

## Comments

Resolved (agent, 2026-10-29): `#sectList` and `#sectBtn` moved out of `#editTools` into their own panel `#sectPanel` under the bands, shown as soon as a song is loaded. Until the bar grid arrives the bar fields and *Abschnitt hinzufügen* are disabled (placeholder …) and the panel head reads *Taktraster wird geladen …* (or why it is missing). Name and delete work without the grid.
