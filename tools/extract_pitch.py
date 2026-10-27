"""Extract a vocal pitch track and note events from a vocal stem.

Pipeline:
  1. load vocal stem (mono, 22.05 kHz)
  2. pYIN pitch tracking (hop 10 ms), voicing from pYIN probabilities
  3. gate frames by stem RMS (Demucs stems leave low-level bleed)
  4. median-smooth f0 in cents, drop short voiced islands
  5. segment into notes: quantize to nearest semitone, merge runs, drop <80 ms

Outputs:
  work/pitch/<id>.json      full pitch track + notes (web contract)
  work/pitch/<id>.png       debug plot

Usage: python tools/extract_pitch.py <id> <stem.wav> <title> [--audio 05_mix.mp3]
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np
from scipy import signal
from scipy.ndimage import median_filter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "work" / "pitch"

SR = 22050
HOP = 221  # ~10.02 ms at 22050 Hz
FMIN, FMAX = librosa.note_to_hz("E2"), librosa.note_to_hz("C6")

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_name(m: int) -> str:
    return f"{NOTE_NAMES[m % 12]}{m // 12 - 1}"


def hz_to_midi(hz):
    return 69 + 12 * np.log2(hz / 440.0)


def drop_short_runs(mask: np.ndarray, min_len: int) -> np.ndarray:
    """Set voiced runs shorter than min_len frames to False."""
    out = mask.copy()
    i = 0
    n = len(mask)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i < min_len:
            out[i:j] = False
        i = j
    return out


def track_pitch(y: np.ndarray, fmin: float = FMIN, highpass_hz: float = 90.0):
    if highpass_hz > 0:
        # subtraction residuals keep bass/hum leakage below the vocal range
        sos = signal.butter(4, highpass_hz, btype="high", fs=SR, output="sos")
        y = signal.sosfiltfilt(sos, y).astype(np.float32)
    f0, voiced, vprob = librosa.pyin(
        y, fmin=fmin, fmax=FMAX, sr=SR, frame_length=2048, hop_length=HOP,
        fill_na=np.nan, resolution=0.05, max_transition_rate=35.92,
    )
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    rms_db = librosa.amplitude_to_db(rms + 1e-9, ref=np.max(rms))
    return f0, voiced, vprob, rms_db


def leak_ratio_db(stem: np.ndarray, mix: np.ndarray, n_frames: int) -> np.ndarray:
    """Per-frame energy of the stem relative to the mix, in the vocal band.

    Subtraction residuals keep codec/mastering noise at about -15 dB below the
    mix in instrumental passages, while sung passages sit around -6 dB.
    """
    sos = signal.butter(4, [100, 2000], btype="band", fs=SR, output="sos")
    n = min(len(stem), len(mix))
    s = librosa.feature.rms(y=signal.sosfiltfilt(sos, stem[:n]).astype(np.float32), frame_length=2048, hop_length=HOP)[0]
    m = librosa.feature.rms(y=signal.sosfiltfilt(sos, mix[:n]).astype(np.float32), frame_length=2048, hop_length=HOP)[0]
    r = 20 * np.log10((s + 1e-7) / (m + 1e-7))
    out = np.full(n_frames, -100.0)
    k = min(n_frames, len(r))
    out[:k] = r[:k]
    return out


def clean(f0, voiced, vprob, rms_db, gate_db=-40.0, med_frames=5, min_run_frames=8, leak_db=None, leak_gate_db=-10.0):
    mask = voiced & (rms_db > gate_db) & np.isfinite(f0)
    if leak_db is not None:
        mask &= leak_db > leak_gate_db
    mask = drop_short_runs(mask, min_run_frames)
    cents = np.full_like(f0, np.nan)
    cents[mask] = 1200 * np.log2(f0[mask] / 440.0)
    # median filter only inside voiced runs so gaps don't smear
    sm = cents.copy()
    i, n = 0, len(cents)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i
        while j < n and mask[j]:
            j += 1
        if j - i >= med_frames:
            sm[i:j] = median_filter(cents[i:j], size=med_frames, mode="nearest")
        i = j
    f0_clean = np.where(mask, 440.0 * 2 ** (sm / 1200), np.nan)
    # pYIN's voiced probability is spread over candidates when several voices
    # sing at once, so it is low in absolute terms; scale it relative to the song.
    conf = np.where(mask, vprob, 0.0)
    p95 = np.percentile(conf[mask], 95) if mask.any() else 1.0
    conf = np.clip(conf / max(p95, 1e-6), 0.0, 1.0)
    return f0_clean, conf, mask


def fold_octaves(f0, mask, hop_s, max_gap_s=1.0, tol=3.0):
    """Collapse octave jumps so two voices singing in octaves become one line.

    Works on note events rather than frames, so the few garbage frames a
    tracker emits while flipping between voices do not drive the decision:
      1. segment notes on the raw track
      2. a note ~12/24 semitones from the previous note (gap < max_gap_s)
         is shifted by octaves to stay near it
      3. each phrase (notes separated by < max_gap_s) is shifted whole so its
         median lies within ±6 semitones of the song median
      4. every frame takes the shift of the note it belongs to (or the nearest
         note in time), so the frame curve follows the folded notes
    """
    notes = segment_notes(f0, mask, hop_s)
    if not notes:
        return f0
    shifts = np.zeros(len(notes))
    folded = np.array([n["midi"] for n in notes], dtype=float)
    for k in range(1, len(notes)):
        if notes[k]["start"] - notes[k - 1]["end"] > max_gap_s:
            continue
        d = folded[k] - folded[k - 1]
        o = round(d / 12)
        if o != 0 and abs(d - 12 * o) <= tol:
            shifts[k] -= 12 * o
            folded[k] -= 12 * o
    center = float(np.median(folded))
    k0 = 0
    for k in range(1, len(notes) + 1):
        if k == len(notes) or notes[k]["start"] - notes[k - 1]["end"] > max_gap_s:
            s = 12 * round((float(np.median(folded[k0:k])) - center) / 12)
            shifts[k0:k] -= s
            folded[k0:k] -= s
            k0 = k
    # frame -> note by nearest centre in time
    centres = np.array([(n["start"] + n["end"]) / 2 for n in notes])
    t = np.arange(len(f0)) * hop_s
    idx = np.searchsorted(centres, t)
    idx = np.clip(idx, 0, len(notes) - 1)
    left = np.clip(idx - 1, 0, len(notes) - 1)
    nearer_left = np.abs(t - centres[left]) < np.abs(t - centres[idx])
    idx = np.where(nearer_left, left, idx)
    # fold every frame into the octave closest to its note's folded pitch, so
    # frames that came from the other voice land on the same line
    midi = np.full_like(f0, np.nan)
    m = hz_to_midi(f0[mask])
    midi[mask] = m - 12 * np.round((m - folded[idx[mask]]) / 12)
    return np.where(mask, 440.0 * 2 ** ((midi - 69) / 12), np.nan)


def segment_notes(f0, mask, hop_s, min_note_s=0.08, max_jump_cents=80):
    """Piecewise-constant note events from the cleaned f0."""
    midi_f = np.full_like(f0, np.nan)
    midi_f[mask] = hz_to_midi(f0[mask])
    notes = []
    i, n = 0, len(f0)
    while i < n:
        if not mask[i]:
            i += 1
            continue
        j = i + 1
        # extend the segment while the pitch stays near the segment's running median
        seg = [midi_f[i]]
        while j < n and mask[j]:
            med = float(np.median(seg))
            if abs(midi_f[j] - med) * 100 > max_jump_cents:
                break
            seg.append(midi_f[j])
            j += 1
        if (j - i) * hop_s >= min_note_s:
            m = int(round(float(np.median(seg))))
            notes.append({"start": round(i * hop_s, 3), "end": round(j * hop_s, 3),
                          "midi": m, "name": midi_name(m),
                          "cents_off": round(float((np.median(seg) - m) * 100), 1)})
        i = j
    # merge adjacent notes with the same midi and tiny gaps
    merged = []
    for nt in notes:
        if merged and merged[-1]["midi"] == nt["midi"] and nt["start"] - merged[-1]["end"] < 0.05:
            merged[-1]["end"] = nt["end"]
        else:
            merged.append(nt)
    return merged


def plot(song_id, t, f0, conf, notes, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(40, 6))
    m = np.where(np.isfinite(f0), hz_to_midi(np.where(np.isfinite(f0), f0, 440)), np.nan)
    ax.scatter(t, m, c=conf, cmap="viridis", s=2, vmin=0, vmax=1)
    for nt in notes:
        ax.hlines(nt["midi"], nt["start"], nt["end"], colors="red", linewidth=2, alpha=0.6)
    ax.set_yticks(range(36, 96, 12))
    ax.set_yticklabels([midi_name(x) for x in range(36, 96, 12)])
    ax.grid(axis="y", alpha=0.3)
    ax.set_xlabel("s")
    ax.set_title(f"{song_id}: pYIN pitch (dots, color=confidence) and notes (red)")
    fig.tight_layout()
    fig.savefig(path, dpi=70)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("stem")
    ap.add_argument("title")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--stem-file", action="append", default=[], metavar="LABEL=FILE",
                    help="selectable audio in the web page, e.g. vocals=05_vocals.mp3")
    ap.add_argument("--gate-db", type=float, default=-40.0)
    ap.add_argument("--fmin", default="E2", help="lowest note to track, e.g. E2 or G2")
    ap.add_argument("--highpass", type=float, default=90.0, help="high-pass Hz before tracking, 0 = off")
    ap.add_argument("--mix", default=None, help="full mix WAV; gates frames where the stem is weak relative to it")
    ap.add_argument("--leak-gate-db", type=float, default=-10.0, help="stem/mix ratio below which a frame is unvoiced")
    args = ap.parse_args()
    stems = dict(s.split("=", 1) for s in args.stem_file)

    y, _ = librosa.load(args.stem, sr=SR, mono=True)
    f0, voiced, vprob, rms_db = track_pitch(y, fmin=float(librosa.note_to_hz(args.fmin)), highpass_hz=args.highpass)
    leak = None
    if args.mix:
        mix, _ = librosa.load(args.mix, sr=SR, mono=True)
        leak = leak_ratio_db(y, mix, len(f0))
    f0c, conf, mask = clean(f0, voiced, vprob, rms_db, gate_db=args.gate_db, leak_db=leak, leak_gate_db=args.leak_gate_db)
    hop_s = HOP / SR
    t = np.arange(len(f0c)) * hop_s
    notes = segment_notes(f0c, mask, hop_s)

    OUT.mkdir(parents=True, exist_ok=True)
    pitch = [[round(float(ti), 3), (round(float(fi), 2) if np.isfinite(fi) else None), round(float(ci), 2)]
             for ti, fi, ci in zip(t, f0c, conf)]
    data = {"id": args.id, "title": args.title, "audio": args.audio, "hop_s": round(hop_s, 5),
            "pitch": pitch, "notes": notes}
    if stems:
        data["stems"] = stems
    (OUT / f"{args.id}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    plot(args.id, t, f0c, conf, notes, OUT / f"{args.id}.png")

    voiced_s = mask.sum() * hop_s
    print(f"{args.id}: {len(f0c)} frames, voiced {voiced_s:.1f}s of {t[-1]:.1f}s, {len(notes)} notes, "
          f"range {midi_name(min(n['midi'] for n in notes))}-{midi_name(max(n['midi'] for n in notes))}")


if __name__ == "__main__":
    main()
