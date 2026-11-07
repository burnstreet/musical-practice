# Settings button on the overview gets a text label

Status: resolved
Blocked by: none
Spec: ../spec.md (rides along on this branch; not part of the repeat spec)

User request 2026-11-07: the settings button of the overview top (`topHeader` in `src/app/screens/roles.ts`, used by the Lieder and Text screens) shows the text `Einstellungen` next to the icon. When that takes so much room that the app title (kicker, plus build label) would wrap, it shows `Einst` instead. aria-label stays `Einstellungen`.

Spec first: update the `settings` row and the Top bullet in `specs/screen-songs.spec.md` (and the shared top in `specs/screen-dialog.spec.md` if it describes it), with a scenario if the existing step style allows a rendering check. Prefer a CSS-only fit (e.g. container query or wrap trick) over JS measuring; ponytail. Check at phone width 360 px and with the real kicker of the production (`../<production>-content/production.json`, field kicker) — do not copy production names into the engine.
