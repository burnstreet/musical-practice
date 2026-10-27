# Gesangs-Übetool

- Setup: `npm install`; Python test deps: `tools/.venv/Scripts/python.exe -m pip install -r tools/requirements-dev.txt`
- Tests (Gherkin from `specs/*.spec.md` via Vitest): `npm test`, one module: `npx vitest run tests/specs/<module>.test.ts`
- Python tests (builder scenarios via pytest-bdd): `tools/.venv/Scripts/python.exe -m pytest tools/tests`
- Dev server: `npm run dev`
- Build to `dist/`: `npm run build`

## Admin flow (publish content)

1. `python tools/phrases.py NN` (phrases per song)
2. `PITCH_PASSWORD=... python tools/pack.py` (encrypts into `content/`)
3. Commit `content/` (encrypted only) and push to `main`.

The `pages.yml` workflow builds the app, copies `content/` into `dist/content/` and deploys to GitHub Pages. Details: `docs/pipeline.md`, section 7.

