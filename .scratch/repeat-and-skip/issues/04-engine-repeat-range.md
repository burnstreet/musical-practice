# Audio engine: repeat range

Status: resolved
Blocked by: 01
Spec: ../spec.md

Spec 'Engine' and 'Lead-in' (named constant LEAD_IN = 3 s, single value). Replace single-phrase loop in src/core/audio-engine.ts with repeat over {start,end} or none, wrap at end, loop event names a phrase only for phrase ranges, seek with lead-in helper (snap back to previous bar, never before 0). Update all callers so the app still builds and passes (practice/results screens keep working via a Phrase range). Tests: 	ests/specs/audio-engine.test.ts.

