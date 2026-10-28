# Editor view: time signature from the song

Status: ready-for-agent
Blocked by: none
Spec: ../spec.md

User story 32 ("the editor staff looks like the singer's staff"). src/editor/view.ts always assumes 4/4:
- `quarter = barLen / 4` (:58)
- `timeSig: [4, 4]` and `bpm = 60 / quarter` (:70)

The server grid already uses the song's beats per bar (tools/serve.py:76). For a song in 3/4 (song 01 has beats=3), the editor's beat-to-bar mapping, its bpm and the drawn bars would all be wrong.

Fix: take the beats per bar from the song or the grid the server sends, and use it for `quarter`, `timeSig` and `bpm`. Today this is latent, because song 01 is not in web/data/index.json. Check it by loading a 3/4 song into the editor.
