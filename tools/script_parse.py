"""One-off: converts the script DOCX into web/data/script.json (run in the content root).

Usage: python tools/script_parse.py <docx> [--force] [--direction-color 0070C0] [--drop-color 00B050]
Rules and report: specs/script-parser.spec.md.
"""

import argparse
import json
import random
import re
import string
import sys
from collections import Counter
from pathlib import Path

from docx import Document

OUT = Path("web/data/script.json")
SCENE = re.compile(r"^Szene\s+(\d+)\s*[-–:]?\s*(.*)$")
SONG = re.compile(r"^Lied\s+(\d+)\s*:")
SPEAKER = re.compile(r"^([^:]{1,30}):\s*(.*)$")


def colour(par):
    """Hex of the first run with text, None when unset or auto."""
    for r in par.runs:
        if r.text.strip():
            c = r.font.color
            return str(c.rgb).upper() if c is not None and c.type is not None and c.rgb is not None else None
    return None


def parse(paragraphs, config, direction_color, drop_color):
    """paragraphs: (text, colour) pairs. Returns (scenes, dropped, warnings)."""
    speakers = {}
    for r in config["roles"]:
        if r.get("speaks"):
            for name in (r["name"], *r.get("aliases", [])):
                speakers[name.casefold()] = r["id"]
    songs = {s["id"] for s in config.get("songs", [])}
    ids, scenes, dropped, warnings = set(), [], [], []

    def item(kind, **kw):
        while (iid := "".join(random.choices(string.ascii_lowercase + string.digits, k=4))) in ids:
            pass
        ids.add(iid)
        scenes[-1]["items"].append({"id": iid, "type": kind, **kw})

    who = None  # current speaker; a bare "Name:" paragraph leaves the line to the next one
    for n, (text, col) in enumerate(paragraphs, 1):
        if m := SCENE.match(text):
            scenes.append({"id": f"s{m[1]}", "title": m[2].strip(), "items": []})
            who = None
        elif not scenes:
            dropped.append(f"{n}: {text[:40]}")
        elif m := SONG.match(text):
            sid = f"{int(m[1]):02d}"
            if sid not in songs:
                warnings.append(f"song {sid} at paragraph {n} is not in config")
            item("song", songId=sid)
        elif col == drop_color:
            dropped.append(f"{n}: {text[:40]}")
        elif col == direction_color:
            item("direction", text=text)
        else:
            m = SPEAKER.match(text)
            if m and m[1].strip().casefold() in speakers:
                who = speakers[m[1].strip().casefold()]
                if m[2]:
                    item("line", role=who, text=m[2])
                continue
            if m:
                warnings.append(f'maybe speaker "{m[1]}" at paragraph {n}')
            if who:
                item("line", role=who, text=text)
            else:
                dropped.append(f"{n}: {text[:40]}")
    return scenes, dropped, warnings


def report(scenes, dropped, warnings):
    roles = Counter(i["role"] for s in scenes for i in s["items"] if i["type"] == "line")
    out = [f"lines {r}: {c}" for r, c in roles.items()]
    out += [f"scene {s['id']} {s['title']!r}: {len(s['items'])} items" for s in scenes]
    out += [f"dropped {d}" for d in dropped]
    out += [f"warning: {w}" for w in warnings]
    return "\n".join(out)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("docx")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--direction-color", default="0070C0")
    ap.add_argument("--drop-color", default="00B050")
    a = ap.parse_args(argv)
    config = json.loads(Path("sources/config.json").read_text(encoding="utf-8"))
    if not any(r.get("speaks") for r in config["roles"]):
        print("no speaking role in sources/config.json", file=sys.stderr)
        return 1
    if OUT.exists() and not a.force:
        print(f"{OUT} exists, use --force to overwrite", file=sys.stderr)
        return 1
    paras = []
    for p in Document(a.docx).paragraphs:
        text = " ".join(p.text.split())
        if text:
            paras.append((text, colour(p)))
    scenes, dropped, warnings = parse(paras, config, a.direction_color.upper(), a.drop_color.upper())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"scenes": scenes}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report(scenes, dropped, warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
