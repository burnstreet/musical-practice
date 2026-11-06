"""Section detection: refrains from recurring runs of phrase lines, strophes between them.

    python tools/sections.py NN    # writes `sections` into web/data/NN.json unless the key is already there

Rules: specs/builder.spec.md. Needs `phrase` on the notes (run phrases.py first).
"""

import json
import sys
from pathlib import Path

from phrases import norm
from script_format import load_config

ROOT = Path.cwd()  # content root (mp.ps1 -Content sets the working directory)


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
        if end <= start:  # snapped onto its neighbour's edge: its phrases fall into the section before
            continue
        counts[g[0]] += 1
        k = counts[g[0]]
        base = "Refrain" if g[0] else "Strophe"
        out.append({"name": base if g[0] and k == 1 else f"{base} {k}", "start": start, "end": end})
    return out


def compute_bars(ordered, bpm, dur, beats=4):
    """(bar start seconds, bar index per note) for notes sorted by start; bars of `beats` quarters run on to `dur`."""
    q = 60 / bpm
    bar_len = beats * q
    # Score bar numbers repeat on repeated sections: renumber bars sequentially in time order.
    seq, known, prev = [], {}, None
    for n in ordered:
        bs = n["start"] - n["beat"] * q
        if prev is None:
            i = n["bar"]
        elif n["bar"] > prev[0]:
            i = seq[-1] + n["bar"] - prev[0]
        elif n["bar"] == prev[0] and bs - prev[1] < bar_len / 2:
            i = seq[-1]
        else:  # score bar went back (or same bar a bar later): a repeat starts a new run
            i = seq[-1] + max(1, round((bs - prev[1]) / bar_len))
        seq.append(i)
        known[i] = min(known.get(i, bs), bs)
        prev = (n["bar"], bs)
    idx = sorted(known)
    bars = [known[idx[0]] - (idx[0] - m) * bar_len for m in range(idx[0])]
    for a, b in zip(idx, idx[1:]):
        bars += [known[a] + (known[b] - known[a]) * (m - a) / (b - a) for m in range(a, b)]
    bars.append(known[idx[-1]])
    while bars[-1] + bar_len <= dur:
        bars.append(bars[-1] + bar_len)
    # The intro before the first sung bar: whole bars counted back from it, so the staff shows the rests.
    lead = int((bars[0] + 1e-6) // bar_len) if bars[0] > 0 else 0
    bars = [bars[0] - (lead - m) * bar_len for m in range(lead)] + bars
    seq = [i + lead for i in seq]
    return [round(b, 3) for b in bars], seq


def bar_grid(notes, bpm, beats=4):
    """Bar start seconds the packer would build for these raw (unpacked) notes."""
    ordered = sorted(notes, key=lambda n: n["start"])
    return compute_bars(ordered, bpm, ordered[-1]["end"] + 8 * 60 / bpm, beats)[0]


def detect_for(notes, bpm, beats=4):
    """detect_sections on the packer's bar grid."""
    return detect_sections(notes, bar_grid(notes, bpm, beats))


def song_bpm(root, nid):
    cfg = load_config(root)
    return next(s["bpm"] for s in cfg["songs"] if s["id"] == nid)


def song_beats(root, nid):
    cfg = load_config(root)
    return next(s.get("beats", 4) for s in cfg["songs"] if s["id"] == nid)


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
    song["sections"] = detect_for(notes, song_bpm(root, nn), song_beats(root, nn))
    path.write_text(json.dumps(song, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv[1:])
