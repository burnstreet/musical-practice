# 09: Pitch engine

**What to build:** Microphone capture through an AudioWorklet that runs McLeod pitch detection (`pitchy`) and emits `PitchFrame`s stamped in song time with latency compensation; permission and capability failures reported as `denied` / `unsupported`; `level()` for the mic test.

**Blocked by:** 02 (content format, for the shared `PitchFrame` type)

**Status:** resolved

Spec: `specs/pitch-engine.spec.md`. Constants in `src/core/pitch-constants.ts`.

Testing: the detector function (samples → `midi | null`, clarity) lives in a pure module shared by the worklet and the tests, so the `Detection` feature feeds synthetic sine/silence buffers to it directly. The engine takes injected `getUserMedia`, `AudioContext` factory and worklet port fakes for the `Time stamps` and `Permission` features. Vite serves the worklet through `new URL('./pitch-worklet.ts', import.meta.url)` or `?worker`-style import; confirm it builds.

- [ ] All scenarios pass via `tests/specs/pitch-engine.test.ts` + `tests/steps/pitch-engine.steps.ts`.
- [ ] `npm run build` still succeeds with the worklet bundled.
- [ ] `stop` releases the media track and closes nothing shared.

## Comments

- 2026-10-27 agent: Merged b347e78: pitch-constants, pitch-detect, pitch-worklet, pitch-engine; worklet bundled via ?worker&url.
