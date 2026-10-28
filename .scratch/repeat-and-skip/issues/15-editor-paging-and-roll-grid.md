# Editor view: paging by the roll window, roll on the bar grid

Status: needs-triage
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

Questions for triage:
- Should the roll be put on the staff's x-axis, so that the page equals the roll window?
- Or is it enough to scroll the roll to the selection and the page, keeping the seconds axis?
