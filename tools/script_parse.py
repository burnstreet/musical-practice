"""One-off: converts the script DOCX into web/data/script.json (run in the content root).

Usage: python tools/script_parse.py <docx> [--force] [--direction-colors 0070C0,00B050] [--song-color 00B050]
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
SPEAKER = re.compile(r"^([^:]{1,30}):")


def colour(run):
    """Hex of the run's font colour, None when unset or auto."""
    c = run.font.color
    return str(c.rgb).upper() if c is not None and c.type is not None and c.rgb is not None else None


def segments(runs, direction_colors):
    """(is_direction, raw text) stretches; whitespace-only runs join the stretch they sit in."""
    out, pending = [], ""
    for text, col in runs:
        if not text.strip():
            if out:
                out[-1][1] += text
            else:
                pending += text
            continue
        is_dir = col in direction_colors
        if out and out[-1][0] == is_dir:
            out[-1][1] += text
        else:
            out.append([is_dir, pending + text])
        pending = ""
    return [(d, t) for d, t in out]


def parse(paragraphs, config, direction_colors, song_color):
    """paragraphs: lists of (text, colour) runs. Returns (scenes, dropped, warnings)."""
    speakers = {}
    for r in config["roles"]:
        if r.get("speaks"):
            for name in (r["name"], *r.get("aliases", [])):
                speakers[name.casefold()] = r["id"]
    prefix = re.compile(
        r"^\s*(" + "|".join(re.escape(n) for n in sorted(speakers, key=len, reverse=True)) + r")(?::|\.|\t|\s*$)",
        re.IGNORECASE,
    )
    songs = {s["id"] for s in config.get("songs", [])}
    ids, scenes, dropped, warnings = set(), [], [], []

    def item(kind, **kw):
        while (iid := "".join(random.choices(string.ascii_lowercase + string.digits, k=4))) in ids:
            pass
        ids.add(iid)
        scenes[-1]["items"].append({"id": iid, "type": kind, **kw})

    def say(who, parts):
        """Line of who from (is_direction, text) parts; only directions: a direction item."""
        parts = [(d, " ".join(t.split())) for d, t in parts]
        parts = [(d, t) for d, t in parts if t]
        if any(not d for d, _ in parts):
            item("line", role=who, text=" ".join(f"[{t}]" if d else t for d, t in parts))
        elif parts:
            item("direction", text=" ".join(t for _, t in parts))

    who = None  # current speaker; a bare "Name:" paragraph leaves the line to the next one
    after_song = False
    for n, runs in enumerate(paragraphs, 1):
        text = " ".join("".join(t for t, _ in runs).split())
        segs = segments(runs, direction_colors)
        segs = [(d, t) for d, t in segs if t.strip()]
        if m := SCENE.match(text):
            scenes.append({"id": f"s{m[1]}", "title": m[2].strip(), "items": []})
            who, after_song = None, False
        elif not scenes:
            dropped.append(f"{n}: {text[:40]}")
        elif m := SONG.match(text):
            sid = f"{int(m[1]):02d}"
            if sid not in songs:
                warnings.append(f"song {sid} at paragraph {n} is not in config")
            item("song", songId=sid)
            after_song = True
        elif after_song and all(c == song_color for t, c in runs if t.strip()):
            dropped.append(f"{n}: {text[:40]} (song note)")
        else:
            after_song = False
            if all(d for d, _ in segs):
                item("direction", text=text)
            elif segs[0][0] is False and (m := prefix.match(segs[0][1])):
                who = speakers[m[1].casefold()]
                say(who, [(False, segs[0][1][m.end() :]), *segs[1:]])
            else:
                if (m := SPEAKER.match(segs[0][1])) and not segs[0][0]:
                    warnings.append(f'maybe speaker "{m[1]}" at paragraph {n}')
                if who:
                    say(who, segs)
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
    ap.add_argument("--direction-colors", default="0070C0,00B050")
    ap.add_argument("--song-color", default="00B050")
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
        if p.text.strip():
            paras.append([(r.text, colour(r)) for r in p.runs])
    scenes, dropped, warnings = parse(paras, config, a.direction_colors.upper().split(","), a.song_color.upper())
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"scenes": scenes}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(report(scenes, dropped, warnings))
    return 0


if __name__ == "__main__":
    sys.exit(main())
