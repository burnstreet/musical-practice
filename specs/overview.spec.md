---
name: Overview
description: Pitch trainer PWA for the cast of the Weihnachtsmusical 2026. Problem, solution, user stories, decisions, module seams, design deltas, device checklist.
targets:
  - ../src/**/*
  - ../tools/pack.py
  - ../tools/phrases.py
---

# Gesangs-Übetool: overview

Supersedes `musical-pitch-trainer-prd.md`. Design: https://claude.ai/artifact/WVyVL88zMdxYrpHFmDaVhh (canvas "Gesangs-Übetool Weihnachtsmusical 2026", 4 phone artboards + 4 desktop artboards). Committed copy of the artboards in `design/`.

Module specs in this folder. Business modules know no UI. Screens know no audio, crypto or scoring internals.

## Problem Statement

Cast member practises songs at home. Cannot tell if notes are hit. Existing tools: Mac only, bound to streaming services. Material is private and copyrighted: full-mix recordings, playback tracks, lyrics, scores. Must work on phone and desktop, offline after first load.

## Solution

Password-protected PWA. Unlock once, whole library downloads to device, practise offline. Singer picks role(s) and a song. App plays the recording, mutes the guide voice where the singer's role sings, shows notes and lyrics of all roles, listens through the mic, scores pitch per note of the singer's role, shows results per phrase with one coaching sentence. Tempo down to 70 %, phrase loop, history per song.

## User Stories

1. As a singer, I want to unlock with the shared password, so only the cast sees the material.
2. As a singer, I want to see the download size and a WLAN hint before unlocking, so I am not surprised on mobile data.
3. As a singer, I want all songs downloaded after unlock with visible progress, so I can practise offline later.
4. As a singer, I want to open a song as soon as its own files are present, so I need not wait for the whole library.
5. As a singer, I want the password remembered on this device, so I enter it once.
6. As a singer, I want to pick one or more roles, so the app knows which notes are mine.
7. As a singer, I want the song list to mark songs where my roles sing, so I find my songs fast.
8. As a singer, I want to hear the recording with all voices, with my role muted, or backing only, so I can practise in steps.
9. As a singer, I want the guide voice muted only while my role sings, so I still hear the others.
10. As a singer, I want a staff with notes and syllables of all roles, mine highlighted, so I know when and what to sing.
11. As a singer, I want a scrolling piano roll with my target notes and my sung pitch line, so I see sharp or flat at once.
12. As a singer, I want a cent readout with the target note, so I know how far off I am.
13. As a singer with any voice, I want octave-independent scoring and display, so men and women use the same material.
14. As a singer, I want to slow the song to 90, 80 or 70 % without pitch change, so I can learn hard passages.
15. As a singer, I want to loop one phrase, so I can drill it.
16. As a singer, I want to jump to the start of the current phrase.
17. As a singer, I want a hit percentage, mean deviation, tendency, sung range and per-phrase chart after each pass, so I know my weak spots.
18. As a singer, I want one coaching sentence naming the worst phrase and syllable, so I know what to drill next.
19. As a singer, I want a one-tap "practise worst phrase at 80 %" action.
20. As a singer, I want a trend across passes in one session, so I see improvement.
21. As a singer, I want my last result per song shown in the song list, so I track weak songs.
22. As a singer, I want a headphone reminder once, so the recording does not bleed into the mic.
23. As a singer, I want to adjust tolerance, mic delay, and test the mic in settings.
24. As a singer, I want a lock action that wipes key, songs and history from the device.
25. As a singer, I want a wrong password to fail clearly, exposing nothing.
26. As a singer, I want to be told when the password changed, so I know why content fails.
27. As a singer on iOS, I want a hint to install to the home screen, so Safari does not delete my downloads.
28. As a singer, I want app updates applied silently on next launch, never mid-practice.
29. As a singer, I want songs where my roles do not sing still playable for listening, with scoring off.
30. As an admin, I want the builder to refuse incomplete songs and list what is missing, so the app never shows an unscorable song.
31. As an admin, I want phrases derived from the lyrics DOCX automatically, with manual override per note.
32. As an admin, I want to paint roles onto notes in the existing editor.
33. As an admin, I want per-song choice between subtracted playback and Demucs accompaniment as backing stem.
34. As an admin, I want one command that encrypts and packs everything into the published folder.
35. As a future user, I want the shell, vault and role selection reusable for the dialog trainer.

## Implementation Decisions

Numbers refer to the grilling session of 2026-10-27.

- Reference melody = transcribed score aligned to the recording (note list: pitch, start, end, syllable, role, phrase). Audio pitch extraction serves alignment only. (Q1)
- Roles: global list from the musical, each flagged `sings`. Song lists its roles. Note carries one role. Singer selects a set. (Q2)
- Client: TypeScript, Lit, Vite, Canvas 2D for staff and piano roll, CSS custom properties as design tokens, DM Sans and Fraunces bundled. No .NET. Builder stays Python. (Q3, Q20)
- Voicetrack modes v1: `all` (Mit Voicetrack), `others` (Voicetrack nur für andere), `backing` (Nur Playback). `auto` deferred. (Q4)
- Two stems per song: voices = full mix, backing = aligned playback or Demucs accompaniment. `others` mode plays backing wherever any selected role has a note. Overlapping other roles go silent too. Documented limitation. (Q5, Q16)
- Tempo 100/90/80/70 % via media elements with pitch preservation. Phrase loop. (Q6, Q33)
- No recording of own voice. (Q7)
- Results: hit %, mean cents, tendency, sung range, signed per-phrase chart, template coaching sentence. Phrase = lyric line. Results screen switched off for now (`features.results`); pause only pauses. (Q8)
- Octave folding in scoring and in display. Note names never show an octave. (Q9)
- Derived AES key stored non-extractable in IndexedDB. Lock wipes all. (Q10)
- History: last 20 sessions per song and role set, on device. (Q11, Q30)
- Hosting: GitHub Pages, workflow on push to main. Encrypted bundle committed. (Q12)
- Headphone sheet once before first practice. No output-device detection. (Q13)
- Scope: singing only. Shell, vault, library, role selection reusable for dialog mode. (Q14)
- Builder packs only songs with aligned score, roles, phrases, stems. Reports the rest. (Q15, Q31)
- Phrases from DOCX line breaks matched to syllables; manual `phraseStart` flag wins. (Q17)
- Roles painted in the existing web editor; score JSON is source of truth. MusicXML role-free. (Q18)
- Staff: custom Canvas, treble clef only, key signature from score, accidentals outside key, real note values, rests, solid numbered bar lines, lyric-aware spacing, pages of 2 bars below 560 px canvas width, else 4. Piano roll: playhead at 30 % width, 1.5 s behind, 3.5 s ahead. No MusicXML shipped. (Q19, Q32)
- Download: whole library after unlock, per-file blobs in IndexedDB, content-hash ids, re-download changed only. Public manifest carries sizes before unlock. (Q21, Q28)
- Scoring per note: 100 ms onset grace, fold to nearest octave, hit = at least half of voiced frames within tolerance, unsung note = miss. Frames outside my notes ignored. (Q22)
- Settings: tolerance easy 75 / normal 50 / strict 30 cents, mic delay ±300 ms, headphone note, mic test, lock. (Q23)
- Latency: AudioContext base + output latency plus user offset. No calibration wizard. (Q24)
- Session = open song to leave song. Pass = play to pause. Note frames reset when playback re-enters the note. Trend from pass 2. History keeps best and last per session. (Q25, Q30)
- Admin tools: existing viewer + plot_aligned.py, local only. (Q26)
- Song without my notes: playable in `all`, scoring off, mic idle, hint shown. (Q27)
- Pitch detector: McLeod (pitchy), window 1024, hop 256 (app-side display delay about 23 ms), clarity 0.9, 80–1100 Hz. (Q34)
- Updates: service worker installs in background, activates next launch, toast. (Q35)
- Song list badge: last session hit % for current role set. (Q36)
- iOS install hint once. (Q37)
- Key id in public manifest detects password change. (Q38)

## Module seams

One seam per module, all at the public API named in each spec. Tests drive the API, never internals.

| Module | Spec | Kind |
|---|---|---|
| content types + validators | content-format | business |
| builder (Python) | builder | business |
| vault | vault | business |
| library | library | business |
| audio engine | audio-engine | business (wraps media elements, mocked in tests) |
| pitch engine | pitch-engine | business (wraps AudioWorklet, mocked in tests) |
| scorer + session | scorer | business, pure |
| history | history | business |
| shell | shell | presentation |
| screens | screen-start, screen-songs, screen-practice, screen-results | presentation |

## Testing Decisions

- Good test: drives the module API with inputs, asserts outputs or emitted events. Never asserts internals, DOM structure of business modules, or timing of private calls.
- Every requirement in a module spec has a Gherkin scenario in a fenced `gherkin` block right below it. The scenario is the acceptance test.
- TypeScript: `tests/gherkin.ts` reads `specs/*.spec.md`, extracts fenced `gherkin` blocks, maps `Feature`/`Scenario`/steps onto Vitest `describe`/`it`. Steps resolve against regex registries in `tests/steps/<module>.steps.ts`. Unmatched step = failing test. `[@test]` links point at the step file.
- Python: `tools/tests/conftest.py` extracts the blocks of `builder.spec.md` and `content-format.spec.md` into a temp dir as `.feature` files, pytest-bdd runs them with steps in `tools/tests/steps_*.py`.
- Screens: rendering smoke tests only (mount, strings present, actions dispatch). Device behaviour: manual checklist below.
- Prior art: none in repo. Existing Python tools have no tests.
- Implementation order: TDD, failing scenario first. Use ponytail: smallest code that passes.

## Manual device checklist

Run on iOS Safari (installed PWA and browser tab) and Android Chrome before each release:

1. Unlock, download completes, airplane mode, reload, song plays.
2. Mic permission prompt appears on first "Üben starten". Deny: banner shown, playback still works.
3. Headphones in: voice mute switches cleanly, no clicks.
4. Tempo 70 %: pitch unchanged, both stems stay in sync for a full song.
5. Lock screen and return: playback paused, app state intact.
6. iOS: install hint shown once, app installed from Safari share sheet, data survives 8 days unused.
7. New deploy: toast appears on next launch, not during practice.

## Design deltas (canvas edits after spec sign-off)

- Start: add download size line and WLAN hint under the form. Add error states.
- Songs: add download progress bar at top, per-row "wird geladen" state, result badge per row, settings button in header, iOS install hint card.
- Songs: role chips show only roles with `sings = true`.
- Songs: voicetrack options reduced to three (Auto removed).
- Practice: cents readout label states; mic-denied banner; "Deine Rolle singt hier nicht" hint; settings sheet; headphone sheet.
- Results: remove "Aufnahme anhören". Add trend line of hit % across passes from pass 2. "Phrase n bei 80 % üben" uses worst phrase.
- Desktop boards: same deltas.

## Out of Scope

- Streaming services. Accounts, sync, upload UI. Forced alignment. Recording own voice. Protection against password sharing. Auto voicetrack mode. Calibration wizard. OCR of scanned lyrics. Transposition. Dialog trainer (own spec later).

## Further Notes

- Copyright: lyrics, titles, scores, audio never in tracked plaintext. Specs use song ids only. Role names are character names, allowed.
- Known iOS issue: `getUserMedia` switches the audio session to play-and-record, speaker output gets quieter. Headphones avoid it.
- Prior art: OnKey (singonkey.app). Lenient defaults.
