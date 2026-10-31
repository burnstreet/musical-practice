---
name: align-song
description: Align a song's score to its recording and write web/data/NN.json with lyrics, roles and phrases. Use when asked to align a song ("align 04") or to re-align after a score change.
---

# Align a song

Runs the score → recording → `web/data/NN.json` chain for one song `NN` of a production. Work in the production repo (the content root, e.g. `../weihnachtsmusical-2026-content`); all paths below are relative to it. Per-song settings live in the production's **song table** (`docs/song-table.md` there); a song missing there needs its form and roles from the user first (ask once, then add a row).

Tools: `./mp.ps1 tool <name> [args]` in the production repo runs `tools/<name>.py` of the engine with the production as working directory. Background and options: `docs/pipeline.md` of the engine, sections 3c–4 and 7.

## Steps

1. **Import** the edited score:
   `./mp.ps1 tool score_from_musicxml scores/angepasst/NN.musicxml work/score/NN_score.json`
   Done when it prints the expected sections (one per form name).

2. **Align** with the row's settings:
   `./mp.ps1 tool align_score work/score/NN_score.json work/pitch/NN.json work/pitch/NN_aligned.json --bpm B --snap --form "..."`
   Done when every form block printed one line, mean cost ≤ 0.15 and the implied tempo agrees across blocks. Lines `block at …: search found X, form says Y` are expected for near-identical sections (Strophe / Strophe 3). A `found order` or `found N blocks` exit means the form or score is wrong: report it, do not loosen the form.

3. **Review** the aligned notes: per block (section, pass) the first lyrics and the role set, and all `snapped` notes. A snap that repeats at the same bar/beat in several blocks is a score error: name bar, beat, syllable, score note and sung note to the user.

4. **Write `web/data/NN.json`**. `web/data/NN.json` holds editor corrections (git shows them; `work/edits/NN*` exist when the editor saved some); overwriting drops them, so with uncommitted edits present ask first. Then write the aligned JSON, carrying `spec` over from the old file.

5. **Phrases**: `./mp.ps1 tool phrases NN`. When the song's DOCX holds only scans (no text), set `phraseStart: true` first on every note at the row's phrase starts (bar, beat), then run `phrases`. Done when every note has `phrase` and `role`.

Packing is a separate request: the production's CI packs on push; locally `./mp.ps1 pack`. Both read `web/data/` as written here.
