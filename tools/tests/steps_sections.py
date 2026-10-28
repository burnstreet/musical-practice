import json
import re
import sys
from pathlib import Path

from pytest_bdd import given, parsers, then, when
from steps_pack import ctx, decrypt_file, library, make_song, read_manifest, run  # noqa: F401

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import sections  # noqa: E402

BARS = [2.0 * i for i in range(21)]


def syllables(text):
    return [s for s in re.split(r"[-\s]+", text) if s]


def phrase_notes(texts, spans):
    notes = []
    for p, (text, (start, end)) in enumerate(zip(texts, spans)):
        syl = syllables(text) or [text]
        step = (end - start) / len(syl)
        notes += [{"start": start + k * step, "end": start + (k + 1) * step, "lyric": s, "phrase": p} for k, s in enumerate(syl)]
    return notes


def evenly(texts):
    return [(4.0 * i + 0.5, 4.0 * i + 3.5) for i in range(len(texts))]


def first_scenario(ctx):
    texts = list("abxaby")
    spans = [(4.5, 7.5), (8.5, 11.5), (12.5, 15.5), (20.5, 23.5), (24.5, 27.5), (28.5, 31.5)]
    ctx["notes"], ctx["bars"] = phrase_notes(texts, spans), BARS


FIRST = "bars every 2 s and phrases with texts a, b, x, a, b, y at "
FIRST += "[4.5,7.5], [8.5,11.5], [12.5,15.5], [20.5,23.5], [24.5,27.5], [28.5,31.5]"


@given(FIRST)
def _(ctx):
    first_scenario(ctx)


@given("the detected sections of the first scenario")
def _(ctx):
    first_scenario(ctx)
    ctx["result"] = sections.detect_sections(ctx["notes"], ctx["bars"])


@given(parsers.re(r"phrases with texts (?P<texts>[a-z](, [a-z])*)"))
def _(ctx, texts):
    t = texts.split(", ")
    ctx["notes"], ctx["bars"] = phrase_notes(t, evenly(t)), BARS


@given("bars every 2 s, an intro until 8.0, phrases a, b, x, a, b starting at 8.5 and an outro after the last note")
def _(ctx):
    t = list("abxab")
    ctx["notes"] = phrase_notes(t, [(8.5 + 4 * i, 11.5 + 4 * i) for i in range(5)])
    ctx["bars"] = BARS


@given(parsers.parse('phrase texts "{a}" and "{b}" at both occurrences of a two-phrase run'))
def _(ctx, a, b):
    t = [a, a, "x", b, b]
    ctx["notes"], ctx["bars"] = phrase_notes(t, evenly(t)), BARS


@when("I detect sections")
def _(ctx):
    ctx["result"] = sections.detect_sections(ctx["notes"], ctx["bars"])


@then("I get no sections")
def _(ctx):
    assert ctx["result"] == []


@then(parsers.parse('I get "Refrain" [4,12], "Strophe 1" [12,20], "Refrain 2" [20,28] and "Strophe 2" [28,32]'))
def _(ctx):
    assert ctx["result"] == [
        {"name": "Refrain", "start": 4.0, "end": 12.0},
        {"name": "Strophe 1", "start": 12.0, "end": 20.0},
        {"name": "Refrain 2", "start": 20.0, "end": 28.0},
        {"name": "Strophe 2", "start": 28.0, "end": 32.0},
    ]


@then("the first section starts at 8.0 and the last ends on the bar line after the last note")
def _(ctx):
    assert ctx["result"][0]["start"] == 8.0
    assert ctx["result"][-1]["end"] == 28.0


@then("both occurrences are refrains")
def _(ctx):
    assert [s["name"] for s in ctx["result"]] == ["Refrain", "Strophe 1", "Refrain 2"]


@then("every section start and end is a bar start and each end equals the next start")
def _(ctx):
    r = ctx["result"]
    assert all(s["start"] in ctx["bars"] and s["end"] in ctx["bars"] for s in r)
    assert all(a["end"] == b["start"] for a, b in zip(r, r[1:]))


# stored sections


def repeated_notes():
    """Six phrases a b x a b y, one note each, one bar (4 s at 60 bpm) per phrase."""
    return [
        {"start": 1.0 + 4 * i, "end": 4.0 + 4 * i, "midi": 60, "lyric": t, "role": "maria", "phrase": i, "bar": i, "beat": 0.0, "dur": 3.0}
        for i, t in enumerate("abxaby")
    ]


def set_sections(ctx, value):
    path = ctx["root"] / "web" / "data" / "08.json"
    song = json.loads(path.read_text(encoding="utf-8"))
    if value is not None:
        song["sections"] = value
    path.write_text(json.dumps(song), encoding="utf-8")


def song_json(ctx):
    return json.loads((ctx["root"] / "web" / "data" / "08.json").read_text(encoding="utf-8"))


@given(parsers.parse('a complete song whose JSON has sections "Refrain" [4,12]'))
def _(ctx):
    make_song(ctx)
    set_sections(ctx, [{"name": "Refrain", "start": 4, "end": 12}])


@given("a complete song whose JSON has sections []")
def _(ctx):
    make_song(ctx)
    set_sections(ctx, [])


@given("a complete song with repeated lines and no sections key")
def _(ctx):
    make_song(ctx, repeated_notes())


@given("a complete song whose JSON has no sections key")
def _(ctx):
    make_song(ctx)


@when("I run sections.py for it")
def _(ctx):
    sections.main(["08"], root=ctx["root"])


@then("the decrypted song file has the sections unchanged and the manifest format is 2")
def _(ctx):
    assert read_manifest(ctx)["format"] == 2
    assert packed_song(ctx)["sections"] == [{"name": "Refrain", "start": 4, "end": 12}]


@then("the decrypted song file has no sections field")
def _(ctx):
    assert "sections" not in packed_song(ctx)


@then("the JSON still has sections []")
def _(ctx):
    assert song_json(ctx)["sections"] == []


@then("the JSON has the detected sections")
def _(ctx):
    assert [s["name"] for s in song_json(ctx)["sections"]] == ["Refrain", "Strophe 1", "Refrain 2", "Strophe 2"]


def packed_song(ctx):
    return json.loads(decrypt_file(ctx, library(ctx)["songs"][0]["files"]["notes"]))


def test_detect_for_raw_notes_on_the_packer_grid():
    got = sections.detect_for(repeated_notes(), 60)
    assert [(s["name"], s["start"], s["end"]) for s in got] == [
        ("Refrain", 1.0, 9.0),
        ("Strophe 1", 9.0, 13.0),
        ("Refrain 2", 13.0, 21.0),
        ("Strophe 2", 21.0, 25.0),
    ]
