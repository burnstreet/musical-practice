import json
import sys
import threading
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import script_format  # noqa: E402
import serve  # noqa: E402

VOICE = {"engine": "xtts", "speaker": "Claribel Dervla"}
ROLES = [{"id": "anna", "name": "Anna", "speaks": True, "voice": VOICE}, {"id": "ben", "name": "Ben", "speaks": True}]
SCRIPT = {
    "scenes": [
        {
            "id": "s1",
            "items": [
                {"id": "a", "type": "line", "role": "anna", "text": "Hallo."},
                {"id": "b", "type": "line", "role": "ben", "text": "Tschüss."},
            ],
        }
    ]
}


def start(tmp_path, monkeypatch):
    (tmp_path / "sources").mkdir()
    (tmp_path / "sources" / "config.json").write_text(json.dumps({"roles": ROLES, "songs": []}), encoding="utf-8")
    monkeypatch.setattr(serve, "ROOT", tmp_path)
    monkeypatch.setattr(serve, "TTS_PYTHON", tmp_path / "no-venv" / "python")
    srv = ThreadingHTTPServer(("127.0.0.1", 0), partial(serve.Handler, directory=str(tmp_path)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def post(srv, path, body):
    req = urllib.request.Request(
        f"http://127.0.0.1:{srv.server_port}{path}", json.dumps(body).encode(), {"Content-Type": "application/json"}
    )
    return json.load(urllib.request.urlopen(req))


def test_script_status_lists_missing_lines_and_hashes(tmp_path, monkeypatch):
    srv = start(tmp_path, monkeypatch)
    try:
        hashes = {
            "a": script_format.line_hash(SCRIPT["scenes"][0]["items"][0], VOICE),
            "b": script_format.line_hash(SCRIPT["scenes"][0]["items"][1], None),
        }
        audio = tmp_path / "web" / "data" / "script"
        audio.mkdir(parents=True)
        (audio / f"{hashes['a']}.mp3").write_bytes(b"x")
        assert post(srv, "/script-status", SCRIPT) == {"missing": ["b"], "hashes": hashes}
    finally:
        srv.shutdown()


def test_script_is_saved_like_a_song(tmp_path, monkeypatch):
    srv = start(tmp_path, monkeypatch)
    try:
        (tmp_path / "web" / "data").mkdir(parents=True)
        assert post(srv, "/save/script.json", SCRIPT)["ok"]
        assert json.loads((tmp_path / "web" / "data" / "script.json").read_text(encoding="utf-8")) == SCRIPT
    finally:
        srv.shutdown()


def test_render_line_without_tts_venv_is_503_naming_setup(tmp_path, monkeypatch):
    srv = start(tmp_path, monkeypatch)
    try:
        try:
            post(srv, "/render-line", {"item": SCRIPT["scenes"][0]["items"][0]})
            raise AssertionError("expected 503")
        except urllib.error.HTTPError as e:
            assert e.code == 503 and "setup -Tts" in e.reason
    finally:
        srv.shutdown()
