"""Assign a `phrase` index to every note of an aligned song JSON.

    python tools/phrases.py NN     # web/data/NN.json + sources/text/NN*.docx, JSON rewritten in place

Manual `phraseStart` flags win (DOCX not consulted). Otherwise lyric lines are
matched against the note syllables; exit 1 and print the first unmatched syllable.
"""
import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def norm(text):
    return re.sub(r"[\W\d_]+", "", (text or "").lower())


def read_docx_lines(path):
    # stdlib route: python-docx is not in the venv
    with zipfile.ZipFile(path) as z:
        tree = ET.fromstring(z.read("word/document.xml"))
    return ["".join(t.text or "" for t in p.iter(W + "t")) for p in tree.iter(W + "p")]


def _run(notes, i, line):
    """(k, None) when `line` equals the syllables of notes[i:i+k]; else (None, index of the diverging note)."""
    acc = ""
    for j in range(i, len(notes)):
        acc += norm(notes[j].get("lyric"))
        if acc == line:
            return j - i + 1, None
        if not line.startswith(acc):
            return None, j
    return None, len(notes) - 1


def derive_phrases(notes, lines):
    """Set note['phrase'] in place. Returns the first unmatched syllable, or None."""
    if any(n.get("phraseStart") for n in notes):
        phrase = 0
        for idx, n in enumerate(notes):
            if n.get("phraseStart") and idx:
                phrase += 1
            n["phrase"] = phrase
        return None
    lines = [norm(l) for l in lines if norm(l)]
    i, nxt = 0, 0
    while i < len(notes):
        # next line first; any line again covers repeated sections
        order = [nxt] + [x for x in range(len(lines)) if x != nxt]
        fail = None
        for x in order:
            k, bad = _run(notes, i, lines[x]) if x < len(lines) else (None, i)
            if fail is None:
                fail = bad
            if k:
                for n in notes[i:i + k]:
                    n["phrase"] = x
                i, nxt = i + k, x + 1
                break
        else:
            return notes[fail].get("lyric") or ""
    return None


def main(argv, root=ROOT):
    nn = argv[0]
    path = Path(root) / "web" / "data" / f"{nn}.json"
    song = json.loads(path.read_text(encoding="utf-8"))
    docx = sorted((Path(root) / "sources" / "text").glob(f"{nn}*.docx"))
    lines = read_docx_lines(docx[0]) if docx else []
    bad = derive_phrases(song["notes"], lines)
    path.write_text(json.dumps(song, ensure_ascii=False, indent=1), encoding="utf-8")
    if bad is not None:
        print(f"unmatched syllable: {bad}")
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
