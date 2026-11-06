# Gesangs-Übetool

## Common tasks

`./mp.ps1 <command>` (PowerShell, any cwd; `./mp.ps1 help` lists all). All commands put the mise tools on PATH when mise is installed, so the pinned versions are used.

- `setup`: idempotent. Installs [mise](https://mise.jdx.dev) via `scoop` if missing, then the tools pinned in `mise.toml`, `tools/.venv`, dev requirements, `npm ci`, Playwright chromium, and runs `doctor`. Without mise/scoop it uses node/python from PATH.
- `doctor`: one line per prerequisite (mise, node, venv python, pinned requirements, node_modules, ffmpeg, Playwright chromium); exit 1 if any is missing or has the wrong version
- `dev` / `build` / `preview`: Vite dev server, build to `dist/`, serve the build
- `test` / `pytest` / `e2e`: Vitest (Gherkin from `specs/*.spec.md`), Python tests (pytest-bdd), Playwright
- `lint` / `format`: Biome + Ruff check, or fix
- `precommit [-Full]`: lint, tsc, vitest, pytest (`-Full` adds e2e); stops at the first failure
- `pack [args]`: `tools/pack.py` in the content root; prompts for `PITCH_PASSWORD` if unset
- `serve [port]`: the editor (`tools/serve.py`) with song data from the content root
- `tool <name> [args]`: any `tools/<name>.py` in the content root

`-Content <path>` names the content root (a production repo); without it, this folder. `dev`, `build` and `preview` then use the production's `production.json` and `public/` (title, logo, icons, storage id).

## Productions

This repo is the engine: app, editor, tools. Each production (a musical) has two more repos next to it:

- a private content repo with the songs in plain text (`sources/`, `scores/`, `web/data/`), `production.json`, `public/` (logo, icons), `salt`, `engine.ref` (engine tag to build with) and a small `mp.ps1` that calls this one with `-Content`;
- a public site repo whose `gh-pages` branch holds only the built app and the encrypted bundle, pushed by the content repo's CI.

Publishing: `docs/pipeline.md`, section 7. Decision: `docs/adr/0007-engine-content-site-split.md`.
