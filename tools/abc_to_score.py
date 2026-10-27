"""Convert a minimal ABC melody file into the score JSON used by align_score.py.

Supported subset: header lines T: K: M: L: Q:, notes A-G/a-g with octave
marks (, and '), accidentals ^ _ =, durations (2, 3, /2, /4, 3/2), ties (-),
rests (z), barlines (|, ||, |: :|) and "%% section NAME" lines. Key
signatures apply to all notes unless overridden by an accidental in the bar.

Usage: python tools/abc_to_score.py <in.abc> <out.json>
"""

import json
import re
import sys
from pathlib import Path

KEY_ACC = {
    "C": {},
    "Am": {},
    "G": {"F": 1},
    "Em": {"F": 1},
    "D": {"F": 1, "C": 1},
    "Bm": {"F": 1, "C": 1},
    "A": {"F": 1, "C": 1, "G": 1},
    "E": {"F": 1, "C": 1, "G": 1, "D": 1},
    "F": {"B": -1},
    "Dm": {"B": -1},
    "Bb": {"B": -1, "E": -1},
    "Gm": {"B": -1, "E": -1},
    "Eb": {"B": -1, "E": -1, "A": -1},
    "Cm": {"B": -1, "E": -1, "A": -1},
    "Ab": {"B": -1, "E": -1, "A": -1, "D": -1},
    "Fm": {"B": -1, "E": -1, "A": -1, "D": -1},
    "Db": {"B": -1, "E": -1, "A": -1, "D": -1, "G": -1},
}
DIATONIC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
TOKEN = re.compile(r"(\^+|_+|=)?([A-Ga-gz])([,']*)(\d+)?(/\d+)?(-)?")


def parse(text):
    key, unit, title, bpm = "C", 0.25, "", None
    section = None
    notes, bar, beat = [], 0, 0.0
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith("%% section"):
            section = line.split(None, 2)[2].strip()
            continue
        if line.startswith("%"):
            continue
        if re.match(r"^[A-Z]:", line):
            tag, val = line[0], line[2:].strip()
            if tag == "K":
                key = val
            elif tag == "L":
                a, b = val.split("/")
                unit = int(a) / int(b)
            elif tag == "T":
                title = val
            elif tag == "Q":
                bpm = float(val.split("=")[-1])
            continue
        acc_in_bar = {}
        pos = 0
        for m in TOKEN.finditer(line):
            # anything between tokens that is a barline resets accidentals / advances the bar
            between = line[pos : m.start()]
            if "|" in between:
                bar += between.count("|") if "||" not in between else 1
                beat = 0.0
                acc_in_bar = {}
            pos = m.end()
            acc, letter, octs, num, den, tie = m.groups()
            dur = (int(num) if num else 1) * unit * 4  # in quarter notes
            if den:
                dur /= int(den[1:])
            if letter == "z":
                notes.append({"bar": bar, "beat": beat, "dur": dur, "midi": None, "name": None, "section": section})
                beat += dur
                continue
            up = letter.islower()
            L = letter.upper()
            octave = 4 + (1 if up else 0) + octs.count("'") - octs.count(",")
            if acc:
                shift = 0 if acc == "=" else (len(acc) if acc[0] == "^" else -len(acc))
                acc_in_bar[L] = shift
            shift = acc_in_bar.get(L, KEY_ACC.get(key, {}).get(L, 0))
            midi = 12 * (octave + 1) + DIATONIC[L] + shift
            flats = any(v < 0 for v in KEY_ACC.get(key, {}).values())
            name = (NAMES_FLAT if flats else NAMES_SHARP)[midi % 12] + str(midi // 12 - 1)
            if notes and notes[-1].get("tie_next") and notes[-1]["midi"] == midi:
                notes[-1]["dur"] += dur
                notes[-1]["tie_next"] = bool(tie)
            else:
                notes.append({"bar": bar, "beat": beat, "dur": dur, "midi": midi, "name": name, "section": section, "tie_next": bool(tie)})
            beat += dur
        bar += 1
        beat = 0.0
    for n in notes:
        n.pop("tie_next", None)
    return {"title": title, "key": key, "bpm": bpm, "beats_per_bar": 4, "notes": notes}


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    score = parse(src.read_text(encoding="utf-8"))
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(score, ensure_ascii=False, indent=1), encoding="utf-8")
    sung = [n for n in score["notes"] if n["midi"] is not None]
    secs = {}
    for n in score["notes"]:
        secs[n["section"]] = secs.get(n["section"], 0) + n["dur"]
    print(f"{src.name}: {len(sung)} notes, sections (beats): {secs}")


if __name__ == "__main__":
    main()
