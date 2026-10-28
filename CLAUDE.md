## Developer tasks

Use `./mp.ps1 <command>` (PowerShell 7, repo root) for every common operation instead of calling npm, npx, vite, vitest, biome, ruff, pytest or tools/pack.py directly. `./mp.ps1 help` lists the commands.

- First time or after changing `mise.toml` / dependencies: `./mp.ps1 setup`. When a tool or version seems wrong: `./mp.ps1 doctor`.
- A husky pre-commit hook runs `./mp.ps1 precommit -Staged` (Biome on staged files via lint-staged, Ruff, tsc, vitest, pytest). Run `./mp.ps1 precommit -Full` yourself to include the Playwright e2e test. Fix formatting with `./mp.ps1 format`. Never skip the hook with `--no-verify`.
- Tool versions are pinned in `mise.toml` (node 26, python 3.12, ffmpeg). Do not install other versions or create other venvs.
- Packing content: `./mp.ps1 pack --root work/pack-root --out content --strict`. Needs `PITCH_PASSWORD`; never write the password into files, commits, logs or memory.

## Agent skills

### Issue tracker

Issues live as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
