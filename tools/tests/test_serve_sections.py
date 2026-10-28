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


def test_detect_sections_route_answers_with_the_builders_sections(tmp_path, monkeypatch):
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "config.json").write_text(json.dumps({"songs": [{"id": "08", "bpm": 60}]}), encoding="utf-8")
    monkeypatch.setattr(serve, "ROOT", tmp_path)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(serve.Handler, directory=str(tmp_path)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{srv.server_port}/detect-sections",
            json.dumps({"id": "08", "notes": repeated_notes()}).encode(),
            {"Content-Type": "application/json"},
        )
        got = json.load(urllib.request.urlopen(req))
    finally:
        srv.shutdown()
    assert [s["name"] for s in got["sections"]] == ["Refrain", "Strophe 1", "Refrain 2", "Strophe 2"]
