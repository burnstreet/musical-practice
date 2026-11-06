---
name: Script parser
description: One-off conversion of the script DOCX into web/data/script.json. Scene, song cue, speaker and direction rules, report, overwrite guard.
targets:
  - ../tools/script_parse.py
---

# Script parser

Admin runs it once per production. Afterwards `web/data/script.json` is the source and is kept in the editor. Paths relative to the content root, as in builder.

```
./mp.ps1 tool script_parse <docx> [--force] [--direction-colors 0070C0,00B050] [--song-color 00B050]
```

- Reads paragraphs in order with python-docx. Text = all runs joined, whitespace runs collapsed to one space, trimmed. Empty paragraphs skipped.
- Every coloured text is a direction: blue (stage direction) and green (light, sound, props, song notes) by default. Colour of a run = its font colour (`None` when unset or auto).
- Segments of a paragraph: runs with text grouped into stretches of direction colour and of other colour; whitespace-only runs join the stretch they sit in. Segment text as above. A segment that is empty after trimming is left out.
- Speaker names: role `name` and `aliases` from `sources/config.json`, roles with `speaks: true`, compared case-insensitively.
- Speaker prefix of the first segment (when it is not a direction): a speaker name at its start, followed by `:`, `.`, a tab, or the segment's end. Matched on the raw text before collapsing whitespace.

Rules per paragraph, first match wins:

1. Before the first scene header: ignored (title, cast list, props).
2. `^Szene\s+(\d+)\s*[-–:]?\s*(.*)$`: new scene, id `s<n>`, title = rest (may be empty). Resets the current speaker.
3. `^Lied\s+(\d+)\s*:`: song item, `songId` = the number zero-padded to two digits. Any colour.
3a. Paragraphs wholly in the song colour (`--song-color`, default green `00B050`) right after a song item, up to the first paragraph of another kind: they belong to the song (who sings, its props; the app takes the singers from the song): dropped.
4. Every segment a direction: one direction item, the paragraph's text.
5. First segment has a speaker prefix: that role becomes the current speaker; the prefix is cut off. The rest is one line item of that role: its segments joined with a space, each direction segment written as an inline direction `[<text>]` (script-format). A paragraph that is only the prefix makes no item; the next paragraph rule 6 takes is the line. Only inline directions left: one direction item of their text.
6. Otherwise, with a current speaker in this scene: line item of the current speaker as in rule 5 (continuation, one item per paragraph). Without one: dropped (props list under a scene header).

- `^([^:]{1,30}):` matches the first segment but the name is no speaker: warning `maybe speaker "<name>" at paragraph <n>`, the paragraph goes through rule 6.
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
    And a green paragraph "Musik leiser"
    And paragraphs "Erzähler 1: Es schneit.", "Es schneit sehr.", "Anna:", "Wir gehen gleich"
    When I parse it
    Then scene s1 has title "Im Zimmer"
    And its items are song "01", direction "Sie sitzt am Fenster.", direction "Musik leiser", line erzaehler1 "Es schneit.", line erzaehler1 "Es schneit sehr.", line anna "Wir gehen gleich"
    And the report lists "Stuhl, Schal" and "1+4 Anna & 2+3 Chor" as dropped

  Scenario: inline directions stay in the line
    Given a config with speaking roles anna "Anna" and mutter "Mutter"
    And a DOCX with "Szene 1" and a paragraph of runs "Anna: Da hinten. ", blue "zeigt nach rechts", " Komm."
    And a paragraph of runs "Mutter", blue "gähnt", "Na gut."
    And a paragraph of runs "Mutter: Oh. ", green "Donnergrollen"
    When I parse it
    Then scene s1 has line anna "Da hinten. [zeigt nach rechts] Komm.", line mutter "[gähnt] Na gut." and line mutter "Oh. [Donnergrollen]"

  Scenario: speaker before a tab or a full stop
    Given a config with speaking roles benjamin "Benjamin" and mutter "Mutter"
    And a DOCX with "Szene 1", "Benjamin\tWer kommt mit?" and a paragraph of runs "Mutter", ".", blue "Verwundert", "Echt?"
    When I parse it
    Then scene s1 has line benjamin "Wer kommt mit?" and line mutter "[Verwundert] Echt?"

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
