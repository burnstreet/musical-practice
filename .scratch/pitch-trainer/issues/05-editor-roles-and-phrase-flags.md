# 05: Editor: role painting and phrase-start flag

**What to build:** In the existing admin editor (`web/`), with notes selected, the admin picks a role from the global list and presses "Rolle setzen" to stamp it on the selection, and toggles "Phrasenanfang" on a selected note; the piano roll marks flagged notes. Saved through the existing save path.

**Blocked by:** 01 (scaffold)

**Status:** ready-for-agent

Spec: `specs/builder.spec.md` → Editor additions. The editor is vanilla JS (`web/app.js`, `web/index.html`), served by `tools/serve.py`, which must additionally serve `sources/config.json` at `/config.json`.

Testing: the scenarios run under Vitest via `tests/specs/editor.test.ts` + `tests/steps/editor.steps.ts`. The editor is not a module today; extract the two pure operations (set role on a selection, toggle phraseStart) into a small ES module the editor imports (`web/edit-ops.js` or similar) and drive those from the steps. Keep the DOM wiring in `app.js`.

- [ ] Feature `Editor role painting` passes.
- [ ] `serve.py` serves `/config.json` from `sources/config.json` (404 when absent).
- [ ] Role dropdown is filled from `/config.json`; when it is missing, the dropdown falls back to roles already present in the song.
- [ ] Vertical marker drawn at notes with `phraseStart`.
