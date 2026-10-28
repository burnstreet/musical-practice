"""Section detection: refrains from recurring runs of phrase lines, strophes between them.

    python tools/sections.py NN    # writes `sections` into web/data/NN.json unless the key is already there

Rules: specs/builder.spec.md. Needs `phrase` on the notes (run phrases.py first).
"""

import json
import sys
from pathlib import Path

from phrases import norm

ROOT = Path(__file__).resolve().parents[1]


def _phrases(notes):
    """[(text, first start, last end)] per phrase in song order."""
    groups = {}
    for n in sorted(notes, key=lambda n: n["start"]):
        if n.get("phrase") is not None:
            groups.setdefault(n["phrase"], []).append(n)
    return [("".join(norm(n.get("syllable") or n.get("lyric")) for n in g), g[0]["start"], g[-1]["end"]) for g in groups.values()]


def _recurs(texts, i, length):
    seq = texts[i : i + length]
    return any(abs(j - i) >= length and texts[j : j + length] == seq for j in range(len(texts) - length + 1))


def detect_sections(notes, bars):
    """[{name, start, end}] snapped to `bars` (bar start seconds), or [] when no refrain recurs."""
    ph = _phrases(notes)
    texts = [p[0] for p in ph]
    groups, i, strophe = [], 0, []  # (is refrain, first phrase index, last phrase index)
    while i < len(ph):
        length = next((k for k in range(len(ph) - i, 1, -1) if _recurs(texts, i, k)), 0)
        if length:
            if strophe:
                groups.append((False, strophe[0], strophe[-1]))
                strophe = []
            groups.append((True, i, i + length - 1))
            i += length
        else:
            strophe.append(i)
            i += 1
    if strophe:
        groups.append((False, strophe[0], strophe[-1]))
    if not any(g[0] for g in groups):
        return []
    eps = 1e-6
    first = max((b for b in bars if b <= ph[0][1] + eps), default=bars[0])
    last = min((b for b in bars if b >= ph[-1][2] - eps), default=bars[-1])
    edges = [first] + [min(bars, key=lambda b: abs(b - ph[g[1]][1])) for g in groups[1:]] + [last]
    counts, out = {True: 0, False: 0}, []
    for g, start, end in zip(groups, edges, edges[1:]):
        counts[g[0]] += 1
        k = counts[g[0]]
        base = "Refrain" if g[0] else "Strophe"
        out.append({"name": base if g[0] and k == 1 else f"{base} {k}", "start": start, "end": end})
    return out


def bar_grid(notes, bpm):
    """Bar start seconds the packer would build for these raw (unpacked) notes."""
    import pack  # bar grid shared with the packer

    ordered = sorted(notes, key=lambda n: n["start"])
    return pack.compute_bars(ordered, bpm, ordered[-1]["end"] + 8 * 60 / bpm)[0]


def detect_for(notes, bpm):
    """detect_sections on the packer's bar grid."""
    return detect_sections(notes, bar_grid(notes, bpm))


def main(argv, root=ROOT):
    nn = argv[0]
    path = Path(root) / "web" / "data" / f"{nn}.json"
    song = json.loads(path.read_text(encoding="utf-8"))
    if "sections" in song:
        return
    notes = song["notes"]
    if any(n.get("phrase") is None for n in notes):
        print("notes without phrase: run phrases.py first")
        sys.exit(1)
    cfg = json.loads((Path(root) / "sources" / "config.json").read_text(encoding="utf-8"))
    bpm = next(s["bpm"] for s in cfg["songs"] if s["id"] == nn)
    song["sections"] = detect_for(notes, bpm)
    path.write_text(json.dumps(song, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
