---
name: Script format
description: The spoken script of a production for the dialog trainer. Source file the parser writes and the editor edits, line hash and audio files, packed script file, library and role additions.
targets:
  - ../src/core/content.ts
  - ../tools/script_format.py
  - ../tools/pack.py
---

# Script format

One script per production. Source `web/data/script.json` in the production repo (plaintext, private). Packed as one encrypted script file plus one encrypted audio file per line. Shared by TypeScript (`parseScript`) and Python (`script_format.py`: load, validate, `line_hash`).

```ts { .api }
export function parseScript(json: unknown, roles: Role[]): Script   // throws ContentError
```

## Source file `web/data/script.json`

```json
{
  "scenes": [
    { "id": "s1", "title": "Im Zimmer", "items": [
      { "id": "k3f9", "type": "direction", "text": "Sie sitzt am Fenster." },
      { "id": "p0x2", "type": "line", "role": "erzaehler1", "text": "Es schneit.", "say": "Es schneit." },
      { "id": "z8m1", "type": "song", "songId": "01" }
    ] }
  ]
}
```

- Scene: `id` = `s` plus the scene number from the DOCX, unique. `title` string, may be empty.
- Item `id`: 4 chars `[a-z0-9]`, unique in the file. Stable: edits keep it, split and insert make new ones, nothing is renumbered.
- `type` `line`: `role` = role id with `speaks: true`, `text` non-empty. `say` optional: text the TTS speaks instead of `text` (pronunciation of names). Display always uses `text`.
- Inline direction: `[…]` inside a line's `text` (no nesting). Shown as a direction inside the line, never spoken. Spoken text = `say`, else `text` without its inline directions, whitespace collapsed, trimmed. A line whose spoken text is empty is rejected.
- `type` `direction`: `text` non-empty. Stage direction, shown, never spoken.
- `type` `song`: `songId` = a song id of the config. Shown as song cue.
- Order of scenes and items = order of the play.
- `script_format.load` rejects: duplicate scene or item id, unknown `type`, a line with empty text or a role that is not a speaking role of the config, a song item with an unknown song id.
  `[@test] ../tools/tests/steps_script.py`

```gherkin
Feature: Script source
  Scenario: valid script loads
    Given a config with speaking role erzaehler1 and song "01"
    And a script with scene s1 holding a direction, a line of erzaehler1 and a song item "01"
    When I load the script
    Then I get one scene with three items

  Scenario: duplicate item id rejected
    Given a script with two items of id "aaaa"
    When I load the script
    Then loading fails naming "aaaa"

  Scenario: line of a non-speaking role rejected
    Given a config where role chor has speaks false
    And a script with a line of chor
    When I load the script
    Then loading fails naming "chor"
```

## Line hash and audio files

- `line_hash(line, voice)` = first 16 hex chars of SHA-256 over the UTF-8 bytes of canonical JSON `{"text": <spoken text>, "voice": <voice of the role>}` (keys sorted, no whitespace, non-ASCII kept). Engines `openai` and `openai-realtime` play the inline directions (see tts-renderer): there the JSON also holds `"direction": <direction(line)>` when that is not empty.
- `direction(line)` = the contents of the inline directions in `text`, in order, joined with `"; "`, whitespace collapsed. Empty when none.
- Audio of a line: `web/data/script/<hash>.mp3`. A line has audio when that file exists. Changing text, `say` or the role's voice changes the hash: the old file no longer counts.
- Audio: MP3, mono, 64 kbps, 44.1 kHz, silence at both ends trimmed to at most 100 ms.
- Python only. The editor asks the server, never hashes in JS.
  `[@test] ../tools/tests/steps_script.py`

```gherkin
Feature: Line hash
  Scenario: say wins over text
    Given a line with text "Hallo Jo" and say "Hallo Joh"
    Then its hash equals the hash of a line with text "Hallo Joh" and the same voice

  Scenario: inline directions are not spoken
    Given a line with text "Da hinten. [zeigt nach rechts] Komm." and no say
    Then its hash equals the hash of a line with text "Da hinten. Komm." and the same voice

  Scenario: voice change changes the hash
    Given a line hashed with voice {"engine":"xtts","speaker":"a"}
    When the role's voice becomes {"engine":"xtts","speaker":"b"}
    Then the hash differs

  Scenario: inline directions count for engine openai
    Given a line with text "[fleht] Bitte. [leise] Nur heute." and no say
    Then its direction is "fleht; leise"
    And with voice {"engine":"openai"} its hash differs from the hash of a line with text "Bitte. Nur heute."
    And with voice {"engine":"xtts"} its hash equals the hash of a line with text "Bitte. Nur heute."
```

## Config additions (`sources/config.json`)

```json
{ "roles": [ { "id": "erzaehler1", "name": "Erzähler 1", "sings": false, "speaks": true,
               "aliases": ["Erzähler 1"], "voice": { "engine": "xtts", "speaker": "Ana Florence" } } ] }
```

- `speaks` optional, default false. `aliases` optional: speaker names as written in the DOCX, matched case-insensitively besides `name`. `voice`: engine and its settings, see tts-renderer. Required for every speaking role before render or pack.

## Packed form

- Library (encrypted JSON) gets an optional field `script`: `{ "file": "<id>", "audio": ["<id>", …] }`, every audio file id once, in play order. Roles carry `speaks` (boolean, default false when missing).
- Script file (encrypted JSON): the source with `say` removed and every line given `audio` = file id of its encrypted MP3.
- Manifest unchanged, `format` stays 2. `totalBytes` and `files` include the script files. An app without dialog support ignores `script`.
- `parseLibrary` keeps `script` when present and rejects one whose ids do not match `^[0-9a-f]{16}$`. `parseScript` rejects what `load` rejects (roles from the library) and a line without a valid `audio` id.
  `[@test] ../tests/steps/content-format.steps.ts`

```gherkin
Feature: Packed script
  Scenario: library with script parses
    Given a library JSON with script file "0123456789abcdef" and audio ["00000000000000aa"]
    When I parse it as a library
    Then library.script.file is "0123456789abcdef"

  Scenario: library without script parses
    Given a library JSON without a script field
    When I parse it as a library
    Then library.script is undefined

  Scenario: role speaks defaults to false
    Given a library JSON with role maria without speaks
    When I parse it as a library
    Then role maria has speaks false

  Scenario: line without audio rejected
    Given a script JSON with a line of erzaehler1 without audio
    When I parse it as a script
    Then parsing fails with ContentError "audio"
```
