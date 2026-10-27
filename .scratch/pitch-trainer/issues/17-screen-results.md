# 17: Screen: Auswertung

**What to build:** The results screen for the latest pass of the live session: ring with hit %, deviation, tendency label, sung range in note names, signed per-phrase bar chart with tolerance band, tip card, trend polyline from pass 2, and the actions "Phrase n bei 80 % üben" (loop worst phrase, tempo 80, seek, back to practice paused), "Nochmal ganz" and close.

**Blocked by:** 06 (scorer), 08 (audio engine), 12 (shell)

**Status:** ready-for-agent

Spec: `specs/screen-results.spec.md`. Artboards `design/Auswertung.dc.html`, `design/AuswertungDesktop.dc.html`. Reads `context.live.session` and drives `context.engine`; never scores anything itself. Chart and trend as inline SVG (simplest to test for presence of points).

- [ ] All scenarios pass via `tests/specs/screen-results.test.ts` + `tests/steps/screen-results.steps.ts` with a fake context and engine.
- [ ] Strings byte-identical to the spec table.
- [ ] No "Aufnahme anhören" anywhere.
