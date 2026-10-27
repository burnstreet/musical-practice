"""Check sample alignment between full-mix and playback tracks.

For each song pair:
  1. decode both to mono 44.1 kHz WAV (cached in work/decoded)
  2. coarse lag via FFT cross-correlation at 8 kHz
  3. refine lag at 44.1 kHz around the coarse estimate
  4. drift check: lag re-estimated in several windows across the song
  5. subtraction residual: energy(full - g*backing) / energy(full), per window,
     also in a low band (<150 Hz) where vocals barely contribute

Usage: python tools/align_check.py [song numbers...]
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "sources" / "audio"
DECODED = ROOT / "work" / "decoded"
SR = 44100


def song_pairs():
    mixes = {m.group(1): p for p in (AUDIO / "Musik").glob("*.mp3") if (m := re.match(r"(\d\d)", p.name))}
    pbs = {m.group(1): p for p in (AUDIO / "Playback").glob("*.mp3") if (m := re.match(r"(\d\d)", p.name))}
    return {n: (mixes[n], pbs[n]) for n in sorted(mixes) if n in pbs}


def decode(src: Path, dst: Path) -> np.ndarray:
    if not dst.exists():
        DECODED.mkdir(parents=True, exist_ok=True)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-ac", "1", "-ar", str(SR), str(dst)], check=True)
    x, sr = sf.read(dst, dtype="float32")
    assert sr == SR
    return x


def xcorr_lag(a: np.ndarray, b: np.ndarray) -> tuple[int, float]:
    """Lag such that b[t] matches a[t + lag]. Returns (lag, normalized peak)."""
    c = signal.correlate(a, b, mode="full", method="fft")
    lags = signal.correlation_lags(len(a), len(b), mode="full")
    i = int(np.argmax(np.abs(c)))
    norm = np.sqrt(np.sum(a**2) * np.sum(b**2)) + 1e-12
    return int(lags[i]), float(c[i] / norm)


def coarse_lag(mix: np.ndarray, pb: np.ndarray) -> int:
    q = SR // 8000  # ~5
    m8 = signal.decimate(mix, q, ftype="fir")
    p8 = signal.decimate(pb, q, ftype="fir")
    lag8, _ = xcorr_lag(m8, p8)
    return lag8 * q


def refine_lag(mix: np.ndarray, pb: np.ndarray, lag: int, start: int, length: int, search: int = 3000) -> tuple[int, float]:
    """Refine lag using a window of `pb` starting at `start`, searching ±search samples."""
    b = pb[start : start + length]
    a0 = start + lag - search
    a1 = start + lag + length + search
    if a0 < 0 or a1 > len(mix) or len(b) < length:
        return lag, 0.0
    a = mix[a0:a1]
    c = signal.correlate(a, b, mode="valid", method="fft")
    i = int(np.argmax(np.abs(c)))
    norm = np.sqrt(np.sum(a[i : i + length] ** 2) * np.sum(b**2)) + 1e-12
    return lag - search + i, float(c[i] / norm)


def residual(mix_seg: np.ndarray, pb_seg: np.ndarray) -> tuple[float, float]:
    g = float(np.dot(mix_seg, pb_seg) / (np.dot(pb_seg, pb_seg) + 1e-12))
    r = mix_seg - g * pb_seg
    return g, float(np.sum(r**2) / (np.sum(mix_seg**2) + 1e-12))


def lowpass(x: np.ndarray, fc: float = 150.0) -> np.ndarray:
    sos = signal.butter(4, fc, btype="low", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, x)


def analyze(n: str, mix_path: Path, pb_path: Path) -> dict:
    mix = decode(mix_path, DECODED / f"{n}_mix.wav")
    pb = decode(pb_path, DECODED / f"{n}_pb.wav")
    lag = coarse_lag(mix, pb)

    win = 20 * SR
    windows = []
    n_win = 8
    usable = min(len(pb), len(mix) - lag) if lag >= 0 else min(len(pb) + lag, len(mix))
    starts = np.linspace(0, max(usable - win, 0), n_win).astype(int)
    for s in starts:
        s = int(s) if lag >= 0 else int(s) - lag
        l, peak = refine_lag(mix, pb, lag, s, win)
        a0 = s + l
        if a0 < 0 or a0 + win > len(mix) or s + win > len(pb):
            continue
        a, b = mix[a0 : a0 + win], pb[s : s + win]
        g, res = residual(a, b)
        _, res_low = residual(lowpass(a), lowpass(b))
        windows.append(
            {
                "pb_start_s": round(s / SR, 1),
                "lag": l,
                "peak": round(peak, 3),
                "gain": round(g, 3),
                "residual": round(res, 3),
                "residual_low": round(res_low, 3),
            }
        )

    lags = [w["lag"] for w in windows]
    out = {
        "song": n,
        "mix": mix_path.name,
        "playback": pb_path.name,
        "mix_len_s": round(len(mix) / SR, 2),
        "pb_len_s": round(len(pb) / SR, 2),
        "coarse_lag": lag,
        "lag_samples_median": int(np.median(lags)) if lags else None,
        "lag_s": round(float(np.median(lags)) / SR, 4) if lags else None,
        "lag_spread_samples": (max(lags) - min(lags)) if lags else None,
        "peak_median": round(float(np.median([w["peak"] for w in windows])), 3) if windows else None,
        "residual_median": round(float(np.median([w["residual"] for w in windows])), 3) if windows else None,
        "residual_low_median": round(float(np.median([w["residual_low"] for w in windows])), 3) if windows else None,
        "windows": windows,
    }
    return out


def verdict(r: dict) -> str:
    if r["lag_spread_samples"] is None:
        return "FAIL (no overlap)"
    if r["lag_spread_samples"] > 50:
        return "DRIFT (lag varies, subtraction will fail)"
    if r["residual_low_median"] is not None and r["residual_low_median"] < 0.15:
        return "ALIGNED (same mix, subtraction viable)"
    if r["peak_median"] is not None and r["peak_median"] > 0.3:
        return "ALIGNED-ish (same tempo, different mix/master)"
    return "DIFFERENT (different performance/arrangement)"


def main():
    pairs = song_pairs()
    wanted = [a.zfill(2) for a in sys.argv[1:]] or list(pairs)
    results = []
    for n in wanted:
        r = analyze(n, *pairs[n])
        r["verdict"] = verdict(r)
        results.append(r)
        print(
            f"{n}: lag={r['lag_s']}s spread={r['lag_spread_samples']} peak={r['peak_median']} "
            f"res={r['residual_median']} res_low={r['residual_low_median']} -> {r['verdict']}",
            flush=True,
        )
    (ROOT / "work" / "align_report.json").write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
