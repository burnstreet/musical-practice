"""The production's spoken script: load and validate web/data/script.json, line hash.

Format: specs/script-format.spec.md. Standard library only: both tools/.venv and tools/.venv-tts import it.
"""

import hashlib
import json
from pathlib import Path

SCRIPT = Path("web/data/script.json")
AUDIO_DIR = Path("web/data/script")
TYPES = {"line", "direction", "song"}


class ScriptError(ValueError):
    pass


def speaking_roles(config):
    """id -> role of every role with speaks: true."""
    return {r["id"]: r for r in config.get("roles", []) if r.get("speaks")}


def validate(script, config):
    """Raises ScriptError naming the first offending id, role or song."""
    speakers = speaking_roles(config)
    songs = {s["id"] for s in config.get("songs", [])}
    scene_ids, item_ids = set(), set()
    for scene in script.get("scenes", []):
        sid = scene.get("id")
        if sid in scene_ids:
            raise ScriptError(f"duplicate scene id {sid}")
        scene_ids.add(sid)
        for item in scene.get("items", []):
            iid = item.get("id")
            if iid in item_ids:
                raise ScriptError(f"duplicate item id {iid}")
            item_ids.add(iid)
            kind = item.get("type")
            if kind not in TYPES:
                raise ScriptError(f"item {iid}: unknown type {kind}")
            if kind in ("line", "direction") and not str(item.get("text", "")).strip():
                raise ScriptError(f"item {iid}: empty text")
            if kind == "line" and item.get("role") not in speakers:
                raise ScriptError(f"item {iid}: {item.get('role')} is no speaking role")
            if kind == "song" and item.get("songId") not in songs:
                raise ScriptError(f"item {iid}: unknown song {item.get('songId')}")
    return script


def load(config, path=SCRIPT):
    return validate(json.loads(Path(path).read_text(encoding="utf-8")), config)


def lines(script):
    """Every line item in play order."""
    return [i for s in script["scenes"] for i in s["items"] if i["type"] == "line"]


def spoken(line):
    return line.get("say") or line["text"]


def line_hash(line, voice):
    canon = json.dumps({"text": spoken(line), "voice": voice}, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canon.encode("utf-8")).hexdigest()[:16]


def audio_path(line, voice, root=Path(".")):
    return Path(root) / AUDIO_DIR / f"{line_hash(line, voice)}.mp3"


def missing_audio(script, config, root=Path(".")):
    """Ids of lines whose audio for the current hash is absent."""
    speakers = speaking_roles(config)
    return [i["id"] for i in lines(script) if not audio_path(i, speakers[i["role"]].get("voice"), root).exists()]
