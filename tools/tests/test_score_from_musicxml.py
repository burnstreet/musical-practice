import json
import subprocess
import sys
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1] / "score_from_musicxml.py"

# 3/4, two bars: bar 1 voice 1 sings, bar 2 voice 1 has a bar rest while voice 2 sings after a quarter rest
XML = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>S</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>3</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice><type>half</type>
        <lyric number="1"><syllabic>begin</syllabic><text>la</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><voice>1</voice><type>quarter</type>
        <lyric number="1"><syllabic>end</syllabic><text>li</text></lyric></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/><duration>3</duration><voice>1</voice></note>
      <backup><duration>3</duration></backup>
      <note><rest/><duration>1</duration><voice>2</voice><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><voice>2</voice><type>half</type>
        <lyric number="1"><text>lo</text></lyric></note>
    </measure>
  </part>
</score-partwise>
"""


# 4/4, two verse lines: C tied to C (verse 2 sings a syllable on the tied note), D tied over the bar line to D
# (no syllable); a slur from the second C to the first D
VERSES = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>S</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><type>quarter</type>
        <lyric number="1"><text>la</text></lyric><lyric number="2"><text>lu</text></lyric></note>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><tie type="stop"/><voice>1</voice><type>half</type>
        <notations><slur type="start" number="1"/></notations>
        <lyric number="2"><text>le</text></lyric></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><tie type="start"/><voice>1</voice><type>quarter</type>
        <notations><slur type="stop" number="1"/></notations>
        <lyric number="1"><text>li</text></lyric><lyric number="2"><text>lo</text></lyric></note>
    </measure>
    <measure number="2">
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><tie type="stop"/><voice>1</voice><type>quarter</type>
        </note>
    </measure>
  </part>
</score-partwise>
"""


def run(tmp_path, *extra, xml=XML):
    src, dst = tmp_path / "s.musicxml", tmp_path / "s.json"
    src.write_text(xml, encoding="utf-8")
    subprocess.run([sys.executable, str(TOOL), str(src), str(dst), *extra], check=True, capture_output=True)
    return json.loads(dst.read_text(encoding="utf-8"))["notes"]


def test_voice_per_note_and_filler_rest_dropped(tmp_path):
    got = [(n["bar"], n["beat"], n["midi"], n["voice"]) for n in run(tmp_path)]
    assert got == [(1, 0.0, 60, "1"), (1, 2.0, 62, "1"), (2, 0.0, None, "2"), (2, 1.0, 62, "2")]


def test_syllable_of_a_word_that_goes_on_ends_in_a_hyphen(tmp_path):
    assert [n.get("lyric") for n in run(tmp_path)] == ["la-", "li", None, "lo"]


def test_roles_from_voices(tmp_path):
    got = [(n["voice"], n.get("role")) for n in run(tmp_path, "--roles", "1=anna,2=chor")]
    assert got == [("1", "anna"), ("1", "anna"), ("2", "chor"), ("2", "chor")]


def test_verse_lines_and_tied_notes_kept_as_written(tmp_path):
    got = [(n["bar"], n["beat"], n["dur"], n["lyric"], n["lyrics"]) for n in run(tmp_path, xml=VERSES)]
    assert got == [
        (1, 0.0, 1.0, "la", ["la", "lu"]),
        (1, 1.0, 2.0, None, [None, "le"]),
        (1, 3.0, 1.0, "li", ["li", "lo"]),
        (2, 0.0, 1.0, None, [None, None]),
    ]


def test_tie_and_slur_flags_point_to_the_next_note(tmp_path):
    got = [(n.get("tie", False), n.get("slur", False)) for n in run(tmp_path, xml=VERSES)]
    assert got == [(True, False), (False, True), (True, False), (False, False)]
