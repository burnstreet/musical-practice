"""Static server for web/ with HTTP Range support (audio seeking) and a save
endpoint for note edits made in the viewer.

GET  /config.json       -> sources/config.json (404 when absent)
POST /save/<name>.json  -> writes web/data/<name>.json and keeps a timestamped
                           copy in work/edits/.

Usage: python tools/serve.py [port]   (default 8765)
"""

import functools
import json
import sys
import time
from http.server import ThreadingHTTPServer
from pathlib import Path

from RangeHTTPServer import RangeRequestHandler

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
EDITS = ROOT / "work" / "edits"


class Handler(RangeRequestHandler):
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

    def do_POST(self):
        name = Path(self.path).name
        if not self.path.startswith("/save/") or not name.endswith(".json") or name != self.path[len("/save/") :]:
            self.send_error(404)
            return
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        try:
            data = json.loads(body)
            assert isinstance(data.get("notes"), list)
        except Exception as e:  # noqa: BLE001
            self.send_error(400, f"bad json: {e}")
            return
        dst = WEB / "data" / name
        EDITS.mkdir(parents=True, exist_ok=True)
        backup = EDITS / f"{dst.stem}-{time.strftime('%Y%m%d-%H%M%S')}.json"
        backup.write_bytes(body)
        dst.write_bytes(body)
        out = json.dumps({"ok": True, "saved": str(dst.relative_to(ROOT)), "backup": str(backup.relative_to(ROOT))}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)
        print(f"saved {dst.name} ({len(data['notes'])} notes) -> {backup.name}")


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    srv = ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=str(WEB)))
    print(f"serving {WEB} at http://localhost:{port}/")
    srv.serve_forever()


if __name__ == "__main__":
    main()
