"""Builds content/: public manifest + AES-GCM encrypted library, song files and stems.

Usage: PITCH_PASSWORD=... python tools/pack.py [--strict] [--out content] [--new-salt] [--root .]
Format: specs/content-format.spec.md. Incomplete songs go to <out>/report.txt and are not packed.
"""
import argparse
import base64
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

ITERATIONS = 600_000
RATE = 44100
TOL = 0.02


def derive_key(password, salt, iterations=ITERATIONS):
    return PBKDF2HMAC(hashes.SHA256(), 32, salt, iterations).derive(password.encode())


def encrypt(key, data):
    iv = os.urandom(12)
    return iv + AESGCM(key).encrypt(iv, data, None)  # tag appended


def decrypt(key, blob):
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)


def sha16(data):
    return hashlib.sha256(data).hexdigest()[:16]


def ffmpeg(*args):
    return subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True, capture_output=True).stdout


def encode(src, dst, af=None):
    """Mono 44.1 kHz 128 kbps MP3, bit-exact so equal inputs give equal bytes."""
    ffmpeg("-i", str(src), *(["-af", af] if af else []), "-ac", "1", "-ar", str(RATE), "-b:a", "128k", "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:a", "+bitexact", str(dst))


def seconds(path):
    pcm = ffmpeg("-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-")
    return len(pcm) / 2 / RATE


def check_song(root, cfg_roles, s, work):
    """Returns (problem or None, prepared) where prepared = (notes, voices_mp3, backing_mp3, duration)."""
    nid = s["id"]
    data = root / "web" / "data"
    jf = data / f"{nid}.json"
    if not jf.exists():
        return f"{nid}: rule 1, {jf.name} missing", None
    notes = json.loads(jf.read_text(encoding="utf-8")).get("notes", [])
    if not notes:
        return f"{nid}: rule 1, no notes", None
    for i, n in enumerate(notes, 1):
        if n.get("role") not in cfg_roles:
            return f"{nid}: rule 2, note {i} missing role", None
        if n.get("phrase") is None:
            return f"{nid}: rule 2, note {i} missing phrase", None
    used = {n["phrase"] for n in notes}
    gap = next((p for p in range(max(used)) if p not in used), None)
    if gap is not None:
        return f"{nid}: rule 3, phrase {gap} missing", None
    mix = data / f"{nid}.mp3"
    back = data / f"{nid}_playback.mp3" if s["backing"] == "playback" else root / "work" / "separated" / f"{nid}_backing.mp3"
    for f in (mix, back):
        if not f.exists():
            return f"{nid}: rule 4, {f.name} missing", None
    voices = work / f"{nid}_voices.mp3"
    encode(mix, voices)
    dur = seconds(voices)
    backing = work / f"{nid}_backing.mp3"
    if s["backing"] == "playback":
        off = s.get("playbackOffsetSec", 0.0)
        trim = f"atrim=start={off},asetpts=N/SR/TB" if off > 0 else f"adelay={int(-off * 1000)}:all=1"
        encode(back, backing, f"{trim},apad,atrim=end={dur}")
    else:
        encode(back, backing)
    bd = seconds(backing)
    if abs(bd - dur) > TOL:
        return f"{nid}: rule 5, stem lengths differ ({dur:.3f} s vs {bd:.3f} s)", None
    return None, (notes, voices, backing, dur)


def build_song(s, notes, dur):
    bpm, q = s["bpm"], 60 / s["bpm"]
    bar_len = 4 * q
    ordered = sorted(notes, key=lambda n: n["start"])
    # Score bar numbers repeat on repeated sections: renumber bars sequentially in time order.
    seq, known, prev = [], {}, None
    for n in ordered:
        bs = n["start"] - n["beat"] * q
        if prev is None:
            i = n["bar"]
        elif n["bar"] > prev[0]:
            i = seq[-1] + n["bar"] - prev[0]
        elif n["bar"] == prev[0] and bs - prev[1] < bar_len / 2:
            i = seq[-1]
        else:  # score bar went back (or same bar a bar later): a repeat starts a new run
            i = seq[-1] + max(1, round((bs - prev[1]) / bar_len))
        seq.append(i)
        known[i] = min(known.get(i, bs), bs)
        prev = (n["bar"], bs)
    idx = sorted(known)
    bars = [known[idx[0]] - (idx[0] - m) * bar_len for m in range(idx[0])]
    for a, b in zip(idx, idx[1:]):
        bars += [known[a] + (known[b] - known[a]) * (m - a) / (b - a) for m in range(a, b)]
    bars.append(known[idx[-1]])
    while bars[-1] + bar_len <= dur:
        bars.append(bars[-1] + bar_len)
    bars = [round(b, 3) for b in bars]
    out = [
        {"start": n["start"], "end": n["end"], "midi": n["midi"], "syllable": n.get("syllable", n.get("lyric", "")),
         "role": n["role"], "phrase": n["phrase"], "bar": i, "beat": n["beat"], "dur": n["dur"]}
        for n, i in zip(ordered, seq)
    ]
    phrases = []
    for p in sorted({n["phrase"] for n in out}):
        ns = [n for n in out if n["phrase"] == p]
        phrases.append({"index": p, "label": f"Phrase {p + 1}", "start": ns[0]["start"], "end": ns[-1]["end"]})
    return {"id": s["id"], "bpm": bpm, "key": s["key"], "timeSig": [4, 4], "bars": bars, "notes": out, "phrases": phrases}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--out", default="content")
    ap.add_argument("--new-salt", action="store_true")
    ap.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    a = ap.parse_args(argv)
    password = os.environ.get("PITCH_PASSWORD")
    if not password:
        print("PITCH_PASSWORD is not set", file=sys.stderr)
        return 2
    root, out = Path(a.root), Path(a.out)
    cfg = json.loads((root / "sources" / "config.json").read_text(encoding="utf-8"))
    role_ids = [r["id"] for r in cfg["roles"]]
    out.mkdir(parents=True, exist_ok=True)
    work = out / ".work"
    work.mkdir(exist_ok=True)

    salt_file = out / "salt"
    if salt_file.exists() and not a.new_salt:
        salt = base64.b64decode(salt_file.read_text())
    else:
        salt = os.urandom(16)
        salt_file.write_text(base64.b64encode(salt).decode())
    key = derive_key(password, salt)

    sizes = {}

    def put(data):
        fid = sha16(data)
        blob = encrypt(key, data)
        (out / f"{fid}.bin").write_bytes(blob)
        sizes[fid] = len(blob)
        return fid

    def put_json(obj):
        return put(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode())

    problems, songs = [], []
    for s in sorted(cfg["songs"], key=lambda s: s["number"]):
        problem, prepared = check_song(root, role_ids, s, work)
        if problem:
            problems.append(problem)
            continue
        notes, voices, backing, dur = prepared
        song = build_song(s, notes, dur)
        used = {n["role"] for n in song["notes"]}
        songs.append({
            "id": s["id"], "number": s["number"], "title": s["title"], "durationSec": round(dur, 1),
            "roles": [r for r in role_ids if r in used],
            "files": {"voices": put(voices.read_bytes()), "backing": put(backing.read_bytes()), "notes": put_json(song)},
        })
    library = put_json({"roles": cfg["roles"], "songs": songs})

    for f in work.iterdir():
        f.unlink()
    work.rmdir()
    for f in out.glob("*.bin"):
        if f.stem not in sizes:
            f.unlink()
    manifest = {
        "format": 1, "build": datetime.now(timezone.utc).isoformat(timespec="seconds"), "keyId": sha16(salt),
        "salt": base64.b64encode(salt).decode(), "iterations": ITERATIONS, "library": library,
        "songCount": len(songs), "totalBytes": sum(sizes.values()), "files": sizes,
    }
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (out / "report.txt").write_text("\n".join(problems) + "\n" if problems else "all songs complete\n", encoding="utf-8")
    for p in problems:
        print("incomplete:", p, file=sys.stderr)
    return 1 if problems and a.strict else 0


if __name__ == "__main__":
    sys.exit(main())
