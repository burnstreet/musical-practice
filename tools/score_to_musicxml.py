"""Export a score JSON (from abc_to_score.py or score_from_pdf.py) to MusicXML
for editing in MuseScore.

Usage: python tools/score_to_musicxml.py <score.json> <out.musicxml> [--key Dm] [--title T] [--bpm 100]
"""
import argparse
import json
from pathlib import Path

from music21 import expressions, key, metadata, meter, note, stream, tempo


def key_from_name(name: str) -> key.Key:
    if name.endswith("m"):
        return key.Key(name[:-1].lower())  # lowercase tonic = minor in music21
    return key.Key(name)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("score")
    ap.add_argument("out")
    ap.add_argument("--key", default=None)
    ap.add_argument("--title", default=None)
    ap.add_argument("--bpm", type=float, default=None)
    args = ap.parse_args()

    data = json.loads(Path(args.score).read_text(encoding="utf-8"))
    beats = data.get("beats_per_bar", 4)
    part = stream.Part()
    part.insert(0, key_from_name(args.key or data.get("key") or "C"))
    part.insert(0, meter.TimeSignature(f"{beats}/4"))
    bpm = args.bpm or data.get("bpm")
    if bpm:
        part.insert(0, tempo.MetronomeMark(number=bpm))

    last_section = None
    for n in data["notes"]:
        offset = n["bar"] * beats + n["beat"]
        if n["midi"] is None:
            el = note.Rest(quarterLength=n["dur"])
        else:
            el = note.Note(n["midi"], quarterLength=n["dur"])
            if n.get("lyric"):
                el.lyric = n["lyric"]
        part.insert(offset, el)
        sec = n.get("section")
        if sec and sec != last_section:
            part.insert(offset, expressions.TextExpression(sec))
            last_section = sec

    part.makeMeasures(inPlace=True)
    part.makeTies(inPlace=True)
    part.makeRests(fillGaps=True, inPlace=True)
    score = stream.Score()
    score.insert(0, metadata.Metadata(title=args.title or data.get("title") or Path(args.score).stem))
    score.insert(0, part)
    score.write("musicxml", fp=args.out)
    sung = sum(1 for n in data["notes"] if n["midi"] is not None)
    print(f"{Path(args.out).name}: {sung} notes, {len(part.getElementsByClass(stream.Measure))} measures")


if __name__ == "__main__":
    main()
