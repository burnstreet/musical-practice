# Practice screen: restore the repeat state and small repeat fixes

Status: ready-for-agent
Blocked by: none
Spec: ../spec.md

Deviations found in the review of tickets 04-07.

1. **The repeat state is lost when the practice screen is shown again.**
   - On remount, `kind` becomes `'phrase'` only when the engine range has `.phrase`, and `'off'` otherwise (src/app/screens/practice.ts:271-272). The engine keeps looping.
   - Case: go back to practice with a Section, Einsatz or A–B repeat active (for example with the browser back button from results).
   - What goes wrong: the *Aus* chip shows as active but playback still wraps. The status line reads ` · m:ss–m:ss` with an empty name, and the roll flag has no label. `sectionName` and `pointA` are lost.
   - Fix: restore `kind`, the name and the A/B points from the engine range, or store them where the screen can read them back. A Gherkin scenario in specs/screen-practice.spec.md covers this.
2. **A manual seek past the range end wraps at once (story 9).**
   - src/core/audio-engine.ts:126 wraps as soon as `t >= end`.
   - The spec says a seek outside the range keeps the repeat on and plays on until the range end, then wraps. A seek past the end should therefore play on rather than jump straight back.
   - Decide the rule and write it as a scenario in specs/audio-engine.spec.md. Proposal: wrap only when playback crosses `end` from inside the range.
3. **Section segments light up by name** (practice.ts:564). Two sections with the same name both look active. Compare by index or by start time instead.

Tests: tests/steps/screen-practice.steps.ts, tests/specs/audio-engine.test.ts.
