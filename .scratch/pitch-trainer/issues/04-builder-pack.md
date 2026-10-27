# 04: Builder: completeness check, stems, encryption and packing

**What to build:** `python tools/pack.py [--strict] [--out content] [--new-salt]` turns the aligned song JSONs, stems and `sources/config.json` into the published `content/` folder: public manifest plus AES-GCM encrypted library, song files and stems, with a `report.txt` naming incomplete songs.

**Blocked by:** 01 (scaffold)

**Status:** resolved

Spec: `specs/builder.spec.md` → Completeness check, Stems, Packing. Crypto and file layout: `specs/content-format.spec.md` → Crypto, Public manifest, Library, Song file. ADRs 0004 and 0006.

Notes:
- Crypto: `cryptography` package (install into `tools/.venv` if missing) for PBKDF2 and AES-GCM. Output must decrypt in the browser with WebCrypto: IV prepended, tag appended.
- Stems: ffmpeg is on PATH; tests generate short WAV/MP3 fixtures with ffmpeg in a temp dir (sine tones), never real recordings.
- Song JSON output must satisfy the content-format rules (notes sorted, phrases contiguous with `start`/`end` from notes, `bars`, `beat`, `dur`). Derive `roles` of a song from its notes.
- The input song JSON is the editor's format (`web/data/NN.json`, see `web/app.js` `load`), notes carry `start`, `end`, `midi`, `lyric`/`syllable`, `role`, `phrase`, optional `phraseStart`. Map `lyric` → `syllable`.

- [ ] Features `Completeness`, `Stem preparation`, `Packing` pass via `tools/tests/test_pack.py` + `tools/tests/steps_pack.py`.
- [ ] Manifest validates against the content-format rules (ids 16 hex chars, salt 16 bytes base64, `totalBytes` = sum of `.bin` sizes).
- [ ] Missing `PITCH_PASSWORD` exits 2 with a message.

## Comments

- 2026-10-27 agent: Merged e77b715: tools/pack.py with --root/--out/--strict/--new-salt; bars/phrase rework in the review fix pass.
