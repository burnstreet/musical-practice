# 03: Builder: phrase derivation from lyrics DOCX

**What to build:** `python tools/phrases.py NN` assigns a `phrase` index to every note of an aligned song JSON by matching lyric lines from the DOCX, with manual `phraseStart` flags winning, and reports the first unmatched syllable with exit 1.

**Blocked by:** 01 (scaffold)

**Status:** ready-for-agent

Spec: `specs/builder.spec.md` → Phrases. Inputs and folders at the top of that spec and in `docs/pipeline.md`. DOCX reading: use `python-docx` if present in `tools/.venv`, else the stdlib zip + XML route (one small function). Tests must not need real lyrics: steps build a DOCX or a plain list of lines in a temp dir.

- [ ] Feature `Phrase derivation` passes via `tools/tests/test_phrases.py` + `tools/tests/steps_phrases.py`.
- [ ] Script writes the updated song JSON in place (same file), keeps all other fields.
- [ ] Repeated sections match the same line again (second pass of a section gets the same phrase index as the first pass).
