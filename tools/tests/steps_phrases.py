import json
import re
import sys
import zipfile
from pathlib import Path

import pytest
from pytest_bdd import given, parsers, then, when

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import phrases  # noqa: E402


def make_docx(path, lines):
    paras = "".join(f"<w:p><w:r><w:t>{l}</w:t></w:r></w:p>" for l in lines)
    xml = f'<w:document xmlns:w="{phrases.W[1:-1]}"><w:body>{paras}</w:body></w:document>'
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/document.xml", xml)


def syl(text):
    return [{"lyric": s} for s in re.split(r"[-\s]+", text) if s]


@pytest.fixture
def ctx():
    return {}


@given(parsers.parse('note syllables "{a}" then "{b}" as six notes'))
def step_six(ctx, a, b):
    ctx["notes"] = syl(a) + syl(b)


@given(parsers.parse('lyric lines "{a}" and "{b}"'))
def step_lines(ctx, a, b):
    ctx["lines"] = [a, b]


@given(parsers.parse("six notes where note 4 has phraseStart true"))
def step_flag(ctx):
    ctx["notes"] = [{"lyric": "a"} for _ in range(6)]
    ctx["notes"][3]["phraseStart"] = True


@given("lyric lines that would split after note 2")
def step_split(ctx):
    ctx["lines"] = ["aa", "aaaa"]


@given(parsers.parse('note syllables "{a}" and lyric lines "{b}"'))
def step_unmatched(ctx, a, b):
    ctx["notes"] = syl(a)
    ctx["lines"] = [b]


@when("I derive phrases")
def step_derive(ctx, tmp_path, capsys):
    (tmp_path / "web" / "data").mkdir(parents=True)
    (tmp_path / "sources" / "text").mkdir(parents=True)
    (tmp_path / "web" / "data" / "01.json").write_text(json.dumps({"title": "t", "notes": ctx["notes"]}), encoding="utf-8")
    make_docx(tmp_path / "sources" / "text" / "01 song.docx", ctx["lines"] if "lines" in ctx else [])
    try:
        phrases.main(["01"], root=tmp_path)
        ctx["exit"] = 0
    except SystemExit as e:
        ctx["exit"] = e.code
    ctx["out"] = capsys.readouterr().out
    ctx["song"] = json.loads((tmp_path / "web" / "data" / "01.json").read_text(encoding="utf-8"))


@then("notes 1-3 get phrase 0 and notes 4-6 get phrase 1")
def step_check(ctx):
    assert [n["phrase"] for n in ctx["song"]["notes"]] == [0, 0, 0, 1, 1, 1]
    assert ctx["song"]["title"] == "t"


@then(parsers.parse('the script exits 1 and prints "{s}"'))
def step_exit(ctx, s):
    assert ctx["exit"] == 1
    assert s in ctx["out"]
    assert "phrase" not in ctx["song"]["notes"][2]


# Beyond the spec scenarios: repeated sections reuse the line index.
def test_repeated_section_same_phrase():
    notes = syl("a b c d a b")
    assert phrases.derive_phrases(notes, ["a b", "c d"]) is None
    assert [n["phrase"] for n in notes] == [0, 0, 1, 1, 2, 2]
