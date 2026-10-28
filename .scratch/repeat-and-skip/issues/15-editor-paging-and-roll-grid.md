# Editor view: paging by the roll window, roll on the bar grid

Status: resolved
Blocked by: none
Spec: ../spec.md

The spec's "Editor" decision is only partly met:

1. **Paging.** The spec says: "Pages follow the roll's visible window with previous/next."
   - Now the staff shows the page that holds the playhead (`t: curTime()`, web/app.js:630, src/editor/view.ts:104).
   - The roll window is `t - w*PLAY_FRAC …` (web/app.js:259).
   - Previous and next seek playback to the neighbouring page (web/app.js:1050-1051).
   - Whether this is acceptable or the page should follow the scrolled roll window is a decision for the user.
2. **One bar grid.** The staff and both bands share one x-axis (`xOf`, view.ts:112). The roll keeps its own seconds axis and only draws bar lines from the same grid (web/app.js:337-350), so the roll and the staff are not aligned with each other.
3. **Selection in the roll.** A click on a phrase, a section or a staff note selects those notes, and the roll highlights them (web/app.js:366-370). The roll does not scroll to them, though, so a selection outside the roll window stays invisible.

## Comments

Decision (user, 2026-10-29):
- The roll goes onto the staff's x-axis, so one page equals the roll window. Previous and next page both together.
- A selection on another page turns to that page.
- Seconds stay visible: show a time scale or time labels in seconds on the roll, and keep the current time display.

Resolved (agent, 2026-10-29): the roll runs on the shown staff page (`Page.grid`: the page's bar lines and end); its bar lines sit under the staff's, time is linear inside each bar (not per onset, so dragging a note in the roll moves it instead of pinning it under its head). Prev/next seek as before, so staff, bands and roll turn together; zoom buttons are hidden while the staff view is on. Seconds scale stays on top of the roll, the time readout stays. `turnFor` turns the view (seek) to the first bar of a selection with no note on the page; focusing a row of the section list now selects that section, which makes this reachable. Pure helpers `timeAt` and `turnFor` covered by new scenarios in specs/builder.spec.md.
