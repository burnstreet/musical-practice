# 14: Screen: Rolle und Lied wählen

**What to build:** Role chips (singing roles only, multi-select, persisted), download progress bar with error text, song rows with number, title, role names, selected-role marker, history badge and loading state, one expandable row with the three voicetrack modes and the start button that saves the mode and opens practice. Settings button in the header and the iOS install card from the shell.

**Blocked by:** 12 (shell)

**Status:** resolved

Spec: `specs/screen-songs.spec.md`. Artboards `design/Songs.dc.html`, `design/SongsDesktop.dc.html`. Context contract from ticket 12.

- [ ] All scenarios pass via `tests/specs/screen-songs.test.ts` + `tests/steps/screen-songs.steps.ts` with a fake context.
- [ ] Strings byte-identical to the spec table.
- [ ] Badge refreshes when the role selection changes.

## Comments

- 2026-10-27 agent: Merged 5b5128a, eefd60a: src/app/screens/songs.ts; MB unit aligned to 1e6 in the review fix pass.
