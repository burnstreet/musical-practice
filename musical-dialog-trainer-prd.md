# Musical Dialog Trainer

Companion to [musical-pitch-trainer-prd.md](musical-pitch-trainer-prd.md). Same app, same vault, second practice mode.

## Problem Statement
Besides the songs, the musical has a spoken script ("Anna im Weihnachtsland.docx", about 370 paragraphs, 15+ speaking roles, 10 scenes with song cues). A cast member learning their lines has nobody to feed them cues outside of rehearsals. Reading the script alone does not train the timing of listening for the cue and coming in. Some cast members play more than one role.

## Solution
A dialog practice mode inside the existing PWA. The user picks their role(s). The app speaks every other role's lines with a synthetic voice (one voice per character, pre-rendered at build time), shows the user's own lines, and waits until the user has finished speaking before it continues. "Finished speaking" is detected by on-device voice activity detection (speech start, then silence), with a tap as fallback. No speech-to-text, no cloud, works offline like the songs.

## User Stories
1. As an actor, I want to choose one or more roles, so that the app plays everyone else and leaves my lines to me.
2. As an actor, I want the other roles spoken aloud with distinguishable voices, so that it feels like a run-through, not a text-to-speech monotone.
3. As an actor, I want the app to notice when I have finished my line and continue on its own, so that I can rehearse hands-free.
4. As an actor, I want a tap or key to advance manually, so that a misfired or missed detection never blocks me.
5. As an actor, I want my own line hidden with reveal on demand, so that I can test whether I know it by heart.
6. As an actor, I want to start at any scene or line and loop a scene, so that I can drill a weak passage.
7. As an actor, I want long narrator passages skippable, so that I can get to my dialog quickly.
8. As an actor, I want song cues shown in the flow with a jump to the pitch trainer, so that I see where songs sit between the dialog.
9. As an actor, I want the silence timeout adjustable, so that my natural pauses do not trigger an early cue.
10. As an admin, I want the DOCX parsed into a script structure once, with a review step, so that parsing mistakes do not reach the cast.
11. As an admin, I want a build step that renders all non-user lines to audio, so that the client ships audio only and needs no TTS runtime.
12. As an actor, I want a headphone reminder, so that the spoken lines do not trigger the voice detection.

UI will be german, to be designed with claude design.

## Implementation thoughts
- **Platform:** same PWA as the pitch trainer (currently plain HTML/JS in `web/`; all APIs below are browser APIs and work equally from Blazor via JS interop).
- **Script format (`script.json`):** scenes, each with an ordered list of items. Item types: `line` (`speaker`, `text`, `audio` ref, `durationMs`), `direction` (stage direction, display only), `song` (`songId`, display plus link), `scene` header. Consecutive paragraphs of the same speaker are merged into one item; long narrator paragraphs may be split at sentence boundaries into several items so skipping is granular. The cast list from the document header is kept as `roles` with display names.
- **Script parser (tools, Python):** `python-docx` paragraph walk. Heuristics, derived from the document:
  - `^(Erzähler 1|Erzähler 2|Anna|Mutter|...):\s*(.+)` starts a line; speaker names are matched against the cast list from the header.
  - Paragraphs after a narrator line with no prefix continue the narrator until the next prefixed paragraph.
  - `^Szene \d+` is a scene header, `^Lied \d+:` a song cue, everything else at scene level is a stage direction.
  - Output is reviewed by hand; the JSON (not the DOCX) is the source of truth afterwards, so manual fixes are not lost on rebuild. A `script.overrides.json` for text corrections and pronunciation hints (e.g. names) is applied before rendering.
- **TTS renderer (tools, Python, build time):** one voice per role from a role-to-voice map. Default engine Piper (German voices such as `thorsten`, `eva_k`, `kerstin`, `karlsson`, CPU only, offline); the map can point individual roles at a cloud voice if quality matters. Output one Opus/MP3 file per line, mono, about 48 to 64 kbps. Rough budget: around 250 spoken items, average 8 s, about 35 min audio, 20 to 30 MB. Lines are rendered for every role; which ones are played is decided on the client by the role selection, so a role switch needs no rebuild. Idempotent: re-render only items whose text or voice changed (hash in manifest).
- **Packer:** script JSON and line audio go through the same AES-GCM packer and vault as the songs.
- **Cue engine (client, pure state machine):** states `idle`, `playingOther`, `waitingUser`, `userSpeaking`, `userDone`, `paused`. Inputs: audio ended, VAD speechStart/speechEnd, tap, skip, timeout. Rules: in `waitingUser` the mic is open and the own line is shown (or hidden per mode); `speechStart` goes to `userSpeaking`; `speechEnd` plus silence timeout (default 1.2 s, range 0.5 to 3 s) advances; a tap advances from any user state; a hard timeout (default 20 s) advances with a visual hint. Mic is muted while `playingOther`.
- **VAD (client):** Silero VAD via ONNX Runtime Web in an AudioWorklet or worker (about 2 MB model, cached by the service worker). Fallback: RMS energy threshold with hysteresis when WASM is unavailable. Mic constraints: `echoCancellation: true`, `noiseSuppression: true`. Reuses the mic pipeline of the pitch engine.
- **Practice UI:** role picker (multi-select), scene list, flow view with current item, previous line as context, own line shown/hidden/revealed, status indicator (speaking, listening, your turn), big advance button, skip-narrator button, silence timeout slider, headphone notice. Song items show title and a jump button into the pitch trainer.
- **Settings persisted locally:** chosen roles, hide-own-lines mode, silence timeout, playback rate for the other voices (0.8 to 1.3).

## Testing Thoughts
- Parser: run against the real DOCX as a fixture; assert the number of lines per speaker, that no non-empty paragraph is lost, that scene and song markers are found in order, and that overrides apply.
- Cue engine: unit tests on the state machine with scripted event sequences (clean line, pause mid-line below timeout, pause above timeout, tap during playback, hard timeout, skip).
- VAD: feed synthetic audio (speech-like bursts plus silence, plus playback leakage) and check speechEnd timing within tolerance and no trigger while muted.
- TTS renderer: idempotency test (second run renders nothing), manifest hash test, a listening check of proper names.
- Manual: real-device run on iOS Safari and Android Chrome with headphones and without (to confirm leakage handling), installed PWA, offline after first load.

## Out of Scope
- Speech-to-text or checking whether the spoken words match the line. Later option: Web Speech API where available, fuzzy-matched against the last words of the expected line, only to improve cue precision.
- Runtime TTS in the browser (Web Speech API `speechSynthesis` is acceptable for a throwaway prototype, not for release).
- Recording the user's voice.
- Editing the script inside the app.
- Multi-user rehearsal over the network.

## Further Notes
- Why no STT: the script is known, so the only question is "has the user stopped talking". VAD answers that offline, instantly, with a 2 MB model. Whisper-class models would still need the VAD decision first and add seconds of latency and hundreds of MB for German.
- Playback leakage into the mic is the main failure mode. Muting during playback plus the headphone reminder covers it; echo cancellation is the second line.
- The document also contains props and cast lists in its header; the parser ignores everything before the first `Szene` marker except the cast list.
