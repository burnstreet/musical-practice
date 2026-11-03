import json
import sys
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, then, when

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import script_format  # noqa: E402


@pytest.fixture
def ctx():
    return {"config": {"roles": [], "songs": []}, "scenes": []}


def one_scene(ctx, items):
    ctx["scenes"] = [{"id": "s1", "title": "", "items": items}]


@given(parsers.parse('a config with speaking role erzaehler1 and song "{song}"'))
def _(ctx, song):
    ctx["config"] = {"roles": [{"id": "erzaehler1", "name": "E1", "speaks": True}], "songs": [{"id": song}]}


@given('a script with scene s1 holding a direction, a line of erzaehler1 and a song item "01"')
def _(ctx):
    one_scene(
        ctx,
        [
            {"id": "k3f9", "type": "direction", "text": "Sie sitzt."},
            {"id": "p0x2", "type": "line", "role": "erzaehler1", "text": "Es schneit."},
            {"id": "z8m1", "type": "song", "songId": "01"},
        ],
    )


@given(parsers.parse('a script with two items of id "{iid}"'))
def _(ctx, iid):
    ctx["config"] = {"roles": [], "songs": []}
    one_scene(ctx, [{"id": iid, "type": "direction", "text": "a"}, {"id": iid, "type": "direction", "text": "b"}])


@given("a config where role chor has speaks false")
def _(ctx):
    ctx["config"] = {"roles": [{"id": "chor", "name": "Chor", "speaks": False}], "songs": []}


@given("a script with a line of chor")
def _(ctx):
    one_scene(ctx, [{"id": "aaaa", "type": "line", "role": "chor", "text": "Hallo"}])


@when("I load the script", target_fixture="loaded")
def _(ctx, tmp_path):
    path = tmp_path / "script.json"
    path.write_text(json.dumps({"scenes": ctx["scenes"]}), encoding="utf-8")
    try:
        return {"script": script_format.load(ctx["config"], path)}
    except script_format.ScriptError as e:
        return {"error": str(e)}


@then("I get one scene with three items")
def _(loaded):
    assert [len(s["items"]) for s in loaded["script"]["scenes"]] == [3]


@then(parsers.parse('loading fails naming "{name}"'))
def _(loaded, name):
    assert name in loaded["error"]


VOICE_A = {"engine": "xtts", "speaker": "a"}


@given(parsers.parse('a line with text "{text}" and say "{say}"'), target_fixture="line")
def _(text, say):
    return {"text": text, "say": say}


@given(parsers.parse('a line with text "{text}" and no say'), target_fixture="line")
def _(text):
    return {"text": text}


@then(parsers.parse('its hash equals the hash of a line with text "{text}" and the same voice'))
def _(line, text):
    assert script_format.line_hash(line, VOICE_A) == script_format.line_hash({"text": text}, VOICE_A)


@given(parsers.parse("a line hashed with voice {voice}"), target_fixture="hashed")
def _(voice):
    line = {"text": "Hallo"}
    return {"line": line, "hash": script_format.line_hash(line, json.loads(voice))}


@when(parsers.parse("the role's voice becomes {voice}"))
def _(hashed, voice):
    hashed["new"] = script_format.line_hash(hashed["line"], json.loads(voice))


@then("the hash differs")
def _(hashed):
    assert hashed["new"] != hashed["hash"]


@then(parsers.parse('its direction is "{direction}"'))
def _(line, direction):
    assert script_format.direction(line) == direction


@then(parsers.parse('with voice {voice} its hash differs from the hash of a line with text "{text}"'))
def _(line, voice, text):
    v = json.loads(voice)
    assert script_format.line_hash(line, v) != script_format.line_hash({"text": text}, v)


@then(parsers.parse('with voice {voice} its hash equals the hash of a line with text "{text}"'))
def _(line, voice, text):
    v = json.loads(voice)
    assert script_format.line_hash(line, v) == script_format.line_hash({"text": text}, v)
