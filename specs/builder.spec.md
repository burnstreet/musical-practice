---
name: Builder
description: Python pipeline end. Phrase derivation, section detection, role painting and section editing in the editor, completeness check, encryption and packing into content/.
targets:
  - ../tools/pack.py
  - ../tools/phrases.py
  - ../tools/sections.py
  - ../web/edit-ops.js
  - ../web/app.js
---

# Builder

Admin runs locally. Inputs: aligned song JSON (`web/data/NN.json`, output of `align_score.py`), stems in `web/data/`, Demucs output in `work/separated/`, lyrics DOCX in `sources/text/`, config `sources/config.json`. Output: `content/` (manifest + encrypted blobs) and a report.

```
python tools/phrases.py NN              # phrase index per note, from DOCX
python tools/sections.py NN             # sections of a song, written into web/data/NN.json
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

## Sections (`tools/sections.py`)

Pure function `detect_sections(notes, bars)` plus a script that writes the result to the song JSON. Needs phrases, so it runs after `phrases.py`.

- Line text of a phrase = its notes' syllables, normalised as in Phrases (lower-case, no punctuation or hyphens, joined).
- Refrain: a run of two or more consecutive phrases whose sequence of line texts occurs again elsewhere in the song. Every occurrence of the run is its own section, named `Refrain`, `Refrain 2`, … in song order. One recurring phrase alone is no refrain.
- Strophe: each stretch of phrases between refrains, before the first or after the last, named `Strophe 1`, `Strophe 2`, … in song order.
- No refrain found: no sections (`[]`). Intro and outro without notes are never in a section.
- Snapping: the first section starts on the bar line at or before its first note, the last ends on the bar line at or after its last note, every other boundary lies on the bar line nearest to the first note of the following section and is shared by both neighbours. Sections are contiguous inside the sung stretch.
- Output entry: `{name, start, end}` in seconds, sorted.
- Stored sections win: when the song JSON already has a `sections` key (also `[]`), `sections.py` and `pack.py` leave it untouched. Only the editor's re-detect replaces it, when the Admin asks.
- `pack.py` writes the song file with its `sections` as stored; a song without the key gets the sections detected at pack time, as `sections.py` would write them (`[]` when no refrain recurs). The song JSON itself is not changed. The manifest `format` is 2.

## Editor additions (`web/app.js`)

- Role painting: with notes selected, a role dropdown (global list from `sources/config.json`, served by `serve.py` at `/config.json`) and button "Rolle setzen" set `role` on every selected note. Saved via existing save path.
- Phrase flag: button "Phrasenanfang" toggles `phraseStart` on the selected note. Piano roll draws a vertical marker at flagged notes.
- Song JSON `roles` list stays derived: builder recomputes from notes.
- Bars and sections view: staff (same drawing as the singer, shared through a second build entry) with syllables, phrase band (number, line text, flag at each phrase start), section band, and a smaller piano roll on one bar grid: one page of the staff is the roll window: the roll's bar lines sit under the staff's, numbered as on the staff, time runs linear inside each bar, and a seconds scale stays on top (the staff is spaced by onsets). A page holds the playhead and shows the bar count the zoom picks (1, 2, 3, 4, 6, 8, 12 or 16, default 4; squeezed where its syllables do not fit); previous/next seek to the neighbouring page, so staff, bands and roll turn together. Without the staff view the zoom picks the roll window in seconds. Click on a phrase, a section or a staff note, or focus a row of the section list, selects it and highlights its notes in the roll; a selection with no note on the shown page turns the view to the bar of its first note. The section list sits in its own panel, visible as soon as a song is loaded (not only in edit mode); its bar fields stay disabled until the bar grid has arrived. Phrases in the band: split at `phraseStart` flags when any note has one (as the builder does), else grouped by `phrase`; line text = the syllables joined by spaces. Each note sits in the grid bar nearest its start minus its beat; the staff's time signature and tempo use the song's beats per bar from `sources/config.json` (default 4), as the bar grid does. The view needs the bar grid from `/detect-sections` and the shared build (`./mp.ps1 build` writes `web/lib/editor-view.js`); without either the editor works as before. Drawing not unit-tested.
- Phrases stay editable only through `Phrasenanfang`.
- Section list: one row per section with name, from bar, to bar (bar numbers as on the staff, first bar 1, both inclusive), delete, and an add button. Edits go through the pure ops in `web/edit-ops.js` and save with the existing save path (`sections` in the song JSON). A section's `start` = start second of its from bar, its `end` = start second of the bar after its to bar (end of the last bar for the last bar). Edges are always on bar lines.
- Re-detect button `Abschnitte neu erkennen`: after a confirmation, posts the current notes to the editor server (`serve.py`, route `/detect-sections`), which first re-derives each note's `phrase` from the `phraseStart` flags (`derive_phrases`, as the builder does; no flags: stored phrases stay), then calls `detect_sections` and answers with the sections and the bar grid (`{sections, bars}`, bar start seconds, the grid for the section ops); the editor replaces its list with them (saved only on save). Detection is never duplicated in JS. Cancel keeps the list.
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

Feature: Editor sections
  Scenario: add a section by bar numbers
    Given a song with bars every 2 s over 20 bars and no sections
    When I add the section "Strophe 1" from bar 3 to bar 5
    Then the sections are "Strophe 1" [4.0,10.0]

  Scenario: last bar ends at the song end
    Given bars every 2 s over 20 bars with the song ending at 40.0
    When I add the section "Outro" from bar 19 to bar 20
    Then the section is [36.0,40.0]

  Scenario: sections stay sorted
    Given a section "B" from bar 9 to bar 12
    When I add the section "A" from bar 1 to bar 4
    Then the sections are "A" then "B"

  Scenario: rename
    Given a section "Strophe 1"
    When I rename it to "Bridge"
    Then it is named "Bridge" and its times are unchanged

  Scenario: re-bar snaps to bar lines
    Given a section "Strophe 1" [4.0,10.0]
    When I set it from bar 2 to bar 6
    Then it is [2.0,12.0]

  Scenario: delete
    Given sections "A" and "B"
    When I delete "A"
    Then only "B" is left

  Scenario: overlap refused
    Given a section "A" [4.0,10.0]
    When I add "B" from bar 4 to bar 6
    Then the sections are unchanged and the editor shows an error

  Scenario: bar range backwards refused
    Given a song with 20 bars
    When I add a section from bar 6 to bar 3
    Then the sections are unchanged and the editor shows an error

  Scenario: re-detect replaces the list
    Given sections "A" and "B" and detected sections "Refrain" and "Strophe 1" from the builder
    When I confirm "Abschnitte neu erkennen"
    Then the sections are "Refrain" and "Strophe 1"

  Scenario: re-detect cancelled
    Given sections "A" and "B"
    When I cancel the confirmation of "Abschnitte neu erkennen"
    Then the sections are "A" and "B"

  Scenario: the list shows bar numbers
    Given a section "Refrain" [4.0,12.0]
    Then its row reads from bar 3 to bar 6

  Scenario: a section ending at the song end reads the last bar
    Given bars every 2 s over 20 bars with the song ending at 40.0
    When I add the section "Outro" from bar 19 to bar 20
    Then its row reads from bar 19 to bar 20

Feature: Editor view
  Scenario: phrase band from the phrase flags
    Given notes "Habt", "ihr", "Platz,", "nein" where note 3 has phraseStart
    Then the phrase band shows "1 Habt ihr" and "2 Platz, nein"

  Scenario: phrase band from derived phrases without flags
    Given notes "Habt", "ihr", "Platz,", "nein" with phrases 0, 0, 0, 1
    Then the phrase band shows "1 Habt ihr Platz," and "2 nein"

  Scenario: staff bars come from the bar grid
    Given bars every 2 s, a note at 3.98 s on beat 0 and a note at 5.45 s on beat 3
    Then the staff puts both notes in bar 3

  Scenario: staff time signature from the song
    Given a song in 3/4 with bars every 1.5 s and a note at 4.6 s on beat 2
    Then the staff reads 3/4 at 120 bpm and puts the note in bar 3

  Scenario: the roll runs on the staff's bar lines
    Given staff bar lines at x 60, 300 and 540 for 0 s, 2 s and 4 s
    Then 3 s is at x 420 on the roll and x 180 is 1 s

  Scenario: a selection on another page turns to it
    Given bars every 2 s, a page of bars 1 to 4 and selected notes in bars 6 and 7
    Then the view turns to 10 s

  Scenario: a selection on the page keeps the page
    Given bars every 2 s, a page of bars 1 to 4 and selected notes in bars 3 and 6
    Then the view stays on the page
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

- Song file notes: `syllable` from the input `syllable` or `lyric` (`""` when none); `spoken: true` copied from an input note that has it (rap, see content-format), left out otherwise; `slur: true` and `tie: true` likewise.
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

Section detection and stored sections.
  `[@test] ../tools/tests/steps_sections.py`

```gherkin
Feature: Section detection
  Scenario: refrains and strophes
    Given bars every 2 s and phrases with texts a, b, x, a, b, y at [4.5,7.5], [8.5,11.5], [12.5,15.5], [20.5,23.5], [24.5,27.5], [28.5,31.5]
    When I detect sections
    Then I get "Refrain" [4,12], "Strophe 1" [12,20], "Refrain 2" [20,28] and "Strophe 2" [28,32]

  Scenario: one recurring phrase is no refrain
    Given phrases with texts a, b, c, a
    When I detect sections
    Then I get no sections

  Scenario: no repeated lines
    Given phrases with texts a, b, c, d
    When I detect sections
    Then I get no sections

  Scenario: intro and outro are no section
    Given bars every 2 s, an intro until 8.0, phrases a, b, x, a, b starting at 8.5 and an outro after the last note
    When I detect sections
    Then the first section starts at 8.0 and the last ends on the bar line after the last note

  Scenario: text is normalised
    Given phrase texts "Sin-ge mit," and "singe mit" at both occurrences of a two-phrase run
    When I detect sections
    Then both occurrences are refrains

  Scenario: boundaries are shared and on bar lines
    Given the detected sections of the first scenario
    Then every section start and end is a bar start and each end equals the next start

  Scenario: no empty section
    Given bars every 2 s and phrases a, b, x, a, b, then a short phrase y at [19.6,19.9]
    When I detect sections
    Then I get "Refrain" [0,8], "Strophe 1" [8,12] and "Refrain 2" [12,20]

Feature: Stored sections
  Scenario: pack keeps stored sections
    Given a complete song whose JSON has sections "Refrain" [4,12]
    When I run pack
    Then the decrypted song file has the sections unchanged and the manifest format is 2

  Scenario: stored empty list is kept
    Given a complete song whose JSON has sections []
    When I run sections.py for it
    Then the JSON still has sections []

  Scenario: song without sections key gets detected ones from sections.py
    Given a complete song with repeated lines and no sections key
    When I run sections.py for it
    Then the JSON has the detected sections

  Scenario: pack detects sections when the key is missing
    Given a complete song with repeated lines and no sections key
    When I run pack
    Then the decrypted song file has the detected sections

  Scenario: pack keeps a stored empty list
    Given a complete song with repeated lines whose JSON has sections []
    When I run pack
    Then the decrypted song file has sections []
```
