# Engine, content and site in separate repos

The plain-text song data (recordings, scores, editor corrections, pack input) was gitignored and therefore not versioned at all, and the engine carried one production's role list, branding and per-song notes. We decided (2026-10-31) to split into three repos per production:

- `musical-practice` (public): the engine. App, editor, tools, specs. No song data, no production names in code.
- `<production>-content` (private): songs in plain text, `production.json` (title, kicker, logo alt text, `storageId`), `public/` (logo, icons), `salt`, `engine.ref` (engine tag), a forwarding `mp.ps1`, and the deploy workflow.
- `<production>` (public): only the `gh-pages` branch with the built app and the encrypted bundle, force-pushed by the content repo's CI with a deploy key.

The content repo's CI checks out the engine at `engine.ref`, builds with `MP_PRODUCTION`, packs with the `PITCH_PASSWORD` Actions secret and the committed salt, and deploys. An engine change reaches a site only when its content repo raises `engine.ref`.

## Consequences

- Role ids come from the production's config; the engine has no role list.
- All productions of one GitHub account share the origin `<account>.github.io`, so IndexedDB and web storage are named by `storageId`. The first production keeps `gu`, the name from before the split, so devices keep their key and history.
- Packing in CI means the password is stored as a secret of the private repo. Accepted; ADR 0004 already accepts that anyone with the password can extract content.
- The engine history was rewritten once to drop the encrypted bundles; the old project URL only redirects to the production site.
