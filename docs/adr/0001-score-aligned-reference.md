# Score-aligned reference melody instead of an extracted pitch track

The first PRD scored the singer against a pitch curve extracted from the recording (backing subtracted, pYIN). The design needs discrete notes, syllables, bars and roles, which a pitch curve cannot give, and the extracted curve is noisy where instruments leak through. We decided (2026-10-27) that the reference is the transcribed score aligned to the recording: a note list with pitch, start, end, syllable, role and phrase. Audio pitch extraction remains an admin-side aid for alignment and verification only.

## Consequences

- Every song needs a transcribed score before it can be published. Five of ten songs still lack one.
- Scoring is per note, not per frame, and phrases exist as a unit.
- The subtraction and neural pitch tools stay in `tools/` but never ship to the client.
