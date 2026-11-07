# Paused scene view, item sheet, repeat chip

Status: resolved
Blocked by: 02
Spec: ../spec.md

`specs/screen-dialog.spec.md`, section "Paused scene view and repeat" and Feature "Paused scene view and repeat" (all scenarios, drop `@todo`). Artboards T1–T3 in `design/dialog-repeat/`. Targets `src/app/screens/run.ts`, `src/app/dialog.ts`; steps `tests/steps/screen-dialog.steps.ts`. Range drawn from `repeatRange`; every range/position change restarts the cue as the spec says.

Also: ticket 04 (commit 5f2b9c5) decides `upNextWrap` in `upNext` of run.ts by stepping the pure `cueStep` one turn ahead, i.e. the screen re-derives engine logic (spec: screens know no cue internals). Once the screen has the cue options, replace that with `repeatRange`: wrap when the last item of `cue.next` is the range's `to`. Keep `tests/run-up-next.test.ts` green.

From ticket 02 (commit 89e002e): `restart()` in `src/app/dialog.ts` starts running and then sends `pause`; use `cueStart` with `paused` instead when restarting a paused cue. Scenario "opens paused with the whole scene" is still `@todo` and belongs here.
