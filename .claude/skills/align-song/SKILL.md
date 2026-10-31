---
name: align-song
description: Align a song's score to its recording and write web/data/NN.json with lyrics, roles and phrases. Use when asked to align a song ("align 04") or to re-align after a score change.
---

# Align a song

Runs the score → recording → `web/data/NN.json` chain for one song `NN`. Per-song settings live in the **song table** below; a song missing there needs its form and roles from the user first (ask once, then add a row).

Python: `tools/.venv/Scripts/python.exe -I -X utf8`. Background and options: `docs/pipeline.md` sections 3c–4 and 7.

## Steps

1. **Import** the edited score:
   `tools/score_from_musicxml.py scores/angepasst/NN.musicxml work/score/NN_score.json`
   Done when it prints the expected sections (one per form name).

2. **Align** with the row's settings:
   `tools/align_score.py work/score/NN_score.json work/pitch/NN.json work/pitch/NN_aligned.json --bpm B --snap --form "..."`
   Done when every form block printed one line, mean cost ≤ 0.15 and the implied tempo agrees across blocks. Lines `block at …: search found X, form says Y` are expected for near-identical sections (Strophe / Strophe 3). A `found order` or `found N blocks` exit means the form or score is wrong: report it, do not loosen the form.

3. **Review** the aligned notes: per block (section, pass) the first lyrics and the role set, and all `snapped` notes. A snap that repeats at the same bar/beat in several blocks is a score error: name bar, beat, syllable, score note and sung note to the user.

4. **Write `web/data/NN.json`**. `web/data/NN.json` holds editor corrections (`work/edits/NN*` exist when the editor saved some); overwriting drops them, so with edits present ask first. Back up the old file to `work/old/web-data-<date>/`, then write the aligned JSON, carrying `spec` over from the old file.

5. **Phrases**: `tools/phrases.py NN`. When the song's DOCX holds only scans (no text), set `phraseStart: true` first on every note at the row's phrase starts (bar, beat), then run `phrases.py`. Done when every note has `phrase` and `role`.

Packing is a separate request (`./mp.ps1 pack`, after syncing `web/data/NN.json` into `work/pack-root`).

## Song table

Bars are MusicXML measure numbers (1-based), beats from the bar start in quarters.

| Song | Settings | Form (section:role, sung order) | Phrase starts (bar, beat) |
|---|---|---|---|
| 04 | `--bpm 113 --snap` | `Refrain:anna,Strophe:anna,Refrain:chor,Strophe:anna,Refrain:chor,Strophe 3:anna,Refrain:chor,Refrain:chor` | (1,.5) (2,3.5) (5,.5) (7,.5) (9,.5) (11,.5) (13,.5) (15,.5) (17,.5) (20,.5) (22,.5) (24,.5) (26,.5) |
