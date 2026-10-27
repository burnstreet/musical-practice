## Developer tasks

Use `./at.ps1 <command>` (PowerShell 7, repo root) for every common operation instead of calling npm, npx, vite, vitest, biome, ruff, pytest or tools/pack.py directly. `./at.ps1 help` lists the commands.

- First time or after changing `mise.toml` / dependencies: `./at.ps1 setup`. When a tool or version seems wrong: `./at.ps1 doctor`.
- Before every commit: `./at.ps1 precommit` (add `-Full` to include the Playwright e2e test). Fix formatting with `./at.ps1 format`.
- Tool versions are pinned in `mise.toml` (node 26, python 3.12, ffmpeg). Do not install other versions or create other venvs.
- Packing content: `./at.ps1 pack --root work/pack-root --out content --strict`. Needs `PITCH_PASSWORD`; never write the password into files, commits, logs or memory.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
