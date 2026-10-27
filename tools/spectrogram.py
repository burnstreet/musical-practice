"""Render a log-frequency (semitone-grid) spectrogram of a vocals stem as an RGBA
PNG for the web viewer, and register it in the song's pitch JSON(s).

One column per hop, SUB rows per semitone between midi LO and HI (row 0 = top =
highest pitch). Alpha encodes level; colour is constant, so the page draws it
over its piano-roll rows.

Usage: python tools/spectrogram.py <vocals.wav|mp3> <out.png> [--json web/data/08.json ...]
         [--lo 40 --hi 90 --sub 3 --hop 0.01 --range-db 55]
"""

import argparse
import json
from pathlib import Path

import librosa
import numpy as np
from PIL import Image

SR = 22050
N_FFT = 4096


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("out")
    ap.add_argument("--json", nargs="*", default=[], help="pitch JSON files to add the spec entry to")
    ap.add_argument("--lo", type=int, default=40)
    ap.add_argument("--hi", type=int, default=90)
    ap.add_argument("--sub", type=int, default=3)
    ap.add_argument("--hop", type=float, default=0.01)
    ap.add_argument("--range-db", type=float, default=55.0)
    args = ap.parse_args()

    y, _ = librosa.load(args.audio, sr=SR, mono=True)
    hop = int(round(args.hop * SR))
    S = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=hop, center=True)) ** 2  # (bins, frames)
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    rows = (args.hi - args.lo + 1) * args.sub
    out = np.zeros((rows, S.shape[1]), dtype=np.float32)
    for r in range(rows):
        m = args.hi + 0.5 - (r + 0.5) / args.sub
        f0, f1 = librosa.midi_to_hz(m - 0.5 / args.sub), librosa.midi_to_hz(m + 0.5 / args.sub)
        k0 = max(1, int(np.searchsorted(freqs, f0)))
        k1 = max(k0 + 1, int(np.searchsorted(freqs, f1, side="right")))
        out[r] = S[k0:k1].max(axis=0)
    db = 10 * np.log10(out + 1e-12)
    # floor = per-row background (median), so broadband leakage fades and harmonics stand out
    db = db - np.median(db, axis=1, keepdims=True)
    peak = np.percentile(db, 99.5)
    v = np.clip((db - (peak - args.range_db)) / args.range_db, 0, 1)
    alpha = (v**1.5 * 230).astype(np.uint8)
    rgba = np.zeros((rows, S.shape[1], 4), dtype=np.uint8)
    rgba[..., 0], rgba[..., 1], rgba[..., 2] = 20, 40, 90
    rgba[..., 3] = alpha
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(args.out, optimize=True)
    print(f"{Path(args.out).name}: {S.shape[1]} frames x {rows} rows, {Path(args.out).stat().st_size // 1024} kB")

    entry = {"file": Path(args.out).name, "hop_s": hop / SR, "midi_lo": args.lo, "midi_hi": args.hi, "sub": args.sub}
    for j in args.json:
        p = Path(j)
        d = json.loads(p.read_text(encoding="utf-8"))
        d["spec"] = entry
        p.write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")
        print(f"  registered in {p.name}")


if __name__ == "__main__":
    main()
