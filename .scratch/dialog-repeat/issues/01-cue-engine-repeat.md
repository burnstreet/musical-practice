# Cue engine: paused start, repeat range, next turn

Status: resolved
Blocked by: none
Spec: ../spec.md

`specs/cue-engine.spec.md` in full: `cueStart` with `paused`, `CueOptions.repeat` replaces `loopScene`, section Repeat, `repeatRange`, `Cue.next`. Target `src/core/cue.ts`, steps `tests/steps/cue.steps.ts`. Drop the `@todo` tags of that spec as scenarios pass.

Keep the build green: callers (`src/app/dialog.ts`, `src/app/screens/run.ts`) pass `repeat: null` for now. Settings and UI are tickets 02–04.
