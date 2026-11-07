# Dialog repeat: paused scene view and repeat in the text run-through

Status: ready-for-agent

Spec lives in the module specs, commit a2bb52f ("Spec: paused scene view and repeat in the text run-through"):

- `specs/cue-engine.spec.md`: paused start, Repeat section, `repeatRange`, `Cue.next`, no `loopScene`
- `specs/screen-dialog.spec.md`: run-through opens paused, `upNextWrap`, section "Paused scene view and repeat", text settings without loop
- `specs/shell.spec.md`: `settings.dialogRepeats`
- `GLOSSARY.md`: Repeat
- Design: `design/dialog-repeat/` (T1–T4)

Done when no `@todo` tag is left in those specs and every scenario passes.

Tickets: `issues/`.
