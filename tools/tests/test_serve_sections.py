import json
import sys
import threading
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serve  # noqa: E402
from steps_sections import repeated_notes  # noqa: E402


def detect(tmp_path, monkeypatch, notes):
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "config.json").write_text(json.dumps({"songs": [{"id": "08", "bpm": 60}]}), encoding="utf-8")
    monkeypatch.setattr(serve, "ROOT", tmp_path)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(serve.Handler, directory=str(tmp_path)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{srv.server_port}/detect-sections",
            json.dumps({"id": "08", "notes": notes}).encode(),
            {"Content-Type": "application/json"},
        )
        return json.load(urllib.request.urlopen(req))
    finally:
        srv.shutdown()


def test_detect_sections_route_answers_with_the_builders_sections(tmp_path, monkeypatch):
    got = detect(tmp_path, monkeypatch, repeated_notes())
    assert [s["name"] for s in got["sections"]] == ["Refrain", "Strophe 1", "Refrain 2", "Strophe 2"]
    # the editor's bar grid for section ops: the same bar lines the sections snap to
    assert {got["sections"][0]["start"], got["sections"][-1]["end"]} <= set(got["bars"])


def test_detect_sections_route_follows_the_current_phrase_flags(tmp_path, monkeypatch):
    # stored `phrase` is stale: notes 0 and 1 still share a phrase, so no line repeats
    notes = repeated_notes()
    for n in notes:
        n["phraseStart"] = True
        n["phrase"] = max(n["phrase"] - 1, 0)
    got = detect(tmp_path, monkeypatch, notes)
    assert [s["name"] for s in got["sections"]] == ["Refrain", "Strophe 1", "Refrain 2", "Strophe 2"]
