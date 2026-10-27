# 06: Scorer and session

**What to build:** Pure scoring: octave folding, per-note hit, pass result with phrase stats, tendency, sung range, worst phrase and the German coaching tip; plus the small stateful `Session` that routes pitch frames to entered notes and keeps passes and trend.

**Blocked by:** 02 (content format)

**Status:** ready-for-agent

Spec: `specs/scorer.spec.md` (all features). Types from `src/core/content.ts` / `src/core/types.ts`. Vocabulary: `GLOSSARY.md` → Scoring.

- [ ] All scenarios pass via `tests/specs/scorer.test.ts` + `tests/steps/scorer.steps.ts`.
- [ ] Tip strings match the spec byte for byte (German quotes „ “).
- [ ] `Session.frame` ignores frames outside entered notes and frames of other roles' notes.
