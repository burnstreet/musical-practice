# Design

Snapshot of the Claude Design canvas "Gesangs-Übetool Weihnachtsmusical 2026":
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

Placeholder lyrics in the artboards are from the public-domain folk song "Der Mond ist aufgegangen", not from the musical. Song titles are `[Liedtitel eintragen]` placeholders.

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

Pending edits (see `specs/overview.spec.md` → Design deltas): remove "Aufnahme anhören", add download size line, progress bar, badges, settings sheet, headphone sheet, install hint, trend line, reduce voicetrack modes to three.
