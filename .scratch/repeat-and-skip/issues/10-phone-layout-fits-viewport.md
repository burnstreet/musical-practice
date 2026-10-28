# Practice screen: phone layout fits the viewport

Status: ready-for-agent
Blocked by: none
Spec: ../spec.md

Found on a real phone (about 412x915 CSS px, Android Chrome): the practice screen is about 990 px tall (about 1050 px with the note banner), while the visible height is about 780-840 px. The play row (play, tempo, mic) is cut off at the bottom and the page scrolls. The selector row, skip row and section segments from tickets 05-07 added about 180 px.

Causes (src/app/screens/practice.ts):
- `:host` uses `min-height: 100vh` (:97, also shell.ts:27). On Android, `vh` is the large viewport, measured with the browser toolbar hidden. Only the landscape query uses `100dvh` (:130, :134).
- The transport is pushed to the bottom (`align-self: end`, :150), so it ends below the visible edge.
- The repeat chips wrap to 2 rows at 372 px width (:155).
- The skip row is its own 44 px row (:159).
- The staff (112 px) and roll (188 px) canvases have fixed heights.

Goal: at 390x844 and 412x915 in portrait, the whole screen, including the play row, is visible without scrolling, with no note banner and with one.

Proposed, largest saving first:
- Put the chips on one line: 32 px chips, or a horizontally scrolling row with no wrap.
- Move previous and next own entry into the play row beside play, and put *Intro überspringen* with the chips or the status line.
- Use `100dvh` in portrait too, and let the roll take the leftover height (`1fr`, as the landscape query does).
- Smaller trims: top padding 28 → 12 px, main button 72 → 60 px, and possibly fold the voicetrack row into the header.

Check against the board *Handy 3a* in design/repeat-and-skip/. Verify in the e2e test or by hand at 390x844 and 412x915.
