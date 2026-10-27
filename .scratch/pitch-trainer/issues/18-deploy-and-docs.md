# 18: Deploy workflow and docs

**What to build:** A GitHub Actions workflow that builds the app on push to `main` and publishes `dist/` plus the committed encrypted `content/` folder to GitHub Pages; the Vite `base` set so the app works under the repository path; `docs/pipeline.md` extended with the new builder steps (phrases, pack, publish) and `README.md` with the admin flow.

**Blocked by:** 12 (shell)

**Status:** resolved

Decision Q12 in `specs/overview.spec.md`; ADR 0004. The service worker must not precache `content/` (ticket 12). `content/` is committed encrypted only (`.gitignore` already blocks plaintext sources).

- [ ] `.github/workflows/pages.yml` builds with Node 22 and deploys with the official Pages actions.
- [ ] `npm run build` output references assets relative to the configured base; `content/` copied into `dist/content/` by the workflow (or by Vite `publicDir` symlink-free copy step).
- [ ] `docs/pipeline.md` section 7 replaced by: phrases → pack → commit `content/` → push.

## Comments

- 2026-10-27 agent: Merged a7f3173: .github/workflows/pages.yml, docs/pipeline.md section 7, README admin flow; Pages source must be set to GitHub Actions manually.
