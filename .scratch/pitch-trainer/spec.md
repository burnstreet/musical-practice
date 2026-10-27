# Pitch trainer PWA

Status: ready-for-human

Spec lives in `specs/` (Tessl-style, one file per module, Gherkin scenarios embedded). Entry: `specs/overview.spec.md`. Design: `design/`. Vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/0001` to `0006`.

Implementation: TDD, failing scenario first, `/ponytail` level full. Suggested order: content-format, scorer, vault, library, audio-engine, pitch-engine, history, shell, screens, builder.

Not in scope here: content work (transcribing songs 01, 02, 05, 06, 09), canvas edits listed under design deltas in the overview.

## Comments

- 2026-10-27 agent: implemented on branch `pitch-trainer` via tickets `issues/01`–`18` (all resolved). Ticket split was written by the agent without user review. Code review findings and fix decisions in the final session report; two spec inconsistencies left for the user: scorer "statistics" scenario (frames at the stated cents give hitPct 75, not 50) and builder "repeated sections match the same line again" vs content-format "phrases contiguous, non-overlapping" (resolved in code by numbering each matched run anew). Needs a real-device pass (manual checklist in overview.spec.md) and real content packed by the admin.
