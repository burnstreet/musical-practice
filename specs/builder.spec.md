---
name: Builder
description: Python pipeline end. Phrase derivation, role painting in the editor, completeness check, encryption and packing into content/.
targets:
  - ../tools/pack.py
  - ../tools/phrases.py
  - ../web/app.js
---

# Builder

Admin runs locally. Inputs: aligned song JSON (`web/data/NN.json`, output of `align_score.py`), stems in `web/data/`, Demucs output in `work/separated/`, lyrics DOCX in `sources/text/`, config `sources/config.json`. Output: `content/` (manifest + encrypted blobs) and a report.

```
python tools/phrases.py NN              # phrase index per note, from DOCX
python tools/pack.py [--strict] [--out content]   # password from env PITCH_PASSWORD
```

Config `sources/config.json` (gitignored):

```json
{
  "roles": [ { "id": "maria", "name": "Maria", "sings": true } ],
  "songs": [ { "id": "08", "number": 8, "title": "…", "backing": "playback", "bpm": 93, "key": "F", "playbackOffsetSec": 0.0 } ]
}
```

`backing`: `playback` (aligned playback file) or `demucs` (`work/separated/NN_backing.mp3`). `playbackOffsetSec` from `align_check.py`: positive = playback starts later than mix.

## Phrases (`tools/phrases.py`)

- Reads lyric lines from the DOCX, ignores empty lines and lines without letters. Normalises: lower-case, strip punctuation and hyphens, join syllables.
- Walks note syllables in order. A line matches when its normalised text equals the concatenated normalised syllables of the next k notes. Matched notes get `phrase` = line counter. Repeated sections (notes with `repeat` or second pass) match the same line again.
- A note with `phraseStart: true` (set in editor) starts a new phrase. Flags win over DOCX matching: when any note has the flag, DOCX is not consulted.
- Unmatched notes keep no `phrase`. Script prints the first unmatched syllable and exits 1.
  `[@test] ../tools/tests/steps_phrases.py`

```gherkin
Feature: Phrase derivation
  Scenario: lines match syllable runs
    Given note syllables "Sin-ge mit" then "hö-re zu" as six notes
    And lyric lines "Singe mit," and "höre zu!"
    When I derive phrases
    Then notes 1-3 get phrase 0 and notes 4-6 get phrase 1

  Scenario: manual flags win
    Given six notes where note 4 has phraseStart true
    And lyric lines that would split after note 2
    When I derive phrases
    Then notes 1-3 get phrase 0 and notes 4-6 get phrase 1

  Scenario: unmatched syllable reported
    Given note syllables "la la lu" and lyric lines "la la la"
    When I derive phrases
    Then the script exits 1 and prints "lu"
```

## Editor additions (`web/app.js`)

- Role painting: with notes selected, a role dropdown (global list from `sources/config.json`, served by `serve.py` at `/config.json`) and button "Rolle setzen" set `role` on every selected note. Saved via existing save path.
- Phrase flag: button "Phrasenanfang" toggles `phraseStart` on the selected note. Piano roll draws a vertical marker at flagged notes.
- Song JSON `roles` list stays derived: builder recomputes from notes.
  `[@test] ../tests/steps/editor.steps.ts`

```gherkin
Feature: Editor role painting
  Scenario: set role on selection
    Given a loaded song with notes 1-4 and notes 2-3 selected
    When I choose role "chor" and press "Rolle setzen"
    Then notes 2 and 3 have role "chor" and notes 1 and 4 are unchanged

  Scenario: toggle phrase start
    Given note 3 selected without phraseStart
    When I press "Phrasenanfang"
    Then note 3 has phraseStart true
    When I press "Phrasenanfang" again
    Then note 3 has no phraseStart
```

## Completeness check (`pack.py`)

Song is complete when all hold:

1. Song JSON exists with at least one note.
2. Every note has `role` in config roles and `phrase`.
3. Phrases contiguous from 0.
4. Voices stem exists. Backing source exists per config.
5. Stem lengths equal within 20 ms after offset trim.

- Incomplete song: listed in `content/report.txt` with the first failing rule and detail (note index, missing file). Not packed. Exit 0. With `--strict` exit 1 when any song incomplete.
  `[@test] ../tools/tests/steps_pack.py`

```gherkin
Feature: Completeness
  Scenario: note without role blocks the song
    Given song 08 whose note 5 has no role
    When I run pack
    Then report.txt lists "08: rule 2, note 5 missing role"
    And content has no files for song 08
    And the exit code is 0

  Scenario: strict mode fails
    Given song 08 incomplete
    When I run pack with --strict
    Then the exit code is 1
```

## Stems

- Voices = full mix, re-encoded mono 128 kbps if source differs.
- Backing `playback`: trim or pad playback by `playbackOffsetSec` so sample 0 aligns with mix, cut or pad to mix length.
- Backing `demucs`: take `work/separated/NN_backing.mp3` as is, check length.
  `[@test] ../tools/tests/steps_pack.py`

```gherkin
Feature: Stem preparation
  Scenario: playback trimmed by offset
    Given mix of 10.0 s and playback of 10.3 s with playbackOffsetSec 0.3
    When I run pack
    Then the backing stem is 10.0 s and its sample 0 equals playback sample at 0.3 s
```

## Packing

- Library and song files: JSON, UTF-8, no whitespace. Encrypt per content-format. File id from plaintext hash. Write `content/<id>.bin`.
- Stems: encrypt the MP3 bytes the same way.
- Manifest per content-format. `totalBytes` = sum of `.bin` sizes.
- Remove `.bin` files in `content/` that no longer appear in the manifest.
- Same inputs twice: same file ids, same manifest except `build`.
- Password: env `PITCH_PASSWORD`. Missing: exit 2 with message. Salt: `content/salt` persisted across builds; `--new-salt` regenerates (forces password re-entry on all devices).
  `[@test] ../tools/tests/steps_pack.py`

```gherkin
Feature: Packing
  Scenario: round trip
    Given one complete song and PITCH_PASSWORD "test"
    When I run pack
    Then manifest.json lists songCount 1 and 4 files
    And decrypting the library with "test" yields the song with id "08"
    And decrypting with "wrong" fails

  Scenario: stable ids
    Given one complete song packed once
    When I run pack again with unchanged inputs
    Then every file id in the manifest is unchanged

  Scenario: orphan removed
    Given content/ holds a file "0000000000000000.bin" not in the inputs
    When I run pack
    Then that file is gone
```
