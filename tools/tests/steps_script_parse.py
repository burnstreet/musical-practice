import json
import re
import sys
from pathlib import Path

import pytest
from docx import Document
from docx.shared import RGBColor
from pytest_bdd import given, parsers, then, when

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import script_parse  # noqa: E402

BLUE, GREEN = "0070C0", "00B050"


@pytest.fixture
def ctx(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "sources").mkdir()
    (tmp_path / "web" / "data").mkdir(parents=True)
    return {"roles": [], "songs": [], "paras": [], "args": []}


def quoted(text):
    return re.findall(r'"([^"]*)"', text)


def role(rid, name, aliases=()):
    return {"id": rid, "name": name, "speaks": True, "sings": False, "aliases": list(aliases)}


@given(parsers.parse('a config with speaking roles erzaehler1 "Erzähler 1" and anna "Anna" and song "01"'))
def _(ctx):
    ctx["roles"] = [role("erzaehler1", "Erzähler 1"), role("anna", "Anna")]
    ctx["songs"] = [{"id": "01"}]


@given(parsers.parse('a config with speaking roles anna "Anna" and mutter "Mutter"'))
def _(ctx):
    ctx["roles"] = [role("anna", "Anna"), role("mutter", "Mutter")]


@given(parsers.parse('a config with speaking roles benjamin "Benjamin" and mutter "Mutter"'))
def _(ctx):
    ctx["roles"] = [role("benjamin", "Benjamin"), role("mutter", "Mutter")]


@given(parsers.parse('a config with speaking role anna "Anna"'))
def _(ctx):
    ctx["roles"] = [role("anna", "Anna")]


@given(parsers.parse('a config with speaking role onkel "Onkel" with alias "Hirte Onkel"'))
def _(ctx):
    ctx["roles"] = [role("onkel", "Onkel", ["Hirte Onkel"])]


@given(parsers.re(r"a DOCX with paragraphs (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"] += [[(t, None)] for t in quoted(text)]


def runs(text):
    """Runs of a paragraph from `"A", blue "B", green "C"`; a literal \t is a tab."""
    return [
        (t.replace("\\t", "\t"), {"blue": BLUE, "green": GREEN}.get(c.strip())) for c, t in re.findall(r"(blue |green |)\"([^\"]*)\"", text)
    ]


@given(parsers.re(r"a DOCX with (?P<text>\".+)"))
def _(ctx, text):
    plain, _, rich = text.partition(" and a paragraph of runs ")
    ctx["paras"] += [[(t.replace("\\t", "\t"), None)] for t in quoted(plain)]
    if rich:
        ctx["paras"].append(runs(rich))


@given(parsers.re(r"a paragraph of runs (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"].append(runs(text))


@given(parsers.re(r"green paragraphs (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"] += [[(t, GREEN)] for t in quoted(text)]


@given(parsers.re(r"a green paragraph (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"] += [[(t, GREEN)] for t in quoted(text)]


@given(parsers.re(r"a blue paragraph (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"] += [[(t, BLUE)] for t in quoted(text)]


@given(parsers.re(r"paragraphs (?P<text>.+)"))
def _(ctx, text):
    ctx["paras"] += [[(t, None)] for t in quoted(text)]


@given("a DOCX with 300 line paragraphs")
def _(ctx):
    ctx["roles"] = [role("anna", "Anna")]
    ctx["paras"] = [[("Szene 1", None)]] + [[(f"Anna: Satz {i}", None)] for i in range(300)]


@given("web/data/script.json exists")
def _(ctx):
    ctx["paras"] = [[("Szene 1", None)]]
    ctx["roles"] = [role("anna", "Anna")]
    Path("web/data/script.json").write_text("old", encoding="utf-8")


def parse(ctx, capsys, *flags):
    Path("sources/config.json").write_text(json.dumps({"roles": ctx["roles"], "songs": ctx["songs"]}), encoding="utf-8")
    doc = Document()
    for par in ctx["paras"]:
        p = doc.add_paragraph()
        for text, color in par:
            run = p.add_run(text)
            if color:
                run.font.color.rgb = RGBColor.from_string(color)
    doc.save("script.docx")
    ctx["exit"] = script_parse.main(["script.docx", *flags])
    ctx["report"] = capsys.readouterr().out


@when("I parse it")
def _(ctx, capsys):
    parse(ctx, capsys)


@when("I parse a DOCX without --force")
def _(ctx, capsys):
    parse(ctx, capsys)


def scene(n):
    scenes = json.loads(Path("web/data/script.json").read_text(encoding="utf-8"))["scenes"]
    return next(s for s in scenes if s["id"] == f"s{n}")


def brief(item):
    return (item["type"], item.get("role") or item.get("songId"), item.get("text"))


@then(parsers.parse('scene s1 has title "{title}"'))
def _(title):
    assert scene(1)["title"] == title


@then(parsers.re(r"its items are song .+"))
def _():
    assert [brief(i) for i in scene(1)["items"]] == [
        ("song", "01", None),
        ("direction", None, "Sie sitzt am Fenster."),
        ("direction", None, "Musik leiser"),
        ("line", "erzaehler1", "Es schneit."),
        ("line", "erzaehler1", "Es schneit sehr."),
        ("line", "anna", "Wir gehen gleich"),
    ]


@then(parsers.parse('the report lists "Stuhl, Schal" and "1+4 Anna & 2+3 Chor" as dropped'))
def _(ctx):
    assert "Stuhl, Schal" in ctx["report"] and "1+4 Anna & 2+3 Chor" in ctx["report"]


@then(parsers.parse('scene s1 has line anna "Hallo." and line anna "Sie sagte: Komm."'))
def _():
    assert [brief(i) for i in scene(1)["items"]] == [("line", "anna", "Hallo."), ("line", "anna", "Sie sagte: Komm.")]


@then(parsers.parse('the report warns maybe speaker "{name}"'))
def _(ctx, name):
    assert f'maybe speaker "{name}"' in ctx["report"]


@then(parsers.parse('scene s1 has line onkel "{text}"'))
def _(text):
    assert [brief(i) for i in scene(1)["items"]] == [("line", "onkel", text)]


@then(parsers.re(r"scene s1 has line (?P<text>.+)"))
def _(text):
    want = [(r, t) for r, t in re.findall(r"(?:line )?(\w+) \"([^\"]*)\"", "line " + text)]
    assert [(i["role"], i["text"]) for i in scene(1)["items"]] == want


@then("the exit code is 1 and the file is unchanged")
def _(ctx):
    assert ctx["exit"] == 1
    assert Path("web/data/script.json").read_text(encoding="utf-8") == "old"


@then("all item ids are distinct and match [a-z0-9]{4}")
def _():
    ids = [i["id"] for i in scene(1)["items"]]
    assert len(ids) == 300 and len(set(ids)) == 300 and all(re.fullmatch(r"[a-z0-9]{4}", i) for i in ids)


def test_no_speaking_role_exits_1(ctx, capsys):
    ctx["roles"] = [{"id": "chor", "name": "Chor"}]
    ctx["paras"] = [[("Szene 1", None)]]
    parse(ctx, capsys)
    assert ctx["exit"] == 1
