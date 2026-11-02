"""Static server for the editor in web/ with HTTP Range support (audio seeking)
and a save endpoint for note edits made in the viewer. Song data comes from the
content root (the current directory; `mp.ps1 -Content` sets it). Nothing is
cached by the browser (Cache-Control: no-store).

GET  /data/<file>       -> web/data/<file> under the content root
GET  /config.json       -> sources/config.json (404 when absent)
POST /detect-sections   -> body {"id", "notes"}: {sections, bars}: the sections the builder
                           detects for those notes (phrases re-derived from their phraseStart
                           flags first) and the bar grid (bar start seconds)
POST /script-status     -> body: script JSON. {missing: [item id], hashes: {item id: hash}} for the
                           lines; the audio of a line is /data/script/<hash>.mp3. 400 on an invalid script.
POST /render-line       -> body {"item"} (a line item). Renders it with its role's voice in a TTS
                           worker (tools/.venv-tts, started on first call): {hash}. 400 without voice,
                           503 without the TTS venv (./mp.ps1 setup -Tts), 500 {error} when rendering fails.
POST /save/<name>.json  -> writes web/data/<name>.json and keeps a timestamped
                           copy in work/edits/.

Usage: python tools/serve.py [port] [--lan]   (default 8765; --lan listens on every address)
"""

import atexit
import functools
import json
import subprocess
import sys
import threading
import time
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

import script_format
from phrases import derive_phrases
from RangeHTTPServer import RangeRequestHandler
from sections import bar_grid, detect_sections, song_beats, song_bpm

ROOT = Path.cwd()  # content root
TTS_PYTHON = Path(__file__).resolve().parent / ".venv-tts" / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
WEB = Path(__file__).resolve().parent.parent / "web"  # editor code, in the engine


_worker = None
_worker_lock = threading.Lock()


def worker_ask(request):
    """One request to the TTS worker (script_render.py --worker in tools/.venv-tts), started on first use. It ends with the server."""
    global _worker
    with _worker_lock:
        if _worker is None or _worker.poll() is not None:
            cmd = [str(TTS_PYTHON), str(Path(__file__).resolve().parent / "script_render.py"), "--worker"]
            _worker = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
            atexit.register(_worker.kill)  # stdin closing already ends it; this covers a render in progress
        try:
            _worker.stdin.write(json.dumps(request, ensure_ascii=False) + "\n")
            _worker.stdin.flush()
            return json.loads(_worker.stdout.readline())
        except (OSError, ValueError) as e:
            return {"error": f"TTS worker failed: {e}"}


class Handler(RangeRequestHandler):
    def translate_path(self, path):
        if not urlsplit(path).path.startswith("/data/"):
            return super().translate_path(path)
        own, self.directory = self.directory, str(ROOT / "web")
        try:
            return super().translate_path(path)
        finally:
            self.directory = own

    def end_headers(self):
        # rebuilt files keep their names (NN_spec.png, NN_mix.mp3): never let the browser reuse an old copy
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/config.json":  # lives outside web/ (gitignored)
            cfg = ROOT / "sources" / "config.json"
            if not cfg.is_file():
                self.send_error(404)
                return
            body = cfg.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def reply(self, code, obj):
        out = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def script_status(self):
        try:
            config = json.loads((ROOT / "sources" / "config.json").read_text(encoding="utf-8"))
            script = script_format.validate(json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0)))), config)
            roles = script_format.speaking_roles(config)
            hashes = {i["id"]: script_format.line_hash(i, roles[i["role"]].get("voice")) for i in script_format.lines(script)}
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"bad script: {e}")
            return
        missing = [i for i, h in hashes.items() if not (ROOT / script_format.AUDIO_DIR / f"{h}.mp3").exists()]
        self.reply(200, {"missing": missing, "hashes": hashes})

    def render_line(self):
        try:
            item = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))))["item"]
            config = json.loads((ROOT / "sources" / "config.json").read_text(encoding="utf-8"))
            voice = script_format.speaking_roles(config)[item["role"]].get("voice")
            assert voice, f"role {item['role']} has no voice in sources/config.json"
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"bad request: {e}")
            return
        if not TTS_PYTHON.is_file():
            self.send_error(503, "no TTS venv: run ./mp.ps1 setup -Tts")
            return
        answer = worker_ask({"item": item, "voice": voice})
        self.reply(200 if "hash" in answer else 500, answer)

    def do_POST(self):
        if self.path == "/detect-sections":
            self.detect_sections()
            return
        if self.path == "/script-status":
            self.script_status()
            return
        if self.path == "/render-line":
            self.render_line()
            return
        name = Path(self.path).name
        if not self.path.startswith("/save/") or not name.endswith(".json") or name != self.path[len("/save/") :]:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            data = json.loads(body)
            key = "scenes" if name == "script.json" else "notes"  # the script, else a song's notes
            assert isinstance(data.get(key), list)
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"bad json: {e}")
            return
        dst = ROOT / "web" / "data" / name
        edits = ROOT / "work" / "edits"
        edits.mkdir(parents=True, exist_ok=True)
        backup = edits / f"{dst.stem}-{time.strftime('%Y%m%d-%H%M%S')}.json"
        backup.write_bytes(body)
        dst.write_bytes(body)
        out = json.dumps({"ok": True, "saved": str(dst.relative_to(ROOT)), "backup": str(backup.relative_to(ROOT))}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
        print(f"saved {dst.name} ({len(data[key])} {key}) -> {backup.name}")

    def detect_sections(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            req = json.loads(body)
            derive_phrases(req["notes"], [])  # phrase from the current phraseStart flags; no flags: stored phrases stay
            bars = bar_grid(req["notes"], song_bpm(ROOT, req["id"]), song_beats(ROOT, req["id"]))
            out = json.dumps({"sections": detect_sections(req["notes"], bars), "bars": bars}).encode()
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"cannot detect: {e}")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)


def main():
    args = [a for a in sys.argv[1:] if a != "--lan"]
    lan = len(args) < len(sys.argv) - 1  # --lan: every address, for a phone in the same network (it can save too)
    port = int(args[0]) if args else 8765
    srv = ThreadingHTTPServer(("0.0.0.0" if lan else "127.0.0.1", port), functools.partial(Handler, directory=str(WEB)))
    print(f"serving {WEB} with data from {ROOT} at http://{'<this PC>' if lan else 'localhost'}:{port}/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
