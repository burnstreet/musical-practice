# Settings: dialogRepeats, no scene loop; run-through opens paused

Status: resolved
Blocked by: 01
Spec: ../spec.md

- `specs/shell.spec.md`: `settings.dialogRepeats` (`src/app/settings.ts`). Remove `loopScene` from `DialogSettings`, its default, and the `Szene wiederholen` toggle in `src/app/settings-sheet.ts`.
- `specs/screen-dialog.spec.md`: run-through opens paused (`cueStart` with `paused`), exception after `songPractice`. The controller (`src/app/dialog.ts`) builds the `repeat` cue option from `settings.dialogRepeats[sceneId]`.
- Un-`@todo` scenarios "directions for my roles highlighted" and "defaults" (Text settings).

Paused view rendering, sheet and chip are ticket 03.
