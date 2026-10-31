"""Import a MusicXML melody (e.g. exported from MuseScore) into the score JSON
used by align_score.py. Takes the first part; chords use their top note; text
expressions / rehearsal marks become section names.
Each note keeps its MuseScore voice; --roles maps voices to role ids. A rest is
dropped while another voice sings (filler rest). With several lyric lines
(verses) each note also gets `lyrics`, one entry per verse. A syllable whose
word goes on ends in "-". Tied notes stay
notes of their own: `tie: true` marks a note tied to the next one (scored as one
note), `slur: true` a note slurred to the next one (the staff draws the arc).

Usage: python tools/score_from_musicxml.py <in.musicxml> <out.json> [--roles 1=anna,2=chor]
"""

import argparse
import json
from pathlib import Path

from music21 import chord, converter, expressions, note, spanner, stream

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src", type=Path)
    ap.add_argument("dst", type=Path)
    ap.add_argument("--roles", default="", help="voice=role pairs, e.g. 1=anna,2=chor")
    args = ap.parse_args()
    src, dst = args.src, args.dst
    roles = dict(pair.split("=") for pair in args.roles.split(",") if pair)
    sc = converter.parse(str(src))
    part = sc.parts[0] if sc.parts else sc
    part = part.toSoundingPitch() if hasattr(part, "toSoundingPitch") else part
    ks = part.recurse().getElementsByClass("KeySignature").first()
    ts = part.recurse().getElementsByClass("TimeSignature").first()
    mm = part.recurse().getElementsByClass("MetronomeMark").first()
    beats = ts.numerator * 4 / ts.denominator if ts else 4

    notes, section = [], None
    for m in part.getElementsByClass(stream.Measure):
        bar = m.measureNumber
        for el in m.recurse():
            if isinstance(el, (expressions.TextExpression, expressions.RehearsalMark)):
                section = el.content
            voice = str(el.activeSite.id) if isinstance(el.activeSite, stream.Voice) else "1"
            if isinstance(el, chord.Chord):
                el = max(el.notes, key=lambda n: n.pitch.midi)
            if isinstance(el, note.Rest):
                rest = {"bar": bar, "beat": float(el.offset), "dur": float(el.quarterLength), "midi": None, "name": None}
                notes.append({**rest, "voice": voice, "section": section})
            elif isinstance(el, note.Note):
                if el.tie is not None and el.tie.type in ("stop", "continue") and notes:
                    prev = next((n for n in reversed(notes) if n["midi"] is not None and n["voice"] == voice), None)
                    if prev and prev["midi"] == el.pitch.midi:
                        prev["tie"] = True  # kept as notes of their own, so the staff writes them as notated
                # shortcut: a slur over n notes becomes n-1 arcs note to note; fine for the two-note slurs we have
                slur = any(isinstance(sp, spanner.Slur) and not sp.isLast(el) for sp in el.getSpannerSites())
                # a syllable whose word goes on ends in "-" (Nie- mand), so the app can join and hyphenate words
                verses = {ly.number: ly.text + ("-" if ly.syllabic in ("begin", "middle") else "") for ly in el.lyrics}
                lyric = verses.get(1) or None
                midi = el.pitch.midi
                name = el.pitch.name.replace("-", "b") + str(el.pitch.octave)
                notes.append(
                    {
                        "bar": bar,
                        "beat": float(el.offset),
                        "dur": float(el.quarterLength),
                        "midi": midi,
                        "name": name,
                        "lyric": lyric,
                        "verses": verses,
                        "voice": voice,
                        "section": section,
                        **({"slur": True} if slur else {}),
                    }
                )
    # several verse lines: every note gets `lyrics`, verse n at index n-1 (align_score picks one per pass)
    n_verses = max((k for n in notes for k in n.get("verses", {})), default=1)
    for n in notes:
        verses = n.pop("verses", None)
        if n_verses > 1 and verses is not None:
            n["lyrics"] = [verses.get(k) or None for k in range(1, n_verses + 1)]
    sung = [n for n in notes if n["midi"] is not None]

    def overlaps(a, b):
        return a["bar"] == b["bar"] and a["beat"] < b["beat"] + b["dur"] and b["beat"] < a["beat"] + a["dur"]

    notes = [n for n in notes if n["midi"] is not None or not any(s["voice"] != n["voice"] and overlaps(s, n) for s in sung)]
    notes.sort(key=lambda n: (n["bar"], n["beat"]))  # voices come one after another from music21
    for n in notes:
        if n["voice"] in roles:
            n["role"] = roles[n["voice"]]
    out = {
        "title": sc.metadata.title if sc.metadata else src.stem,
        "key": ks.asKey().name if ks else "C",
        "bpm": mm.number if mm else None,
        "beats_per_bar": beats,
        "notes": notes,
    }
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    sung = [n for n in notes if n["midi"] is not None]
    print(
        f"{src.name}: {len(sung)} notes, {len(part.getElementsByClass(stream.Measure))} measures, "
        f"key {out['key']}, sections {sorted(set(n['section'] for n in notes if n['section']))}"
    )


if __name__ == "__main__":
    main()
