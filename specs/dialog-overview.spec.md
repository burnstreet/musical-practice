---
name: Dialog overview
description: Dialog trainer, second practice mode of the PWA. Problem, solution, user stories, decisions, module seams, testing, device checklist, open points.
targets:
  - ../src/core/cue.ts
  - ../src/core/voice-detect.ts
  - ../tools/script_parse.py
  - ../tools/script_render.py
  - ../tools/script_format.py
---

# Dialog trainer: overview

Supersedes `musical-dialog-trainer-prd.md`. Same app, vault, library and role selection as the pitch trainer (overview.spec.md). UI German. Design: canvas "Dialog-Trainer – Entwürfe", copy in `design/dialog/`, screens in screen-dialog.spec.md. The role selection is one collapsible bar for songs and text.

## Problem Statement

Besides the songs a musical has a spoken script (first production: a DOCX of about 370 paragraphs, 10 speaking roles, 8 scenes with song cues). An actor learning lines has nobody to feed cues outside rehearsals. Reading alone does not train listening for the cue and coming in. Some actors play several roles.

## Solution

Dialog mode in the PWA. The actor picks role(s). The app speaks every other role's lines with a synthetic voice per role (pre-rendered on the Admin's machine), shows the actor's own lines (shown, hidden or first words), and waits until the actor has finished speaking. "Finished" = on-device level detection (speech start, then silence), tap as fallback. No speech-to-text, no cloud, offline like the songs.

## User Stories

1. As an actor, I want to choose one or more roles, so the app plays everyone else and leaves my lines to me.
2. As an actor, I want the other roles spoken with distinguishable voices, so it feels like a run-through.
3. As an actor, I want the app to notice when I have finished my line and continue on its own, so I can rehearse hands-free.
4. As an actor, I want a tap to advance, so a missed detection never blocks me.
5. As an actor, I want my own line shown, hidden with reveal, or only its first words, so I can test whether I know it.
6. As an actor, I want my own line spoken on request (*Vorsprechen*), so I can hear it when stuck.
7. As an actor, I want to start at any scene or line and loop a scene, so I can drill a weak passage.
8. As an actor, I want to skip the rest of a speaker's lines, so I get to my dialog fast.
9. As an actor, I want song cues in the flow with a jump to the song in the pitch trainer and back.
10. As an actor, I want the silence time adjustable, so my natural pauses do not trigger the next cue.
11. As an actor, I want the playback speed of the other voices adjustable (0.8 to 1.3).
12. As an actor, I want to continue where I stopped last time, per role set.
13. As an actor, I want stage directions shown briefly, or hidden.
14. As an actor, I want the headphone reminder, so spoken lines do not trigger the detection.
15. As an admin, I want the DOCX converted once into a script file and then edited in the editor, so parsing mistakes never reach the cast.
16. As an admin, I want to re-speak a single line from the editor and hear it at once, so I can fix pronunciation with `say`.
17. As an admin, I want one command that renders all missing line audio and removes stale files.
18. As an admin, I want a voice test with two sentences per role, so I can check voices before the full render.
19. As an admin, I want pack to refuse a script with lines without current audio.

## Implementation Decisions

Grilling and listening test of 2026-11-02.

- All stories in v1. No scoring, no history. Last position per role set only.
- Module specs: script-format, script-parser, tts-renderer, cue-engine, voice-detect, script-editor; library and builder extended. Screen after the design.
- Detection: energy threshold with hysteresis on the pitch engine's `rms` frames (voice-detect). Same mic, no second capture. Silero VAD only if this fails on devices.
- TTS: XTTS-v2 (`coqui-tts`), built-in speakers, `split_sentences=False`, local GPU, chunks of at most 250 characters with no tiny chunk. Piper, Chatterbox and Kokoro lost the listening test (Piper: quality; Chatterbox: garbage in some outputs, slower; Kokoro: no official German). Cloud TTS not needed: cost would be trivial, quality of XTTS sufficient.
- Renderer in its own venv `tools/.venv-tts` (`mp.ps1 setup -Tts`), so CI's tools venv never pulls torch. The editor server talks to a long-lived worker in that venv.
- Rendering only local. MP3 mono 64 kbps in the production repo under `web/data/script/<hash>.mp3`; the hash covers spoken text and voice, so render is idempotent without a manifest. CI never renders. ADR 0008.
- Roles: one global list for songs and script, flags `sings` and `speaks`; one role selection for both modes. Narrators are roles (`erzaehler1`, `erzaehler2`). DOCX speaker names map through `name` and `aliases`. Voice per role in the config.
- Script source: `web/data/script.json`, written once by the parser, then edited in the editor's `Skript` view. Pronunciation via `say` per line.
- Directions shown 2.5 s and auto-advance; can be hidden. Technical cues (props, light) dropped by the parser.
- Own lines: three modes plus *Vorsprechen* (all lines are rendered anyway).
- Song items: jump to the pitch trainer and back to the same place. No song audio inside the dialog flow.
- Script audio is part of the full library download after unlock (estimated 15 to 25 MB).
- Cue engine defaults from the PRD: silence 1.2 s (0.5 to 3), hard timeout 20 s with a hint, mic only while the actor's turn is open.

## Module seams

| Module | Spec | Kind |
|---|---|---|
| script types, validators, hash | script-format | business (TS + Python) |
| parser (Python) | script-parser | business |
| renderer (Python) | tts-renderer | business (engine faked in tests) |
| cue engine | cue-engine | business, pure |
| voice detect | voice-detect | business, pure |
| library, pack | library, builder | business |
| script editor | script-editor | ops pure, view presentation |
| role bar, scene selection, run-through, text settings | screen-dialog | presentation |

## Testing Decisions

- As in overview.spec.md: every requirement has its Gherkin scenario, the scenario is the acceptance test, steps drive the public API.
- The TS runner (`tests/gherkin.ts`) knows `Feature`, `Scenario` and steps only: no `Background`, no tables. Shared setup is described in prose above the block.
- Python: `tools/tests/conftest.py` `SPECS` gets script-format, script-parser and tts-renderer. Renderer tests use the fake engine `sine` and real ffmpeg; no model download in tests.
- Parser fixture: DOCX built in the test with invented text. The real script is never a test fixture (copyright).
- Voice detect: synthetic level frames. Cue engine: event lists.

## Manual device checklist

Run on iOS Safari (installed PWA) and Android Chrome:

1. Full run of scene 1 with headphones: others spoken, own turn detected, auto-advance after silence.
2. Without headphones: no false trigger while others speak.
3. Pause mid-line shorter than the silence time: no advance.
4. Tap advances in every state. Hard timeout shows the hint.
5. Song cue: jump to the song, back to the same place.
6. Offline after sync: dialog plays.
7. Reopen: continues at the last position of the role set.

## Open points

- Production repo: add `speaks`, `aliases`, `voice` to `sources/config.json`, add roles `erzaehler1`, `erzaehler2`, `roemer`.

## Out of Scope

- Speech-to-text or checking the spoken words. Runtime TTS in the browser. Recording the actor. Multi-user rehearsal. Editing roles or voices in the editor. Cloud TTS.

## Further Notes

- The first production's DOCX colours: blue = stage direction, green = technical cue or song cue. Unprefixed black paragraphs continue the last speaker; right after a scene header they are props lists.
- Copyright: no script text in tracked plaintext of the engine. Specs use invented text. Character names are allowed.
- XTTS-v2 license (CPML) allows non-commercial use only. The production is non-commercial.
- Playback leaking into the mic is the main failure mode. Mic only open on the actor's turn, a fresh noise floor per turn, and the headphone reminder cover it.
