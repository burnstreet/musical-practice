import json
import sys
import threading
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import serve  # noqa: E402


def serve_with(tmp_path, monkeypatch):
    """Editor code in one folder, song data under a separate content root."""
    web, content = tmp_path / "engine-web", tmp_path / "content"
    web.mkdir()
    (web / "index.html").write_text("editor", encoding="utf-8")
    (content / "web" / "data").mkdir(parents=True)
    (content / "web" / "data" / "08.json").write_text('{"notes": []}', encoding="utf-8")
    monkeypatch.setattr(serve, "ROOT", content)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(serve.Handler, directory=str(web)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, content


def test_editor_from_engine_data_from_content_root(tmp_path, monkeypatch):
    srv, _ = serve_with(tmp_path, monkeypatch)
    base = f"http://127.0.0.1:{srv.server_port}"
    try:
        assert urllib.request.urlopen(f"{base}/index.html").read() == b"editor"
        assert json.load(urllib.request.urlopen(f"{base}/data/08.json")) == {"notes": []}
    finally:
        srv.shutdown()


def test_save_writes_into_the_content_root(tmp_path, monkeypatch):
    srv, content = serve_with(tmp_path, monkeypatch)
    try:
        url = f"http://127.0.0.1:{srv.server_port}/save/08.json"
        urllib.request.urlopen(urllib.request.Request(url, b'{"notes": [1]}', {"Content-Type": "application/json"}))
    finally:
        srv.shutdown()
    assert json.loads((content / "web" / "data" / "08.json").read_text(encoding="utf-8")) == {"notes": [1]}
    assert len(list((content / "work" / "edits").glob("08-*.json"))) == 1
