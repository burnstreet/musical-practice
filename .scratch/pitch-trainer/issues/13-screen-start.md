# 13: Screen: Start und Passwort

**What to build:** The password screen: size line and WLAN hint from the public manifest, password field with show/hide, unlock with busy state, error states for wrong password and offline, password-changed banner, and on success start the library sync and go to the songs screen.

**Blocked by:** 12 (shell)

**Status:** ready-for-agent

Spec: `specs/screen-start.spec.md`. Artboards `design/Start.dc.html`, `design/StartDesktop.dc.html`. Context contract from ticket 12.

- [ ] All scenarios pass via `tests/specs/screen-start.test.ts` + `tests/steps/screen-start.steps.ts` with a fake context.
- [ ] Strings byte-identical to the spec table.
- [ ] Phone (390) and desktop (1280) layouts per the artboards, touch targets ≥ 44 px.
