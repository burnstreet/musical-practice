---
name: Script parser
description: One-off conversion of the script DOCX into web/data/script.json. Scene, song cue, speaker and direction rules, report, overwrite guard.
targets:
  - ../tools/script_parse.py
---

# Script parser

Admin runs it once per production. Afterwards `web/data/script.json` is the source and is kept in the editor. Paths relative to the content root, as in builder.

```
python tools/script_parse.py <docx> [--force] [--direction-color 0070C0] [--drop-color 00B050]
```

- Reads paragraphs in order with python-docx. Text = all runs joined, whitespace runs collapsed to one space, trimmed. Empty paragraphs skipped.
- Colour of a paragraph = font colour of its first run with text (`None` when unset or auto).
- Speaker names: role `name` and `aliases` from `sources/config.json`, roles with `speaks: true`, compared case-insensitively.

Rules per paragraph, first match wins:

1. Before the first scene header: ignored (title, cast list, props).
2. `^Szene\s+(\d+)\s*[-–:]?\s*(.*)$`: new scene, id `s<n>`, title = rest (may be empty). Resets the current speaker.
3. `^Lied\s+(\d+)\s*:`: song item, `songId` = the number zero-padded to two digits. Any colour.
4. Colour = drop colour (technical cue, props): dropped.
5. Colour = direction colour: direction item.
6. `^([^:]{1,30}):\s*(.*)$` and group 1 is a speaker name: that role becomes the current speaker. Rest non-empty: line item of that role. Rest empty: the next paragraph that rule 7 takes is the line.
7. Otherwise, with a current speaker in this scene: line item of the current speaker (continuation, one item per paragraph). Without one: dropped (props list under a scene header).

- Rule 6 pattern matches but the name is no speaker: warning `maybe speaker "<name>" at paragraph <n>`, the paragraph goes through rule 7.
- Song number not in config songs: warning, item kept.
- Item ids: random, 4 chars `[a-z0-9]`, unique.
- Writes `web/data/script.json` (UTF-8, 2-space indent). File exists and no `--force`: exit 1, file untouched.
- Report on stdout: lines per role, items per scene, every dropped paragraph (`<n>: <first 40 chars>`), every warning. The Admin reviews it; nothing is lost silently.
- No speaking role in config: exit 1 with message.
  `[@test] ../tools/tests/steps_script_parse.py`

Fixture: a DOCX built in the test with python-docx, invented text only.

```gherkin
Feature: Script parsing
  Scenario: scenes, lines, directions, songs
    Given a config with speaking roles erzaehler1 "Erzähler 1" and anna "Anna" and song "01"
    And a DOCX with paragraphs "Titel", "Anna Darstellerin", "Szene 1 - Im Zimmer", "Stuhl, Schal"
    And green paragraphs "Lied 1: Schnee", "1+4 Anna & 2+3 Chor"
    And a blue paragraph "Sie sitzt am Fenster."
    And paragraphs "Erzähler 1: Es schneit.", "Es schneit sehr.", "Anna:", "Wir gehen gleich"
    When I parse it
    Then scene s1 has title "Im Zimmer"
    And its items are song "01", direction "Sie sitzt am Fenster.", line erzaehler1 "Es schneit.", line erzaehler1 "Es schneit sehr.", line anna "Wir gehen gleich"
    And the report lists "Stuhl, Schal" and "1+4 Anna & 2+3 Chor" as dropped

  Scenario: unknown speaker is a warning, not a role
    Given a config with speaking role anna "Anna"
    And a DOCX with "Szene 1", "Anna: Hallo." and "Sie sagte: Komm."
    When I parse it
    Then scene s1 has line anna "Hallo." and line anna "Sie sagte: Komm."
    And the report warns maybe speaker "Sie sagte"

  Scenario: alias matches
    Given a config with speaking role onkel "Onkel" with alias "Hirte Onkel"
    And a DOCX with "Szene 1" and "Hirte Onkel: Ruhe!"
    When I parse it
    Then scene s1 has line onkel "Ruhe!"

  Scenario: existing script kept
    Given web/data/script.json exists
    When I parse a DOCX without --force
    Then the exit code is 1 and the file is unchanged

  Scenario: ids unique
    Given a DOCX with 300 line paragraphs
    When I parse it
    Then all item ids are distinct and match [a-z0-9]{4}
```
