# Design

Snapshot of the Claude Design canvas "Gesangs-Übetool":
https://claude.ai/artifact/WVyVL88zMdxYrpHFmDaVhh

Canvas is the editable original. This folder is the committed copy. After canvas edits, re-export here and commit.

| file | screen | size |
|---|---|---|
| Start.dc.html | Handy 1 Start und Passwort | 390×844 |
| Songs.dc.html | Handy 2 Rolle und Lied wählen | 390×1380 |
| Main.dc.html | Handy 3 Singen (live) | 390×844 |
| Auswertung.dc.html | Handy 4 Auswertung | 390×844 |
| StartDesktop.dc.html | Desktop 1 | 1280×800, fluid |
| SongsDesktop.dc.html | Desktop 2 | 1280×800, fluid |
| MainDesktop.dc.html | Desktop 3 | 1280×960, fluid |
| AuswertungDesktop.dc.html | Desktop 4 | 1280×960, fluid |
| canvas.json | board index, positions, titles | |

Files are self-contained HTML artboards (`<x-dc>` markup, inline styles). Open in a browser for a rough look; the `support.js` script is canvas-only and missing here, so `{{accent}}` holes render literally in Main and MainDesktop.

No production content in any board here. Lyrics are from the public-domain folk song "Der Mond ist aufgegangen". Role names (Lena, Clara, Tom, Vater, Frau Berger, Erzählerin …), dialog lines and settings are invented. Production, song and scene titles are `[Produktionstitel]` / `[Liedtitel]` / `[Szenentitel]` placeholders. The canvases may still hold production names; replace them again on every re-export.

## Auswertung (results redesign)

Claude Design canvas "Auswertung – Entwürfe", not exported here: https://claude.ai/artifact/VuMigQE7PKiR3eyLrrN6q2. Boards: Main (Gesamt / Abschnitte / Phrasen, built), Einsaetze (entries after rests, built), Verlauf (trend over days and weeks, built). Supersedes Auswertung.dc.html and AuswertungDesktop.dc.html.

## Repeat and skip (`repeat-and-skip/`)

Snapshot of the Claude Design canvas "Wiederholen und Springen – Entwürfe" (spec `.scratch/repeat-and-skip/spec.md`):
https://claude.ai/artifact/7CZmN8NxVA5vztViGPY1j4. Added next to the boards above, not replacing them. Unverified drafts.

| file | screen | size |
|---|---|---|
| repeat-and-skip/Main.dc.html | Handy 3a Singen · Abschnitt wiederholen | 390×844 |
| repeat-and-skip/MainIntro.dc.html | Handy 3b Singen · Intro überspringen | 390×844 |
| repeat-and-skip/MainAB.dc.html | Handy 3c Singen · A–B setzen | 390×844 |
| repeat-and-skip/MainDesktop.dc.html | Desktop 3 Singen · Einsatz wiederholen | 1280×960, fluid |
| repeat-and-skip/Editor.dc.html | Admin-Editor · Phrasen, Abschnitte, Noten | 1440×1040, fluid |
| repeat-and-skip/canvas.json | board index | |

## Dialog trainer (`dialog/`)

Snapshot of the Claude Design canvas "Dialog-Trainer – Entwürfe" (spec `specs/screen-dialog.spec.md`):
https://claude.ai/artifact/JepLkpUgQLtk1PHKB1UrxH.

| file | screen | size |
|---|---|---|
| dialog/Main.dc.html | Handy D1 Rollen (eingeklappt, gemeinsam für Lieder und Text) und Szene wählen | 390×1000 |
| dialog/Play.dc.html | Handy D2 Durchlauf · andere sprechen | 390×844 |
| dialog/Turn.dc.html | Handy D3 Durchlauf · du bist dran | 390×844 |
| dialog/Cue.dc.html | Handy D4 Durchlauf · Lied-Hinweis, Regie, nichts gehört | 390×844 |
| dialog/Settings.dc.html | Handy D5 Einstellungen Text | 390×844 |
| dialog/PlayDesktop.dc.html | Desktop D2 Durchlauf | 1280×800, fluid |
| dialog/Editor.dc.html | Admin-Editor · Skript | 1440×1040, fluid |
| dialog/canvas.json | board index | |

## Dialog repeat (`dialog-repeat/`)

Snapshot of the Claude Design canvas "Text · Abschnitt üben – Entwürfe" (paused run-through as a scrollable scene, tap a line for Von / Bis / Ab hier, repeat range within a scene):
https://claude.ai/artifact/Gpo361XzAdnDWW3zrG3mSW. Added next to `dialog/`, not replacing it. Roles (Lena, Vater, Erzählerin), lines and the scene are invented placeholders, not from any production.

| file | screen | size |
|---|---|---|
| dialog-repeat/Main.dc.html | Handy T1 Pausiert · Szene lesen (interactive) | 390×844 |
| dialog-repeat/Menu.dc.html | Handy T2 Zeile angetippt · Von / Bis / Ab hier (imports Main) | 390×844 |
| dialog-repeat/Range.dc.html | Handy T3 Wiederholung gesetzt (imports Main) | 390×844 |
| dialog-repeat/Play.dc.html | Handy T4 Läuft in der Wiederholung | 390×844 |
| dialog-repeat/canvas.json | board index, design notes | |

## Pending

Pending edits (see `specs/overview.spec.md` → Design deltas): remove "Aufnahme anhören", add download size line, progress bar, badges, settings sheet, headphone sheet, install hint, trend line, reduce voicetrack modes to three.
