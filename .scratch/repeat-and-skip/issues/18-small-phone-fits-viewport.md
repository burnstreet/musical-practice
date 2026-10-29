# Practice screen: small phone (360x740) fits with sections and banner

Status: resolved
Blocked by: none
Spec: ../spec.md

Found after ticket 10: at 360x740 in portrait, the practice screen fits except in one case. When a song has sections and the note banner shows, it is 750 px tall and overflows by 10 px.

Goal: at 360x740, there is no page scroll in all four combinations (with and without sections, with and without the banner), and 390x844 and 412x915 stay unchanged.

Code: the upright-phone block in src/app/screens/practice.ts. The roll has `minmax(96px, 1fr)` and the other rows are fixed. Proposal: a smaller roll minimum, or a tighter staff, readout or banner below about 760 px height (`max-height` media query). Add 360x740 to the size check in e2e/smoke.e2e.ts.

## Comments

Resolved. src/app/screens/practice.ts: new block `(max-width: 959px) and (orientation: portrait) and (max-height: 760px)` with the staff canvas 96 px instead of 112 px (saves 16 px). The roll minimum (96 px) stays. Measured with Playwright (real layout, with and without sections, with and without the note banner): at 360x740 scrollHeight 740 = viewport in all four cases (play row bottom at 724 px; roll canvas 166 / 106 / 142 / 82 px, sections plus banner 82 px, before 76 px with 10 px overflow). 390x844 (844) and 412x915 (915) unchanged, numbers as before (roll 254 / 194 / 230 / 170 and 325 / 265 / 301 / 241). Sections: the chips scroll 5 px sideways at 360 wide. 360x740 and the other sizes added to the size check in e2e/smoke.e2e.ts; spec prose in specs/screen-practice.spec.md (Upright phone).