# Gesangs-Übetool

- Setup: `npm install`; Python test deps: `tools/.venv/Scripts/python.exe -m pip install -r tools/requirements-dev.txt`
- Tests (Gherkin from `specs/*.spec.md` via Vitest): `npm test`, one module: `npx vitest run tests/specs/<module>.test.ts`
- Python tests (builder scenarios via pytest-bdd): `tools/.venv/Scripts/python.exe -m pytest tools/tests`
- Dev server: `npm run dev`
- Build to `dist/`: `npm run build`

## Common tasks

`./at.ps1 <command>` (PowerShell, any cwd; `./at.ps1 help` lists all):

- `setup`: idempotent. Installs [mise](https://mise.jdx.dev) via `scoop` if missing, then the tools pinned in `mise.toml` (node 22, python 3.12, ffmpeg), `tools/.venv`, dev requirements, `npm ci`, Playwright chromium, and runs `doctor`. Without mise/scoop it uses node/python from PATH.
- `doctor`: one line per prerequisite (mise, node 22, venv python 3.12, pinned requirements, node_modules, ffmpeg, Playwright chromium); exit 1 if any is missing or has the wrong version

All commands put the mise tools on PATH when mise is installed, so the pinned versions are used.
- `dev` / `build` / `preview`: Vite dev server, build to `dist/`, serve the build
- `test` / `pytest` / `e2e`: Vitest, Python tests, Playwright
- `lint` / `format`: Biome + Ruff check, or fix
- `precommit [-Full]`: lint, tsc, vitest, pytest (`-Full` adds e2e); stops at the first failure
- `pack [args]`: `tools/pack.py` with the venv Python; prompts for `PITCH_PASSWORD` if unset

## Admin flow (publish content)

1. `python tools/phrases.py NN` (phrases per song)
2. `PITCH_PASSWORD=... python tools/pack.py` (encrypts into `content/`)
3. Commit `content/` (encrypted only) and push to `main`.

The `pages.yml` workflow builds the app, copies `content/` into `dist/content/` and deploys to GitHub Pages. Details: `docs/pipeline.md`, section 7.

