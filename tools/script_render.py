"""Renders every script line to MP3 with the voice of its role (local, never in CI).

Usage (content root as working directory):
  python tools/script_render.py            render lines without audio, delete orphans
  python tools/script_render.py --test     voice test: work/voice-test/<role>.mp3 per role
  python tools/script_render.py --worker   editor server mode: {"item", "voice"} per stdin line -> {"hash"} or {"error"}
Spec: specs/tts-renderer.spec.md. Runs in tools/.venv-tts; script_format.py is standard library only.
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path

import numpy as np
import script_format as sf

MAX_CHARS = 250
MIN_CHARS = 40
GAP = 0.25  # seconds of silence between chunks
SENTENCE_END = re.compile("(?:(?<=[.!?…])|(?<=[.!?…][\"»“”'’)]))\\s+")
CLAUSE_END = re.compile("(?<=[,;:–])\\s+")
CONFIG = Path("sources/config.json")
VOICE_TEST = Path("work/voice-test")
SILENCE = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1"  # leading; areverse twice for the trailing end
FILTER = f"{SILENCE},areverse,{SILENCE},areverse,loudnorm=I=-18:TP=-1.5"


def sentences(text):
    return SENTENCE_END.split(text.strip())


def words(text):
    """Pieces of at most MAX_CHARS, split between words (last resort)."""
    out, cur = [], ""
    for w in text.split(" "):
        if cur and len(cur) + 1 + len(w) > MAX_CHARS:
            out.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}" if cur else w
    return [*out, cur]


def units(text):
    """Sentences; one over MAX_CHARS becomes its clauses, an overlong clause its word runs."""
    out = []
    for s in sentences(text):
        for part in [s] if len(s) <= MAX_CHARS else CLAUSE_END.split(s):
            out += [part] if len(part) <= MAX_CHARS else words(part)
    return out


def chunk(text):
    """Chunks of at most MAX_CHARS for one engine call; a chunk under MIN_CHARS joins its shorter neighbour when that fits."""
    chunks = []
    for u in units(text):
        if chunks and len(chunks[-1]) + 1 + len(u) <= MAX_CHARS:
            chunks[-1] += " " + u
        else:
            chunks.append(u)
    merged = True
    while merged:
        merged = False
        for i, c in enumerate(chunks):
            near = [j for j in (i - 1, i + 1) if 0 <= j < len(chunks)]
            if len(c) >= MIN_CHARS or not near:
                continue
            j = min(near, key=lambda j: len(chunks[j]))
            if len(c) + 1 + len(chunks[j]) <= MAX_CHARS:
                lo, hi = sorted((i, j))
                chunks[lo : hi + 1] = [f"{chunks[lo]} {chunks[hi]}"]
                merged = True
                break
    return chunks


_model = None


def xtts(text, voice):
    """XTTS-v2 via coqui-tts, German, built-in speaker. Torch and TTS load on first use only."""
    global _model
    if _model is None:
        os.environ["COQUI_TOS_AGREED"] = "1"  # Coqui Public Model License, non-commercial use: ADR 0008
        import torch
        from TTS.api import TTS

        device = "cuda" if torch.cuda.is_available() else "cpu"
        if device == "cpu":
            print("warning: no CUDA, XTTS runs on the CPU (slow)", file=sys.stderr)
        _model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    wav = _model.tts(text=text, speaker=voice["speaker"], language="de", split_sentences=False, speed=voice.get("speed", 1.0))
    return np.asarray(wav, dtype=np.float32), _model.synthesizer.output_sample_rate


OPENAI_URL = "https://api.openai.com/v1/audio/speech"


def instructions(voice):
    """The voice's instructions plus the line's direction (set by render_line)."""
    d = voice.get("direction")
    return voice.get("instructions", "") + (f"\nRegie zu dieser Zeile: {d}" if d else "")


def openai(text, voice):
    """OpenAI speech API, whole line in one call."""
    body = {"model": voice["model"], "voice": voice["voice"], "input": text, "instructions": instructions(voice), "response_format": "pcm"}
    req = urllib.request.Request(
        OPENAI_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            pcm = r.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"OpenAI {e.code}: {e.read().decode('utf-8', 'replace')}") from e
    return np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768, 24000


def realtime_exchange(model, messages):
    """Sends messages over one Realtime WebSocket, returns the server events up to response.done or error. aiohttp loads on first use."""
    import asyncio

    import aiohttp

    async def run():
        url = f"wss://api.openai.com/v1/realtime?model={model}"
        headers = {"Authorization": f"Bearer {os.environ['OPENAI_API_KEY']}"}
        async with aiohttp.ClientSession() as session, session.ws_connect(url, headers=headers) as ws:
            for m in messages:
                await ws.send_json(m)
            events = []
            async for msg in ws:
                events.append(json.loads(msg.data))
                if events[-1]["type"] in ("response.done", "error"):
                    break
            return events

    return asyncio.run(run())


def openai_realtime(text, voice, tries=3):
    """OpenAI Realtime API, whole line in one session; spoken again while the transcript's words differ from the text."""
    say = {"type": "message", "role": "user", "content": [{"type": "input_text", "text": text}]}
    messages = [
        {
            "type": "session.update",
            "session": {
                "type": "realtime",
                "output_modalities": ["audio"],
                "instructions": instructions(voice),
                "audio": {"output": {"voice": voice["voice"], "format": {"type": "audio/pcm", "rate": 24000}}},
            },
        },
        {"type": "conversation.item.create", "item": say},
        {"type": "response.create"},
    ]
    for _ in range(tries):
        pcm, heard = bytearray(), ""
        for ev in realtime_exchange(voice["model"], messages):
            if ev["type"] == "error":
                raise RuntimeError(f"OpenAI Realtime: {ev['error']}")
            if ev["type"] == "response.output_audio.delta":
                pcm += base64.b64decode(ev["delta"])
            elif ev["type"] == "response.output_audio_transcript.delta":
                heard += ev["delta"]
        if re.findall(r"\w+", heard.lower()) == re.findall(r"\w+", text.lower()):
            return np.frombuffer(bytes(pcm), dtype="<i2").astype(np.float32) / 32768, 24000
    raise RuntimeError(f"OpenAI Realtime did not read the text after {tries} tries, last heard: {heard!r}")


ENGINES = {"xtts": xtts, "openai": openai, "openai-realtime": openai_realtime}
WHOLE_LINE = {"openai", "openai-realtime"}  # engines that take a whole line, never chunked


def render_text(text, voice, dst):
    """Chunks through the engine, joined with GAP silence, post-processed to MP3 at dst (written under a temp name, then renamed)."""
    synth = ENGINES[voice["engine"]]
    parts, rate = [], None
    for c in [text] if voice["engine"] in WHOLE_LINE else chunk(text):
        audio, rate = synth(c, voice)
        parts += [np.zeros(int(GAP * rate), dtype=np.float32), np.asarray(audio, dtype=np.float32)]
    audio = np.concatenate(parts[1:])
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_name(dst.name + ".tmp.mp3")
    with tempfile.TemporaryDirectory() as d:
        wav = Path(d) / "in.wav"
        with wave.open(str(wav), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(rate)
            w.writeframes((np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes())
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-loglevel",
                "error",
                "-i",
                str(wav),
                "-af",
                FILTER,
                "-ac",
                "1",
                "-ar",
                "44100",
                "-b:a",
                "64k",
                "-map_metadata",
                "-1",
                str(tmp),
            ],
            check=True,
            capture_output=True,
        )
    tmp.replace(dst)
    return dst


def render_line(line, voice, out_dir):
    """Renders the line to <out_dir>/<hash>.mp3 and returns that path."""
    dst = Path(out_dir) / f"{sf.line_hash(line, voice)}.mp3"
    return render_text(sf.spoken(line), {**voice, "direction": sf.direction(line)}, dst)


def voice_problems(roles, script):
    """Speaking roles with lines but no voice or an unknown engine; openai voices without a key."""
    used = {i["role"] for i in sf.lines(script)}
    problems = [
        f"{r}: no voice" if not (v := roles[r].get("voice")) else f"{r}: unknown engine {v.get('engine')}"
        for r in sorted(used)
        if not (v := roles[r].get("voice")) or v.get("engine") not in ENGINES
    ]
    if not os.environ.get("OPENAI_API_KEY") and any((roles[r].get("voice") or {}).get("engine") in WHOLE_LINE for r in used):
        problems.append("engine openai: OPENAI_API_KEY not set")
    return problems


def run_all(config, script):
    roles = sf.speaking_roles(config)
    if problems := voice_problems(roles, script):
        print("cannot render, fix sources/config.json:\n  " + "\n  ".join(problems))
        return 1
    started = time.time()
    done = skipped = 0
    keep = set()
    for item in sf.lines(script):
        voice = roles[item["role"]]["voice"]
        keep.add(sf.line_hash(item, voice))
        if sf.audio_path(item, voice).exists():
            skipped += 1
            continue
        render_line(item, voice, sf.AUDIO_DIR)
        done += 1
        print(f"rendered {item['id']} ({done})", flush=True)
    orphans = [p for p in sf.AUDIO_DIR.glob("*.mp3") if p.stem not in keep] if sf.AUDIO_DIR.is_dir() else []
    for p in orphans:
        p.unlink()
    print(f"rendered {done}, skipped {skipped}, deleted {len(orphans)}, {time.time() - started:.1f} s")
    return 0


def voice_test(config, script):
    roles = sf.speaking_roles(config)
    if problems := voice_problems(roles, script):
        print("cannot render, fix sources/config.json:\n  " + "\n  ".join(problems))
        return 1
    for role in roles.values():
        voice = role.get("voice")
        mine = [s for i in sf.lines(script) if i["role"] == role["id"] for s in sentences(sf.spoken(i))]
        if not voice or not mine:
            print(f"{role['id']}: no lines" if voice else f"{role['id']}: no voice, no lines")
            continue
        render_text(" ".join(mine[:2]), voice, VOICE_TEST / f"{role['id']}.mp3")
        print(f"{role['id']}: {VOICE_TEST / (role['id'] + '.mp3')}")
    return 0


def worker():
    """One JSON request per stdin line, one JSON answer per stdout line. Library output goes to stderr."""
    answers, sys.stdout = sys.stdout, sys.stderr
    for request in sys.stdin:
        try:
            req = json.loads(request)
            out = {"hash": render_line(req["item"], req["voice"], sf.AUDIO_DIR).stem}
        except Exception as e:  # noqa: BLE001
            out = {"error": f"{type(e).__name__}: {e}"}
        answers.write(json.dumps(out) + "\n")
        answers.flush()
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--test", action="store_true", help="voice test: first two sentences per role to work/voice-test/")
    ap.add_argument("--worker", action="store_true", help="JSON-lines worker for the editor server")
    args = ap.parse_args(argv)
    if args.worker:
        return worker()
    config = json.loads(CONFIG.read_text(encoding="utf-8"))
    script = sf.load(config)
    return (voice_test if args.test else run_all)(config, script)


if __name__ == "__main__":
    sys.exit(main())
