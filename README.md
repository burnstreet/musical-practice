# Gesangs-Übetool

- Setup: `npm install`; Python test deps: `tools/.venv/Scripts/python.exe -m pip install pytest==9.1.1 pytest-bdd==9.0.0`
- Tests (Gherkin from `specs/*.spec.md` via Vitest): `npm test`, one module: `npx vitest run tests/specs/<module>.test.ts`
- Python tests (builder scenarios via pytest-bdd): `tools/.venv/Scripts/python.exe -m pytest tools/tests`
- Dev server: `npm run dev`
- Build to `dist/`: `npm run build`
