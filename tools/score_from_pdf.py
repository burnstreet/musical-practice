"""Read a Finale-exported lead sheet PDF (Maestro font) into a note list.

Finale draws noteheads/rests/flags as glyphs of the Maestro font and staff
lines, stems, beams and barlines as vector paths, so pitch and rhythm can be
read exactly without OMR.

Pitch: notehead y relative to the staff lines (treble clef), key signature
applied. Rhythm: glyph type (half/quarter/rests), flags, number of beams
crossing the stem, augmentation dots. Chords: top note is the melody.
Lyrics: syllables (regular text below the staff) attached to the nearest
notehead.

Usage: python tools/score_from_pdf.py <pdf> <out.json> [--key-flats N | --key-sharps N]
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pymupdf

NOTEHEADS = {"œ": 1.0, "˙": 2.0, "w": 4.0}
RESTS = {"∑": 4.0, "Ó": 2.0, "Œ": 1.0, "‰": 0.5, "≈": 0.25}
FLAGS = {"j": 1, "J": 1, "r": 2, "R": 2}  # up/down eighth, sixteenth flags
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
DIATONIC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LETTERS = "CDEFGAB"
FLAT_ORDER = "BEADGCF"
SHARP_ORDER = "FCGDAEB"


def midi_name(m, flats=False):
    names = NOTE_NAMES_FLAT if flats else NOTE_NAMES
    return f"{names[m % 12]}{m // 12 - 1}"


def load_page(pdf):
    page = pymupdf.open(pdf)[0]
    glyphs, lyrics = [], []
    for b in page.get_text("rawdict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["font"] == "Maestro":
                    for c in s["chars"]:
                        if c["c"] != " ":
                            glyphs.append({"ch": c["c"], "x": c["origin"][0], "y": c["origin"][1],
                                           "x0": c["bbox"][0], "x1": c["bbox"][2]})
                elif "Bold" not in s["font"] and s["size"] < 11:
                    # lyric syllables: one span per word; split hyphenated syllables by char x
                    word, wx0 = "", None
                    for c in s["chars"]:
                        if c["c"] == " ":
                            if word:
                                lyrics.append({"text": word, "x": wx0, "y": c["origin"][1]})
                            word, wx0 = "", None
                            continue
                        if wx0 is None:
                            wx0 = c["bbox"][0]
                        word += c["c"]
                        if c["c"] == "-":
                            lyrics.append({"text": word, "x": wx0, "y": c["origin"][1]})
                            word, wx0 = "", None
                    if word:
                        lyrics.append({"text": word, "x": wx0, "y": s["chars"][-1]["origin"][1]})
    hlines, vlines, beams, ties = [], [], [], []
    for p in page.get_drawings():
        xs, ys = [], []
        n_items = len(p["items"])
        for it in p["items"]:
            if it[0] == "l":
                (x0, y0), (x1, y1) = it[1], it[2]
                if abs(y0 - y1) < 0.5 and x1 - x0 > 100:
                    hlines.append(y0)
                elif abs(x0 - x1) < 0.5 and abs(y1 - y0) > 15:
                    vlines.append({"x": x0, "y0": min(y0, y1), "y1": max(y0, y1), "w": p.get("width") or 0})
                xs += [x0, x1]
                ys += [y0, y1]
            elif it[0] == "re":
                r = it[1]
                xs += [r.x0, r.x1]
                ys += [r.y0, r.y1]
        if p.get("fill") is not None and xs:
            w, h = max(xs) - min(xs), max(ys) - min(ys)
            box = {"x0": min(xs), "x1": max(xs), "y0": min(ys), "y1": max(ys)}
            if n_items <= 6 and 1.5 < h < 12 and w > 3:  # beams: straight quads (slanted ones are taller)
                beams.append(box)
            elif n_items > 6 and h < 12 and w > 6:  # ties/slurs: many-segment filled curves
                ties.append(box)
    return glyphs, lyrics, sorted(set(round(y, 1) for y in hlines)), vlines, beams, ties


def group_staves(line_ys):
    staves = []
    for y in line_ys:
        if staves and y - staves[-1][-1] < 8:
            staves[-1].append(y)
        else:
            staves.append([y])
    return [s for s in staves if len(s) == 5]


def step_to_midi(step_from_top, flats, sharps):
    """Treble clef: top line is F5; each half-space down is one diatonic step."""
    letter_idx = (LETTERS.index("F") - step_from_top) % 7
    octave = 5 + (LETTERS.index("F") - step_from_top) // 7
    letter = LETTERS[letter_idx]
    m = 12 * (octave + 1) + DIATONIC[letter]
    if letter in FLAT_ORDER[:flats]:
        m -= 1
    if letter in SHARP_ORDER[:sharps]:
        m += 1
    return m


def parse(pdf, flats=0, sharps=0):
    glyphs, lyrics, line_ys, vlines, beams, ties = load_page(pdf)
    staves = group_staves(line_ys)
    events = []  # per staff, in x order
    for si, lines in enumerate(staves):
        top, spacing = lines[0], (lines[-1] - lines[0]) / 4
        half = spacing / 2
        y_lo, y_hi = top - 5 * spacing, lines[-1] + 5 * spacing
        sg = [g for g in glyphs if y_lo < g["y"] < y_hi]
        heads = [g for g in sg if g["ch"] in NOTEHEADS]
        # barlines span the staff exactly (stems don't) and have no notehead beside them
        spans = [v for v in vlines if abs(v["y0"] - top) < 1.5 and abs(v["y1"] - lines[-1]) < 1.5
                 and not any(h["x0"] - 1.5 < v["x"] < h["x1"] + 1.5 for h in heads)]
        bars = sorted(v["x"] for v in spans)
        thick = sorted(v["x"] for v in spans if v["w"] > 1.2)
        rests = [g for g in sg if g["ch"] in RESTS]
        flags = [g for g in sg if g["ch"] in FLAGS]
        dots = [g for g in sg if g["ch"] == "."]
        # chords: group heads by x
        heads.sort(key=lambda g: g["x"])
        chords = []
        for g in heads:
            if chords and abs(g["x"] - chords[-1][0]["x"]) < 2.5:
                chords[-1].append(g)
            else:
                chords.append([g])
        ev = []
        for ch in chords:
            ch.sort(key=lambda g: g["y"])
            topg = ch[0]
            x0, x1 = min(g["x0"] for g in ch) - 1.5, max(g["x1"] for g in ch) + 1.5
            dur = NOTEHEADS[topg["ch"]]
            if dur == 1.0:
                nb = sum(1 for b in beams if b["x0"] - 0.5 <= x1 and b["x1"] + 0.5 >= x0
                         and y_lo < (b["y0"] + b["y1"]) / 2 < y_hi)
                nf = max([FLAGS[f["ch"]] for f in flags if 0 <= f["x"] - topg["x"] < 12], default=0)
                dur = 1.0 / 2 ** max(nb, nf)
            pitches = [step_to_midi(int(round((g["y"] - top) / half)), flats, sharps) for g in ch]
            ev.append({"x": topg["x"], "x0": x0, "x1": x1, "dur": dur, "midi": pitches[0], "chord": pitches})
        for r in rests:
            ev.append({"x": r["x"], "dur": RESTS[r["ch"]], "midi": None})
        ev.sort(key=lambda e: e["x"])
        for d in dots:
            prev = [e for e in ev if 0 < d["x"] - e["x"] < 14]
            if prev:
                prev[-1]["dur"] *= 1.5
        # lyrics below this staff
        ly = [l for l in lyrics if lines[-1] < l["y"] < lines[-1] + 6 * spacing]
        for l in ly:
            cand = [e for e in ev if e["midi"] is not None and abs(e["x"] - l["x"]) < 10]
            if cand:
                e = min(cand, key=lambda e: abs(e["x"] - l["x"]))
                e["lyric"] = (e.get("lyric", "") + l["text"]).strip()
        # ties: a curve from one notehead to the next of the same pitch -> one note
        st_ties = [t for t in ties if y_lo < (t["y0"] + t["y1"]) / 2 < y_hi]
        merged = []
        for e in ev:
            prev = merged[-1] if merged else None
            tied = (prev and prev["midi"] is not None and prev["midi"] == e["midi"]
                    and any(t["x0"] <= prev["x1"] + 1 and t["x1"] >= e["x0"] - 1 for t in st_ties))
            if tied:
                prev["dur"] += e["dur"]
                prev["tied"] = True
            else:
                merged.append(e)
        ev = merged
        for e in ev:
            e["staff"] = si
            e["bar_x"] = sum(1 for b in bars if b < e["x"])
            e["after_thick"] = sum(1 for b in thick if b < e["x"])
        events.append({"events": ev, "bars": bars, "thick": thick})
    return events


def to_sequence(events, beats_per_bar=4.0):
    """Flatten to one list with bar numbers and beat positions, check bar sums."""
    seq, bar_no, beat = [], 0, 0.0
    bar_sums = {}
    for st in events:
        last_bar_x = None
        for e in st["events"]:
            if last_bar_x is not None and e["bar_x"] != last_bar_x:
                bar_no += 1
                beat = 0.0
            last_bar_x = e["bar_x"]
            seq.append({**e, "bar": bar_no, "beat": beat})
            beat += e["dur"]
            bar_sums[bar_no] = bar_sums.get(bar_no, 0) + e["dur"]
        bar_no += 1
        beat = 0.0
    return seq, bar_sums


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--key-flats", type=int, default=0)
    ap.add_argument("--key-sharps", type=int, default=0)
    args = ap.parse_args()
    events = parse(args.pdf, args.key_flats, args.key_sharps)
    seq, bar_sums = to_sequence(events)
    for st_i, st in enumerate(events):
        print(f"staff {st_i}: barlines at {[round(b) for b in st['bars']]}, thick {[round(b) for b in st['thick']]}")
    for b, s in bar_sums.items():
        flag = "" if abs(s - 4.0) < 1e-6 else "   <-- not 4"
        fl = args.key_flats > 0
        items = " ".join(("r" if e["midi"] is None else midi_name(e["midi"], fl)) + f"/{e['dur']:g}" for e in seq if e["bar"] == b)
        print(f"bar {b:2d}: {s:g} beats  {items}{flag}")
    out = [{"bar": e["bar"], "beat": e["beat"], "dur": e["dur"], "midi": e["midi"],
            "name": midi_name(e["midi"], args.key_flats > 0) if e["midi"] is not None else None,
            "chord": e.get("chord"), "lyric": e.get("lyric"), "staff": e["staff"], "after_thick": e["after_thick"]}
           for e in seq]
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps({"beats_per_bar": 4, "notes": out}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
