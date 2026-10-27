"""Import a MusicXML melody (e.g. exported from MuseScore) into the score JSON
used by align_score.py. Takes the first part; chords use their top note; tied
notes are merged; text expressions / rehearsal marks become section names.

Usage: python tools/score_from_musicxml.py <in.musicxml> <out.json>
"""
import json
import sys
from pathlib import Path

from music21 import chord, converter, expressions, note, stream

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def main():
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    sc = converter.parse(str(src))
    part = sc.parts[0] if sc.parts else sc
    part = part.toSoundingPitch() if hasattr(part, "toSoundingPitch") else part
    ks = part.recurse().getElementsByClass("KeySignature").first()
    ts = part.recurse().getElementsByClass("TimeSignature").first()
    mm = part.recurse().getElementsByClass("MetronomeMark").first()
    beats = ts.numerator * 4 / ts.denominator if ts else 4
    flats = ks is not None and ks.sharps < 0

    notes, section = [], None
    for m in part.getElementsByClass(stream.Measure):
        bar = m.measureNumber
        for el in m.recurse():
            if isinstance(el, (expressions.TextExpression, expressions.RehearsalMark)):
                section = el.content
            if isinstance(el, chord.Chord):
                el = max(el.notes, key=lambda n: n.pitch.midi)
            if isinstance(el, note.Rest):
                notes.append({"bar": bar, "beat": float(el.offset), "dur": float(el.quarterLength),
                              "midi": None, "name": None, "section": section})
            elif isinstance(el, note.Note):
                if el.tie is not None and el.tie.type in ("stop", "continue") and notes:
                    prev = next((n for n in reversed(notes) if n["midi"] is not None), None)
                    if prev and prev["midi"] == el.pitch.midi:
                        prev["dur"] += float(el.quarterLength)
                        continue
                lyric = el.lyric if el.lyric else None
                midi = el.pitch.midi
                name = el.pitch.name.replace("-", "b") + str(el.pitch.octave)
                notes.append({"bar": bar, "beat": float(el.offset), "dur": float(el.quarterLength),
                              "midi": midi, "name": name, "lyric": lyric, "section": section})
    out = {"title": sc.metadata.title if sc.metadata else src.stem, "key": ks.asKey().name if ks else "C",
           "bpm": mm.number if mm else None, "beats_per_bar": beats, "notes": notes}
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    sung = [n for n in notes if n["midi"] is not None]
    print(f"{src.name}: {len(sung)} notes, {len(part.getElementsByClass(stream.Measure))} measures, "
          f"key {out['key']}, sections {sorted(set(n['section'] for n in notes if n['section']))}")


if __name__ == "__main__":
    main()
