# 16: Staff and piano roll canvases

**What to build:** The two Canvas 2D drawings on the practice screen: a treble-clef staff, 4 bars per page, key signature from the song, accidentals outside the key, my notes in accent and others in `--other`, syllables, role names, current-note highlight and page flip; and the scrolling piano roll with semitone rows, 5 s window, playhead at 1/3, target bars with elapsed fill, dashed other-role notes, and the folded sung pitch line with a dot at the newest frame.

**Blocked by:** 15 (practice screen)

**Status:** ready-for-agent

Spec: `specs/screen-practice.spec.md` → Staff, Piano roll. Decisions Q19, Q32. Artboards `design/Main.dc.html`, `design/MainDesktop.dc.html` for the look.

Testing: no Gherkin scenarios cover drawing. Add unit tests for the pure layout helpers only (staff position of a midi in a key, accidental needed or not, page index for a bar, roll row range from notes in view, folding a frame into the nearest target octave). Drawing calls are not tested. Verify visually with `npm run dev` and a synthetic song if a browser is available; otherwise state that it was not visually checked.

- [ ] Helpers tested; `npm test` green.
- [ ] Canvases scale with `devicePixelRatio` and resize with the element.
- [ ] Spec constants respected: 1.5 s behind / 3.5 s ahead, min 10 rows, ±2 semitone margin, 4 px white line with dark outline.
