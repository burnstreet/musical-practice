"""Give score notes timings from a recording via subsequence DTW.

Input: a score JSON from score_from_pdf.py and a pitch JSON from
extract_pitch*.py (the audio pitch track). The score is expanded (repeats),
rendered as a frame sequence at a tempo guess, and aligned to the audio pitch
track with subsequence DTW, octave-invariant. The best match is masked out
and the search repeated for further passes (verse/chorus sung several times).

Output: the pitch JSON with its `notes` replaced by the score notes with
start/end times from the audio (fields bar, beat, dur, lyric, pass kept).

Usage: python tools/align_score.py <score.json> <pitch.json> <out.json>
         [--bpm 90] [--passes 2] [--repeat-bars 9-12]
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np

HOP_S = 0.01


def expand(notes, repeat_ranges):
    """Expand repeats: each (first_bar, last_bar) range is played twice."""
    out = []
    bars = sorted(set(n["bar"] for n in notes))
    for b in bars:
        bar_notes = [n for n in notes if n["bar"] == b]
        out += bar_notes
        if any(b == last for _, last in repeat_ranges):
            first = next(f for f, last in repeat_ranges if last == b)
            out += [dict(n, repeat=True) for n in notes if first <= n["bar"] <= b]
    return out


def score_frames(seq, bpm):
    """Frame-wise midi (nan for rests) at HOP_S, plus each note's frame span."""
    spb = 60.0 / bpm
    t = 0.0
    frames, spans = [], []
    for n in seq:
        f0 = int(round(t / HOP_S))
        t += n["dur"] * spb
        f1 = int(round(t / HOP_S))
        frames += [n["midi"] if n["midi"] is not None else np.nan] * (f1 - f0)
        spans.append((f0, f1))
    return np.array(frames, dtype=float), spans


def cost_matrix(score_midi, audio_midi, unvoiced_cost=1.0, max_semitones=3.0):
    sv = np.isfinite(score_midi)[:, None]
    av = np.isfinite(audio_midi)[None, :]
    d = np.abs(np.nan_to_num(score_midi)[:, None] - np.nan_to_num(audio_midi)[None, :]) % 12
    d = np.minimum(d, 12 - d)
    d = np.minimum(d, max_semitones) / max_semitones
    C = np.where(sv & av, d, np.where(sv | av, unvoiced_cost, 0.0))
    # a rest in the score against singing is worse than singing against a gap
    C = np.where(~sv & av, unvoiced_cost * 0.5, C)
    return C.astype(np.float32)


def align_pass(score_midi, audio_midi, masked):
    a = audio_midi.copy()
    a[masked] = np.nan
    C = cost_matrix(score_midi, a)
    C[:, masked] += 2.0  # keep away from already-used regions
    D, wp = librosa.sequence.dtw(C=C, subseq=True, step_sizes_sigma=np.array([[1, 1], [1, 2], [2, 1]]),
                                 weights_add=np.array([0, 0, 0]), weights_mul=np.array([1, 1, 1]))
    wp = wp[::-1]  # (score_frame, audio_frame), increasing
    cost = D[-1, wp[-1, 1]] / len(score_midi)
    return wp, cost


def notes_from_path(seq, spans, wp, t_audio, audio_midi=None, snap=False):
    """Score notes with audio timings. With snap=True a note whose sung pitch
    (median over its frames, octave-folded to the score note) is a different
    semitone gets that pitch, and keeps the original in `score_midi`."""
    s2a = {}
    for si, ai in wp:
        s2a.setdefault(si, []).append(ai)
    out = []
    for n, (f0, f1) in zip(seq, spans):
        if n["midi"] is None or f1 <= f0:
            continue
        a_frames = [a for f in range(f0, f1) for a in s2a.get(f, [])]
        if not a_frames:
            continue
        a0, a1 = min(a_frames), max(a_frames) + 1
        note = {"start": round(float(t_audio[a0]), 3), "end": round(float(t_audio[min(a1, len(t_audio) - 1)]), 3),
                "midi": n["midi"], "name": n["name"], "bar": n["bar"], "beat": n["beat"], "dur": n["dur"],
                "lyric": n.get("lyric"), "section": n.get("section"), "repeat": n.get("repeat", False)}
        if snap and audio_midi is not None:
            sung = audio_midi[a0:a1]
            sung = sung[np.isfinite(sung)]
            if len(sung) >= max(5, 0.4 * (a1 - a0)):
                m = float(np.median(sung))
                m -= 12 * round((m - n["midi"]) / 12)  # fold to the score note's octave
                spread = float(np.median(np.abs(sung - np.median(sung))))
                if abs(m - n["midi"]) >= 0.6 and spread < 0.7:
                    note["score_midi"] = n["midi"]
                    note["midi"] = int(round(m))
                    note["name"] = midi_name(note["midi"])
                    note["snapped"] = True
        out.append(note)
    return out


NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_name(m):
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("score")
    ap.add_argument("pitch")
    ap.add_argument("out")
    ap.add_argument("--bpm", type=float, default=90.0)
    ap.add_argument("--passes", type=int, default=2)
    ap.add_argument("--repeat-bars", default="", help="e.g. 9-12 (bars played twice), comma separated")
    ap.add_argument("--max-cost", type=float, default=0.3, help="stop searching a section above this mean cost")
    ap.add_argument("--snap", action="store_true", help="replace a note's pitch by the sung one when they differ")
    args = ap.parse_args()

    score = json.loads(Path(args.score).read_text(encoding="utf-8"))
    pitch = json.loads(Path(args.pitch).read_text(encoding="utf-8"))
    repeats = [tuple(int(v) for v in r.split("-")) for r in args.repeat_bars.split(",") if r]
    seq = expand(score["notes"], repeats)
    score_midi, spans = score_frames(seq, args.bpm)

    t_audio = np.array([p[0] for p in pitch["pitch"]])
    hz = np.array([p[1] if p[1] else np.nan for p in pitch["pitch"]], dtype=float)
    audio_midi = np.where(np.isfinite(hz), 69 + 12 * np.log2(np.where(np.isfinite(hz), hz, 440) / 440), np.nan)
    if abs(t_audio[1] - t_audio[0] - HOP_S) > 1e-4:
        raise SystemExit("pitch track must have a 10 ms hop")

    # sections (e.g. Refrain/Strophe) are aligned separately, each as often as
    # it occurs in the recording; a score without sections is one section
    sections = []
    for n in seq:
        s = n.get("section")
        if not sections or sections[-1][0] != s:
            sections.append((s, []))
        sections[-1][1].append(n)

    masked = np.zeros(len(audio_midi), dtype=bool)
    all_notes = []
    for sec_name, sec_seq in sections:
        sec_midi, sec_spans = score_frames(sec_seq, args.bpm)
        sung_beats = sum(n["dur"] for n in sec_seq)
        for k in range(args.passes):
            wp, cost = align_pass(sec_midi, audio_midi, masked)
            a0, a1 = wp[0, 1], wp[-1, 1]
            if cost > args.max_cost or masked[a0:a1 + 1].mean() > 0.3:
                break
            notes = notes_from_path(sec_seq, sec_spans, wp, t_audio, audio_midi, snap=args.snap)
            for n in notes:
                n["pass"] = k
            bpm_est = sung_beats / max(t_audio[a1] - t_audio[a0], 1e-3) * 60
            snapped = sum(1 for n in notes if n.get("snapped"))
            print(f"{sec_name or 'score'} #{k}: audio {t_audio[a0]:.1f}-{t_audio[a1]:.1f}s, mean cost {cost:.3f}, "
                  f"{len(notes)} notes, implied tempo {bpm_est:.0f} bpm" + (f", {snapped} snapped" if args.snap else ""))
            masked[a0:a1 + 1] = True
            all_notes += notes

    all_notes.sort(key=lambda n: n["start"])
    pitch["notes"] = all_notes
    pitch["score"] = {"source": Path(args.score).name, "bpm_guess": args.bpm, "repeats": repeats}
    Path(args.out).write_text(json.dumps(pitch, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
