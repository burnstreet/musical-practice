# Pre-rendered TTS with XTTS-v2 for the dialog trainer

The dialog trainer needs every role's lines spoken. We render them once on the Admin's machine with XTTS-v2 (built-in speakers, `split_sentences=False`), commit the MP3s in the production repo under a hash of spoken text and voice, and pack them like the songs. The app ships audio only, no TTS runtime, and works offline.

A listening test on 2026-11-02 compared Piper, Chatterbox Multilingual and XTTS-v2 on the same lines. Piper was too synthetic; Chatterbox produced garbage in some outputs and renders slower than real time; XTTS babbled only when its own sentence splitting was on. Kokoro has no official German model. Browser `speechSynthesis` varies per device and is not offline-safe. Cloud TTS would cost little but sends the copyrighted script out and adds a key.

Consequences: rendering needs a CUDA machine and stays out of CI. XTTS-v2 is under the Coqui Public Model License, non-commercial only; the production is non-commercial. The renderer chunks long lines itself (at most 250 characters, no tiny chunk), because XTTS cannot take long input and invents sounds on very short input.
