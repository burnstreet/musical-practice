# Pitch trainer PWA

Status: ready-for-agent

Spec lives in `specs/` (Tessl-style, one file per module, Gherkin scenarios embedded). Entry: `specs/overview.spec.md`. Design: `design/`. Vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/0001` to `0006`.

Implementation: TDD, failing scenario first, `/ponytail` level full. Suggested order: content-format, scorer, vault, library, audio-engine, pitch-engine, history, shell, screens, builder.

Not in scope here: content work (transcribing songs 01, 02, 05, 06, 09), canvas edits listed under design deltas in the overview.

## Comments
