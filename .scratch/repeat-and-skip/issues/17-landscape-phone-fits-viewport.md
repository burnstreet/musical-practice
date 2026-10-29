# Practice screen: landscape phone fits the viewport

Status: resolved
Blocked by: none
Spec: ../spec.md

Found after ticket 10: in landscape on a phone (844x390), the practice screen is about 424-536 px tall and scrolls. The play row is below the visible edge. This was already over before the selector rows, and ticket 10 changed only the portrait layout.

Goal: at 844x390 and 915x412 in landscape, the whole screen, including the play row, is visible without page scrolling. It must hold with and without sections and with and without the note banner. The portrait (ticket 10) and desktop (1280x800) layouts must stay as they are.

Code: the landscape media query in src/app/screens/practice.ts (`100dvh`, two columns). Proposal: denser transport in the right column, smaller staff and readout, and the roll takes the leftover height. Add the check to e2e/smoke.e2e.ts next to the portrait sizes.

## Comments

Resolved. src/app/screens/practice.ts, landscape block (moved to the end of the styles, so it wins over the base rules for `.chip`, `.main`, `.readout`): mode button in the header row on the right, right column 320 px with a denser readout (8 px padding) and transport (chips on one 32 px line, 40 px buttons, 52 px main, 24 px lines), staff canvas 80 px, banner 4 px padding, roll canvas absolutely placed in a `minmax(96px, 1fr)` row so it takes the leftover height. Portrait and desktop blocks untouched. Measured with Playwright (real layout, with and without sections, with and without banner): scrollHeight equals the viewport at 844x390 (390) and 915x412 (412) in all four cases, play row bottom at 384 / 406 px (before 424-536 px, scrolling). Roll canvas 188 / 163 / 188 / 163 px at 844x390 and 210 / 185 / 210 / 185 px at 915x412. 360x740, 390x844, 412x915 and 1280x800 measured unchanged by this ticket. Check added to e2e/smoke.e2e.ts next to the portrait sizes; spec prose in specs/screen-practice.spec.md (Sideways phone). Screenshot at 844x390 checked by eye.