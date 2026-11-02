import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pytest
from conftest import FEATURES_DIR
from pytest_bdd import given, parsers, scenarios, then, when

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import script_render  # noqa: E402

scenarios(str(FEATURES_DIR / "chunking.feature"))
scenarios(str(FEATURES_DIR / "rendering.feature"))
scenarios(str(FEATURES_DIR / "voice-test.feature"))

RATE = 22050
VOICE = {"engine": "sine"}


def sentence(n, ch="a"):
    return ch * (n - 1) + "."


@pytest.fixture
def rctx(tmp_path, monkeypatch, capsys):
    """Content root = cwd. Fake engine `sine`: 0.5 s tone per call (pad seconds of silence around it), records its texts."""
    monkeypatch.chdir(tmp_path)
    c = {"root": tmp_path, "texts": [], "pad": 0.0, "roles": {"anna": VOICE}, "lines": []}

    def sine(text, voice):
        c["texts"].append(text)
        t = np.arange(int(RATE * 0.5)) / RATE
        pad = np.zeros(int(RATE * c["pad"]))
        return np.concatenate([pad, 0.5 * np.sin(2 * np.pi * 440 * t), pad]).astype(np.float32), RATE

    monkeypatch.setitem(script_render.ENGINES, "sine", sine)
    return c


def write_project(c):
    roles = [{"id": r, "name": r.title(), "speaks": True, **({"voice": v} if v else {})} for r, v in c["roles"].items()]
    (c["root"] / "sources").mkdir(exist_ok=True)
    (c["root"] / "sources" / "config.json").write_text(json.dumps({"roles": roles, "songs": []}), encoding="utf-8")
    (c["root"] / "web" / "data").mkdir(parents=True, exist_ok=True)
    items = [{"id": i, "type": "line", "role": r, "text": t, **rest} for i, r, t, rest in c["lines"]]
    script = {"scenes": [{"id": "s1", "title": "", "items": items}]}
    (c["root"] / "web" / "data" / "script.json").write_text(json.dumps(script, ensure_ascii=False), encoding="utf-8")


def line(c, id_, text, role="anna", **rest):
    c["lines"].append((id_, role, text, rest))


def render(c, *args):
    write_project(c)
    c["exit"] = script_render.main(list(args))


def audio_dir(c):
    return c["root"] / "web" / "data" / "script"


def mp3s(c):
    return {p.name for p in audio_dir(c).glob("*.mp3")}


def hash_of(c, id_):
    cfg = json.loads((c["root"] / "sources" / "config.json").read_text(encoding="utf-8"))
    import script_format

    script = script_format.load(cfg)
    item = next(i for i in script_format.lines(script) if i["id"] == id_)
    return script_format.line_hash(item, script_format.speaking_roles(cfg)[item["role"]].get("voice"))


# --- chunking ---


@when(parsers.parse('I chunk "{text}"'))
def _(rctx, text):
    rctx["chunks"] = script_render.chunk(text)


@when("I chunk it")
def _(rctx):
    rctx["chunks"] = script_render.chunk(rctx["text"])


@given(parsers.parse("a text of {n:d} sentences of {size:d} characters each"))
def _(rctx, n, size):
    rctx["text"] = " ".join(sentence(size, "abcdefghijkl"[i]) for i in range(n))


@given(parsers.parse('a text "{first}" followed by {n:d} sentences of {size:d} characters'))
def _(rctx, first, n, size):
    rctx["text"] = " ".join([first] + [sentence(size, "bcdefg"[i]) for i in range(n)])


@given(parsers.parse("one sentence of {n:d} characters with a comma at {at:d}"))
def _(rctx, n, at):
    rctx["text"] = "a" * (at - 1) + "," + " " + "b" * (n - at - 2) + "."
    assert len(rctx["text"]) == n


@then("I get one chunk")
def _(rctx):
    assert len(rctx["chunks"]) == 1


@then("every chunk has at most 250 characters and at least 40")
def _(rctx):
    assert all(40 <= len(c) <= 250 for c in rctx["chunks"])


@then("joining the chunks with spaces gives the text")
def _(rctx):
    assert " ".join(rctx["chunks"]) == rctx["text"]


@then(parsers.parse('no chunk is "{text}"'))
def _(rctx, text):
    assert text not in rctx["chunks"]


@then("I get two chunks split after the comma")
def _(rctx):
    a, b = rctx["chunks"]
    assert a.endswith(",") and not b.startswith(" ") and len(rctx["chunks"]) == 2


# --- rendering ---


@given("a script with lines a and b, voices on engine sine, and audio for a present")
def _(rctx):
    line(rctx, "a", "Hallo.")
    line(rctx, "b", "Tschüss.")
    render(rctx)
    rctx["texts"].clear()
    (audio_dir(rctx) / f"{hash_of(rctx, 'b')}.mp3").unlink()


@given("a fully rendered script")
def _(rctx):
    line(rctx, "a", "Hallo.")
    line(rctx, "b", "Tschüss.")
    render(rctx)
    rctx["old"] = hash_of(rctx, "a")
    rctx["texts"].clear()


@given(parsers.parse('a line with text "{text}" and say "{say}"'))
def _(rctx, text, say):
    line(rctx, "a", text, say=say)


@given("a line of role anna and no voice for anna")
def _(rctx):
    rctx["roles"] = {"anna": None}
    line(rctx, "a", "Hallo.")


@given("a line rendered by engine sine with 1 s of silence before and after")
def _(rctx):
    rctx["pad"] = 1.0
    line(rctx, "a", "Hallo.")
    render(rctx)


@when("I render")
def _(rctx):
    render(rctx)


@when("line a's text changes and I render")
def _(rctx):
    rctx["lines"][0] = ("a", "anna", "Hallo Welt.", {})
    render(rctx)


@then("only b is rendered and both have audio")
def _(rctx):
    assert rctx["texts"] == ["Tschüss."]
    assert mp3s(rctx) == {f"{hash_of(rctx, i)}.mp3" for i in "ab"}


@then("a is rendered under its new hash and its old file is gone")
def _(rctx):
    assert rctx["texts"] == ["Hallo Welt."]
    assert f"{rctx['old']}.mp3" not in mp3s(rctx)
    assert f"{hash_of(rctx, 'a')}.mp3" in mp3s(rctx)


@then(parsers.parse('the engine received "{text}"'))
def _(rctx, text):
    assert rctx["texts"] == [text]


@then("the exit code is 1, the output names anna, and nothing is rendered")
def _(rctx, capsys):
    out = capsys.readouterr()
    assert rctx["exit"] == 1 and "anna" in out.out + out.err
    assert rctx["texts"] == [] and not mp3s(rctx)


def probe(path, *entries):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries", f"stream={','.join(entries)}", "-of", "json", str(path)],
        check=True,
        capture_output=True,
    ).stdout
    return json.loads(out)["streams"][0]


def silence_at_ends(path):
    raw = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], check=True, capture_output=True
    ).stdout
    s = np.abs(np.frombuffer(raw, dtype="<i2").astype(int))
    loud = np.flatnonzero(s > 32768 * 10 ** (-45 / 20))
    return loud[0] / 44100, (len(s) - 1 - loud[-1]) / 44100


@then("its file is mono MP3 at 44.1 kHz, 64 kbps, with at most 0.1 s silence at each end")
def _(rctx):
    (file,) = audio_dir(rctx).glob("*.mp3")
    info = probe(file, "codec_name", "channels", "sample_rate", "bit_rate")
    assert (info["codec_name"], info["channels"], info["sample_rate"], int(info["bit_rate"])) == ("mp3", 1, "44100", 64000)
    head, tail = silence_at_ends(file)
    assert head <= 0.13 and tail <= 0.13  # 0.1 s plus encoder padding


# --- voice test ---


@given(parsers.parse('role anna with lines "{one}" and "{two}"'))
def _(rctx, one, two):
    line(rctx, "a", one)
    line(rctx, "b", two)


@when("I run the voice test")
def _(rctx):
    render(rctx, "--test")


@then(parsers.parse('work/voice-test/anna.mp3 exists and the engine received "{text}"'))
def _(rctx, text):
    assert (rctx["root"] / "work" / "voice-test" / "anna.mp3").is_file()
    assert rctx["texts"] == [text]
    assert not audio_dir(rctx).exists() or not mp3s(rctx)
