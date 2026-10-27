import base64
import json
import subprocess
import sys
from pathlib import Path

import pytest
from cryptography.exceptions import InvalidTag
from pytest_bdd import given, parsers, then, when

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pack  # noqa: E402

ROLES = [{"id": r, "name": r.title(), "sings": True} for r in ("maria", "josef", "chor")]


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True)


def sine(path, seconds, freq=440):
    ffmpeg("-f", "lavfi", "-i", f"sine=frequency={freq}:duration={seconds}:sample_rate=44100", "-ac", "1", "-b:a", "128k", str(path))


def pcm(path):
    """Decoded mono 44.1 kHz samples, independent of pack.py."""
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "44100", "-"], check=True, capture_output=True).stdout
    return [int.from_bytes(out[i:i + 2], "little", signed=True) for i in range(0, len(out), 2)]


def notes():
    spec = [("Sin", "maria"), ("ge", "maria"), ("mit", "josef"), ("hö", "josef"), ("re", "chor"), ("zu", "chor")]
    return [{"start": 1.0 + i, "end": 1.8 + i, "midi": 60 + i, "lyric": s, "role": r, "phrase": 0 if i < 3 else 1, "bar": i // 4, "beat": float(i % 4), "dur": 1.0}
            for i, (s, r) in enumerate(spec)]


@pytest.fixture
def ctx(tmp_path, monkeypatch):
    monkeypatch.setenv("PITCH_PASSWORD", "test")
    (tmp_path / "web" / "data").mkdir(parents=True)
    (tmp_path / "sources").mkdir()
    return {"root": tmp_path, "out": tmp_path / "content", "args": []}


def make_song(ctx, song_notes=None, mix=10.0, playback=10.0, offset=0.0):
    root = ctx["root"]
    data = root / "web" / "data"
    (data / "08.json").write_text(json.dumps({"notes": song_notes or notes()}, ensure_ascii=False), encoding="utf-8")
    sine(data / "08.mp3", mix)
    sine(data / "08_playback.mp3", playback, 220)  # differs from the mix, else both stems share one file id
    song = {"id": "08", "number": 8, "title": "Test", "backing": "playback", "bpm": 60, "key": "F", "playbackOffsetSec": offset}
    (root / "sources" / "config.json").write_text(json.dumps({"roles": ROLES, "songs": [song]}), encoding="utf-8")


def run(ctx):
    ctx["exit"] = pack.main(["--root", str(ctx["root"]), "--out", str(ctx["out"]), *ctx["args"]])


def read_manifest(ctx):
    return json.loads((ctx["out"] / "manifest.json").read_text(encoding="utf-8"))


def key_for(ctx, password):
    m = read_manifest(ctx)
    return pack.derive_key(password, base64.b64decode(m["salt"]), m["iterations"])


def decrypt_file(ctx, file_id, password="test"):
    return pack.decrypt(key_for(ctx, password), (ctx["out"] / f"{file_id}.bin").read_bytes())


def library(ctx, password="test"):
    return json.loads(decrypt_file(ctx, read_manifest(ctx)["library"], password))


@given(parsers.parse("song 08 whose note 5 has no role"))
def _(ctx):
    n = notes()
    del n[4]["role"]
    make_song(ctx, n)


@given("song 08 incomplete")
def _(ctx):
    n = notes()
    del n[4]["role"]
    make_song(ctx, n)


@given(parsers.parse("mix of {mix:f} s and playback of {pb:f} s with playbackOffsetSec {off:f}"))
def _(ctx, mix, pb, off):
    data = ctx["root"] / "web" / "data"
    make_song(ctx, mix=mix, playback=1, offset=off)
    # 0.3 s of 440 Hz lead-in, then 880 Hz: trimmed backing must start at 880 Hz
    ffmpeg("-f", "lavfi", "-i", f"sine=frequency=440:duration={off}:sample_rate=44100", "-f", "lavfi", "-i", f"sine=frequency=880:duration={pb - off}:sample_rate=44100",
           "-filter_complex", "[0][1]concat=n=2:v=0:a=1", "-ac", "1", "-b:a", "128k", str(data / "08_playback.mp3"))


@given(parsers.parse('one complete song and PITCH_PASSWORD "{pw}"'))
def _(ctx, monkeypatch, pw):
    monkeypatch.setenv("PITCH_PASSWORD", pw)
    make_song(ctx)


@given("one complete song packed once")
def _(ctx):
    make_song(ctx)
    run(ctx)
    ctx["ids"] = read_manifest(ctx)["files"].keys()


@given(parsers.parse('content/ holds a file "{name}" not in the inputs'))
def _(ctx, name):
    make_song(ctx)
    ctx["out"].mkdir()
    (ctx["out"] / name).write_bytes(b"x")
    ctx["orphan"] = ctx["out"] / name


@when("I run pack")
def _(ctx):
    run(ctx)


@when("I run pack with --strict")
def _(ctx):
    ctx["args"] = ["--strict"]
    run(ctx)


@when("I run pack again with unchanged inputs")
def _(ctx):
    run(ctx)


@then(parsers.parse('report.txt lists "{line}"'))
def _(ctx, line):
    assert line in (ctx["out"] / "report.txt").read_text(encoding="utf-8")


@then("content has no files for song 08")
def _(ctx):
    m = read_manifest(ctx)
    assert m["songCount"] == 0 and list(m["files"]) == [m["library"]]
    assert library(ctx)["songs"] == []


@then(parsers.parse("the exit code is {code:d}"))
def _(ctx, code):
    assert ctx["exit"] == code


@then(parsers.parse("the backing stem is {sec:f} s and its sample 0 equals playback sample at {at:f} s"))
def _(ctx, sec, at, tmp_path):
    f = library(ctx)["songs"][0]["files"]["backing"]
    out = tmp_path / "backing.mp3"
    out.write_bytes(decrypt_file(ctx, f))
    s = pcm(out)
    assert abs(len(s) / 44100 - sec) < 0.02
    head = s[2000:22000]  # skip codec warm-up, 20000 samples = 0.45 s
    crossings = sum(1 for a, b in zip(head, head[1:]) if (a < 0) != (b < 0))
    assert abs(crossings / (len(head) / 44100) / 2 - 880) < 20  # 880 Hz, not the 440 Hz lead-in


@then("manifest.json lists songCount 1 and 4 files")
def _(ctx):
    m = read_manifest(ctx)
    assert m["songCount"] == 1 and len(m["files"]) == 4
    assert m["totalBytes"] == sum(p.stat().st_size for p in ctx["out"].glob("*.bin"))


@then(parsers.parse('decrypting the library with "test" yields the song with id "08"'))
def _(ctx):
    assert [s["id"] for s in library(ctx)["songs"]] == ["08"]


@then(parsers.parse('decrypting with "wrong" fails'))
def _(ctx):
    with pytest.raises(InvalidTag):
        library(ctx, "wrong")


@then("every file id in the manifest is unchanged")
def _(ctx):
    assert read_manifest(ctx)["files"].keys() == ctx["ids"]


@then("that file is gone")
def _(ctx):
    assert not ctx["orphan"].exists()


def test_missing_password_exits_2(ctx, monkeypatch, capsys):
    monkeypatch.delenv("PITCH_PASSWORD")
    make_song(ctx)
    run(ctx)
    assert ctx["exit"] == 2 and "PITCH_PASSWORD" in capsys.readouterr().err


def test_song_file_follows_content_format(ctx):
    make_song(ctx)
    run(ctx)
    lib = library(ctx)
    song = json.loads(decrypt_file(ctx, lib["songs"][0]["files"]["notes"]))
    assert lib["songs"][0]["roles"] == ["maria", "josef", "chor"]
    assert song["notes"][0]["syllable"] == "Sin" and "lyric" not in song["notes"][0]
    assert song["phrases"] == [{"index": 0, "label": "Phrase 1", "start": 1.0, "end": 3.8}, {"index": 1, "label": "Phrase 2", "start": 4.0, "end": 6.8}]
    assert song["bars"][0] == 1.0 and song["bars"][1] == 5.0


def test_repeat_gets_later_bar_and_bars_increase():
    n = [{"start": t, "end": t + 1, "midi": 60, "lyric": "a", "role": "maria", "phrase": p, "bar": 0, "beat": 0.0, "dur": 1.0}
         for p, t in enumerate((0.0, 10.0))]
    song = pack.build_song({"id": "08", "bpm": 60, "key": "F"}, n, 20.0)
    first, second = (x["bar"] for x in song["notes"])
    assert first == 0 and second > 0
    assert song["bars"][second] == 10.0
    assert all(a < b for a, b in zip(song["bars"], song["bars"][1:]))
