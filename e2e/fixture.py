"""Builds the e2e fixture: a synthetic song (sine audio, no real content), packed and encrypted
into <dist>/content with password "e2e", plus a fake microphone recording at 440 Hz (A4).

usage: python e2e/fixture.py <dist-dir> <work-dir>
"""
import json
import math
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools"))
import pack  # noqa: E402

dist, work = Path(sys.argv[1]), Path(sys.argv[2])
shutil.rmtree(work, ignore_errors=True)
data = work / "web" / "data"
data.mkdir(parents=True)
(work / "sources").mkdir()


def sine_mp3(path, secs, freq):
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"sine=frequency={freq}:duration={secs}:sample_rate=44100",
                    "-ac", "1", "-b:a", "64k", str(path)], check=True)


# 18 notes on A4, 1 s apart from 1 s; maria sings the first 12, chor the rest. 3 phrases.
notes = [{"start": 1.0 + i, "end": 1.9 + i, "midi": 69, "lyric": "la", "role": "maria" if i < 12 else "chor",
          "phrase": i // 6, "bar": i // 4, "beat": float(i % 4), "dur": 1.0} for i in range(18)]
(data / "90.json").write_text(json.dumps({"notes": notes}), encoding="utf-8")
sine_mp3(data / "90.mp3", 20, 330)
sine_mp3(data / "90_playback.mp3", 20, 220)
roles = [{"id": "maria", "name": "Maria", "sings": True}, {"id": "chor", "name": "Chor", "sings": True}]
song = {"id": "90", "number": 90, "title": "E2E Testlied", "backing": "playback", "bpm": 60, "key": "A", "playbackOffsetSec": 0.0}
(work / "sources" / "config.json").write_text(json.dumps({"roles": roles, "songs": [song]}), encoding="utf-8")

import os  # noqa: E402

os.environ["PITCH_PASSWORD"] = "e2e"
if pack.main(["--root", str(work), "--out", str(dist / "content"), "--strict"]) != 0:
    sys.exit("pack failed")

# Fake microphone: 60 s of a steady 440 Hz tone, looped by Chromium.
with wave.open(str(work / "mic.wav"), "wb") as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(48000)
    w.writeframes(b"".join(struct.pack("<h", int(12000 * math.sin(2 * math.pi * 440 * i / 48000))) for i in range(48000 * 60)))
