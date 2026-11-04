"""Builds content/: public manifest + AES-GCM encrypted library, song files and stems.

Usage: PITCH_PASSWORD=... python tools/pack.py [--strict] [--out content] [--new-salt] [--root .] [--cache dir]
Format: specs/content-format.spec.md. Incomplete songs go to <out>/report.txt and are not packed.
"""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path

import script_format
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from sections import detect_for

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
    ffmpeg(
        "-i",
        str(src),
        *(["-af", af] if af else []),
        "-ac",
        "1",
        "-ar",
        str(RATE),
        "-b:a",
        "128k",
        "-map_metadata",
        "-1",
        "-fflags",
        "+bitexact",
        "-flags:a",
        "+bitexact",
        str(dst),
    )


def seconds(path):
    pcm = ffmpeg("-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(RATE), "-")
    return len(pcm) / 2 / RATE


def stem(src, dst, af=None, cache=None):
    """`encode` to dst, returns (file, seconds); with a cache dir both are reused for the same source bytes and filter."""
    if cache:
        key = sha16(src.read_bytes() + (af or "").encode())
        hit, sec = cache / f"{key}.mp3", cache / f"{key}.sec"
        if hit.exists() and sec.exists():
            return hit, float(sec.read_text())
    encode(src, dst, af)
    dur = seconds(dst)
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dst, hit)
        sec.write_text(repr(dur))
    return dst, dur


def check_song(root, cfg_roles, s, work, cache=None):
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
    mix = data / f"{nid}_mix.mp3"
    back = data / (f"{nid}_playback.mp3" if s["backing"] == "playback" else f"{nid}_no_vocals.mp3")
    for f in (mix, back):
        if not f.exists():
            return f"{nid}: rule 4, {f.name} missing", None
    voices, dur = stem(mix, work / f"{nid}_voices.mp3", cache=cache)
    af = None
    if s["backing"] == "playback":
        off = s.get("playbackOffsetSec", 0.0)
        trim = f"atrim=start={off},asetpts=N/SR/TB" if off > 0 else f"adelay={int(-off * 1000)}:all=1"
        af = f"{trim},apad,atrim=end={dur}"
    backing, bd = stem(back, work / f"{nid}_backing.mp3", af, cache)
    if abs(bd - dur) > TOL:
        return f"{nid}: rule 5, stem lengths differ ({dur:.3f} s vs {bd:.3f} s)", None
    return None, (notes, voices, backing, dur)


def compute_bars(ordered, bpm, dur, beats=4):
    """(bar start seconds, bar index per note) for notes sorted by start; bars of `beats` quarters run on to `dur`."""
    q = 60 / bpm
    bar_len = beats * q
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
    # The intro before the first sung bar: whole bars counted back from it, so the staff shows the rests.
    lead = int((bars[0] + 1e-6) // bar_len) if bars[0] > 0 else 0
    bars = [bars[0] - (lead - m) * bar_len for m in range(lead)] + bars
    seq = [i + lead for i in seq]
    return [round(b, 3) for b in bars], seq


def build_song(s, notes, dur):
    bpm = s["bpm"]
    beats = s.get("beats", 4)  # quarters per bar (time signature beats/4)
    ordered = sorted(notes, key=lambda n: n["start"])
    bars, seq = compute_bars(ordered, bpm, dur, beats)
    out = [
        {
            "start": n["start"],
            "end": n["end"],
            "midi": 71 if n.get("spoken") else n["midi"],  # a spoken note has no pitch; 71 is the middle line
            "syllable": n.get("syllable") or n.get("lyric") or "",
            "role": n["role"],
            "phrase": n["phrase"],
            "bar": i,
            "beat": n["beat"],
            "dur": n["dur"],
            **({"spoken": True} if n.get("spoken") else {}),
            **({"slur": True} if n.get("slur") else {}),
            **({"tie": True} if n.get("tie") else {}),
        }
        for n, i in zip(ordered, seq)
    ]
    phrases = []
    for p in sorted({n["phrase"] for n in out}):
        ns = [n for n in out if n["phrase"] == p]
        phrases.append({"index": p, "label": f"Phrase {p + 1}", "start": ns[0]["start"], "end": ns[-1]["end"]})
    return {"id": s["id"], "bpm": bpm, "key": s["key"], "timeSig": [beats, 4], "bars": bars, "notes": out, "phrases": phrases}


def pack_script(root, cfg, put, put_json, library):
    """Sets library["script"] when web/data/script.json is complete; returns the problems."""
    path = root / script_format.SCRIPT
    if not path.exists():
        return []
    try:
        script = script_format.load(cfg, path)
    except (script_format.ScriptError, ValueError) as e:
        return [f"script: rule 1, {e}"]
    speakers = script_format.speaking_roles(cfg)
    files = {}
    for line in script_format.lines(script):
        mp3 = script_format.audio_path(line, speakers[line["role"]].get("voice"), root)
        files[line["id"]] = mp3
    missing = [f"script: rule 2, {i['id']} ({i['role']}) has no audio" for i in script_format.lines(script) if not files[i["id"]].exists()]
    if missing:
        return missing
    ids = {lid: put(mp3.read_bytes()) for lid, mp3 in files.items()}
    for line in script_format.lines(script):
        line.pop("say", None)
        line["audio"] = ids[line["id"]]
    library["script"] = {"file": put_json(script), "audio": list(dict.fromkeys(ids.values()))}
    return []


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--out", default="content")
    ap.add_argument("--new-salt", action="store_true")
    ap.add_argument("--root", default=".")  # content root
    ap.add_argument("--cache")  # dir for encoded stems (dev server); none in CI
    a = ap.parse_args(argv)
    cache = Path(a.cache) if a.cache else None
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
        problem, prepared = check_song(root, role_ids, s, work, cache)
        if problem:
            problems.append(problem)
            continue
        notes, voices, backing, dur = prepared
        song = build_song(s, notes, dur)
        stored = json.loads((root / "web" / "data" / f"{s['id']}.json").read_text(encoding="utf-8"))
        # stored sections win, as they are; else detect as sections.py would
        song["sections"] = stored["sections"] if "sections" in stored else detect_for(notes, s["bpm"], s.get("beats", 4))
        used = {n["role"] for n in song["notes"]}
        songs.append(
            {
                "id": s["id"],
                "number": s["number"],
                "title": s["title"],
                "durationSec": round(dur, 1),
                "roles": [r for r in role_ids if r in used],
                "files": {"voices": put(voices.read_bytes()), "backing": put(backing.read_bytes()), "notes": put_json(song)},
            }
        )
    roles = [{"id": r["id"], "name": r["name"], "sings": r["sings"], "speaks": bool(r.get("speaks"))} for r in cfg["roles"]]
    library = {"roles": roles, "songs": songs}
    problems += pack_script(root, cfg, put, put_json, library)
    library = put_json(library)

    for f in work.iterdir():
        f.unlink()
    work.rmdir()
    for f in out.glob("*.bin"):
        if f.stem not in sizes:
            f.unlink()
    manifest = {
        "format": 2,
        "build": datetime.now(UTC).isoformat(timespec="seconds"),
        "keyId": sha16(salt),
        "salt": base64.b64encode(salt).decode(),
        "iterations": ITERATIONS,
        "library": library,
        "songCount": len(songs),
        "totalBytes": sum(sizes.values()),
        "files": sizes,
    }
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    (out / "report.txt").write_text("\n".join(problems) + "\n" if problems else "all songs complete\n", encoding="utf-8")
    for p in problems:
        print("incomplete:", p, file=sys.stderr)
    return 1 if problems and a.strict else 0


if __name__ == "__main__":
    sys.exit(main())
