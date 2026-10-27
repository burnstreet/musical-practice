"""Neural pitch tracking (CREPE or FCPE) with the same cleaning, note
segmentation and output format as extract_pitch.py.

Everything runs at 16 kHz with a 10 ms hop (160 samples).

Usage: python tools/extract_pitch_nn.py <id> <stem.wav> <title> --method crepe|fcpe
       [--mix mix.wav] [--audio ...] [--stem-file label=file ...]
"""
import argparse
import json
from pathlib import Path

import librosa
import numpy as np
import torch
from scipy import signal

from extract_pitch import OUT, clean, fold_octaves, midi_name, plot, segment_notes

SR = 16000
HOP = 160
HOP_S = HOP / SR
FRAME = 1024


def rms_db(y: np.ndarray) -> np.ndarray:
    r = librosa.feature.rms(y=y, frame_length=FRAME, hop_length=HOP)[0]
    return librosa.amplitude_to_db(r + 1e-9, ref=np.max(r))


def leak_ratio_db(stem: np.ndarray, mix: np.ndarray, n_frames: int) -> np.ndarray:
    sos = signal.butter(4, [100, 2000], btype="band", fs=SR, output="sos")
    n = min(len(stem), len(mix))
    s = librosa.feature.rms(y=signal.sosfiltfilt(sos, stem[:n]).astype(np.float32), frame_length=FRAME, hop_length=HOP)[0]
    m = librosa.feature.rms(y=signal.sosfiltfilt(sos, mix[:n]).astype(np.float32), frame_length=FRAME, hop_length=HOP)[0]
    r = 20 * np.log10((s + 1e-7) / (m + 1e-7))
    out = np.full(n_frames, -100.0)
    k = min(n_frames, len(r))
    out[:k] = r[:k]
    return out


def track_crepe(y: np.ndarray, fmin: float, fmax: float, periodicity_thr: float):
    import torchcrepe

    audio = torch.from_numpy(y)[None]
    f0, per = torchcrepe.predict(audio, SR, HOP, fmin, fmax, model="full", decoder=torchcrepe.decode.viterbi,
                                 return_periodicity=True, batch_size=512, device="cpu")
    per = torchcrepe.filter.median(per, 3)
    f0 = f0[0].numpy().astype(np.float64)
    per = per[0].numpy().astype(np.float64)
    voiced = per > periodicity_thr
    return f0, voiced, per


def track_fcpe(y: np.ndarray, fmin: float, fmax: float, threshold: float):
    from torchfcpe import spawn_bundled_infer_model

    model = spawn_bundled_infer_model(device="cpu")
    n_frames = len(y) // HOP + 1
    audio = torch.from_numpy(y)[None, :, None]
    f0 = model.infer(audio, sr=SR, decoder_mode="local_argmax", threshold=threshold, f0_min=fmin, f0_max=fmax,
                     interp_uv=False, output_interp_target_length=n_frames)
    f0 = f0[0, :, 0].numpy().astype(np.float64)
    voiced = f0 > 0
    return np.where(voiced, f0, np.nan), voiced, np.where(voiced, 1.0, 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("id")
    ap.add_argument("stem")
    ap.add_argument("title")
    ap.add_argument("--method", choices=["crepe", "fcpe"], default="crepe")
    ap.add_argument("--audio", default=None)
    ap.add_argument("--stem-file", action="append", default=[], metavar="LABEL=FILE")
    ap.add_argument("--mix", default=None)
    ap.add_argument("--leak-gate-db", type=float, default=-10.0)
    ap.add_argument("--gate-db", type=float, default=-40.0)
    ap.add_argument("--fmin", default="E2")
    ap.add_argument("--fmax", default="C6")
    ap.add_argument("--highpass", type=float, default=90.0)
    ap.add_argument("--threshold", type=float, default=None,
                    help="voicing threshold: CREPE periodicity (default 0.3), FCPE (default 0.006)")
    ap.add_argument("--suffix", default="", help="appended to the output id, e.g. _crepe")
    ap.add_argument("--fold-octaves", action="store_true", help="merge voices singing in octaves into one line")
    args = ap.parse_args()
    stems = dict(s.split("=", 1) for s in args.stem_file)
    fmin, fmax = float(librosa.note_to_hz(args.fmin)), float(librosa.note_to_hz(args.fmax))

    y, _ = librosa.load(args.stem, sr=SR, mono=True)
    if args.highpass > 0:
        sos = signal.butter(4, args.highpass, btype="high", fs=SR, output="sos")
        y = signal.sosfiltfilt(sos, y).astype(np.float32)

    if args.method == "crepe":
        f0, voiced, vprob = track_crepe(y, fmin, fmax, args.threshold if args.threshold is not None else 0.3)
    else:
        f0, voiced, vprob = track_fcpe(y, fmin, fmax, args.threshold if args.threshold is not None else 0.006)

    n = len(f0)
    rdb = rms_db(y)[:n]
    rdb = np.pad(rdb, (0, n - len(rdb)), constant_values=-100)
    leak = None
    if args.mix:
        mix, _ = librosa.load(args.mix, sr=SR, mono=True)
        leak = leak_ratio_db(y, mix, n)
    f0c, conf, mask = clean(f0, voiced, vprob, rdb, gate_db=args.gate_db, leak_db=leak, leak_gate_db=args.leak_gate_db)
    if args.fold_octaves:
        f0c = fold_octaves(f0c, mask, HOP_S)
    t = np.arange(n) * HOP_S
    notes = segment_notes(f0c, mask, HOP_S)

    out_id = args.id + args.suffix
    OUT.mkdir(parents=True, exist_ok=True)
    pitch = [[round(float(ti), 3), (round(float(fi), 2) if np.isfinite(fi) else None), round(float(ci), 2)]
             for ti, fi, ci in zip(t, f0c, conf)]
    data = {"id": out_id, "title": f"{args.title} ({args.method})", "audio": args.audio, "hop_s": HOP_S,
            "pitch": pitch, "notes": notes}
    if stems:
        data["stems"] = stems
    (OUT / f"{out_id}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    plot(out_id, t, f0c, conf, notes, OUT / f"{out_id}.png")
    print(f"{out_id}: {n} frames, voiced {mask.sum() * HOP_S:.1f}s of {t[-1]:.1f}s, {len(notes)} notes, "
          f"range {midi_name(min(x['midi'] for x in notes))}-{midi_name(max(x['midi'] for x in notes))}")


if __name__ == "__main__":
    main()
