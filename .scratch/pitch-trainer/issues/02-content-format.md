# 02: Content format types and parsers

**What to build:** The shared content types and validators every other TypeScript module imports: `parseManifest`, `parseLibrary`, `parseSong`, `roleSpans`, `ContentError`, and the shared types (`Manifest`, `Library`, `Role`, `RoleId`, `SongMeta`, `Song`, `Note`, `Phrase`, `Span`, plus `PitchFrame` from the pitch-engine spec so scorer and pitch engine share it without depending on each other).

**Blocked by:** 01 (scaffold)

**Status:** ready-for-agent

Spec: `specs/content-format.spec.md` (all four features). `PitchFrame` shape: `specs/pitch-engine.spec.md` API block.

- [ ] All scenarios of `content-format.spec.md` pass via `tests/specs/content-format.test.ts` + `tests/steps/content-format.steps.ts`.
- [ ] `ContentError` carries a `field` name (`format`, `files`, `roles`, `notes`, `phrase`, …) that the scenarios check.
- [ ] Types exported from `src/core/content.ts`; `PitchFrame` exported from `src/core/types.ts` (or re-exported from content.ts) so ticket 06 and 09 import the same type.
