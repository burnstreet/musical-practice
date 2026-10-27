# 01: Project scaffold and Gherkin runners

**What to build:** A runnable project skeleton in which `npm test` executes the Gherkin scenarios embedded in `specs/*.spec.md` as Vitest tests, and `pytest` does the same for the Python-targeted scenarios of `specs/builder.spec.md`. After this ticket every later ticket only adds a step file plus a one-line test stub and starts in the red.

**Blocked by:** None (can start immediately)

**Status:** resolved

Spec: `specs/overview.spec.md` → Testing Decisions. Stack decisions (Q3): TypeScript, Lit, Vite, Vitest. Repo already has `web/` (old vanilla editor, untouched) and `tools/` (Python, venv at `tools/.venv`).

Design of the TypeScript runner (fixed here so later tickets do not drift):

- `tests/gherkin.ts` exports `runSpec(specName, stepsPath)` and `steps(define)`.
  - `runSpec('vault', 'tests/steps/vault.steps.ts')` reads `specs/vault.spec.md`, takes every fenced `gherkin` block whose nearest preceding `[@test]` link resolves to `stepsPath`, and maps `Feature` → `describe`, `Scenario` → `it`, steps in order.
  - `steps(({ Given, When, Then }) => { Given(/^regex$/, async (ctx, ...captures) => {}) })` returns a registry. Keyword is ignored when matching (so `And`/`But` work); captures are strings; `ctx` is a fresh plain object per scenario.
  - A step that matches no regex throws `Unmatched step: <text>` so the scenario fails. A scenario may alternate When/Then several times.
  - Each module gets a stub `tests/specs/<module>.test.ts` containing only the `runSpec` call, so a ticket can run `npx vitest run tests/specs/<module>.test.ts`. Modules without a stub are simply not run yet.
- Vitest environment `happy-dom` (Lit screens need a DOM), `fake-indexeddb` available as a dev dependency for later tickets, Node `crypto.webcrypto` is the WebCrypto in tests.
- `src/` layout per spec `targets`: `src/core/*` business, `src/app/*` presentation. `index.html` + `src/main.ts` boot a placeholder `<gu-app>` so `npm run dev` and `npm run build` work.

Python runner:

- Install `pytest` and `pytest-bdd` into `tools/.venv`.
- `tools/tests/conftest.py` extracts every fenced `gherkin` block from `specs/builder.spec.md` whose `[@test]` link points at a `.py` file, writes one `.feature` file per `Feature` into a generated folder (gitignored), slug of the feature title as file name. Blocks whose link points at a `.ts` file are skipped (they run under Vitest).
- Later tickets add `tools/tests/test_<module>.py` binding their features with `scenarios(...)` and steps in `tools/tests/steps_<module>.py` as the spec names them.

- [ ] `npm install && npm test` passes; the runner has its own test against a fixture spec in `tests/` proving block selection by `[@test]` link, keyword-agnostic matching, captures, fresh ctx per scenario, and that an unmatched step throws.
- [ ] `npm run build` produces `dist/` with a placeholder `<gu-app>`.
- [ ] `tools/.venv/Scripts/python.exe -m pytest tools/tests` passes and the generated feature folder contains `completeness`, `stem-preparation`, `packing`, `phrase-derivation` features but no `editor-role-painting`.
- [ ] `README.md` at repo root: how to run tests, dev server, build (five lines).
- [ ] `.gitignore` extended for `node_modules`, `dist`, generated features.

## Comments

- 2026-10-27 agent: Scaffold merged (a3caab6, f42ea4f): Vite/Lit/Vitest, tests/gherkin.ts runner, pytest-bdd conftest.
