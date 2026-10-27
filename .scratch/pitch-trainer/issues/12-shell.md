# 12: Shell: routing, settings, PWA, sheets, tokens, composition root

**What to build:** The `<gu-app>` root that boots the real modules, routes by hash with guards, persists settings in localStorage, installs the service worker with silent update and launch toast, shows the settings sheet (tolerance, mic delay, mic test, headphone text, lock with confirm), the headphone sheet before first play, and the iOS install hint; ships the design tokens and bundled fonts.

**Blocked by:** 07 (vault), 09 (pitch engine), 10 (library), 11 (history)

**Status:** ready-for-agent

Spec: `specs/shell.spec.md`. Artboards: `design/*.dc.html` for colours and layout. Decisions Q12, Q13, Q35, Q37 in `specs/overview.spec.md`.

Composition root contract (screens in tickets 13–17 build on this, so fix it here):
- `src/app/context.ts` exports an `AppContext` interface `{ vault, library, history, engine, pitch, settings, route(to: Route): void, live: { songId: string; song: LoadedSong; session: Session } | null }` and a Lit context (or a plain module singleton) through which screens obtain it. Screens get fakes injected in their tests, so the shell must accept a pre-built context (constructor argument or static setter) instead of building it itself when one is given.
- `<gu-app>` renders the screen element for the current route: `<gu-start>`, `<gu-songs>`, `<gu-practice>`, `<gu-results>`. Until those tickets land, render a placeholder element per route.
- The audio engine and pitch engine instances are created once in the context (practice and results share them). `live` is set by the practice screen on enter and cleared when leaving to songs.
- Settings sheet and headphone sheet are shell-owned elements (`<gu-settings-sheet>`, `<gu-headphone-sheet>`) that screens open through context methods (`openSettings()`, `ensureHeadphoneSheet(): Promise<void>` resolving when the user may play).

PWA: `vite-plugin-pwa` with `injectManifest` and `src/app/sw.ts` (Workbox precache of the app shell, `content/` excluded). Fonts via `@fontsource/dm-sans` and `@fontsource-variable/fraunces` (woff2, bundled, no network). Icons: placeholder PNGs 192 and 512 generated in the build step or committed under `public/icons/` (admin replaces later).

- [ ] All scenarios of `shell.spec.md` pass via `tests/specs/shell.test.ts` + `tests/steps/shell.steps.ts` with fake vault/library/history/pitch injected through the context.
- [ ] `npm run build` emits a web manifest and a service worker; `content/` is not precached.
- [ ] `tokens.css` holds exactly the token table of the spec; `lang="de"` on the document.
- [ ] Lock flow: confirm dialog strings as in the spec, `vault.lock()` then route start.
