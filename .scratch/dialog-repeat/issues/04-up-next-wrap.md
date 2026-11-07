# upNext from cue.next, with wrap hint

Status: resolved
Blocked by: 01
Spec: ../spec.md

`specs/screen-dialog.spec.md`, current item `playing`: `upNext` decided from `cue.next`, plus `upNextWrap` (` · dann wieder von vorn`) when that turn is the last turn of the repeat (artboard T4 in `design/dialog-repeat/`). Target `src/app/screens/run.ts`. Add a scenario only if the spec has one; otherwise a rendering smoke test in the existing style.
