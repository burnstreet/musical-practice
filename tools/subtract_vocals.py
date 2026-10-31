"""Recover the vocal by subtracting the aligned playback from the full mix.

Uses the lag from work/align_report.json, then fits a complex gain per
STFT bin (least squares over time) so EQ/mastering differences and the
sub-sample part of the lag are absorbed:  V(f,t) = F(f,t) - g(f) * B(f,t).

Outputs (mix timeline, mono 44.1 kHz):
  work/subtracted/<id>_vocals.wav
  work/subtracted/<id>_backing.wav   (g(f) * B, i.e. the playback as it sits in the mix)

Usage: python tools/subtract_vocals.py <id>
"""

import json
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path.cwd()  # content root (mp.ps1 -Content sets the working directory)
DECODED = ROOT / "work" / "decoded"
OUT = ROOT / "work" / "subtracted"
SR = 44100
N_FFT, HOP = 4096, 1024


def load_aligned(song_id: str):
    report = json.loads((ROOT / "work" / "align_report.json").read_text(encoding="utf-8"))
    entry = next(r for r in report if r["song"] == song_id)
    lag = entry["lag_samples_median"]  # pb[t] <-> mix[t + lag]
    mix, _ = sf.read(DECODED / f"{song_id}_mix.wav", dtype="float32")
    pb, _ = sf.read(DECODED / f"{song_id}_pb.wav", dtype="float32")
    # bring pb onto the mix timeline: pb_al[i] = pb[i - lag]
    pb_al = np.zeros_like(mix)
    if lag <= 0:
        n = min(len(mix), len(pb) + lag)
        pb_al[:n] = pb[-lag : -lag + n]
    else:
        n = min(len(mix) - lag, len(pb))
        pb_al[lag : lag + n] = pb[:n]
    return mix, pb_al, lag, entry


def subtract(mix: np.ndarray, pb: np.ndarray):
    win = signal.windows.hann(N_FFT, sym=False)
    stft = signal.ShortTimeFFT(win, hop=HOP, fs=SR, fft_mode="onesided")
    F = stft.stft(mix)
    B = stft.stft(pb)
    # per-bin complex least-squares gain, computed over the whole song
    num = np.sum(F * np.conj(B), axis=1)
    den = np.sum(np.abs(B) ** 2, axis=1) + 1e-9
    g = num / den
    Bs = g[:, None] * B
    V = F - Bs
    vocals = stft.istft(V, k1=len(mix))[: len(mix)]
    backing = stft.istft(Bs, k1=len(mix))[: len(mix)]
    return vocals.astype(np.float32), backing.astype(np.float32), g


def main():
    song_id = sys.argv[1].zfill(2)
    mix, pb, lag, entry = load_aligned(song_id)
    vocals, backing, g = subtract(mix, pb)
    OUT.mkdir(parents=True, exist_ok=True)
    sf.write(OUT / f"{song_id}_vocals.wav", vocals, SR)
    sf.write(OUT / f"{song_id}_backing.wav", backing, SR)
    res = float(np.sum(vocals**2) / np.sum(mix**2))
    freqs = np.fft.rfftfreq(N_FFT, 1 / SR)
    lo = (freqs > 40) & (freqs < 150)
    print(
        f"{song_id}: lag {lag} samples ({lag / SR:.3f}s), residual energy {res:.3f} of mix, "
        f"|g| 40-150Hz median {np.median(np.abs(g[lo])):.3f}, |g| 1-4kHz median "
        f"{np.median(np.abs(g[(freqs > 1000) & (freqs < 4000)])):.3f}"
    )


if __name__ == "__main__":
    main()
