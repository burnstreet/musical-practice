---
name: Content format
description: Files the builder writes and the app reads. Public manifest, encrypted library, encrypted song note files, encrypted audio stems. Crypto parameters.
targets:
  - ../src/core/content.ts
  - ../tools/pack.py
---

# Content format

Builder output folder `content/` next to the app. Static files only. One public manifest, all else encrypted. Shared by TypeScript (`parseManifest`, `parseLibrary`, `parseSong`) and Python (`pack.py`).

```ts { .api }
export function parseManifest(json: unknown): Manifest       // throws ContentError
export function parseLibrary(json: unknown): Library         // throws ContentError
export function parseSong(json: unknown): Song               // throws ContentError
export function roleSpans(notes: Note[], roles: RoleId[]): Span[]
```

## Crypto

- Key: PBKDF2-SHA256, 600 000 iterations, 16-byte salt from manifest, 256-bit output.
- Cipher: AES-256-GCM. 12-byte random IV per file, prepended to ciphertext. Tag appended (WebCrypto default).
- Key id: first 16 hex chars of SHA-256(salt). Password change = new salt = new key id.
- File id: first 16 hex chars of SHA-256(plaintext bytes). Stable across builds when content unchanged. File path `content/<id>.bin`.

## Public manifest `content/manifest.json`

Plaintext. Fields:

| field | type | meaning |
|---|---|---|
| `format` | 1 | format version |
| `build` | string | ISO timestamp of the build |
| `keyId` | string | see Crypto |
| `salt` | string | base64, 16 bytes |
| `iterations` | number | PBKDF2 rounds |
| `library` | string | file id of the encrypted library |
| `songCount` | number | songs in library |
| `totalBytes` | number | sum of all file sizes incl. library |
| `files` | `{ [id]: bytes }` | every file in the bundle |

Reveals nothing but sizes and opaque ids.

- `parseManifest` rejects missing fields, `format` other than 1, non-base64 salt, ids not matching `^[0-9a-f]{16}$`.
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Public manifest
  Scenario: valid manifest parses
    Given a manifest JSON with format 1, keyId "0123456789abcdef", a 16-byte base64 salt, iterations 600000, library "fedcba9876543210", songCount 2, totalBytes 300, files {"fedcba9876543210": 100, "00000000000000aa": 200}
    When I parse it as a manifest
    Then I get songCount 2 and totalBytes 300

  Scenario: wrong format version rejected
    Given a manifest JSON with format 2
    When I parse it as a manifest
    Then parsing fails with ContentError "format"

  Scenario: bad file id rejected
    Given a valid manifest JSON whose files contain the id "not-hex"
    When I parse it as a manifest
    Then parsing fails with ContentError "files"
```

## Library (encrypted JSON)

```json
{
  "roles": [ { "id": "maria", "name": "Maria", "sings": true }, { "id": "esel", "name": "Esel", "sings": false } ],
  "songs": [ {
    "id": "08", "number": 8, "title": "…", "durationSec": 135.2,
    "roles": ["maria", "josef", "chor", "wirt"],
    "files": { "voices": "<id>", "backing": "<id>", "notes": "<id>" }
  } ]
}
```

- Role ids: lower-case ASCII, from the global list: `erzaehler1`, `erzaehler2`, `anna`, `mutter`, `engel`, `benjamin`, `roemer`, `hirte`, `josef`, `wirt`, `weihnachtsmann`, `maria`, `esel`, `kuh`, `schaf`, `chor`. Display name per role in the library. The `sings` flag comes from the builder config.
- Songs sorted by `number`. `roles` of a song = roles that have at least one note.
- `parseLibrary` rejects a song whose `roles` names an unknown role id, or whose three file ids are missing.
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Library
  Scenario: song with unknown role rejected
    Given a library JSON with roles [maria] and a song with roles [maria, ghost]
    When I parse it as a library
    Then parsing fails with ContentError "roles"

  Scenario: songs come back sorted by number
    Given a library JSON with songs numbered 3, 1, 2
    When I parse it as a library
    Then song ids come back in order of number 1, 2, 3
```

## Song file (encrypted JSON)

```json
{
  "id": "08", "bpm": 93, "key": "F", "timeSig": [4, 4],
  "bars": [0.0, 2.58, 5.16],
  "notes": [ { "start": 1.21, "end": 1.62, "midi": 67, "syllable": "Sin", "role": "maria", "phrase": 0, "bar": 0, "beat": 1.5, "dur": 0.5 } ],
  "phrases": [ { "index": 0, "label": "Phrase 1", "start": 1.21, "end": 7.9 } ]
}
```

- `bars[i]` = start second of bar i. The intro before the first sung bar gets whole bars counted back from it (as many as fit after 0 s), so the staff shows its rests; `bar` of the notes counts them. `key` = tonic plus `m` for minor (`F`, `Ebm`). `beat` in quarters from bar start, `dur` in quarters.
- Notes sorted by `start`. `end > start`. `midi` integer 36–96. `role` in library roles. `phrase` indexes `phrases`.
- `phrases[i].start` = first note start, `.end` = last note end of that phrase. Contiguous, non-overlapping, sorted.
- `parseSong` rejects unsorted notes, a note whose `phrase` is out of range, a phrase without notes.
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Song file
  Scenario: unsorted notes rejected
    Given a song JSON whose notes start at 2.0 then 1.0
    When I parse it as a song
    Then parsing fails with ContentError "notes"

  Scenario: note pointing at a missing phrase rejected
    Given a song JSON with one phrase and a note with phrase 3
    When I parse it as a song
    Then parsing fails with ContentError "phrase"
```

## Role spans

`roleSpans(notes, roles)` = time ranges where any of `roles` sings. Used by the audio engine for muting.

- Take notes whose role is in `roles`. Merge consecutive notes when the gap is below 0.5 s. Span = [first start, last end].
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Role spans
  Scenario: close notes merge, far notes split
    Given notes for role maria at [1.0,1.5], [1.7,2.0], [3.0,3.4] and a note for josef at [2.1,2.9]
    When I compute role spans for [maria]
    Then I get spans [1.0,2.0] and [3.0,3.4]

  Scenario: two selected roles merge into one timeline
    Given notes for role maria at [1.0,1.5] and for josef at [1.6,2.0]
    When I compute role spans for [maria, josef]
    Then I get spans [1.0,2.0]
```

## Visible notes

`visibleNotes(notes, roles)` = the notes staff, piano roll and session use. The singer always sees one line where they sing. Songs store a duet as two identical notes (same start, end, midi) of two roles.

- My notes (role in `roles`) with the same start, end and midi as an earlier one of mine are dropped.
- Other roles' notes overlapping in time any of my notes are dropped. Elsewhere other roles' notes stay.
- Order kept. No role of `roles` sings in the song: notes unchanged.
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Visible notes
  Scenario: duet in unison shows once
    Given notes maria 67 at [1.0,2.0], josef 67 at [1.0,2.0], maria 69 at [2.0,3.0]
    When I take the visible notes for [maria, josef]
    Then I get maria 67 at [1.0,2.0] and maria 69 at [2.0,3.0]

  Scenario: others hidden where I sing
    Given notes maria 67 at [1.0,2.0], chor 60 at [1.5,2.5], chor 62 at [2.0,3.0], josef 64 at [3.0,4.0]
    When I take the visible notes for [maria]
    Then I get maria 67 at [1.0,2.0], chor 62 at [2.0,3.0] and josef 64 at [3.0,4.0]

  Scenario: no part keeps everything
    Given notes maria 67 at [1.0,2.0], josef 67 at [1.0,2.0]
    When I take the visible notes for [esel]
    Then I get maria 67 at [1.0,2.0] and josef 67 at [1.0,2.0]
```

## Audio stems

- MP3, mono, 128 kbps, 44.1 kHz. Voices = full mix. Backing = aligned playback or Demucs accompaniment.
- Both stems of a song equal in length within 20 ms. Sample 0 of both = same musical instant.
