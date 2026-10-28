# Editor: re-detect sections from the current phrase flags

Status: ready-for-agent
Blocked by: none
Spec: ../spec.md

User story 35 ("re-detect after fixing phrase flags"). The bug:
- Re-detect sends `song.notes` as they are (web/app.js:590).
- tools/sections.py:17-23 groups notes by the stored `phrase` field.
- Toggling *Phrasenanfang* changes only `phraseStart` (web/edit-ops.js:8). `phrase` is recomputed only in tools/phrases.py:43-64, during the build.

So right after the admin fixes phrase flags, the phrase band, which follows the flags (src/editor/view.ts:37-54), and the detection disagree. Detection still works on the old phrases.

Fix: before detecting, the server re-derives `phrase` from the `phraseStart` flags with the builder's phrase derivation. Do not duplicate the logic in the editor. Add a pytest case in tools/tests/test_serve_sections.py: flag a new phrase start, re-detect, and expect the sections to follow the new phrases.
